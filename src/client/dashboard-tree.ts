/**
 * 看板树形视图派生——纯函数，无运行时依赖（只允许 `import type`）。
 *
 * 树构建复刻 DSH `lineage.ts` 语义：
 * - 子代理（`origin === 'subagent'`、`parentId` 指向已知会话）→ 树中子节点；
 * - 孤儿（parentId 指向缺席的会话）、fork（有 parentId 但不属子代理）→ 树根；
 * - 环成员 visited 集合防无限递归，未遍历到的环成员补发为根。
 *
 * @module client/dashboard-tree
 */

import type { DashboardRow, SessionIdString } from './types.ts'

/** 树形行：DashboardRow + 树结构信息 + 派生标记。 */
export interface TreeRow extends DashboardRow {
  /** 树深度：根 = 0。 */
  readonly depth: number
  /** 直接子行数。 */
  readonly childCount: number
  /** 是否有子行（折叠/展开三角用）。 */
  readonly hasChildren: boolean
  /** 后代中是否有运行中的会话。 */
  readonly runningDescendants: boolean
  /**
   * 是否因血统中有被显式归档的祖先而被派生为归档 ——
   * 四档 filter、归档徽标在此之后以 `effectiveArchived = archived || lineageArchived` 为准。
   */
  readonly lineageArchived: boolean
  /** 项目键：树根 cwd 的规范化全路径（子行继承树根值，孤儿子代理降级为根且无 cwd 时为空）。 */
  readonly projectKey: string | undefined
  /** 项目显示标签：树根 cwd 的 basename（子行继承树根值，孤儿子代理降级为根且无 cwd 时为空）。 */
  readonly projectLabel: string | undefined
  /**
   * 最近的显式归档祖先 id（ancestorArchived 为 true 时必有值）。
   * 用于恢复按钮动态 Tooltip——点名真正能解锁的行，而非中间血统归档祖先。
   * 血统归档行自身恢复也是 no-op，点名它等于给无效目标。
   */
  readonly closestArchivedAncestorId: string | undefined
  /**
   * 父会话标题（子代理行从 byId 取父 row.title；父不在行集时为 undefined 即孤儿）。
   * 用于子代理档「所属主会话」小字——避免经面板 titleOf 走 displayTitle 回落链。
   */
  readonly parentTitle: string | undefined
}

/**
 * 构建树形行集：建树 → 计算深度/计数/血统归档/项目标签。
 *
 * 与 DSH `flattenLineage` 的关键差异：
 * - 输入是 `DashboardRow[]`（已 join），不是 `SessionSummary[]`；
 * - 输出携带 runningDescendants、lineageArchived、projectKey/Label；
 * - 子代理行必须有 `parentId` 且其父在行集中，否则降级为根。
 *
 * @param rows - join 后的看板行。
 * @param archivedSessionIds - 显式归档 id 集合（workspaces.list）。
 *   **当前未消费**：血统归档传播以 `row.archived`（joinDashboardRows 填入）为准，非本形参。
 *   保留于签名用于未来可能的跨层校验，新增代码不得依赖此形参。
 * @returns 平展开的树形行列表，按 DFS 序。
 */
export function buildTree(
  rows: readonly DashboardRow[],
  archivedSessionIds: ReadonlySet<SessionIdString>,
): TreeRow[] {
  const byId = new Map<SessionIdString, DashboardRow>()
  for (const row of rows) byId.set(row.id, row)

  // 1. **v0.2 flatten pass**：子代理挂最近主会话祖先（origin !== 'subagent'），depth 恒 1。
  // 孤儿子代理（父链无主会话可达）不发射——design §13.3 有意分歧于 DSH lineage 降级为根。
  //
  // fork（parentId 存在但 origin !== 'subagent'）按产品经理终裁（2026-11-04）：
  // 作为独立树根、与普通主会话同权；血统/级联在非 subagent 行截断。
  const children = new Map<SessionIdString, DashboardRow[]>()
  const roots: DashboardRow[] = []
  for (const row of rows) {
    if (row.origin === 'subagent' && row.parentId !== undefined) {
      const ancestor = findMainAncestor(row.parentId, byId)
      if (ancestor !== undefined) {
        const list = children.get(ancestor) ?? []
        list.push(row)
        children.set(ancestor, list)
      }
      // 孤儿子代理：不发射
    } else {
      roots.push(row) // 主会话 + fork：均为独立根
    }
  }

  // 2. 第一遍 DFS：建平展列表 + 收集每个 id 的 runningDescendants
  const flat: { row: DashboardRow; depth: number; ancestorArchived: boolean; closestArchivedAncestorId: string | undefined; projectKey: string | undefined; projectLabel: string | undefined }[] = []
  const runningDescendantsMap = new Map<SessionIdString, boolean>()
  const visited = new Set<SessionIdString>()

  const walk = (
    row: DashboardRow,
    depth: number,
    ancestorArchived: boolean,
    closestArchivedAncestorId: string | undefined,
    inheritedProjectKey: string | undefined,
    inheritedProjectLabel: string | undefined,
  ): void => {
    if (visited.has(row.id)) return
    visited.add(row.id)

    const isRoot = depth === 0
    const projectKey = isRoot ? normalizeProjectKey(row.cwd) : inheritedProjectKey
    const projectLabel = isRoot ? projectLabelOf(row.cwd) : inheritedProjectLabel

    // 前序：先推当前行，再递归子（与 DSH lineage.ts 一致）
    flat.push({ row, depth, ancestorArchived, closestArchivedAncestorId, projectKey, projectLabel })

    const kids = children.get(row.id)
    if (kids !== undefined) {
      const childAncestorArchived = ancestorArchived || row.archived
      // 最近的显式归档祖先：若当前行自己就是显式归档 → 当前行 id；否则继承传入值
      const childAncestorId = row.archived ? row.id : closestArchivedAncestorId
      for (const kid of kids) {
        walk(kid, depth + 1, childAncestorArchived, childAncestorId, projectKey, projectLabel)
      }
    }

    // 后收集 runningDescendants（在子树都处理完后）
    const runningBelow = kids?.some(kid => kid.running || (runningDescendantsMap.get(kid.id) ?? false)) ?? false
    runningDescendantsMap.set(row.id, runningBelow)
  }

  for (const root of roots) walk(root, 0, false, undefined, undefined, undefined)

  // v0.2: 未遍历到的子代理 = 孤儿（父链无主会话可达），不发射
  // 仅补发未遍历到的主会话行（环成员 main 对 main，或 fork 行）
  for (const row of rows) {
    if (!visited.has(row.id) && row.origin !== 'subagent') walk(row, 0, false, undefined, undefined, undefined)
  }

  // 3. 从 flat 构建 TreeRow[]（子计数 + 运行后代从 map 取）
  const out: TreeRow[] = []
  for (const item of flat) {
    const kids = children.get(item.row.id)
    const childCount = kids?.length ?? 0
    const hasChildren = childCount > 0
    out.push({
      ...item.row,
      depth: item.depth,
      childCount,
      hasChildren,
      runningDescendants: runningDescendantsMap.get(item.row.id) ?? false,
      lineageArchived: item.ancestorArchived,
      projectKey: item.projectKey,
      projectLabel: item.projectLabel,
      closestArchivedAncestorId: item.closestArchivedAncestorId,
      parentTitle: item.row.parentId !== undefined ? byId.get(item.row.parentId)?.title : undefined,
    })
  }
  return out
}

/**
 * 获取某行的所有后代（DFS 序）。
 * @param rowId - 目标行 id。
 * @param treeRows - 完整的树形行列表。
 * @returns 后代行列表（不含自身）。
 */
export function descendantsOf(
  rowId: SessionIdString,
  treeRows: readonly TreeRow[],
): TreeRow[] {
  const result: TreeRow[] = []
  const target = treeRows.find(row => row.id === rowId)
  if (target === undefined) return result
  const targetDepth = target.depth
  let found = false
  for (const row of treeRows) {
    if (row.id === rowId) {
      found = true
      continue
    }
    if (found) {
      if (row.depth > targetDepth) {
        result.push(row)
      } else {
        break
      }
    }
  }
  return result
}

/**
 * 根据展开/折叠状态返回当前可见行。
 * 折叠的父行仍在列表中（挂子数徽标）；其子树不出现，直到展开。
 * @param treeRows - 完整的树形行列表。
 * @param expanded - 当前展开的会话 id 集合。
 * @returns 可见行列表。
 */
export function visibleRows(
  treeRows: readonly TreeRow[],
  expanded: ReadonlySet<SessionIdString>,
): TreeRow[] {
  const result: TreeRow[] = []
  // 按 depth 跟踪当前「折叠路径」——depth → 该层级的父是否折叠
  // 简化：逐行检查，如果某行的祖先被折叠则跳过
  const hiddenDepths = new Set<number>() // 折叠父的子 depth 起始值
  const expandedDepths = new Map<number, SessionIdString>() // depth → 展开父的 id

  for (const row of treeRows) {
    // 清理比当前行深的折叠标记
    for (const d of hiddenDepths) {
      if (d >= row.depth) hiddenDepths.delete(d)
    }
    // 检查是否被折叠祖先隐藏
    if (hiddenDepths.size > 0) continue

    result.push(row)

    // 如果当前行有子但未展开 → 标记子树隐藏
    if (row.hasChildren && !expanded.has(row.id)) {
      hiddenDepths.add(row.depth)
    }
  }
  return result
}

// ---- 内部工具 ----

function normalizeProjectKey(cwd: string | undefined): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  return cwd.replace(/[/\\]+$/, '')
}

function projectLabelOf(cwd: string | undefined): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const sep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return sep >= 0 ? trimmed.slice(sep + 1) : trimmed
}

/**
 * 沿父链上溯，返回最近的 `origin !== 'subagent'` 祖先 id。
 * 用于 flatten pass：子代理挂最近主会话祖先，而非直接父。
 * 父不在 byId、全链均为子代理、或遇环 → 返回 undefined（孤儿，不发射）。
 */
function findMainAncestor(
  startId: SessionIdString,
  byId: Map<SessionIdString, DashboardRow>,
): SessionIdString | undefined {
  let current = byId.get(startId)
  const visited = new Set<SessionIdString>()
  while (current) {
    if (current.origin !== 'subagent') return current.id
    if (visited.has(current.id)) return undefined // 环
    visited.add(current.id)
    if (current.parentId === undefined) return undefined
    current = byId.get(current.parentId)
  }
  return undefined // 父不在行集中
}