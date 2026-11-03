/**
 * 看板行集与标题契约测试（问题二：文件夹行 + blank 草稿行）
 *
 * 依据（本轮产品拍板，已落文档）：
 * - `docs/design-session-dashboard.md` §5.2 join 公式：
 *   行 = stats.sessions × sessions.list.byId × workspaces.list − tombstones − 未落盘草稿行（`blank === true`）；
 *   草稿行不进看板行集，也不可被勾选（与侧栏全选 `ops.ts:285` 的既有排除规则一致）。
 * - `docs/design-session-dashboard.md` §5.3 标题列：取 `sessions.list` 的 `title` 字段，
 *   空值直接回落会话 id，**不经** `displayTitle` 的「项目目录 basename」回落。
 * - `docs/ui-session-dashboard.md` §5.1：无标题回落显示会话 id（同截断规则）。
 *
 * 缺陷背景（已用真实语料复现确认）：
 * DSH 客户端 `displayTitleOf(title, cwd, id)`
 * （deepseek-harness/packages/api/session-controller/src/client/sessions/service.ts:123）
 * 的回落链是「持久化标题 → 项目目录 basename → 会话 id」，旧 join 直接采信 `displayTitle`，
 * 于是零轮次空壳会话（真实语料 3 条：`title` 投影为 null、`sessionStats.turns` 为 0）
 * 在看板上显示成 `workspace` / `AI` / `Research`，看起来像「文件夹被当成一条会话」。
 *
 * 被测对象是**真实源码**，不是镜像：本文件 import `src/client/dashboard-rows.ts`。
 * 该模块的契约（缺一即整文件红）：
 *
 * ```ts
 * // 只允许 `import type`，不得有运行时 import——本插件 node_modules 里没有 zustand 等
 * // 客户端运行时依赖，任何运行时 import 都会让 `node --test` 直接挂在模块解析上。
 * export function joinDashboardRows(inputs: {
 *   data: StatsResponse | null
 *   byId: Record<SessionIdString, SessionRowSummary>
 *   archivedSessionIds: readonly SessionIdString[]
 *   pinnedSessionIds: readonly SessionIdString[]
 *   tombstones: readonly SessionIdString[]
 * }): DashboardRow[]
 *
 * export function filterDashboardRows(
 *   rows: readonly DashboardRow[], filter: DashboardFilter,
 * ): DashboardRow[]
 * ```
 *
 * `DashboardPanel.tsx` 必须改为调用这两个函数（否则测试覆盖的不是实际渲染路径）；
 * `SessionRowSummary`（src/client/types.ts）需补 `readonly title?: string`。
 *
 * 运行：node --test tests/dashboard-rows.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const panelSource = readFileSync(join(repoRoot, 'src/client/DashboardPanel.tsx'), 'utf8')

/** 加载被测的真实 join/filter 模块；缺失时给出可执行的修复指引。 */
const rowsModule = await import('../src/client/dashboard-rows.ts')
  .then(mod => ({ ok: true, mod }))
  .catch(error => ({ ok: false, error }))

/**
 * 取被测函数，模块缺失或导出不全时以明确信息失败。
 * @returns `{ joinDashboardRows, filterDashboardRows }`。
 */
function seam() {
  assert.ok(
    rowsModule.ok,
    'src/client/dashboard-rows.ts 尚不可导入（'
    + String(rowsModule.error?.message ?? rowsModule.error).split('\n')[0]
    + '）——请把 DashboardPanel.tsx 的 join/filter 抽到该模块并导出 '
    + 'joinDashboardRows / filterDashboardRows；该文件只能有 `import type`，'
    + '任何运行时 import 都会让本测试挂在模块解析上',
  )
  const { joinDashboardRows, filterDashboardRows } = rowsModule.mod
  assert.equal(typeof joinDashboardRows, 'function', 'dashboard-rows.ts 需导出 joinDashboardRows(inputs)')
  assert.equal(typeof filterDashboardRows, 'function', 'dashboard-rows.ts 需导出 filterDashboardRows(rows, filter)')
  return { joinDashboardRows, filterDashboardRows }
}

// === 夹具 ===

/**
 * 真实空壳会话：2026-11-03 采集自 `~/.dsh/sessions/`。零用户轮次的证据取自 DSH 自己
 * 写出的投影缓存 `~/.dsh/storages/session_projcache/sessions/<id>.json`：
 * `rows.title.val === null`、`titleInput.count === 0`、`turnOutline.turns === []`、
 * `sessionStats.turns === 0`、`tokenUsage.totals` 四桶全 0、`contextPressure.surfaceTokens === 0`
 * （对照组 `session-0c216b11…` 同一批字段为 turns=8、有标题、有 token）。
 *
 * 注意取证方法：这些日志是**多帧 zstd 容器**（空壳 3~4 帧，正常会话上百帧），
 * Node 的 `zstdDecompressSync` / `createZstdDecompress` 都只解首帧，
 * 因此不能靠解压日志数事件来判定轮次，必须读投影缓存。
 *
 * `displayTitle` 一栏是上游回落链的产物，用于钉住「join 不得采信 displayTitle」。
 */
const SHELLS = [
  {
    id: 'session-93ac64a6-bd51-455c-b7c9-728cf38064ce',
    cwd: '/Users/jiawen.guang/.dsh/bot/workspace',
    folder: 'workspace',
  },
  {
    id: 'session-00818cbf-343e-45bc-b91e-94a28cd483f2',
    cwd: '/Users/jiawen.guang/AI',
    folder: 'AI',
  },
  {
    id: 'session-3e77360f-40f8-4cc3-9f7d-aca332c0f811',
    cwd: '/Users/jiawen.guang/Research',
    folder: 'Research',
  },
]

/** 空壳会话的 stats 行：无任何投影数据（tokenUsage / contextPressure 均缺席）。 */
const emptyStats = id => ({ id, model: null, usage: null, pressure: null, error: null })

/** 有数据的 stats 行。 */
const fullStats = (id, model = 'deepseek/deepseek-chat') => ({
  id,
  model,
  usage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 1000, cacheWriteTokens: 200 },
  pressure: { pressureTokens: 8000, projectedTokens: 9000, contextWindow: 64000 },
  error: null,
})

/**
 * 构造 join 输入。
 * @param sessions - 会话夹具（`{ id, cwd?, title?, displayTitle?, origin?, blank?, archived?, pinned?, stats? }`）。
 * @param overrides - 覆盖项（`tombstones` / `extraStats` / `omitFromById`）。
 * @returns `joinDashboardRows` 的 inputs。
 */
function inputs(sessions, overrides = {}) {
  const byId = {}
  for (const s of sessions) {
    if (overrides.omitFromById?.includes(s.id)) continue
    byId[s.id] = {
      id: s.id,
      running: s.running ?? false,
      blank: s.blank ?? false,
      updatedAt: s.updatedAt ?? 0,
      ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
      ...(s.title === undefined ? {} : { title: s.title }),
      // 上游 displayTitleOf 的产物：无标题时是 cwd basename
      displayTitle: s.displayTitle
        ?? (s.title !== undefined
          ? s.title
          : (s.cwd === undefined ? s.id : s.cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop())),
      ...(s.origin === undefined ? {} : { origin: s.origin }),
    }
  }
  return {
    data: {
      ok: true,
      complete: true,
      pending: 0,
      degraded: false,
      generatedAt: 0,
      sessions: [
        ...sessions.filter(s => !overrides.omitFromById?.includes(s.id) || s.stats !== undefined)
          .map(s => s.stats ?? (s.untitled === false ? fullStats(s.id) : emptyStats(s.id))),
        ...(overrides.extraStats ?? []),
      ],
    },
    byId,
    archivedSessionIds: sessions.filter(s => s.archived === true).map(s => s.id),
    pinnedSessionIds: sessions.filter(s => s.pinned === true).map(s => s.id),
    tombstones: overrides.tombstones ?? [],
  }
}

/** 混合语料：主会话（有/无标题）、子代理、归档、blank 草稿各若干。 */
const MIXED = [
  { id: 'session-main-titled-0001', cwd: '/w/alpha', title: '重构扫描器', stats: fullStats('session-main-titled-0001') },
  { id: 'session-main-shell-0002', cwd: '/w/alpha', stats: emptyStats('session-main-shell-0002') },
  { id: 'session-main-arch-0003', cwd: '/w/beta', title: '已归档会话', archived: true, stats: fullStats('session-main-arch-0003') },
  { id: 'sub-0004', cwd: '/w/alpha', origin: 'subagent', title: '子代理任务', stats: fullStats('sub-0004') },
  { id: 'sub-0005', cwd: '/w/beta', origin: 'subagent', stats: emptyStats('sub-0005') },
  { id: 'session-draft-0006', cwd: '/w/alpha', blank: true, stats: emptyStats('session-draft-0006') },
]

describe('看板行集与标题契约（问题二）', () => {
  // --- §5.3 标题：空值回落会话 id，不经 displayTitle 的目录回落 ---

  it('TC-01 无标题会话的标题 = 会话 id（真实 3 条空壳会话）', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(SHELLS.map(s => ({ ...s })))).filter(r => SHELLS.some(s => s.id === r.id))
    assert.equal(rows.length, 3)
    for (const [i, row] of rows.entries()) {
      assert.equal(row.title, row.id, '无标题必须回落会话 id（design §5.3 / ui §5.1）')
      assert.notEqual(row.title, SHELLS[i].folder, '标题不得是 cwd basename——这就是「文件夹行」缺陷')
    }
    assert.deepEqual(rows.map(r => r.title), SHELLS.map(s => s.id))
  })

  it('TC-02 join 不得采信 displayTitle 的目录回落值', () => {
    const { joinDashboardRows } = seam()
    // displayTitle 是上游回落产物（'Research'），title 缺席 → 必须回落 id 而不是 displayTitle
    const [row] = joinDashboardRows(inputs([{ id: 'session-x', cwd: '/Users/u/Research' }]))
    assert.equal(row.title, 'session-x')
    assert.notEqual(row.title, 'Research')
  })

  it('TC-03 有 title 的会话标题不受影响', () => {
    const { joinDashboardRows } = seam()
    const [row] = joinDashboardRows(inputs([{ id: 'session-y', cwd: '/w/alpha', title: '你是资深 TypeScript 架构分析员' }]))
    assert.equal(row.title, '你是资深 TypeScript 架构分析员')
  })

  it('TC-03b title 为空串时同样回落会话 id', () => {
    const { joinDashboardRows } = seam()
    // 上游同样防空串标题（session-controller/.../service.ts:657）；空串是 falsy 但存在，
    // 用 `?? ` 会漏掉它并渲染出一个空标题单元格。
    const [row] = joinDashboardRows(inputs([{ id: 'session-z', cwd: '/w/alpha', title: '' }]))
    assert.equal(row.title, 'session-z')
  })

  it('TC-04 同一工作区两条无标题会话标题互异（原碰撞缺陷）', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs([
      { id: 'session-aaaa-0001', cwd: '/Users/u/Research' },
      { id: 'session-aaaa-0002', cwd: '/Users/u/Research' },
    ]))
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].title, rows[1].title)
    assert.equal(new Set(rows.map(r => r.title)).size, 2, '标题必须能区分同工作区的两条会话')
  })

  // --- 空壳会话保留（产品拍板：清理工具不得藏起清理对象）---

  it('TC-05 空壳会话保留在行集里，且 main 档仍可见', () => {
    const { joinDashboardRows, filterDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(SHELLS.map(s => ({ ...s }))))
    assert.equal(rows.length, 3, '零轮次空壳会话是真实落盘状态，不得过滤')
    assert.equal(filterDashboardRows(rows, 'main').length, 3, '空壳会话是主会话，问题一的 main 默认过滤不得连带隐藏它们')
  })

  it('TC-06 空壳行四个数值列的渲染前提：model/usage/pressure 全空且不是错误行', () => {
    const { joinDashboardRows } = seam()
    const [row] = joinDashboardRows(inputs([{ id: SHELLS[2].id, cwd: SHELLS[2].cwd }]))
    assert.equal(row.stats.model, null)
    assert.equal(row.stats.usage, null)
    assert.equal(row.stats.pressure, null)
    assert.equal(row.stats.error, null, '空壳不是读取失败行，不得显示告警图标')
    // 组件派生守卫：四列在 null 时都落到 '—'
    for (const branch of [
      "{hasError ? '—' : (",
      'hasError || tokenTotal === null',
      'hasError || stats.usage === null',
      'hasError || ctxPercent === null || ctxWindow === undefined',
    ]) {
      assert.ok(panelSource.includes(branch), `DashboardPanel.tsx 的 '${branch}' 分支已改动：请复核空壳行的「—」渲染`)
    }
  })

  // --- §5.2 blank 草稿行：整体排除，含勾选 ---

  it('TC-07 blank 草稿会话不产生看板行', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(MIXED))
    assert.ok(!rows.some(r => r.id === 'session-draft-0006'), 'blank 草稿行必须从行集整体排除（design §5.2）')
    assert.equal(rows.length, MIXED.length - 1)
  })

  it('TC-08 blank 草稿不可被全选/勾选（任何过滤档）', () => {
    const { joinDashboardRows, filterDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(MIXED))
    // 看板全选的输入集合就是 filteredRows.map(r => r.id)（DashboardPanel.tsx:272）
    for (const filter of ['all', 'main', 'subagent', 'archived']) {
      const ids = filterDashboardRows(rows, filter).map(r => r.id)
      assert.ok(!ids.includes('session-draft-0006'), `${filter} 档的全选集合不得包含 blank 草稿`)
    }
    assert.ok(panelSource.includes('store.selectAll(filteredRows.map(r => r.id))'), 'DashboardPanel.tsx 的全选取值已改动：请复核本用例')
  })

  it('TC-09 blank 草稿即使带归档标记也不进行集', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs([{ id: 'session-draft-0007', cwd: '/w/alpha', blank: true, archived: true }]))
    assert.deepEqual(rows, [], 'blank 优先于归档：未落盘对象没有归档语义')
  })

  // --- 既有语义保护 ---

  it('TC-10 stats 里 id 不在 sessions.list 时保留行并回落裸 id', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(
      [{ id: 'orphan-097823d5', cwd: '/w/alpha', title: '不会用到' }],
      { omitFromById: ['orphan-097823d5'], extraStats: [emptyStats('orphan-097823d5')] },
    ))
    const orphan = rows.find(r => r.id === 'orphan-097823d5')
    assert.ok(orphan !== undefined, '未知 id 仍应出现（降级显示，不是过滤）')
    assert.equal(orphan.title, 'orphan-097823d5')
    assert.equal(orphan.origin, undefined)
  })

  it('TC-11 墓碑 id 仍被排除', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(
      [{ id: 'session-live', cwd: '/w/alpha', title: '存活' }, { id: 'session-gone', cwd: '/w/alpha', title: '已删' }],
      { tombstones: ['session-gone'], extraStats: [emptyStats('session-gone')] },
    ))
    assert.deepEqual(rows.map(r => r.id), ['session-live'])
  })

  it('TC-12 四档过滤语义（保护问题一的 main 默认修复）', () => {
    const { joinDashboardRows, filterDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(MIXED))
    const ids = filter => filterDashboardRows(rows, filter).map(r => r.id).sort()
    assert.deepEqual(ids('all'), [
      'session-main-arch-0003', 'session-main-shell-0002', 'session-main-titled-0001', 'sub-0004', 'sub-0005',
    ])
    assert.deepEqual(ids('main'), ['session-main-shell-0002', 'session-main-titled-0001'])
    assert.deepEqual(ids('subagent'), ['sub-0004', 'sub-0005'])
    assert.deepEqual(ids('archived'), ['session-main-arch-0003'])
  })

  it('TC-13 归档/置顶/运行中标记仍按 workspaces.list 与 sessions.list 落位', () => {
    const { joinDashboardRows } = seam()
    const rows = joinDashboardRows(inputs([
      { id: 'session-arch', cwd: '/w/alpha', title: 'a', archived: true },
      { id: 'session-pin', cwd: '/w/alpha', title: 'p', pinned: true },
      { id: 'session-run', cwd: '/w/alpha', title: 'r', running: true },
    ]))
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))
    assert.equal(byId['session-arch'].archived, true)
    assert.equal(byId['session-pin'].pinned, true)
    assert.equal(byId['session-run'].running, true)
    assert.equal(byId['session-arch'].pinned, false)
  })

  it('TC-14 标题列被 onlyWhenClipped 的 Tooltip 包裹（ui §5.1 截断时显示全文）', () => {
    const titleSpan = '<span className="dsh-dash-session-title">{row.title}</span>'
    const at = panelSource.indexOf(titleSpan)
    assert.ok(at >= 0, '标题 span 结构已变：请复核本用例')
    // 模型列（DashboardPanel.tsx 的 .dsh-dash-model-col）的既有写法就是模板：
    // <Tooltip portal label={…} onlyWhenClipped>
    const openTag = panelSource.slice(0, at).match(/<Tooltip[^>]*>\s*$/)
    assert.ok(
      openTag !== null,
      '标题 span 前必须紧跟 <Tooltip …> 开标签（ui §5.1：截断时 Tooltip 显示完整标题）；'
      + `实际前置文本：${JSON.stringify(panelSource.slice(Math.max(0, at - 120), at))}`,
    )
    const tag = openTag[0]
    assert.match(tag, /\bportal\b/, 'ui §2 层级表：面板内 Tooltip 必须用 portal 变体（非 portal z=100 会被面板盖住）')
    assert.match(tag, /label=\{row\.title\}/, 'Tooltip label 必须是 row.title（完整标题或回落的会话 id），否则悬停看到的不是全文')
    assert.match(tag, /\bonlyWhenClipped\b/, 'ui §5.1：只在真被截断时显示（原语按 scrollWidth > clientWidth 判定）')
    // 闭合标签紧随 span → 证明是「包裹」而不是「并列在前」
    const after = panelSource.slice(at + titleSpan.length).replace(/^\s+/, '')
    assert.ok(after.startsWith('</Tooltip>'), `标题 span 后必须紧跟 </Tooltip>；实际：${JSON.stringify(after.slice(0, 40))}`)
    // ui §10 触屏策略：标题截断属「纯辅助类」，触屏不显示；openOnClick 是数值明细类的做法
    assert.ok(!/\bopenOnClick\b/.test(tag), 'ui §10：标题截断属纯辅助类，触屏不显示，不得加 openOnClick')
  })
})
