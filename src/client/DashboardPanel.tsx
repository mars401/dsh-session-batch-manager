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
  DashboardFilter, DashboardRow, DashboardState, StatsResponse, TranslateFn,
} from './types.ts'
import { BODY_DASHBOARD_CLASS } from './styles.ts'
import { joinDashboardRows, filterDashboardRows } from './dashboard-rows.ts'
import type { DashboardJoinInputs } from './dashboard-rows.ts'

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

  // 数据状态（不归 store 管）
  const [data, setData] = useState<StatsResponse | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  const pollerRef = useRef(createStatsPoller())
  const panelRef = useRef<HTMLDivElement>(null)

  const titleOf = useCallback((id: string): string => {
    const row = sessions.list.getSnapshot().byId[id]
    const title = row?.displayTitle
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

  // Esc 关闭
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (store.get().confirmDelete !== null) return
        if (store.get().busy !== null) return
        e.preventDefault(); e.stopPropagation()
        doClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onToggle, store])

  // join 数据
  const rows = useMemo((): DashboardRow[] => {
    const byId = sessions.list.getSnapshot().byId
    const ws = workspaces.list.getSnapshot()
    return joinDashboardRows({
      data,
      byId,
      archivedSessionIds: ws.archivedSessionIds,
      pinnedSessionIds: ws.pinnedSessionIds,
      tombstones: sidebarOps.tombstones,
    })
  }, [data, sessions.list, workspaces.list, sidebarOps.tombstones])

  const filteredRows = useMemo(() => {
    return filterDashboardRows(rows, filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const all = rows.length
    const main = rows.filter(r => r.origin !== 'subagent' && !r.archived).length
    const sub = rows.filter(r => r.origin === 'subagent' && !r.archived).length
    const arch = rows.filter(r => r.archived).length
    return { all, main, sub, arch }
  }, [rows])

  const allArchived = selected.length > 0 && selected.every(id => {
    const row = rows.find(r => r.id === id)
    return row?.archived ?? false
  })
  const noneSelected = selected.length === 0
  const working = busy !== null
  const isDegraded = data !== null && data.ok && data.degraded

  // 关闭面板
  const doClose = useCallback(() => {
    if (working) return
    onToggle()
    store.clearSelection()
  }, [working, onToggle, store])

  // 刷新
  const doRefresh = useCallback(() => {
    setFetchError(false)
    void fetchStats().then(res => { setData(res); if (res.ok) setFetchError(false) })
  }, [])

  // 批量归档
  const doArchive = useCallback(async () => {
    if (selected.length === 0) return
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
      store.showNotice({ kind: ok > 0 ? 'success' : 'info', textKey: ok > 0 ? 'notice.archived' : 'notice.noneArchived', params: { n: ok } })
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

  // 删除
  const doDelete = useCallback(async (ids: readonly string[]) => {
    if (ids.length === 0) return
    store.closeConfirm()
    store.dismissNotice()
    store.setBusy('bar.busyDeleting', 0, ids.length)
    try {
      const result = await runDeleteCore(ids, discoverRouteBase(), titleOf)
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
  }, [titleOf, sidebarOps, store])

  // 全选当前视图
  const selectAll = useCallback(() => {
    store.selectAll(filteredRows.map(r => r.id))
  }, [filteredRows, store])

  // 过滤 + 切换选中（都走 store）
  const onFilter = useCallback((f: DashboardFilter) => { store.setFilter(f) }, [store])
  const toggleRow = useCallback((id: string) => { store.toggleSelect(id) }, [store])

  if (!open) return null

  const pending = data?.pending ?? 0
  const loaded = filteredRows.length
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
          <div className="dsh-dash-toolbar">
            <Pill active={filter === 'all'} onClick={() => { onFilter('all') }}>{t('dash.filter.all')} {counts.all}</Pill>
            <Pill active={filter === 'main'} onClick={() => { onFilter('main') }}>{t('dash.filter.main')} {counts.main}</Pill>
            <Pill active={filter === 'subagent'} onClick={() => { onFilter('subagent') }}>{t('dash.filter.subagent')} {counts.sub}</Pill>
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
          </div>

          <div className="dsh-dash-table-wrapper">
            {isDegraded && (
              <div className="dsh-dash-notice-bar"><IconWarningOutlineRegular size={14} /><span>{t('dash.degraded')}</span></div>
            )}
            {fetchError && (
              <div className="dsh-dash-notice-bar"><IconWarningOutlineRegular size={14} /><span>{t('dash.loadFailed')}</span><button type="button" className="dsh-batch-btn" onClick={doRefresh}>{t('dash.retry')}</button></div>
            )}
            {initialLoad && (data === null || data.sessions.length === 0) ? (
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
            ) : filteredRows.length === 0 ? (
              <div className="dsh-dash-empty">
                <span className="dsh-dash-empty-title">{t('dash.emptyFiltered.title')}</span>
                <button type="button" className="dsh-batch-notice-action" onClick={() => { onFilter('all') }}>{t('dash.emptyFiltered.clear')}</button>
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
                  {filteredRows.map(row => (
                    <DashboardRowView
                      key={row.id}
                      row={row}
                      selected={selected.includes(row.id)}
                      onToggle={() => { toggleRow(row.id) }}
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

      {confirmDelete !== null && (
        <Modal
          open
          closeLabel={t('delete.cancel')}
          onClose={() => { if (!working) store.closeConfirm() }}
          title={t('delete.title', { n: confirmDelete.length })}
          description={t('delete.desc')}
          footer={(
            <>
              <Button variant="outline" disabled={working} onClick={() => { store.closeConfirm() }}>{t('delete.cancel')}</Button>
              <Button variant="outline" className="dsh-batch-danger-btn" disabled={working} onClick={() => { void doDelete(confirmDelete) }}>{t('delete.confirm')}</Button>
            </>
          )}
        >
          <ul className="dsh-batch-delete-list">
            {confirmDelete.slice(0, 8).map(id => <li key={id}>{titleOf(id)}</li>)}
            {confirmDelete.length > 8 && <li>{t('delete.more', { n: confirmDelete.length - 8 })}</li>}
          </ul>
        </Modal>
      )}

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
      <col className="dsh-dash-model-col" style={{ width: '180px' }} />
      <col style={{ width: '100px' }} />
      <col style={{ width: '120px' }} />
      <col style={{ width: '240px' }} />
    </colgroup>
    <thead>
      <tr>
        <th className="dsh-dash-th" scope="col" aria-label={t('dash.selectAll.aria', { n: 0 })} />
        <th className="dsh-dash-th" scope="col">{t('dash.col.session')}</th>
        <th className="dsh-dash-th dsh-dash-model-col" scope="col">{t('dash.col.model')}</th>
        <th className="dsh-dash-th dsh-dash-th-right" scope="col">{t('dash.col.tokens')}</th>
        <th className="dsh-dash-th dsh-dash-th-right" scope="col">{t('dash.col.cache')}</th>
        <th className="dsh-dash-th" scope="col">{t('dash.col.context')}</th>
      </tr>
    </thead>
    </>
  )
}

function DashboardRowView({ row, selected, onToggle, t }: {
  row: DashboardRow; selected: boolean; onToggle: () => void; t: TranslateFn
}): ReactNode {
  const stats = row.stats
  const hasError = stats.error !== null

  const tokenTotal = stats.usage !== null
    ? stats.usage.uncachedInputTokens + stats.usage.outputTokens + stats.usage.cacheReadTokens + stats.usage.cacheWriteTokens
    : null

  const ctxUsed = stats.pressure?.projectedTokens ?? stats.pressure?.pressureTokens
  const ctxWindow = stats.pressure?.contextWindow
  const ctxPercent = ctxUsed !== undefined && ctxWindow !== undefined && ctxWindow > 0
    ? Math.min(100, Math.round(ctxUsed / ctxWindow * 100))
    : null
  const ctxWarn = ctxPercent !== null && ctxPercent >= 90

  return (
    <tr className={selected ? 'dsh-dash-row dsh-dash-row-selected' : 'dsh-dash-row'} onClick={onToggle}>
      <td className="dsh-dash-td" onClick={e => { e.stopPropagation() }}>
        <input type="checkbox" className="dsh-dash-check" checked={selected} onChange={onToggle} aria-label={t('dash.row.select.aria', { title: row.title })} data-dsh-batch-ui="" />
      </td>
      <td className="dsh-dash-td">
        <div className="dsh-dash-session-cell">
          {row.running && <StateDot state="ongoing" />}
          <Tooltip portal label={row.title} onlyWhenClipped>
            <span className="dsh-dash-session-title">{row.title}</span>
          </Tooltip>
          {row.origin === 'subagent' && <Tag tone="info">{t('dash.badge.subagent')}</Tag>}
          {row.archived && <Tag tone="neutral">{t('dash.badge.archived')}</Tag>}
          {row.pinned && <Tag tone="quiet">{t('dash.badge.pinned')}</Tag>}
          {hasError && (
            <Tooltip portal label={stats.error === 'corrupt' ? t('dash.error.corrupt') : t('dash.error.read-failed')}>
              <IconWarningOutlineRegular size={12} />
            </Tooltip>
          )}
        </div>
        <div className="dsh-dash-session-model-sub">{stats.model ?? '—'}</div>
      </td>
      <td className="dsh-dash-td dsh-dash-model-col">
        {hasError ? '—' : (
          <Tooltip portal label={stats.model ?? ''} onlyWhenClipped>
            <span className="dsh-dash-session-subtitle">{stats.model ?? '—'}</span>
          </Tooltip>
        )}
      </td>
      <td className="dsh-dash-td dsh-dash-td-right">
        {hasError || tokenTotal === null ? (
          <span aria-hidden="true">—</span>
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
          <span aria-hidden="true">—</span>
        ) : (
          <Tooltip portal openOnClick label={`${t('dash.tip.cacheRead')}: ${formatNum(stats.usage.cacheReadTokens)}\n${t('dash.tip.cacheWrite')}: ${formatNum(stats.usage.cacheWriteTokens)}`}>
            <span onClick={e => { e.stopPropagation() }}>{compactNum(stats.usage.cacheReadTokens)} / {compactNum(stats.usage.cacheWriteTokens)}</span>
          </Tooltip>
        )}
      </td>
      <td className="dsh-dash-td">
        {hasError || ctxPercent === null || ctxWindow === undefined ? (
          <span aria-hidden="true">—</span>
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