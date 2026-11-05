/**
 * 会话仪表盘全屏面板——`shell.overlay` 第二占位。
 *
 * 状态管理：DashboardStore（独立于侧栏 BatchState，见 dashboard-store.ts）。
 * 数据流：轮询 stats 路由 → join sessions.list + workspaces.list → 表格渲染。
 * 选择集独立于侧栏；ops 调用核心层（runArchiveCore/runDeleteCore）。
 *
 * @module client/DashboardPanel
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, Modal, Pill, StateDot, Tag, Tooltip,
  IconCloseOutlineRegular, IconTrashOutlineRegular,
  IconArchiveOutlineRegular, IconUnarchiveOutlineRegular,
  IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createStatsPoller, fetchStats } from './stats-client.ts'
import { runArchiveCore, runDeleteCore, runUnarchiveCore, DeleteRequestError } from './ops.ts'
import type { DashboardStore } from './dashboard-store.ts'
import type {
  BatchNotice, ClientSessionsLike, ClientWorkspacesLike,
  DashboardFilter, DashboardRow, DashboardState, RecallCandidate, RecallMode, RecallResult,
  SessionIdString, StatsResponse, TranslateFn, WorkspaceItem,
} from './types.ts'
import type { TreeRow } from './dashboard-tree.ts'
import { computeRecallCandidates } from './dashboard-recall.ts'
import { BODY_DASHBOARD_CLASS } from './styles.ts'
import { joinDashboardRows, filterDashboardRows } from './dashboard-rows.ts'
import type { DashboardJoinInputs } from './dashboard-rows.ts'
import { buildTree, visibleRows, descendantsOf } from './dashboard-tree.ts'

export interface DashboardPanelProps {
  readonly open: boolean
  readonly onToggle: () => void
  readonly sessions: ClientSessionsLike
  readonly workspaces: ClientWorkspacesLike
  readonly t: TranslateFn
  readonly sidebarOps: {
    tombstones: readonly string[]
    addTombstones: (ids: readonly string[]) => void
    refreshSessions: () => Promise<void>
  }
  readonly dashStore: DashboardStore
}

/** 从 store 订阅单个 key 的 hook。 */
function useDashState<K extends keyof DashboardState>(store: DashboardStore, key: K): DashboardState[K] {
  return useSyncExternalStore(
    store.source.subscribe,
    () => store.get()[key],
  )
}

export function DashboardPanel({ open, onToggle, sessions, workspaces, t, sidebarOps, dashStore }: DashboardPanelProps): ReactNode {
  // 从 store 读取（subscribed via useSyncExternalStore）
  const store = dashStore
  const filter = useDashState(store, 'filter')
  const selected = useDashState(store, 'selected')
  const busy = useDashState(store, 'busy')
  const confirmDelete = useDashState(store, 'confirmDelete')
  const notice = useDashState(store, 'notice')

  const expanded = useDashState(store, 'expanded')
  const recallMode = useDashState(store, 'recallMode')
  const recallDismissed = useDashState(store, 'recallDismissed')

  // 数据状态（不归 store 管）
  const [data, setData] = useState<StatsResponse | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  const pollerRef = useRef(createStatsPoller())
  const panelRef = useRef<HTMLDivElement>(null)
  const backBtnRef = useRef<HTMLButtonElement>(null)
  const bannerViewRef = useRef<HTMLButtonElement>(null)

  const titleOf = useCallback((id: string): string => {
    const row = sessions.list.getSnapshot().byId[id]
    // D7 修复：不采信 displayTitle（其回落链含项目目录 basename），改用持久化 title || id
    const title = row?.title
    return typeof title === 'string' && title !== '' ? title : id
  }, [sessions.list])

  // 轮询
  useEffect(() => {
    if (!open) {
      pollerRef.current.stop()
      return
    }
    const handleData = (res: StatsResponse) => {
      setData(res)
      setInitialLoad(false)
      if (res.ok) setFetchError(false)
    }
    pollerRef.current.start(handleData)
    return () => { pollerRef.current.stop() }
  }, [open])

  // body 标记类
  useEffect(() => {
    if (!open) return
    document.body.classList.add(BODY_DASHBOARD_CLASS)
    return () => { document.body.classList.remove(BODY_DASHBOARD_CLASS) }
  }, [open])

  // join → tree → filter 管线
  const rows = useMemo((): DashboardRow[] => {
    const snap = sessions.list.getSnapshot()
    const ws = workspaces.list.getSnapshot()
    return joinDashboardRows({
      data,
      ids: snap.ids,
      byId: snap.byId,
      archivedSessionIds: ws.archivedSessionIds,
      pinnedSessionIds: ws.pinnedSessionIds,
      tombstones: sidebarOps.tombstones,
    })
  }, [data, sessions.list, workspaces.list, sidebarOps.tombstones])

  const treeRows = useMemo(() => {
    const ws = workspaces.list.getSnapshot()
    return buildTree(rows, new Set(ws.archivedSessionIds))
  }, [rows, workspaces.list])

  // ref 保持最新树形行 — 供回调闭包里读取（避免 useCallback 依赖漂移）
  const treeRowsRef = useRef(treeRows)
  treeRowsRef.current = treeRows

  const filteredRows = useMemo(() => {
    return filterDashboardRows(treeRows, filter)
  }, [treeRows, filter])

  const displayRows = useMemo(() => {
    return visibleRows(filteredRows, expanded)
  }, [filteredRows, expanded])

  const counts = useMemo(() => {
    // v0.2 两档：chips = 各档主会话数（子代理不计入独立计数，压平在父行下）
    const all = treeRows.filter(r => r.origin !== 'subagent').length
    const main = treeRows.filter(r => r.origin !== 'subagent' && !(r.archived || r.lineageArchived)).length
    const arch = treeRows.filter(r => r.origin !== 'subagent' && (r.archived || r.lineageArchived)).length
    return { all, main, arch }
  }, [treeRows])

  const allArchived = selected.length > 0 && selected.every(id => {
    const row = treeRows.find(r => r.id === id)
    return (row?.archived || row?.lineageArchived) ?? false
  })
  const noneSelected = selected.length === 0
  const working = busy !== null
  const isDegraded = data !== null && data.ok && data.degraded

  // ---- 召回 ----

  /** 当前所有工作区条目的快照 + phase（从 workspaces.list 快照读取，DSH 0.2.2 无独立 items observable）。 */
  const wsSubscribe = useCallback((cb: () => void) => workspaces.list.subscribe(cb), [workspaces.list])
  const wsSnap = useSyncExternalStore(
    wsSubscribe,
    () => workspaces.list.getSnapshot(),
  )
  const workspaceItems = wsSnap.items
  const wsPhase: 'pending' | 'ready' = wsSnap.phase

  /** 已在任何工作区组内的会话 id 集合。 */
  const groupedIds = useMemo((): ReadonlySet<SessionIdString> => {
    const s = new Set<SessionIdString>()
    for (const item of workspaceItems) {
      for (const sid of item.sessionIds) s.add(sid)
    }
    return s
  }, [workspaceItems])

  /** 召回候选：未分组的主会话（非子代理、非 blank），按 cwd 聚拢（D17 抽至 dashboard-recall.ts）。 */
  const recallCandidatesByCwd = useMemo(() => {
    return computeRecallCandidates(rows, groupedIds)
  }, [rows, groupedIds])

  const recallBaseline = useDashState(store, 'recallBaseline')

  // 初始化 baseline（决策 b：store 级，首个 phase === 'ready' 快照抓取；零工作区为合法 baseline）
  useEffect(() => {
    if (recallBaseline !== null) return
    if (wsPhase !== 'ready') return
    store.initRecallBaseline(workspaceItems.map(w => w.workspaceId))
  }, [wsPhase, workspaceItems, recallBaseline, store])

  /** 当前待展示的召回横幅（第一条未忽略的新工作区）。 */
  const recallBanner = useMemo(() => {
    if (recallBaseline === null) return null
    if (working) return null
    if (recallCandidatesByCwd.size === 0) return null
    for (const item of workspaceItems) {
      if (recallBaseline.has(item.workspaceId)) continue
      if (recallDismissed.has(item.workspaceId)) continue
      const norm = item.path.replace(/[/\\]+$/, '')
      const group = recallCandidatesByCwd.get(norm)
      if (group === undefined || group.candidates.length === 0) continue
      return {
        workspaceId: item.workspaceId,
        workspacePath: group.path,
        workspaceTitle: item.title ?? group.title,
        candidateCount: group.candidates.length,
        subagentCount: group.subagentCount,
      }
    }
    return null
  }, [workspaceItems, recallBaseline, recallCandidatesByCwd, recallDismissed, working])

  // 进入召回模式
  const enterRecallMode = useCallback((wsId: string) => {
    const item = workspaceItems.find(w => w.workspaceId === wsId)
    if (item === undefined) return
    const norm = item.path.replace(/[/\\]+$/, '')
    const group = recallCandidatesByCwd.get(norm)
    if (group === undefined) return
    store.enterRecallMode({
      workspaceId: wsId,
      workspacePath: group.path,
      workspaceTitle: item.title ?? group.title,
      candidates: group.candidates,
      selected: group.candidates.map(c => c.id),
      subagentCount: group.subagentCount,
    })
  }, [workspaceItems, recallCandidatesByCwd, store])

  // 退出召回模式（F5：焦点归还横幅［查看］，无横幅则面板关闭按钮）
  const exitRecallMode = useCallback(() => {
    store.exitRecallMode()
    requestAnimationFrame(() => {
      if (bannerViewRef.current) {
        bannerViewRef.current.focus()
      } else {
        panelRef.current?.querySelector<HTMLButtonElement>('.dsh-dash-close')?.focus()
      }
    })
  }, [store])

  // 忽略召回横幅
  const dismissRecall = useCallback((wsId: string) => {
    store.dismissRecallBanner(wsId)
  }, [store])

  // 执行召回
  const doRecall = useCallback(async () => {
    if (recallMode === null) return
    const ids = recallMode.selected
    if (ids.length === 0) return
    const routeBase = (window as any).__DSH_SESSION_BATCH_MANAGER__?.routeBase ?? '/dsh-session-batch-manager/v1'
    store.setBusy('dash.recall.busy', 0, ids.length)
    try {
      const res = await fetch(`${routeBase}/recall`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-session-batch-manager': '1' },
        body: JSON.stringify({ cwd: recallMode.workspacePath, sessionIds: ids }),
      })
      const body = await res.json() as { results?: RecallResult[]; message?: string; error?: string }
      if (!res.ok) {
        // HTTP 级失败（如 400：目录已删）→ 整批失败，逐条点名
        store.clearBusy()
        store.showNotice({
          kind: 'error',
          textKey: 'dash.recall.failure',
          params: { ok: 0, fail: ids.length },
          failures: ids.map(id => ({
            id,
            title: titleOf(id),
            code: body.error ?? `${res.status}`,
            message: body.message ?? `${res.status} ${res.statusText}`,
          })),
        })
        exitRecallMode()
        return
      }
      const results = body.results ?? []
      const okResults = results.filter(r => r.ok)
      const failResults = results.filter(r => !r.ok)
      store.clearBusy()
      void fetchStats().then(setData)
      void sidebarOps.refreshSessions()
      if (failResults.length === 0) {
        store.showNotice({ kind: 'success', textKey: 'dash.recall.success', params: { n: okResults.length, name: recallMode.workspaceTitle } })
      } else {
        store.showNotice({
          kind: 'error',
          textKey: 'dash.recall.failure',
          params: { ok: okResults.length, fail: failResults.length },
          failures: failResults.map(r => ({ id: r.sessionId, title: titleOf(r.sessionId), code: r.code ?? 'unknown', message: r.message })),
        })
      }
      exitRecallMode()
    } catch (error: unknown) {
      store.clearBusy()
      store.showNotice({ kind: 'error', textKey: 'notice.code.network', failures: [{ id: '', title: '', code: 'network', message: error instanceof Error ? error.message : String(error) }] })
      exitRecallMode()
    }
  }, [recallMode, store, sidebarOps, exitRecallMode, titleOf])

  // Esc 关闭 / 退出召回模式
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (store.get().confirmDelete !== null) return
        if (store.get().busy !== null) return
        e.preventDefault(); e.stopPropagation()
        if (store.get().recallMode !== null) {
          exitRecallMode()
          return
        }
        doClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onToggle, store, exitRecallMode])

  // 关闭面板
  const doClose = useCallback(() => {
    if (working) return
    onToggle()
    store.clearSelection()
    store.collapseAll()
  }, [working, onToggle, store])

  // 刷新
  const doRefresh = useCallback(() => {
    setFetchError(false)
    void fetchStats().then(res => { setData(res); if (res.ok) setFetchError(false) })
  }, [])

  // 批量归档
  const doArchive = useCallback(async () => {
    if (selected.length === 0) return
    const currentTree = treeRowsRef.current
    // 级联检测：单选且有子树 → 归档通知用级联文案
    const cascadeInfo = selected.length === 1
      ? (() => { const selId = selected[0]!; const dc = descendantsOf(selId, currentTree); return dc.length > 0 ? { title: titleOf(selId), n: dc.length } : null })()
      : null
    store.setBusy('bar.busyArchiving', 0, selected.length)
    const capActive = selected // 捕获：store.clearSelection 后会变
    const result = await runArchiveCore(capActive, workspaces, titleOf, false, {
      onProgress: () => store.advanceBusy(),
    })
    store.clearBusy()
    store.clearSelection()
    void fetchStats().then(setData)
    const { ok, active, failures } = result
    if (active.length === 0 && failures.length === 0) {
      if (cascadeInfo) {
        store.showNotice({ kind: 'success', textKey: 'dash.archive.cascade', params: { title: cascadeInfo.title, n: cascadeInfo.n } })
      } else {
        store.showNotice({ kind: ok > 0 ? 'success' : 'info', textKey: ok > 0 ? 'notice.archived' : 'notice.noneArchived', params: { n: ok } })
      }
    } else {
      store.showNotice({
        kind: 'error', textKey: ok > 0 ? 'notice.archived' : 'notice.noneArchived', params: { n: ok },
        failures: [...active.map(id => ({ id, title: titleOf(id), code: 'active' })), ...failures],
        action: active.length > 0
          ? {
              labelKey: 'notice.stopAndArchive',
              params: { n: active.length },
              run: () => {
                // 重试用捕获的 active 列表，不依赖已清空的选择集
                void (async () => {
                  store.dismissNotice()
                  store.setBusy('bar.busyArchiving', 0, active.length)
                  const retry = await runArchiveCore(active, workspaces, titleOf, true, {
                    onProgress: () => store.advanceBusy(),
                  })
                  store.clearBusy()
                  void fetchStats().then(setData)
                  const { ok: rOk, failures: rFail } = retry
                  store.showNotice({
                    kind: rFail.length === 0 ? 'success' : 'error',
                    textKey: rOk > 0 ? 'notice.archived' : 'notice.noneArchived',
                    params: { n: rOk },
                    failures: rFail,
                  })
                })()
              },
            }
          : undefined,
      })
    }
  }, [selected, workspaces, titleOf, store])

  // 批量恢复
  const doUnarchive = useCallback(async () => {
    if (selected.length === 0) return
    store.setBusy('bar.busyUnarchiving', 0, selected.length)
    const capSelected = selected
    const result = await runUnarchiveCore(capSelected, workspaces, titleOf, {
      onProgress: () => store.advanceBusy(),
    })
    store.clearBusy()
    store.clearSelection()
    void fetchStats().then(setData)
    store.showNotice({
      kind: result.failures.length === 0 ? 'success' : 'error',
      textKey: result.ok > 0 ? 'notice.unarchived' : 'notice.noneUnarchived',
      params: { n: result.ok },
      failures: result.failures,
    })
  }, [selected, workspaces, titleOf, store])

  // 单行恢复（行级恢复按钮回调）
  const doRestoreRow = useCallback(async (id: string) => {
    store.setBusy('bar.busyUnarchiving', 0, 1)
    const result = await runUnarchiveCore([id], workspaces, titleOf, {
      onProgress: () => store.advanceBusy(),
    })
    store.clearBusy()
    void fetchStats().then(setData)
    store.showNotice({
      kind: result.failures.length === 0 ? 'success' : 'error',
      textKey: result.ok > 0 ? 'notice.unarchived' : 'notice.noneUnarchived',
      params: { n: result.ok },
      failures: result.failures,
    })
  }, [workspaces, titleOf, store])

  // 删除（级联：勾选中集经 descendantsOf 展开，去重，原子性拒绝运行中）
  const doDelete = useCallback(async (ids: readonly string[]) => {
    if (ids.length === 0) return
    // 级联展开：每个选中 id 的选中自身 + 全部后代（去重）
    const expanded = new Set<string>()
    for (const id of ids) {
      expanded.add(id)
      for (const desc of descendantsOf(id, treeRows)) {
        expanded.add(desc.id)
      }
    }
    const expandedIds = [...expanded]
    // 原子性拒绝：级联集合中有运行中的 → 整单拒绝
    const runningIds = expandedIds.filter(id => {
      const row = treeRows.find(r => r.id === id)
      return row?.running ?? false
    })
    if (runningIds.length > 0) {
      store.showNotice({
        kind: 'error',
        textKey: 'dash.cascade.blocked',
        failures: runningIds.map(id => ({ id, title: titleOf(id), code: 'active' })),
      })
      store.closeConfirm()
      return
    }
    store.closeConfirm()
    store.dismissNotice()
    store.setBusy('bar.busyDeleting', 0, expandedIds.length)
    try {
      const result = await runDeleteCore(expandedIds, discoverRouteBase(), titleOf)
      if (result.okIds.length > 0) sidebarOps.addTombstones(result.okIds)
      store.clearSelection()
      try { await sidebarOps.refreshSessions() } catch { /* 自愈 */ }
      store.clearBusy()
      void fetchStats().then(setData)
      store.showNotice({
        kind: result.failures.length === 0 ? 'success' : 'error',
        textKey: result.okIds.length > 0 ? 'notice.deleted' : 'notice.noneDeleted',
        params: { n: result.okIds.length },
        failures: result.failures,
      })
    } catch (reason: unknown) {
      store.clearBusy()
      const code = reason instanceof DeleteRequestError ? reason.code : 'internal'
      store.showNotice({
        kind: 'error', textKey: 'notice.noneDeleted',
        failures: [{ id: '', title: '', code, message: reason instanceof Error ? reason.message : String(reason) }],
      })
    }
  }, [titleOf, sidebarOps, store, treeRows])

  // 全选当前视图（仅主会话行——子代理行无 checkbox，操作收敛主会话）
  const selectAll = useCallback(() => {
    const mainIds = displayRows.filter(r => r.origin !== 'subagent').map(r => r.id)
    store.selectAll(mainIds)
  }, [displayRows, store])

  // 过滤 + 切换选中（都走 store）
  const onFilter = useCallback((f: DashboardFilter) => { store.setFilter(f) }, [store])
  const toggleRow = useCallback((id: string) => { store.toggleSelect(id) }, [store])

  // 召回模式进入 → 焦点移到返回按钮（D15）
  useEffect(() => {
    if (recallMode !== null) {
      backBtnRef.current?.focus()
    }
  }, [recallMode])

  if (!open) return null

  const pending = data?.pending ?? 0
  const loaded = displayRows.length
  const totalEst = loaded + pending
  const progressPercent = totalEst > 0 ? Math.round(loaded / totalEst * 100) : 0

  return (
    <>
      {createPortal(
        <div
          ref={panelRef}
          className="dsh-dash-panel"
          data-dsh-batch-ui=""
          role="dialog"
          aria-modal="true"
          aria-label={t('dash.panel.aria')}
        >
          <div className="dsh-dash-header">
            <span className="dsh-dash-header-left">{t('dash.title')}</span>
            <span className="dsh-dash-header-right">
              {pending > 0 ? t('dash.pending', { n: pending }) : data !== null ? t('dash.updatedAt', { time: new Date(data.generatedAt).toLocaleTimeString() }) : ''}
            </span>
            <button type="button" className="dsh-dash-close" disabled={working} aria-label={t('dash.close')} onClick={doClose} data-dsh-batch-ui="">
              <IconCloseOutlineRegular size={14} />
            </button>
          </div>
          {pending > 0 && (
            <div className="dsh-dash-progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={t('dash.progress.aria')}>
              <div className="dsh-dash-progress-fill" style={{ width: `${String(progressPercent)}%` }} />
            </div>
          )}
          {recallBanner !== null && (
            <div className="dsh-dash-notice-bar">
              <IconWarningOutlineRegular size={14} />
              <span>{t('dash.recall.banner', { n: recallBanner.candidateCount, m: recallBanner.subagentCount, name: recallBanner.workspaceTitle })}</span>
              <button type="button" className="dsh-batch-btn" ref={bannerViewRef} onClick={() => { enterRecallMode(recallBanner.workspaceId) }}>{t('dash.recall.view')}</button>
              <button type="button" className="dsh-batch-btn" onClick={() => { dismissRecall(recallBanner.workspaceId) }}>{t('dash.recall.dismiss')}</button>
            </div>
          )}
          <div className="dsh-dash-toolbar">
            {recallMode !== null ? (
              <>
                <span className="dsh-dash-header-left">{t('dash.recall.title', { name: recallMode.workspaceTitle })}</span>
                <div className="dsh-dash-toolbar-right">
                  <button type="button" className="dsh-batch-btn" disabled={working} onClick={exitRecallMode} ref={backBtnRef}>{t('dash.recall.back')}</button>
                </div>
              </>
            ) : (
              <>
            <Pill active={filter === 'main'} onClick={() => { onFilter('main') }}>{t('dash.filter.main')} {counts.main}</Pill>
            <Pill active={filter === 'archived'} onClick={() => { onFilter('archived') }}>{t('dash.filter.archived')} {counts.arch}</Pill>
            <div className="dsh-dash-toolbar-right">
              <span className="dsh-batch-count">{t('bar.selected', { n: selected.length })}</span>
              <button type="button" className="dsh-batch-btn" disabled={working} onClick={selectAll}>{t('bar.selectAll')}</button>
              <button type="button" className="dsh-batch-btn" disabled={working || noneSelected} onClick={() => { store.clearSelection() }}>{t('bar.clear')}</button>
              <span className="dsh-batch-sep" aria-hidden={true} />
              <button type="button" className="dsh-batch-btn" disabled={working || noneSelected} onClick={() => { allArchived ? void doUnarchive() : void doArchive() }}>
                {allArchived ? <IconUnarchiveOutlineRegular size={14} /> : <IconArchiveOutlineRegular size={14} />}
                {allArchived ? t('bar.unarchive') : t('bar.archive')}
              </button>
              <button type="button" className="dsh-batch-btn dsh-batch-btn-danger" disabled={working || noneSelected} onClick={() => { store.requestDeleteConfirm() }}>
                <IconTrashOutlineRegular size={14} />
                {t('bar.delete')}
              </button>
              <span className="dsh-batch-sep" aria-hidden={true} />
              <button type="button" className="dsh-batch-btn" disabled={working} onClick={doRefresh}>{t('dash.refresh')}</button>
              {busy !== null && (
                <span className="dsh-batch-busy" role="status">
                  {t(busy.labelKey)} {busy.done}/{busy.total}
                </span>
              )}
            </div>
              </>
            )}
          </div>

          <div className="dsh-dash-table-wrapper">
            {isDegraded && (
              <div className="dsh-dash-notice-bar"><IconWarningOutlineRegular size={14} /><span>{t('dash.degraded')}</span></div>
            )}
            {fetchError && (
              <div className="dsh-dash-notice-bar"><IconWarningOutlineRegular size={14} /><span>{t('dash.loadFailed')}</span><button type="button" className="dsh-batch-btn" onClick={doRefresh}>{t('dash.retry')}</button></div>
            )}
            {recallMode !== null ? (
              // ---- 召回清单模式 ----
              <>
              <table className="dsh-dash-table dsh-dash-recall-table">
                <caption>{t('dash.recall.title', { name: recallMode.workspaceTitle })}</caption>
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col style={{ minWidth: '200px' }} />
                  <col className="dsh-dash-recall-time-col" style={{ width: '120px' }} />
                  <col style={{ width: 'auto', minWidth: '120px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="dsh-dash-th" scope="col">
                      <input type="checkbox" checked={recallMode.selected.length === recallMode.candidates.length && recallMode.candidates.length > 0} onChange={() => {
                        if (recallMode.selected.length === recallMode.candidates.length) {
                          store.setRecallSelected([])
                        } else {
                          store.setRecallSelected(recallMode.candidates.map(c => c.id))
                        }
                      }} aria-label={t('dash.recall.selectAll', { n: recallMode.candidates.length })} />
                    </th>
                    <th className="dsh-dash-th" scope="col">{t('dash.col.session')}</th>
                    <th className="dsh-dash-th dsh-dash-recall-time-col" scope="col">{t('dash.updatedAt', { time: '' }).replace(/ .*$/, '')}</th>
                    <th className="dsh-dash-th" scope="col">{t('dash.col.project')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recallMode.candidates.map(c => (
                    <tr key={c.id} className={recallMode.selected.includes(c.id) ? 'dsh-dash-row dsh-dash-row-selected dsh-dash-recall-row' : 'dsh-dash-row dsh-dash-recall-row'} onClick={() => { store.toggleRecallCandidate(c.id) }}>
                      <td className="dsh-dash-td">
                        <input type="checkbox" checked={recallMode.selected.includes(c.id)} onChange={() => {}} />
                      </td>
                      <td className="dsh-dash-td">
                        <Tooltip portal label={c.title || c.id} onlyWhenClipped>
                          <span className="dsh-dash-recall-cell-title">{c.title || c.id}{c.subagentCount > 0 ? ` +${c.subagentCount}` : ''}</span>
                        </Tooltip>
                        <span className="dsh-dash-recall-cell-cwd-sub">{c.cwd}</span>
                      </td>
                      <td className="dsh-dash-td dsh-dash-recall-time-col">{formatDate(c.updatedAt)}</td>
                      <td className="dsh-dash-td">
                        <Tooltip portal label={c.cwd} onlyWhenClipped>
                          <span className="dsh-dash-recall-cell-cwd">{c.cwd}</span>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 底部操作条（D15） */}
              <div className="dsh-dash-recall-footer">
                <span className="dsh-batch-count">{t('bar.selected', { n: recallMode.selected.length })}</span>
                {busy !== null && (
                  <span className="dsh-batch-busy" role="status">
                    {t(busy.labelKey)} {busy.done}/{busy.total}
                  </span>
                )}
                <div className="dsh-dash-recall-footer-actions">
                  <button type="button" className="dsh-batch-btn" disabled={working} onClick={exitRecallMode}>{t('dash.recall.cancel')}</button>
                  <button type="button" className="dsh-batch-btn" disabled={working || recallMode.selected.length === 0} onClick={() => { void doRecall() }}>{t('dash.recall.execute', { k: recallMode.selected.length })}</button>
                </div>
              </div>
              </>
            ) : initialLoad && (data === null || data.sessions.length === 0) ? (
              <table className="dsh-dash-table">
                <DashboardTableHead t={t} />
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => (
                    <tr key={`skel-${String(i)}`} className="dsh-dash-skeleton">
                      <td className="dsh-dash-td"><div className="dsh-dash-skeleton-bar" style={{ width: '18px' }} /></td>
                      <td className="dsh-dash-td"><div className="dsh-dash-skeleton-bar" style={{ width: '60%' }} /></td>
                      <td className="dsh-dash-td dsh-dash-model-col"><div className="dsh-dash-skeleton-bar" style={{ width: '70%' }} /></td>
                      <td className="dsh-dash-td dsh-dash-td-right"><div className="dsh-dash-skeleton-bar" style={{ width: '40px', marginLeft: 'auto' }} /></td>
                      <td className="dsh-dash-td dsh-dash-td-right"><div className="dsh-dash-skeleton-bar" style={{ width: '50px', marginLeft: 'auto' }} /></td>
                      <td className="dsh-dash-td"><div className="dsh-dash-skeleton-bar dsh-dash-ctx-bar" style={{ width: '100px' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : data === null || data.sessions.length === 0 ? (
              <div className="dsh-dash-empty">
                <span className="dsh-dash-empty-title">{t('dash.empty.title')}</span>
                <span className="dsh-dash-empty-desc">{t('dash.empty.desc')}</span>
              </div>
            ) : displayRows.length === 0 ? (
              <div className="dsh-dash-empty">
                <span className="dsh-dash-empty-title">{t('dash.emptyFiltered.title')}</span>
                <button type="button" className="dsh-batch-notice-action" onClick={() => { onFilter('main') }}>{t('dash.emptyFiltered.clear')}</button>
              </div>
            ) : data === null || !data.ok ? (
              <div className="dsh-dash-error-center">
                <IconWarningOutlineRegular size={24} />
                <span>{t('dash.loadFailed')}</span>
                <Button variant="outline" onClick={doRefresh}>{t('dash.retry')}</Button>
              </div>
            ) : (
              <table className="dsh-dash-table">
                <caption>{t('dash.table.caption')}</caption>
                <DashboardTableHead t={t} />
                <tbody>
                  {displayRows.map(row => (
                    <DashboardRowView
                      key={row.id}
                      row={row}
                      selected={selected.includes(row.id)}
                      onToggle={() => { toggleRow(row.id) }}
                      onExpand={row.hasChildren ? () => { store.toggleExpanded(row.id) } : undefined}
                      isExpanded={expanded.has(row.id)}
                      filter={filter}
                      titleOf={titleOf}
                      onRestore={doRestoreRow}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>,
        document.body,
      )}

      {confirmDelete !== null && (() => {
        // 级联删除预览：展开后代去重计数
        const cascadeSet = new Set<string>()
        for (const id of confirmDelete) {
          cascadeSet.add(id)
          for (const desc of descendantsOf(id, treeRows)) {
            cascadeSet.add(desc.id)
          }
        }
        const childCount = cascadeSet.size - confirmDelete.length
        const descText = childCount > 0
          ? t('dash.delete.cascade.summary', { total: cascadeSet.size, n: childCount })
          : t('delete.desc')
        return (
        <Modal
          open
          closeLabel={t('delete.cancel')}
          onClose={() => { if (!working) store.closeConfirm() }}
          title={t('delete.title', { n: cascadeSet.size })}
          description={descText}
          footer={(
            <>
              <Button variant="outline" disabled={working} onClick={() => { store.closeConfirm() }}>{t('delete.cancel')}</Button>
              <Button variant="outline" className="dsh-batch-danger-btn" disabled={working} onClick={() => { void doDelete(confirmDelete) }}>{t('delete.confirm')}</Button>
            </>
          )}
        >
          <ul className="dsh-batch-delete-list">
            {confirmDelete.slice(0, 8).map(id => {
              const dc = descendantsOf(id, treeRows).length
              const title = titleOf(id)
              return (
                <li key={id}>
                  {dc > 0 ? (
                    <Tooltip portal label={t('dash.delete.cascade', { title, n: String(dc) })}>
                      <span>{title} +{dc}</span>
                    </Tooltip>
                  ) : title}
                </li>
              )
            })}
            {confirmDelete.length > 8 && <li>{t('delete.more', { n: confirmDelete.length - 8 })}</li>}
          </ul>
        </Modal>
        )
      })()}

      {notice !== null && createPortal(
        <NoticePanel notice={notice} t={t} onDismiss={() => { store.dismissNotice() }} />,
        document.body,
      )}
    </>
  )
}

// === 子组件 ===

function DashboardTableHead({ t }: { t: TranslateFn }): ReactNode {
  return (
    <>
    <colgroup>
      <col style={{ width: '40px' }} />
      <col style={{ minWidth: '200px' }} />
      <col style={{ width: '160px' }} />
      <col className="dsh-dash-model-col" style={{ width: '180px' }} />
      <col style={{ width: '100px' }} />
      <col style={{ width: '120px' }} />
      <col style={{ width: '240px' }} />
    </colgroup>
    <thead>
      <tr>
        <th className="dsh-dash-th" scope="col" aria-label={t('dash.selectAll.aria', { n: 0 })} />
        <th className="dsh-dash-th" scope="col">{t('dash.col.session')}</th>
        <th className="dsh-dash-th" scope="col">{t('dash.col.project')}</th>
        <th className="dsh-dash-th dsh-dash-model-col" scope="col">{t('dash.col.model')}</th>
        <th className="dsh-dash-th dsh-dash-th-right" scope="col">{t('dash.col.tokens')}</th>
        <th className="dsh-dash-th dsh-dash-th-right" scope="col">{t('dash.col.cache')}</th>
        <th className="dsh-dash-th" scope="col">{t('dash.col.context')}</th>
      </tr>
    </thead>
    </>
  )
}

function DashboardRowView({ row, selected, onToggle, onExpand, isExpanded, filter, titleOf, onRestore, t }: {
  row: TreeRow; selected: boolean; onToggle: () => void; onExpand: (() => void) | undefined; isExpanded: boolean;
  filter: DashboardFilter; titleOf: (id: string) => string; onRestore: (id: string) => void; t: TranslateFn
}): ReactNode {
  const stats = row.stats
  const hasError = stats.error !== null
  const isSub = row.origin === 'subagent'
  const isArchived = row.archived || row.lineageArchived

  const tokenTotal = stats.usage !== null
    ? stats.usage.uncachedInputTokens + stats.usage.outputTokens + stats.usage.cacheReadTokens + stats.usage.cacheWriteTokens
    : null

  const ctxUsed = stats.pressure?.projectedTokens ?? stats.pressure?.pressureTokens
  const ctxWindow = stats.pressure?.contextWindow
  const ctxPercent = ctxUsed !== undefined && ctxWindow !== undefined && ctxWindow > 0
    ? Math.min(100, Math.round(ctxUsed / ctxWindow * 100))
    : null
  const ctxWarn = ctxPercent !== null && ctxPercent >= 90

  const indentPx = row.depth * 16
  const collapsed = !isExpanded

  // 恢复按钮状态
  // D2 修复：血统归档行（lineageArchived && !archived）也应有按钮（置灰）
  const showRestore = filter === 'archived' && !hasError && (row.archived || row.lineageArchived)
  // D3 修复：去掉 depth===0——显式归档且无已归档祖先即为可点，与 depth 无关
  const restoreActive = showRestore && row.archived && !row.lineageArchived
  const restoreDisabled = showRestore && !restoreActive
  // ① 纯血统归档 → dash.restore.withParent；② 显式归档+有归档祖先 → dash.restore.ancestorFirst
  const restoreKey = row.archived ? 'dash.restore.ancestorFirst' : 'dash.restore.withParent'

  // 子代理「所属主会话」小字（v0.2 两档下始终对子代理行显示）
  // D7+D8：父标题走 TreeRow.parentTitle，孤儿判据 = parentTitle === undefined
  const parentDisplay = (isSub && row.parentId) ? (() => {
    if (row.parentTitle !== undefined) {
      return { text: `↳ ${row.parentTitle}`, aria: t('dash.parent.label', { title: row.parentTitle }), isOrphan: false, fullId: row.parentId }
    }
    // 孤儿：父不在行集中 → 短 id + Tooltip 恒完整 id
    return { text: `↳ ${shortId(row.parentId)}`, aria: t('dash.parent.label', { title: row.parentId }), isOrphan: true, fullId: row.parentId }
  })() : null

  return (
    <tr className={selected ? 'dsh-dash-row dsh-dash-row-selected' : 'dsh-dash-row'} onClick={isSub ? undefined : onToggle}>
      <td className="dsh-dash-td" onClick={e => { e.stopPropagation() }}>
        {/* 子代理行不参与选择——操作收敛主会话行 */}
        {!isSub && (
        <input
          type="checkbox" className="dsh-dash-check" checked={selected}
          onChange={onToggle}
          aria-label={t('dash.row.select.aria', { title: row.title })}
          data-dsh-batch-ui=""
        />
        )}
      </td>
      <td className="dsh-dash-td">
        <div className="dsh-dash-session-cell" style={{ paddingLeft: `${String(indentPx)}px` }}>
          {/* 展开/折叠按钮 */}
          {row.hasChildren && (
            <button
              type="button" className="dsh-dash-expand-btn"
              aria-expanded={isExpanded} aria-label={isExpanded ? t('dash.tree.collapse', { title: row.title }) : t('dash.tree.expand', { title: row.title, n: String(row.childCount) })}
              onClick={e => { e.stopPropagation(); onExpand?.() }}
              data-dsh-batch-ui=""
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          {/* 连接线（子行） */}
          {row.depth > 0 && <span className="dsh-dash-tree-connector" aria-hidden="true">└</span>}
          {/* 自身运行指示（读屏可见：级联原子性的安全前置） */}
          {row.running && <>
            <Tooltip portal label={t('dash.badge.running')}>
              <StateDot state="ongoing" />
            </Tooltip>
            <span className="dsh-dash-sr-only" role="img" aria-label={t('dash.badge.running')} />
          </>}
          {/* 标题 */}
          <Tooltip portal label={row.title} onlyWhenClipped>
            <span className={isSub ? 'dsh-dash-session-title dsh-dash-session-title-sub' : 'dsh-dash-session-title'}>{row.title}</span>
          </Tooltip>
          {/* fork「派生」Tag（产品经理终裁第 5 条：纯信息、不参与语义） */}
          {!isSub && row.parentId !== undefined && row.origin !== 'subagent' && (
            <Tooltip portal label={t('dash.fork.origin', { title: row.parentTitle ?? row.parentId })}>
              <Tag tone="quiet">{t('dash.fork.tag')}</Tag>
            </Tooltip>
          )}
          {/* 子数徽标 */}
          {row.hasChildren && (
            <Tag tone="quiet">
              {collapsed && row.runningDescendants && <>
                <Tooltip portal label={t('dash.tree.childrenRunning')}>
                  <StateDot state="ongoing" />
                </Tooltip>
                <span className="dsh-dash-sr-only" role="img" aria-label={t('dash.tree.childrenRunning')} />
              </>}
              {'▸ '}{row.childCount}
            </Tag>
          )}
          {/* 身份徽标 */}
          {isSub && <Tag tone="info">{t('dash.badge.subagent')}</Tag>}
          {isArchived && <Tag tone="neutral">{t('dash.badge.archived')}</Tag>}
          {!isSub && row.pinned && <Tag tone="quiet">{t('dash.badge.pinned')}</Tag>}
          {/* 错误图标 */}
          {hasError && (
            <Tooltip portal label={stats.error === 'corrupt' ? t('dash.error.corrupt') : t('dash.error.read-failed')}>
              <IconWarningOutlineRegular size={12} />
            </Tooltip>
          )}
          {/* 行级恢复按钮（已归档档 + 显式归档行） */}
          {restoreActive && (
            <button type="button" className="dsh-batch-btn"
              onClick={e => { e.stopPropagation(); onRestore(row.id) }}
              aria-label={t('dash.restore.row.aria', { title: row.title })}
              data-dsh-batch-ui=""
            >{t('dash.restore.row')}</button>
          )}
          {restoreDisabled && row.closestArchivedAncestorId && (
            <Tooltip portal label={t(restoreKey, { title: titleOf(row.closestArchivedAncestorId) })}>
              <button type="button" className="dsh-batch-btn" disabled
                aria-label={t('dash.restore.row.aria', { title: row.title })}
                data-dsh-batch-ui=""
              >{t('dash.restore.row')}</button>
            </Tooltip>
          )}
          {/* 子代理档「所属主会话」小字 */}
          {parentDisplay && (
            <Tooltip portal label={parentDisplay.isOrphan ? parentDisplay.fullId : row.parentTitle!} onlyWhenClipped={!parentDisplay.isOrphan}>
              <span className="dsh-dash-parent-label" role="note" aria-label={parentDisplay.aria}>{parentDisplay.text}</span>
            </Tooltip>
          )}
        </div>
        <div className="dsh-dash-session-model-sub">{stats.model ?? '—'}</div>
      </td>
      {/* 项目列 */}
      <td className="dsh-dash-td">
        {row.projectLabel !== undefined ? (
          <Tooltip portal openOnClick label={row.projectKey ?? ''}>
            <span className="dsh-dash-project-label">{row.projectLabel}</span>
          </Tooltip>
        ) : (
          <><span aria-hidden="true" className="dsh-dash-project-label">—</span><span className="dsh-dash-sr-only">{t('dash.noData')}</span></>
        )}
      </td>
      <td className="dsh-dash-td dsh-dash-model-col">
        {hasError ? (
          <><span aria-hidden="true">—</span><span className="dsh-dash-sr-only">{t('dash.noData')}</span></>
        ) : (
          <Tooltip portal label={stats.model ?? ''} onlyWhenClipped>
            <span className="dsh-dash-session-subtitle">{stats.model ?? '—'}</span>
          </Tooltip>
        )}
      </td>
      <td className="dsh-dash-td dsh-dash-td-right">
        {hasError || tokenTotal === null ? (
          <><span aria-hidden="true">—</span><span className="dsh-dash-sr-only">{t('dash.noData')}</span></>
        ) : (
          <Tooltip portal openOnClick label={
            `${t('dash.tip.input')}: ${formatNum(stats.usage!.uncachedInputTokens)}\n${t('dash.tip.output')}: ${formatNum(stats.usage!.outputTokens)}\n${t('dash.tip.cacheRead')}: ${formatNum(stats.usage!.cacheReadTokens)}\n${t('dash.tip.cacheWrite')}: ${formatNum(stats.usage!.cacheWriteTokens)}\n${t('dash.tip.usageNote')}`
          }>
            <span onClick={e => { e.stopPropagation() }}>{compactNum(tokenTotal)}</span>
          </Tooltip>
        )}
      </td>
      <td className="dsh-dash-td dsh-dash-td-right">
        {hasError || stats.usage === null ? (
          <><span aria-hidden="true">—</span><span className="dsh-dash-sr-only">{t('dash.noData')}</span></>
        ) : (
          <Tooltip portal openOnClick label={`${t('dash.tip.cacheRead')}: ${formatNum(stats.usage.cacheReadTokens)}\n${t('dash.tip.cacheWrite')}: ${formatNum(stats.usage.cacheWriteTokens)}`}>
            <span onClick={e => { e.stopPropagation() }}>{compactNum(stats.usage.cacheReadTokens)} / {compactNum(stats.usage.cacheWriteTokens)}</span>
          </Tooltip>
        )}
      </td>
      <td className="dsh-dash-td">
        {hasError || ctxPercent === null || ctxWindow === undefined ? (
          <><span aria-hidden="true">—</span><span className="dsh-dash-sr-only">{t('dash.noData')}</span></>
        ) : (
          <Tooltip portal openOnClick label={
            t('dash.tip.context', { used: compactNum(ctxUsed ?? 0), window: compactNum(ctxWindow), percent: String(ctxPercent) })
            + '\n' + t('dash.tip.contextNote')
          }>
            <span className="dsh-dash-ctx-bar" onClick={e => { e.stopPropagation() }}>
              <span className="dsh-dash-ctx-track">
                <span className={ctxWarn ? 'dsh-dash-ctx-fill dsh-dash-ctx-fill-warn' : 'dsh-dash-ctx-fill'} style={{ width: `${String(ctxPercent)}%` }} />
              </span>
              <span className={ctxWarn ? 'dsh-dash-ctx-percent dsh-dash-ctx-percent-warn' : 'dsh-dash-ctx-percent'}>{ctxPercent}%</span>
              <span className="dsh-dash-ctx-detail">~{compactNum(ctxUsed ?? 0)} / {compactNum(ctxWindow)}</span>
            </span>
          </Tooltip>
        )}
      </td>
    </tr>
  )
}

function NoticePanel({ notice, t, onDismiss }: {
  notice: BatchNotice; t: TranslateFn; onDismiss: () => void
}): ReactNode {
  // auto-dismiss: 6s for success/info, 15s for error
  useEffect(() => {
    const delay = notice.kind === 'error' ? 15_000 : 6_000
    const timer = setTimeout(onDismiss, delay)
    return () => clearTimeout(timer)
  }, [notice.seq, notice.kind, onDismiss])

  // 通过字典查找失败原因的文案
  const failureLabel = (failure: { code: string; message?: string }): string => {
    const dictKey = `notice.code.${failure.code}`
    const dictText = t(dictKey)
    // 字典里没有对应键时回落原 code
    if (dictText === dictKey) return failure.message ?? failure.code
    return failure.message !== undefined && failure.message !== '' ? `${dictText}: ${failure.message}` : dictText
  }

  return (
    <div className="dsh-batch-notice" data-dsh-batch-ui="" role="status">
      <div className="dsh-batch-notice-head">
        {notice.kind === 'error' && <IconWarningOutlineRegular size={14} />}
        <span className="dsh-batch-notice-text">{t(notice.textKey, notice.params)}</span>
        <button type="button" className="dsh-batch-notice-close" aria-label={t('notice.close')} onClick={onDismiss}>
          <IconCloseOutlineRegular size={12} />
        </button>
      </div>
      {notice.failures !== undefined && notice.failures.length > 0 && (
        <ul className="dsh-batch-failures">
          {notice.failures.map((failure, index) => (
            <li key={failure.id !== '' ? failure.id : `idx-${String(index)}`}>
              {failure.title !== '' && <span className="dsh-batch-fail-title">{failure.title}</span>}
              <span className="dsh-batch-fail-reason">{failureLabel(failure)}</span>
            </li>
          ))}
        </ul>
      )}
      {notice.action !== undefined && (
        <button type="button" className="dsh-batch-notice-action" onClick={() => { notice.action!.run() }}>
          {t(notice.action.labelKey, notice.action.params)}
        </button>
      )}
    </div>
  )
}

// === utilities ===

function compactNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1e6) {
    const v = n / 1000
    return v >= 100 ? String(Math.round(v)) + 'k' : String(Math.round(v * 10) / 10) + 'k'
  }
  const v = n / 1e6
  return v >= 100 ? String(Math.round(v)) + 'M' : String(Math.round(v * 10) / 10) + 'M'
}

function formatNum(n: number): string {
  return new Intl.NumberFormat().format(n)
}

function discoverRouteBase(): string {
  const injected = typeof window === 'undefined' ? undefined : window.__DSH_SESSION_BATCH_MANAGER__
  const base = injected?.routeBase
  if (typeof base === 'string' && base.startsWith('/')) return base.replace(/\/+$/, '')
  return '/dsh-session-batch-manager/v1'
}

/** 短 id：`session-<uuid>` 取前缀 + uuid 前 8 位，裸 UUID 取前 8 位，加省略号。 */
function shortId(id: string): string {
  if (id.startsWith('session-')) {
    const uuid = id.slice(8)
    return `session-${uuid.slice(0, 8)}…`
  }
  return `${id.slice(0, 8)}…`
}

/** YYYY-MM-DD 日期格式（D15 召回清单时间列）。 */
function formatDate(ts: number | undefined): string {
  if (ts === undefined) return '—'
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}