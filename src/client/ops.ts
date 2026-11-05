/**
 * 批量操作的实现：归档 / 恢复 / 删除 / 全选。
 *
 * 归档与恢复走 dsh 原生的 `workspaces` 客户端服务（与 GUI 内置的单个归档同一条路）；
 * 删除走宿主半的 HTTP 路由（dsh 没有原生的删除会话 API），请求携带自定义头
 * `x-dsh-session-batch-manager: 1` 以通过宿主侧的浏览器信任栅栏。
 *
 * 批量归档对「会话有运行中工作」的拒绝（宿主 rpcError code `workspace/session-active`）
 * 做单独归类，并在结果通知里给出「停止并归档」一键重试（`stopActivity: true`）——
 * 与 GUI 原生归档对话框的升级路径一致。
 * @module client/ops
 */

import type { BatchStore } from './store.ts'
import { deriveSource } from './store.ts'
import type {
  BatchFailure, BatchOpsFace, ClientSessionsLike, ClientWorkspacesLike,
  ObservableLike, SessionIdString,
} from './types.ts'

/** 浏览器半的完整操作面（含注入 hooks 舱用的派生源与探测到的路由前缀）。 */
export interface BatchOps extends BatchOpsFace {
  /** 归档集派生源（`useArchivedIds` 的订阅输入）。 */
  readonly archivedIdsSource: ObservableLike<ReadonlySet<SessionIdString>>
  /** 生效的宿主路由前缀。 */
  readonly routeBase: string
}

/** 宿主归档拒绝码：会话有运行中工作。 */
const ACTIVE_REFUSAL_CODE = 'workspace/session-active'

/** 行 key 前缀（ui-workspace 的 Rows 渲染契约）。 */
const ROW_KEY_PREFIX = 'session:'

/** 页面全局里宿主注入的配置（`webserver/index-inject` 的 global 行）。 */
declare global {
  interface Window {
    __DSH_SESSION_BATCH_MANAGER__?: { readonly routeBase?: string; readonly statsPollIntervalMs?: number }
  }
}

/** 宿主注入缺席时的路由前缀默认值（与宿主半 Config 默认一致）。 */
const DEFAULT_ROUTE_BASE = '/dsh-session-batch-manager/v1'

/**
 * 发现生效的路由前缀：优先页面全局注入，缺席时回落默认值。
 * @returns 无尾斜杠的绝对路径前缀。
 */
function discoverRouteBase(): string {
  const injected = typeof window === 'undefined' ? undefined : window.__DSH_SESSION_BATCH_MANAGER__
  const base = injected?.routeBase
  if (typeof base === 'string' && base.startsWith('/')) return base.replace(/\/+$/, '')
  return DEFAULT_ROUTE_BASE
}

/**
 * 归档拒绝是否为「会话有运行中工作」。
 *
 * `WorkspaceArchiveError` 的类身份属于宿主 bundle，跨 bundle 不能用 instanceof；
 * 与 ui-workspace 相同的判别方式：name + rpcError.code。
 * @param reason - 拒绝值。
 * @returns 是否活动拒绝。
 */
function isSessionActiveRefusal(reason: unknown): boolean {
  return reason instanceof Error
    && reason.name === 'WorkspaceArchiveError'
    && (reason as { rpcError?: { code?: string } }).rpcError?.code === ACTIVE_REFUSAL_CODE
}

/** 拒绝值的可读消息。 */
function failureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message !== '') return reason.message
  return String(reason)
}

/** 删除请求的携带分类的失败。 */
export class DeleteRequestError extends Error {
  /** 失败分类（映射到 `notice.code.*` 字典键）。 */
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DeleteRequestError'
    this.code = code
  }
}

// === ops 核心层：不触碰任何选择集，返回结构化结果 ===

/** 批量归档核心的单个结果。 */
export interface ArchiveCoreResult {
  ok: number
  active: SessionIdString[]
  failures: BatchFailure[]
}

/** 核心层可选参数。 */
export interface CoreOptions {
  /** 每完成一条调一次（用于 busy 进度条逐条推进）。 */
  onProgress?: () => void
}

/**
 * 批量归档核心——不触碰任何选择集。
 * @param ids - 目标会话。
 * @param workspaces - 客户端工作区服务。
 * @param titleOf - 会话标题解析。
 * @param stopActivity - 是否先停止运行中的工作。
 * @param opts - 可选回调。
 * @returns 结构化结果。
 */
export async function runArchiveCore(
  ids: readonly SessionIdString[],
  workspaces: ClientWorkspacesLike,
  titleOf: (id: SessionIdString) => string,
  stopActivity: boolean,
  opts?: CoreOptions,
): Promise<ArchiveCoreResult> {
  const active: SessionIdString[] = []
  const failures: BatchFailure[] = []
  let ok = 0
  for (const id of ids) {
    try {
      await workspaces.archiveSession(id, stopActivity ? { stopActivity: true } : undefined)
      ok += 1
      opts?.onProgress?.()
    } catch (reason: unknown) {
      if (!stopActivity && isSessionActiveRefusal(reason)) active.push(id)
      else failures.push({ id, title: titleOf(id), code: 'archive-failed', message: failureMessage(reason) })
    }
  }
  return { ok, active, failures }
}

/** 批量恢复核心的结果。 */
export interface UnarchiveCoreResult {
  ok: number
  failures: BatchFailure[]
}

/**
 * 批量恢复核心——不触碰任何选择集。
 */
export async function runUnarchiveCore(
  ids: readonly SessionIdString[],
  workspaces: ClientWorkspacesLike,
  titleOf: (id: SessionIdString) => string,
  opts?: CoreOptions,
): Promise<UnarchiveCoreResult> {
  const failures: BatchFailure[] = []
  let ok = 0
  for (const id of ids) {
    try {
      await workspaces.unarchiveSession(id)
      ok += 1
      opts?.onProgress?.()
    } catch (reason: unknown) {
      failures.push({ id, title: titleOf(id), code: 'unarchive-failed', message: failureMessage(reason) })
    }
  }
  return { ok, failures }
}

/** 批量删除核心的结果。 */
export interface DeleteCoreResult {
  okIds: SessionIdString[]
  failures: BatchFailure[]
}

/**
 * 批量删除核心——不触碰任何选择集。
 */
export async function runDeleteCore(
  ids: readonly SessionIdString[],
  routeBase: string,
  titleOf: (id: SessionIdString) => string,
): Promise<DeleteCoreResult> {
  if (ids.length === 0) return { okIds: [], failures: [] }
  let response: Response
  try {
    response = await fetch(`${routeBase}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-session-batch-manager': '1' },
      body: JSON.stringify({ sessionIds: ids }),
    })
  } catch {
    throw new DeleteRequestError('network', 'fetch failed')
  }
  if (response.status === 404) {
    throw new DeleteRequestError('route-unavailable', `HTTP 404 from ${routeBase}/delete`)
  }
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json() as { message?: string; error?: string }
      detail = body.message ?? body.error ?? ''
    } catch {
      // 非 JSON 响应体：只带状态码。
    }
    throw new DeleteRequestError('network', detail !== '' ? detail : `HTTP ${String(response.status)}`)
  }
  const payload = await response.json() as {
    results?: { sessionId: string; ok: boolean; code?: string; message?: string }[]
  }
  const results = Array.isArray(payload.results) ? payload.results : []
  const okIds = results.filter(result => result.ok).map(result => result.sessionId)
  const failures: BatchFailure[] = results
    .filter(result => !result.ok)
    .map(result => ({
      id: result.sessionId,
      title: titleOf(result.sessionId),
      code: result.code ?? 'internal',
      message: result.message,
    }))
  const seen = new Set(results.map(result => result.sessionId))
  for (const id of ids) {
    if (!seen.has(id)) failures.push({ id, title: titleOf(id), code: 'internal' })
  }
  return { okIds, failures }
}

/** 归档结果通知展示（侧栏/仪表盘共用）。 */
function showArchiveNotice(
  store: BatchStore,
  result: ArchiveCoreResult,
  stopActivity: boolean,
  retryBatch?: () => void,
): void {
  const { ok, active, failures } = result
  if (active.length === 0 && failures.length === 0) {
    store.showNotice(ok > 0
      ? { kind: 'success', textKey: 'notice.archived', params: { n: ok } }
      : { kind: 'info', textKey: 'notice.noneArchived' })
    return
  }
  store.showNotice({
    kind: 'error',
    textKey: ok > 0 ? 'notice.archived' : 'notice.noneArchived',
    params: { n: ok },
    failures: [
      ...active.map(id => ({ id, title: '', code: 'active' })),
      ...failures,
    ],
    action: active.length > 0 && !stopActivity && retryBatch !== undefined
      ? {
          labelKey: 'notice.stopAndArchive',
          params: { n: active.length },
          run: retryBatch,
        }
      : undefined,
  })
}

/**
 * 创建批量操作面。
 * @param sessions - 客户端会话列表服务（全选过滤、删除后 refresh、标题解析）。
 * @param workspaces - 客户端工作区服务（归档/恢复、归档集快照）。
 * @param store - 批量状态存储。
 * @returns 注入各占位组件的操作面。
 */
export function createBatchOps(
  sessions: ClientSessionsLike,
  workspaces: ClientWorkspacesLike,
  store: BatchStore,
): BatchOps {
  const routeBase = discoverRouteBase()
  const archivedIdsSource = deriveSource(
    workspaces.list,
    snapshot => new Set<SessionIdString>(snapshot.archivedSessionIds),
  )

  const titleOf = (sessionId: SessionIdString): string => {
    // D9 修复（design §12 规则一）：不采信 displayTitle 的目录回落链，用持久化 title || id
    const title = sessions.list.getSnapshot().byId[sessionId]?.title
    return typeof title === 'string' && title !== '' ? title : sessionId
  }

  const selectAllVisible = (): void => {
    const byId = sessions.list.getSnapshot().byId
    const tombstones = new Set(store.get().tombstones)
    const ids: SessionIdString[] = []
    document.querySelectorAll(`[data-row-key^="${ROW_KEY_PREFIX}"]`).forEach((element) => {
      const id = (element.getAttribute('data-row-key') ?? '').slice(ROW_KEY_PREFIX.length)
      if (id === '') return
      const row = byId[id]
      // 与原生列表行为对齐：草稿行与 subagent 行不进「全选」。
      if (row === undefined || row.blank === true || row.origin === 'subagent') return
      // 墓碑行（已被 CSS 隐藏）不进「全选」——双保险：集合 + 可见性。
      if (tombstones.has(id)) return
      if (typeof getComputedStyle === 'function' && getComputedStyle(element).display === 'none') return
      ids.push(id)
    })
    store.addSelected(ids)
  }

  // === 侧栏包装层：调用核心 + 管理 store ===

  /**
   * 批量归档（侧栏包装）。
   * @param ids - 目标会话。
   */
  const runArchiveLoop = async (ids: readonly SessionIdString[], stopActivity: boolean): Promise<void> => {
    if (ids.length === 0) return
    store.dismissNotice()
    store.setBusy('bar.busyArchiving', 0, ids.length)
    const result = await runArchiveCore(ids, workspaces, titleOf, stopActivity, {
      onProgress: () => store.advanceBusy(),
    })
    store.clearBusy()
    store.clearSelection()
    const activeIds = result.active
    showArchiveNotice(store, result, stopActivity, () => { void runArchiveLoop(activeIds, true) })
  }

  /**
   * 批量恢复（侧栏包装）。
   * @param ids - 目标会话。
   */
  const runUnarchiveLoop = async (ids: readonly SessionIdString[]): Promise<void> => {
    if (ids.length === 0) return
    store.dismissNotice()
    store.setBusy('bar.busyUnarchiving', 0, ids.length)
    const result = await runUnarchiveCore(ids, workspaces, titleOf, {
      onProgress: () => store.advanceBusy(),
    })
    store.clearBusy()
    store.clearSelection()
    if (result.failures.length === 0) {
      store.showNotice(result.ok > 0
        ? { kind: 'success', textKey: 'notice.unarchived', params: { n: result.ok } }
        : { kind: 'info', textKey: 'notice.noneUnarchived' })
      return
    }
    store.showNotice({
      kind: 'error',
      textKey: result.ok > 0 ? 'notice.unarchived' : 'notice.noneUnarchived',
      params: { n: result.ok },
      failures: result.failures,
    })
  }

  /**
   * 批量删除（侧栏包装）。
   * @param ids - 目标会话。
   */
  const runDeleteAsync = async (ids: readonly SessionIdString[]): Promise<void> => {
    if (ids.length === 0) return
    store.closeConfirm()
    store.dismissNotice()
    store.setBusy('bar.busyDeleting', 0, ids.length)
    try {
      const result = await runDeleteCore(ids, routeBase, titleOf)
      // 墓碑
      if (result.okIds.length > 0) store.addTombstones(result.okIds)
      store.clearSelection()
      try {
        await sessions.refresh()
      } catch {
        // 刷新失败不影响删除结果。
      }
      store.clearBusy()
      if (result.failures.length === 0) {
        store.showNotice({ kind: 'success', textKey: 'notice.deleted', params: { n: result.okIds.length } })
        return
      }
      store.showNotice({
        kind: 'error',
        textKey: result.okIds.length > 0 ? 'notice.deleted' : 'notice.noneDeleted',
        params: { n: result.okIds.length },
        failures: result.failures,
      })
    } catch (reason: unknown) {
      store.clearBusy()
      const code = reason instanceof DeleteRequestError ? reason.code : 'internal'
      store.showNotice({
        kind: 'error',
        textKey: 'notice.noneDeleted',
        failures: [{ id: '', title: '', code, message: failureMessage(reason) }],
      })
    }
  }

  return {
    archivedIdsSource,
    routeBase,
    peekState: () => store.get(),
    watchBatch: listener => store.source.subscribe(listener),
    enterSelect: seed => { store.setMode('select', seed) },
    exitSelect: () => { store.setMode('off') },
    toggleSession: sessionId => { store.toggle(sessionId) },
    selectAllVisible,
    clearSelection: () => { store.clearSelection() },
    runArchive: ids => { void runArchiveLoop(ids, false) },
    runUnarchive: ids => { void runUnarchiveLoop(ids) },
    requestDeleteConfirm: () => { store.requestDeleteConfirm() },
    closeConfirm: () => { store.closeConfirm() },
    runDelete: ids => { void runDeleteAsync(ids) },
    dismissNotice: () => { store.dismissNotice() },
    titleOf,
  }
}
