/**
 * 召回候选派生——纯函数层（D17：从组件抽离，可单测）。
 *
 * 将未分组的主会话按 cwd 聚类，子代理计数走 parentId 亲缘链（D14）。
 *
 * @module client/dashboard-recall
 */

import type { DashboardRow, RecallCandidate, SessionIdString } from './types.ts'

/** 一个 cwd 聚类的召回组。 */
export interface RecallGroup {
  readonly path: string
  readonly title: string
  readonly candidates: RecallCandidate[]
  /** 组内所有候选的亲缘子代理总数（按 parentId 链唯一计数）。 */
  subagentCount: number
}

/**
 * 从看板行集中派生召回候选清单。
 *
 * 规则：
 * - 排除子代理（origin === 'subagent'）与无 cwd 的会话；
 * - 排除已在任意工作区内的会话（groupedIds）；
 * - 主会话按 cwd（两侧去尾斜杠）聚为一组；
 * - 子代理计数沿 parentId 亲缘链（非 cwd 字符串相等，D14）；
 * - 每组内候选按 updatedAt 降序排列（D15）。
 *
 * @param rows 看板 join 后的全量行集
 * @param groupedIds 已分组（已挂账工作区）的会话 id 集合
 * @returns cwd 归一化路径 → 召回组映射
 */
export function computeRecallCandidates(
  rows: readonly DashboardRow[],
  groupedIds: ReadonlySet<SessionIdString>,
): Map<string, RecallGroup> {
  // parentId → 子行 id 索引（亲缘计数，D14）
  // 注意：只装 subagent 子行——fork 不是子代理，不进 childrenOf 也不被计入亲缘（F1）
  const childrenOf = new Map<string, string[]>()
  const subagentIds = new Set<string>()
  for (const row of rows) {
    if (row.origin === 'subagent') {
      subagentIds.add(row.id)
      if (row.parentId) {
        let list = childrenOf.get(row.parentId)
        if (!list) { list = []; childrenOf.set(row.parentId, list) }
        list.push(row.id)
      }
    }
  }

  /** 递归统计某个会话的亲缘子代理数（去重防环；非 subagent 行跳过不深入，F1）。 */
  function countDescendants(id: string, visited: Set<string>): number {
    let count = 0
    const children = childrenOf.get(id)
    if (children) {
      for (const cid of children) {
        if (visited.has(cid)) continue
        visited.add(cid)
        count += 1 + countDescendants(cid, visited)
      }
    }
    return count
  }

  const map = new Map<string, RecallGroup>()
  for (const row of rows) {
    if (row.origin === 'subagent') continue
    if (row.cwd === undefined || row.cwd === '') continue
    if (groupedIds.has(row.id)) continue
    const norm = row.cwd.replace(/[/\\]+$/, '')
    let group = map.get(norm)
    if (group === undefined) {
      const basename = norm.slice(Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\')) + 1) || norm
      group = { path: norm, title: basename, candidates: [], subagentCount: 0 }
      map.set(norm, group)
    }
    const descendantSet = new Set<string>()
    const subCount = countDescendants(row.id, descendantSet)
    group.subagentCount += subCount
    group.candidates.push({
      id: row.id,
      title: row.title,
      cwd: row.cwd,
      updatedAt: row.updatedAt,
      subagentCount: subCount,
    })
  }
  // 每组内 candidates 按 updatedAt 降序（D15）
  for (const group of map.values()) {
    group.candidates.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }
  return map
}