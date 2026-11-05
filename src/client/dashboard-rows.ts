/**
 * 看板行集派生——纯函数，无运行时依赖（只允许 `import type`）。
 *
 * 行集与标题规则见 docs/design-session-dashboard.md §5.2 / §5.3。
 *
 * @module client/dashboard-rows
 */

import type {
  DashboardFilter, DashboardRow, SessionIdString, SessionRowSummary, StatsResponse,
} from './types.ts'
import type { TreeRow } from './dashboard-tree.ts'

/** join 所需的五路输入（全部来自客户端已有快照，不触发 I/O）。 */
export interface DashboardJoinInputs {
  /** stats 路由响应；降级或失败时不产生行。 */
  readonly data: StatsResponse | null
  /** `sessions.list` 快照的 Host-list 成员 id（行集基准）。 */
  readonly ids: readonly SessionIdString[]
  /** `sessions.list` 快照的 byId（含子代理回退行，用于 origin/parentId/blank 判定与合成）。 */
  readonly byId: Record<SessionIdString, SessionRowSummary>
  /** `workspaces.list` 的归档集合。 */
  readonly archivedSessionIds: readonly SessionIdString[]
  /** `workspaces.list` 的置顶集合。 */
  readonly pinnedSessionIds: readonly SessionIdString[]
  /** 侧栏墓碑 id（本地已删、宿主索引未对账完）。 */
  readonly tombstones: readonly SessionIdString[]
}

/**
 * 派生看板行集（v0.2 基准翻转）。
 *
 * 基准 = `SessionListState.ids`（Host-list 成员）∪ 子代理行（origin==='subagent' 且父链可达 ids）；
 * `/stats` 降为富集（Map 查找，缺席照常发射、显示降级字段）；
 * stats-only 行（∉ids、无父可合成）在 join 层直接丢弃；
 * blank 一刀切排除（含已落盘零轮次，看板口径 = 至少一轮对话）。
 * @param inputs - 五路客户端快照。
 * @returns 看板行，顺序沿用 ids 的行序（子代理紧随其父）。
 */
export function joinDashboardRows(inputs: DashboardJoinInputs): DashboardRow[] {
  const { data, ids, byId, archivedSessionIds, pinnedSessionIds, tombstones } = inputs
  if (data === null || !data.ok) return []
  const archived = new Set(archivedSessionIds)
  const pinned = new Set(pinnedSessionIds)
  const removed = new Set(tombstones)
  const statsById = new Map(data.sessions.map(s => [s.id, s]))

  // Step 1: 行集——ids ∪ 子代理（父链可达 ids，BFS）
  const rowSet = new Set(ids)
  const queue = [...ids]
  // 子代索引：parentId → 子代理 id 列表
  const childMap = new Map<SessionIdString, SessionIdString[]>()
  for (const [sid, s] of Object.entries(byId)) {
    if (s.origin !== 'subagent' || s.parentId === undefined) continue
    const list = childMap.get(s.parentId) ?? []
    list.push(sid)
    childMap.set(s.parentId, list)
  }
  while (queue.length > 0) {
    const pid = queue.pop()!
    for (const cid of childMap.get(pid) ?? []) {
      if (!rowSet.has(cid)) { rowSet.add(cid); queue.push(cid) }
    }
  }

  // Step 2: ids 序推出行，子代理紧随其父
  const rows: DashboardRow[] = []
  const pushRow = (id: SessionIdString, fromParent: boolean): void => {
    if (removed.has(id)) return
    const session = byId[id]
    // zero-turn/blank：看板 = 至少一轮对话（行为口径，键控字段待架构师核实）
    if (isZeroTurnOrBlank(session)) return
    if (!fromParent && !ids.includes(id)) return // 子代理只在从父递归时发射
    const stats = statsById.get(id) ?? { id, model: null, usage: null, pressure: null, error: null }
    rows.push({
      id,
      title: titleOf(session, id),
      origin: session?.origin,
      parentId: session?.parentId,
      cwd: session?.cwd,
      running: session?.running ?? false,
      archived: archived.has(id),
      pinned: pinned.has(id),
      updatedAt: session?.updatedAt,
      stats,
    })
    // 递归子代理（子紧随父，形成插入序）
    for (const cid of childMap.get(id) ?? []) {
      if (rowSet.has(cid)) pushRow(cid, true)
    }
  }
  for (const id of ids) {
    if (rowSet.has(id)) pushRow(id, false)
  }
  return rows
}

/**
 * 按过滤档收窄行集（v0.2 两档）。
 *
 * @param rows - 树形行列表（tree 之后）。
 * @param filter - 当前档位。
 * @returns 过滤后的行。
 */
export function filterDashboardRows(
  rows: readonly TreeRow[],
  filter: DashboardFilter,
): TreeRow[] {
  return rows.filter(row => {
    const effectiveArchived = row.archived || row.lineageArchived
    if (filter === 'main') return !effectiveArchived
    return effectiveArchived // 'archived'
  })
}

/**
 * 标题：持久化 `title`，空值回落会话 id。
 *
 * 不采信 `displayTitle`——它的回落链会把无标题会话显示成项目目录 basename。
 * @param session - 列表行摘要，可能缺席。
 * @param id - 会话 id。
 * @returns 标题文本。
 */
function titleOf(session: SessionRowSummary | undefined, id: SessionIdString): string {
  const title = session?.title || id
  return title
}

/**
 * v0.2 行为口径：看板会话 = 至少一轮对话。
 * blank = 首个 turn/start 事件前为 true（含已落盘零轮次与未落盘草稿）。
 * 桌面/沙箱实证：0/114 有缓存缺失（cold fallback ?? false），单键足矣。
 */
function isZeroTurnOrBlank(session: SessionRowSummary | undefined): boolean {
  return session?.blank === true
}