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

/** join 所需的四路输入（全部来自客户端已有快照，不触发 I/O）。 */
export interface DashboardJoinInputs {
  /** stats 路由响应；降级或失败时不产生行。 */
  readonly data: StatsResponse | null
  /** `sessions.list` 快照的 byId。 */
  readonly byId: Record<SessionIdString, SessionRowSummary>
  /** `workspaces.list` 的归档集合。 */
  readonly archivedSessionIds: readonly SessionIdString[]
  /** `workspaces.list` 的置顶集合。 */
  readonly pinnedSessionIds: readonly SessionIdString[]
  /** 侧栏墓碑 id（本地已删、宿主索引未对账完）。 */
  readonly tombstones: readonly SessionIdString[]
}

/**
 * 派生看板行集：stats × sessions.list × workspaces.list − tombstones − 未落盘草稿行。
 * @param inputs - 四路客户端快照。
 * @returns 看板行，顺序沿用 stats 的行序。
 */
export function joinDashboardRows(inputs: DashboardJoinInputs): DashboardRow[] {
  const { data, byId, archivedSessionIds, pinnedSessionIds, tombstones } = inputs
  if (data === null || !data.ok) return []
  const archived = new Set(archivedSessionIds)
  const pinned = new Set(pinnedSessionIds)
  const removed = new Set(tombstones)
  const rows: DashboardRow[] = []
  for (const stats of data.sessions) {
    if (removed.has(stats.id)) continue
    const session = byId[stats.id]
    // 草稿行未落盘、零数据、无归档/删除语义：不进看板行集（与侧栏全选的排除规则一致）
    if (session?.blank) continue
    rows.push({
      id: stats.id,
      title: titleOf(session, stats.id),
      origin: session?.origin,
      running: session?.running ?? false,
      archived: archived.has(stats.id),
      pinned: pinned.has(stats.id),
      updatedAt: session?.updatedAt,
      stats,
    })
  }
  return rows
}

/**
 * 按过滤档收窄行集。
 * @param rows - 看板行。
 * @param filter - 当前档位。
 * @returns 过滤后的行。
 */
export function filterDashboardRows(
  rows: readonly DashboardRow[],
  filter: DashboardFilter,
): DashboardRow[] {
  return rows.filter(row => {
    if (filter === 'main') return row.origin !== 'subagent' && !row.archived
    if (filter === 'subagent') return row.origin === 'subagent' && !row.archived
    if (filter === 'archived') return row.archived
    return true
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