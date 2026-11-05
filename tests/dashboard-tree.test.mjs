/**
 * 看板树形视图单元测试 —— buildTree / descendantsOf
 *
 * 树构建语义复刻 DSH `lineage.ts`（packages/api/session-controller/src/client/sessions/lineage.ts），
 * 本文件平移 DSH `lineage.client.spec.ts` 的环/孤儿/fork 用例。
 *
 * 运行：node --test tests/dashboard-tree.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** 加载被测模块。 */
const mod = await import('../src/client/dashboard-tree.ts')
const { buildTree, descendantsOf, visibleRows } = mod
/** 平面档用例还要过 filter（面板管线是 join → tree → filter → visibleRows）。 */
const { filterDashboardRows } = await import('../src/client/dashboard-rows.ts')

/** 快捷构造一个 DashboardRow（只填本模块关心的字段）。 */
function row(id, overrides = {}) {
  return {
    id,
    title: id,
    origin: undefined,
    parentId: undefined,
    cwd: undefined,
    running: false,
    archived: false,
    pinned: false,
    updatedAt: 0,
    stats: { id, model: null, usage: null, pressure: null, error: null },
    ...overrides,
  }
}

describe('buildTree', () => {
  it('纯平面行（无子代理）→ 全部根、depth=0、无子', () => {
    const rows = [row('a'), row('b'), row('c')]
    const tree = buildTree(rows, new Set())
    assert.equal(tree.length, 3)
    for (const t of tree) {
      assert.equal(t.depth, 0)
      assert.equal(t.childCount, 0)
      assert.equal(t.hasChildren, false)
      assert.equal(t.runningDescendants, false)
      assert.equal(t.lineageArchived, false)
    }
  })

  it('子代理挂在父下：depth 递增、父有子计数', () => {
    const rows = [
      row('parent', { cwd: '/home/proj' }),
      row('child', { origin: 'subagent', parentId: 'parent' }),
    ]
    const tree = buildTree(rows, new Set())
    assert.equal(tree.length, 2)
    // DFS：父在前
    assert.equal(tree[0].id, 'parent')
    assert.equal(tree[0].depth, 0)
    assert.equal(tree[0].childCount, 1)
    assert.equal(tree[0].hasChildren, true)
    assert.equal(tree[0].projectLabel, 'proj')
    assert.equal(tree[1].id, 'child')
    assert.equal(tree[1].depth, 1)
    assert.equal(tree[1].childCount, 0)
    // 子行继承根的项目标签
    assert.equal(tree[1].projectLabel, 'proj')
  })

  it('子代理运行态 → 父 runningDescendants = true', () => {
    const rows = [
      row('parent'),
      row('child', { origin: 'subagent', parentId: 'parent', running: true }),
    ]
    const tree = buildTree(rows, new Set())
    assert.equal(tree[0].runningDescendants, true)
  })

  it('fork（有 parentId 但非 subagent）→ 独立树根、depth 0、在 main 档可见（产品经理终裁 2026-11-04）', () => {
    const rows = [
      row('parent', { title: '父会话' }),
      row('forked', { origin: undefined, parentId: 'parent', title: 'Fork 会话' }),
    ]
    const tree = buildTree(rows, new Set())
    // fork 作为独立根——从 main 档可看到
    assert.equal(tree.length, 2)
    for (const t of tree) assert.equal(t.depth, 0)
    // 主会话档（main filter）：fork 应与普通主会话同权存在
    const main = filterDashboardRows(tree, 'main')
    assert.deepEqual(main.map(r => r.id), ['parent', 'forked'],
      'fork 应在主会话档可见（终裁：同权树根）')
  })

  it('fork 名下子代理不重挂到 fork 的父——压平锚点是 fork 自身，非 fork 的祖先（终裁契约测试 ②）', () => {
    const rows = [
      row('p1', { title: '父会话 P1' }),
      row('p4', { origin: undefined, parentId: 'p1', title: 'Fork 会话 P4' }),
      row('d1', { origin: 'subagent', parentId: 'p4', title: '子代理 D1 · fork 名下' }),
    ]
    const tree = buildTree(rows, new Set())
    assert.equal(tree.length, 3, 'P1 + P4（fork 根）+ D1（P4 的子代理）')

    // P1 和 P4 各自是 depth 0 的根
    const p1Row = tree.find(r => r.id === 'p1')
    const p4Row = tree.find(r => r.id === 'p4')
    assert.equal(p1Row.depth, 0)
    assert.equal(p4Row.depth, 0)

    // D1 挂在 P4 下（不是 P1）
    const d1Row = tree.find(r => r.id === 'd1')
    assert.ok(d1Row, 'D1 应在树中（findMainAncestor 返回 P4，非孤儿）')
    assert.equal(d1Row.depth, 1, 'D1 depth = 1（P4 根的直接子）')
    assert.equal(d1Row.parentTitle, 'Fork 会话 P4',
      'D1 的 parentTitle = P4 的 title，不是 P1 的 title——压平锚点是最近的 non-subagent 祖先 P4')

    // P1 的 childCount 不包含 D1（D1 在 P4 子树）
    assert.equal(p1Row.childCount, 0,
      'P1 无子代理，D1 在 P4 子树 → P1 徽标不得膨胀')

    // P4 的 childCount = 1（D1）
    assert.equal(p4Row.childCount, 1, 'P4 的直接子 = D1')

    // main 档：三行全可见
    const main = filterDashboardRows(tree, 'main')
    assert.deepEqual(main.map(r => r.id), ['p1', 'p4', 'd1'],
      'P1、P4（fork）、D1 均在主会话档可见')
  })

  it('血统/级联在 fork 行截断——归档 P1 不影响 P4；descendantsOf(P1) 不含 P4/D1（终裁契约测试 ③）', () => {
    const rows = [
      row('p1', { title: '父会话 P1', archived: true }),
      row('a1', { origin: 'subagent', parentId: 'p1', title: '子代理 A1' }),
      row('p4', { origin: undefined, parentId: 'p1', title: 'Fork 会话 P4' }),
      row('d1', { origin: 'subagent', parentId: 'p4', title: '子代理 D1 · fork 名下' }),
    ]
    const tree = buildTree(rows, new Set())
    assert.equal(tree.length, 4)

    // P4 是独立根（depth 0），不受 P1 归档的血统传播
    const p4Row = tree.find(r => r.id === 'p4')
    assert.equal(p4Row.depth, 0, 'P4 是独立根')
    assert.equal(p4Row.lineageArchived, false,
      'P4 不因 P1 归档而血统归档——级联在非 subagent 行截断')

    // P1 的子代理 A1 照常血统归档
    const a1Row = tree.find(r => r.id === 'a1')
    assert.equal(a1Row.lineageArchived, true, 'A1 是子代理，随 P1 归档血统归档')

    // main 档：P4 + D1 仍在（不受 P1 归档影响）
    const main = filterDashboardRows(tree, 'main')
    const mainIds = main.map(r => r.id)
    assert.ok(mainIds.includes('p4'), 'P4（fork）仍在主会话档')
    assert.ok(mainIds.includes('d1'), 'D1 仍在主会话档')
    assert.ok(!mainIds.includes('p1'), 'P1 已归档，不在主会话档')
    assert.ok(!mainIds.includes('a1'), 'A1 血统归档，不在主会话档')

    // 已归档档：P1 + A1（血统归档），不含 P4/D1
    const archived = filterDashboardRows(tree, 'archived')
    const archIds = archived.map(r => r.id)
    assert.deepEqual(archIds, ['p1', 'a1'],
      '已归档档仅含 P1 + A1（血统归档）；P4/D1 不在')

    // descendantsOf(P1)：仅 A1，不含 P4/D1
    const desc = descendantsOf('p1', tree)
    assert.deepEqual(desc.map(r => r.id), ['a1'],
      'P1 的后代仅子代理 A1；fork P4 及其子代理 D1 不在其中——级联截断')
  })

  it('孤儿（parentId 指向缺席的父）→ 不发射（v0.2 flatten 有意分歧于 DSH lineage）', () => {
    const rows = [
      row('orphan', { origin: 'subagent', parentId: 'missing-parent' }),
    ]
    const tree = buildTree(rows, new Set())
    // v0.2: findMainAncestor('missing-parent') = undefined → 孤儿不发射。
    // 这是设计上对 DSH lineage "degrade to root, never drop" 的有意分歧（design §13.3）。
    assert.equal(tree.length, 0)
  })

  it('环防御：互相引用的子代理 → 全链无主会话可达 → 全部丢弃（v0.2 flatten）', () => {
    const rows = [
      row('a', { origin: 'subagent', parentId: 'b' }),
      row('b', { origin: 'subagent', parentId: 'a' }),
    ]
    const tree = buildTree(rows, new Set())
    // v0.2 flatten: 环成员无主会话祖先可达 → findMainAncestor 遇环返回 undefined → 孤儿，不发射
    assert.equal(tree.length, 0)
  })

  it('三层嵌套压平：depth 恒 1（v0.2 flatten 子代理全挂最近主会话祖先）', () => {
    const rows = [
      row('root'),
      row('l1', { origin: 'subagent', parentId: 'root' }),
      row('l2', { origin: 'subagent', parentId: 'l1' }),
    ]
    const tree = buildTree(rows, new Set())
    assert.equal(tree.length, 3)
    assert.equal(tree[0].depth, 0)
    assert.equal(tree[1].depth, 1)
    assert.equal(tree[2].depth, 1, 'l2 压平到 depth 1（非 2）')
    // l2 仍继承根的项目标签
    assert.equal(tree[2].projectLabel, tree[0].projectLabel)
    // 三代继承同一个项目标签
    assert.equal(tree[2].projectLabel, tree[0].projectLabel)
  })

  it('血统归档：父被显式归档 → 子 lineageArchived = true', () => {
    const rows = [
      row('parent', { archived: true }),
      row('child', { origin: 'subagent', parentId: 'parent' }),
      row('grandchild', { origin: 'subagent', parentId: 'child' }),
    ]
    const tree = buildTree(rows, new Set(['parent']))
    assert.equal(tree[0].lineageArchived, false) // 根自己是显式归档，不是被派生
    assert.equal(tree[1].lineageArchived, true)
    assert.equal(tree[2].lineageArchived, true)
  })

  it('子先于父被显式归档：父恢复后子仍为显式归档', () => {
    const rows = [
      row('parent'),
      row('child', { origin: 'subagent', parentId: 'parent', archived: true }),
    ]
    // 父未归档 → 子没有血统归档（即便自身是显式归档）
    const tree = buildTree(rows, new Set(['child']))
    assert.equal(tree[0].lineageArchived, false)
    assert.equal(tree[1].lineageArchived, false)
    assert.equal(tree[1].archived, true) // 但自身显式归档标记仍在
  })

  it('孤儿子代理（v0.2 不发射）+ 普通行项目标签正常', () => {
    const rows = [
      row('orphan', { origin: 'subagent', parentId: 'gone' }),
      row('normal', { cwd: '/home/user' }),
    ]
    const tree = buildTree(rows, new Set())
    // v0.2: 孤儿子代理不发射——有意分歧于 DSH lineage
    assert.equal(tree.length, 1)
    assert.equal(tree[0].id, 'normal')
    assert.equal(tree[0].projectLabel, 'user')
    // 确认 orphan 不在树中
    assert.equal(tree.find(t => t.id === 'orphan'), undefined)
  })

  it('徽标不变量：每个根行 childCount === flat 输出中实际发射的子行数（防过滤顺序漂移）', () => {
    // 背景：childCount 取自 buildTree 内部 children map，blank 排除发生在 join 层。
    // 若将来把 blank 或其他排除逻辑下移到 buildTree 之后（如 filterDashboardRows），
    // children map 会纳入被排除的行 → childCount 虚高 → 徽标 ≠ 可见子行数。
    // 本不变量与过滤顺序无关：直接对比 childCount 与 flat 输出中属于该根的深度>0 行数。
    const rows = [
      row('root', { title: '根会话' }),
      // 正常子代理（应计入 childCount 且在 flat 中发射）
      row('sub-a', { origin: 'subagent', parentId: 'root', title: '子代理 A' }),
      // 孤儿子代理（不发射 → 不计入 childCount）
      row('sub-orphan', { origin: 'subagent', parentId: 'dead-parent', title: '孤儿' }),
      // 孙代理（压平后挂 root → 计入 childCount 且在 flat 中发射）
      row('grand', { origin: 'subagent', parentId: 'sub-a', title: '孙代理' }),
      // 模拟「将来把 blank 排除移到 buildTree 之后」的漂移场景：
      // 此行的 origin 和 parentId 皆为子代理形态——若它在 join 后被保留，会进 children map
      row('sub-blank-sim', { origin: 'subagent', parentId: 'root', title: '模拟 blank 子代理' }),
    ]
    const tree = buildTree(rows, new Set())

    // 树输出：root + sub-a + grand + sub-blank-sim（orphan 不发射）= 4 行
    assert.equal(tree.length, 4, 'root + 2 正常子代理 + 模拟 blank 后代 + 孤儿不发射 = 4')

    const rootRow = tree.find(r => r.id === 'root')
    // children map 纳入 3 条（sub-a、grand 的锚点也是 root、sub-blank-sim）
    // 但 flat 中 depth>0 且属于 root 子树的行：sub-a depth=1、grand depth=1、sub-blank-sim depth=1
    // → 期待 childCount = 3（与 flat 发射数一致）
    const childrenOfRoot = tree.filter(r => r.depth > 0
      // 简单判定：depth>0 的行都属于某个根；在 DFS 序中搜索 root 到下一个根之间的行
    )
    // 更严谨的判定：从 root 的下标开始，收集所有 depth>0 的行直到下一个 depth=0
    const rootIdx = tree.indexOf(rootRow)
    const actualChildren = []
    for (let i = rootIdx + 1; i < tree.length; i++) {
      if (tree[i].depth === 0) break
      actualChildren.push(tree[i])
    }
    assert.equal(rootRow.childCount, actualChildren.length,
      `徽标(${rootRow.childCount}) ≠ flat发射子行数(${actualChildren.length})。`
      + ' 若有人把排除逻辑从 join 下移到 buildTree 之后（如 filterDashboardRows），'
      + ' children map 会纳入被排除的行 → childCount 虚高，本断言在此刻精准抓现行。')
  })
})

describe('descendantsOf', () => {
  it('空树 → 空列表', () => {
    assert.deepEqual(descendantsOf('x', []), [])
  })

  it('不存在的 id → 空列表', () => {
    const rows = [row('a')]
    const tree = buildTree(rows, new Set())
    assert.deepEqual(descendantsOf('x', tree), [])
  })

  it('返回所有后代（含多层）', () => {
    const rows = [
      row('root'),
      row('l1', { origin: 'subagent', parentId: 'root' }),
      row('l2', { origin: 'subagent', parentId: 'l1' }),
      row('other'),
    ]
    const tree = buildTree(rows, new Set())
    const desc = descendantsOf('root', tree)
    assert.deepEqual(desc.map(d => d.id), ['l1', 'l2'])
  })

  it('返回所有后代（在树中位于不连续区域仍正确）', () => {
    const rows = [
      row('root-a'),
      row('child-a', { origin: 'subagent', parentId: 'root-a' }),
      row('root-b'),
      row('child-b', { origin: 'subagent', parentId: 'root-b' }),
    ]
    const tree = buildTree(rows, new Set())
    const descA = descendantsOf('root-a', tree)
    assert.deepEqual(descA.map(d => d.id), ['child-a'])
    const descB = descendantsOf('root-b', tree)
    assert.deepEqual(descB.map(d => d.id), ['child-b'])
  })
})

describe('v0.2 两档过滤 + 压平（主会话=树形含子代理、已归档=血统归档）', () => {
  // v0.2：砍 all/subagent，留 main+archived。子代理全部压平到 depth 1 挂在最近主会话祖先下。
  // filterDashboardRows 不再做平面归一化——buildTree 的 flatten pass 已处理 depth。
  
  it('TC-15 两档过滤各行归属正确', () => {
    const rows = [
      row('session-p', { title: '父会话' }),
      row('c1', { origin: 'subagent', parentId: 'session-p', title: '子代理 A' }),
      row('g1', { origin: 'subagent', parentId: 'c1', title: '孙代理' }),
    ]
    const tree = buildTree(rows, new Set())
    // main 档：3 行全部可见（主会话 + 两个子代理，都非归档）
    const main = filterDashboardRows(tree, 'main')
    assert.deepEqual(main.map(r => r.id), ['session-p', 'c1', 'g1'])
    assert.equal(main.filter(r => r.origin !== 'subagent').length, 1, '主会话 chips = 1')
    // archived 档：无归档行
    assert.equal(filterDashboardRows(tree, 'archived').length, 0)
    
    // 归档父 → 整树进已归档档
    const archRows = [
      row('session-p', { title: '父会话', archived: true }),
      row('c1', { origin: 'subagent', parentId: 'session-p', title: '子代理 A' }),
      row('g1', { origin: 'subagent', parentId: 'c1', title: '孙代理' }),
    ]
    const archTree = buildTree(archRows, new Set())
    const arch = filterDashboardRows(archTree, 'archived')
    assert.deepEqual(arch.map(r => r.id), ['session-p', 'c1', 'g1'])
    // 子代理 depth 全为 1（压平）
    assert.equal(arch[1].depth, 1)
    assert.equal(arch[2].depth, 1)
  })

  it('TC-17 压平后子代理全挂最近主会话祖先、无缩进变化', () => {
    const rows = [
      row('session-p', { title: '父会话' }),
      row('c1', { origin: 'subagent', parentId: 'session-p', title: '子代理 A' }),
      row('g1', { origin: 'subagent', parentId: 'c1', title: '孙代理' }),
    ]
    const tree = buildTree(rows, new Set())
    // 所有行 depth ∈ {0, 1}（压平后无 depth≥2）
    for (const r of tree) {
      assert.ok(r.depth <= 1, `${r.id} 的 depth=${r.depth}，压平后应 ≤ 1`)
    }
    // 父 childCount = 全部后代数（含孙代）
    assert.equal(tree[0].childCount, 2)
  })

  it('TC-19 孤儿判定走行集成员，不走标题/id 字符串相等（design §12 规则二）', () => {
    // 规则一让标题回落 id，于是「父在行集但无标题」与「父不在行集」在字符串上不可区分。
    // 孤儿判定必须用 byId 成员判定（TreeRow.parentTitle === undefined），
    // 否则无标题父会话会被误判成孤儿、小字错显短 id —— D7 修法里点名的连带陷阱。
    const rows = [
      // 无持久化标题的父：joinDashboardRows 会把 title 回落成它自己的 id
      row('session-untitled-parent', { title: 'session-untitled-parent' }),
      row('child-of-untitled', { origin: 'subagent', parentId: 'session-untitled-parent', title: '子代理' }),
      row('orphan', { origin: 'subagent', parentId: 'session-deleted-parent', title: '孤儿子代理' }),
    ]
    const byId = Object.fromEntries(buildTree(rows, new Set()).map(r => [r.id, r]))
    assert.equal(byId['child-of-untitled'].parentTitle, 'session-untitled-parent',
      '父在行集但无标题 → parentTitle 是回落后的 id（不是 undefined），小字应显示「↳ <父 id>」而非短 id')
    assert.equal(byId['orphan'], undefined,
      'v0.2: 父不在行集 → 孤儿不发射（design §13.3 有意分歧于 DSH lineage）')
  })
})