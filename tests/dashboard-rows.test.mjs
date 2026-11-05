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
import { readFileSync, readdirSync } from 'node:fs'
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
      ...(s.parentId === undefined ? {} : { parentId: s.parentId }),
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
    // v0.2: ids = Host-list 成员（非子代理），子代理仅存在于 byId（不挂账）
    ids: sessions.filter(s => s.origin !== 'subagent').map(s => s.id),
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
      "{hasError ? (",
      'hasError || tokenTotal === null',
      'hasError || stats.usage === null',
      'hasError || ctxPercent === null || ctxWindow === undefined',
    ]) {
      assert.ok(panelSource.includes(branch), `DashboardPanel.tsx 的 '${branch}' 分支已改动：请复核空壳行的「—」渲染（v0.2 已加 sr-only 包裹）`)
    }
  })

  // --- §5.2 blank 草稿行：整体排除，含勾选 ---

  it('TC-07 blank 草稿会话不产生看板行', () => {
    const { joinDashboardRows } = seam()
    // v0.2: sub-0004/sub-0005 是孤儿子代理（无 parentId、无 ids 挂靠）→ 不发射。
    // 预期仅 3 行：3 条主会话，blank 草稿被排除。
    const rows = joinDashboardRows(inputs(MIXED))
    assert.ok(!rows.some(r => r.id === 'session-draft-0006'), 'blank 草稿行必须从行集整体排除（design §5.2）')
    assert.equal(rows.length, 3)
  })

  it('TC-08 blank 草稿不可被全选/勾选（任何过滤档）', () => {
    const { joinDashboardRows, filterDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(MIXED))
    // v0.2 两档：main / archived
    for (const filter of ['main', 'archived']) {
      const ids = filterDashboardRows(rows, filter).map(r => r.id)
      assert.ok(!ids.includes('session-draft-0006'), `${filter} 档的全选集合不得包含 blank 草稿`)
    }
    // v0.2 selectAll 收敛到主会话行
    assert.ok(panelSource.includes('origin !== \'subagent\''), 'DashboardPanel.tsx 的 selectAll 应仅选主会话行')
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

  it('TC-12 两档过滤语义（v0.2：砍 all/subagent，留 main+archived）', () => {
    const { joinDashboardRows, filterDashboardRows } = seam()
    const rows = joinDashboardRows(inputs(MIXED))
    // v0.2: sub-0004/sub-0005 是孤儿子代理（无 parentId）→ join 层不发射
    assert.equal(rows.length, 3, '只有 3 条主会话（孤儿子代理不发射）')
    const ids = filter => filterDashboardRows(rows, filter).map(r => r.id).sort()
    assert.deepEqual(ids('main'), ['session-main-shell-0002', 'session-main-titled-0001'])
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
    // v0.2 起标题 span 的 className 是条件表达式（子代理行降层），锚点随之更新，
    // 但断言强度不降：仍须证明「包裹」而非「并列」，且 openOnClick 禁令作用域限定在标题这一个 Tooltip 上
    // （文件里另有 4 处合法的 openOnClick：项目列 / Token / 缓存 / 上下文，属数值明细类，ui §15.4）。
    const titleSpan = "<span className={isSub ? 'dsh-dash-session-title dsh-dash-session-title-sub' : 'dsh-dash-session-title'}>{row.title}</span>"
    const at = panelSource.indexOf(titleSpan)
    assert.ok(at >= 0, '标题 span 结构已变：请复核本用例（锚点是含子代理降层 className 三元表达式的整个 span）')
    const openTag = panelSource.slice(0, at).match(/<Tooltip[^>]*>\s*$/)
    assert.ok(
      openTag !== null,
      '标题 span 前必须紧跟 <Tooltip …> 开标签（ui §5.1：截断时 Tooltip 显示完整标题）；'
      + `实际前置文本：${JSON.stringify(panelSource.slice(Math.max(0, at - 160), at))}`,
    )
    const tag = openTag[0]
    assert.match(tag, /\bportal\b/, 'ui §2 层级表：面板内 Tooltip 必须用 portal 变体（非 portal z=100 会被面板盖住）')
    assert.match(tag, /label=\{row\.title\}/, 'Tooltip label 必须是 row.title（完整标题或回落的会话 id），否则悬停看到的不是全文')
    assert.match(tag, /\bonlyWhenClipped\b/, 'ui §5.1：只在真被截断时显示（原语按 scrollWidth > clientWidth 判定）')
    const after = panelSource.slice(at + titleSpan.length).replace(/^\s+/, '')
    assert.ok(after.startsWith('</Tooltip>'), `标题 span 后必须紧跟 </Tooltip>；实际：${JSON.stringify(after.slice(0, 40))}`)
    assert.ok(!/\bopenOnClick\b/.test(tag), 'ui §10：标题截断属纯辅助类，触屏不显示，不得加 openOnClick')
  })

  it('TC-16 五处「—」占位都带 sr-only 的 dash.noData（ui §15.4 引 §5.6）', () => {
    // 项目列 + 模型 + Token + 缓存 + 上下文。视觉「—」aria-hidden，读屏读 dash.noData。
    const n = (panelSource.match(/t\('dash\.noData'\)/g) ?? []).length
    assert.equal(n, 5, `dash.noData 的引用数应为 5（五个占位列），实为 ${n}；列结构变了请复核本用例`)
    const hidden = (panelSource.match(/<span aria-hidden="true"[^>]*>—<\/span>/g) ?? []).length
    assert.ok(hidden >= 5, `视觉「—」应带 aria-hidden（避免读屏读到裸破折号），实为 ${hidden} 处`)
  })

  it('TC-18 全量 titleOf 不得采信 displayTitle（design §12 规则一+规则二，D7/D9 防止第三次复现）', () => {
    // §12 规则一：任何渲染会话标题的面一律 title || id，禁止 displayTitle。
    // D7 修了 DashboardPanel.titleOf，D9 修了 ops.ts 的 titleOf（侧栏 notice）。
    // 本断言扫描 src/client/ 下所有 .ts 文件，找到每一个 titleOf 定义，逐一定向钉住。
    const clientDir = join(repoRoot, 'src/client')
    const files = readdirSync(clientDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
    let violations = 0
    for (const file of files) {
      const src = readFileSync(join(clientDir, file), 'utf8')
      // 找所有 const titleOf = ... 或 const titleOf = ( ... 定义
      const re = /const titleOf\s*=\s*(?:useCallback\()?\s*(?:\([^)]*\)|async\s*\([^)]*\))\s*(?::\s*\w+)?\s*=>\s*\{/g
      let m
      while ((m = re.exec(src)) !== null) {
        const fnStart = m.index
        // 简版：从 { 到下一个独立 }（函数体结束）
        let depth = 1
        let i = fnStart + m[0].length - 1 // 站在开 {
        while (depth > 0 && i < src.length) {
          if (src[i] === '{') depth++
          else if (src[i] === '}') depth--
          i++
        }
        const fnBody = src.slice(fnStart, i)
        // 剔除注释后检查
        const cleaned = fnBody.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
        if (cleaned.includes('displayTitle')) {
          violations++
          console.error(`FAIL: ${file} 的 titleOf 函数体含 displayTitle（去注释后）：\n${cleaned.slice(0, 200)}…`)
        }
        if (!/(?:byId\[[^\]]+\]|row|session)\?\.title/.test(cleaned)) {
          violations++
          console.error(`FAIL: ${file} 的 titleOf 未取 row?.title：\n${cleaned.slice(0, 200)}…`)
        }
      }
    }
    assert.equal(violations, 0,
      `${violations} 处 titleOf 定义违反 design §12 规则一——`
      + `禁止 displayTitle（用持久化 title || id），且必须取 row?.title。`
      + `\n扫描目录：src/client/（${files.length} 个 ts/tsx 文件）`)
  })

  /**
   * 剔除注释、**保留字符串字面量**的源码净化器（§12 守卫用）。
   *
   * 为什么不用 `.replace(/\/\/.*$/gm, '')` 那种正则：它会误伤字符串里的 `//`（URL、路由前缀），
   * 也会被注释里的引号带偏。这里走状态机，逐字符判定 code / 行注释 / 块注释 / 三种引号。
   * 字符串必须保留——`row["displayTitle"]` 这种写法同样是运行时消费，不能因为净化被吃掉。
   */
  const stripComments = (source) => {
    let out = ''
    let state = 'code'
    for (let i = 0; i < source.length; i++) {
      const c = source[i]
      const c2 = source[i + 1]
      if (state === 'code') {
        if (c === '/' && c2 === '/') { state = 'line'; i++; continue }
        if (c === '/' && c2 === '*') { state = 'block'; i++; continue }
        if (c === "'") state = 'sq'
        else if (c === '"') state = 'dq'
        else if (c === '`') state = 'tpl'
        out += c
        continue
      }
      if (state === 'line') { if (c === '\n') { state = 'code'; out += c } continue }
      if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i++ } continue }
      out += c
      if (c === '\\') { out += source[i + 1] ?? ''; i++; continue }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code'
    }
    return out
  }

  it('TC-20 src/client 运行时零 displayTitle 消费（§12 规则一全局守卫，不限函数名）', () => {
    // 比 TC-18 更狠：TC-18 只钉名叫 titleOf 的函数体，本条钉**整个 src/client**——
    // 任何面以任何写法（内联 byId[id]?.displayTitle、别名函数、解构）重新引入都会变红。
    // 产品经理 2026-11-04 拍板：意图是「任何面以任何函数名重新引入」都拦住。
    const clientDir = join(repoRoot, 'src/client')
    const files = readdirSync(clientDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).sort()
    assert.ok(files.length >= 10, `src/client 下应至少有 10 个源文件，实为 ${files.length}——目录结构变了请复核本用例`)
    const offenders = []
    for (const file of files) {
      const code = stripComments(readFileSync(join(clientDir, file), 'utf8'))
      const hits = (code.match(/displayTitle/g) ?? []).length
      if (file === 'types.ts') {
        // 唯一豁免：宿主契约的**类型声明**（形状必须与宿主一致，声明不是消费）。
        // 数量钉死，兼作净化器的自检——净化失灵会让 hits 掉到 0 而静默通过。
        assert.equal(hits, 2, 'types.ts 应恰有 2 处 displayTitle 类型声明（SessionRowSummary 字段 + 宿主 context-menu target 形状）；'
          + `实为 ${hits}——要么契约变了，要么净化器失灵，请复核`)
        assert.equal((code.match(/displayTitle\?:\s*string/g) ?? []).length, hits,
          'types.ts 里的 displayTitle 必须全部处于类型声明位（displayTitle?: string），不得有运行时消费')
        continue
      }
      if (hits > 0) offenders.push(`${file}：${hits} 处`)
    }
    assert.deepEqual(offenders, [],
      'design §12 规则一：任何渲染会话标题的面一律 title || id，禁止采信 displayTitle'
      + '（其回落链是 持久化 title → 项目目录 basename → id，会把无标题会话显示成文件夹名，即用户报的「问题二」）。'
      + `\n仍在运行时消费 displayTitle 的文件：${offenders.join('；')}`
      + '\n修法：改取 ?.title，并按 TC-21 保留空串兜底。')
  })

  it('TC-21 titleOf 必须接住空串标题，且 TC-18 的扫描不得空转', () => {
    // ① 空串兜底：displayTitle 的回落链永不返回空串，所以旧代码没这个需求；改取 title 之后
    //    「字段存在但是空串」成了可能值，而 `??` 只接 undefined/null → notice 里会出现空白会话名。
    const opsSource = readFileSync(join(repoRoot, 'src/client/ops.ts'), 'utf8')
    for (const [name, src, anchor] of [
      ['DashboardPanel.tsx', panelSource, 'const titleOf = useCallback((id: string): string => {'],
      ['ops.ts', opsSource, 'const titleOf = (sessionId: SessionIdString): string => {'],
    ]) {
      const at = src.indexOf(anchor)
      assert.ok(at >= 0, `${name} 的 titleOf 定义位已移动：请更新本断言锚点`)
      const body = stripComments(src.slice(at, at + 400))
      assert.ok(body.includes("!== ''") || /\|\|\s*(?:id|sessionId)\b/.test(body),
        `${name} 的 titleOf 必须接住空串标题（` + '`?? id` 不够，要 `|| id` 或显式 !== ""）。当前函数体：'
        + JSON.stringify(body.slice(0, 220)))
    }
    // ② 防空转：TC-18 靠正则匹配 titleOf 的**定义形态**，形态一变（例如改成 function 声明）
    //    就会「扫到 0 个定义 → 0 处违反 → 通过」，守卫静默失效。这里钉住至少扫到 2 个。
    const clientDir = join(repoRoot, 'src/client')
    const defRe = /const titleOf\s*=\s*(?:useCallback\()?\s*(?:\([^)]*\)|async\s*\([^)]*\))\s*(?::\s*\w+)?\s*=>\s*\{/g
    let found = 0
    for (const file of readdirSync(clientDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      found += (stripComments(readFileSync(join(clientDir, file), 'utf8')).match(defRe) ?? []).length
    }
    assert.ok(found >= 2, `TC-18 的定义正则只扫到 ${found} 个 titleOf（应 ≥2：面板 + 侧栏 ops）。`
      + '定义形态变了就更新 TC-18 的正则，别让守卫空转成永久通过。')
  })

  it('TC-22 截断守卫：DashboardPanel.tsx 剥注释后 .parentId 仅限 parentDisplay 块——级联不得沿 parentId 遍历（fork 终裁第 2 条）', () => {
    // 血统/级联链在非 subagent 行截断（产品经理 fork 终裁 2026-11-04 第 2 条）：
    // effectiveArchived 与删除级联的祖先遍历只允许沿 children map 走，
    // 而 children map 只装 subagent 行——fork 不在任何人的 children 里，故 fork 永不进级联。
    // 本守卫禁止 DashboardPanel.tsx 在 parentDisplay 块之外使用 .parentId，
    // 防后人绕过 children map 直走 parentId 链实现级联。
    const dashSource = stripComments(readFileSync(join(repoRoot, 'src/client/DashboardPanel.tsx'), 'utf8'))
    // 定位 parentDisplay 块（第一个合法出处——子代理行小字渲染）
    const pdStart = dashSource.indexOf('const parentDisplay = (isSub && row.parentId)')
    assert.ok(pdStart >= 0, 'parentDisplay 块锚点已移动：请更新本断言')
    const afterPd = dashSource.slice(pdStart)
    const pdEndMatch = afterPd.match(/\}\)\(\)\s*:\s*null/)
    assert.ok(pdEndMatch, 'parentDisplay 块结束位已移动：请更新本断言')
    const pdBlock = dashSource.slice(pdStart, pdStart + pdEndMatch.index + pdEndMatch[0].length)

    // 定位 fork Tag 块（第二个合法出处——fork「派生」Tag 渲染，纯显示非级联）
    // 锚点：`{!isSub && row.parentId` 是 fork Tag 的条件（唯一出现位）
    const forkTagStart = dashSource.indexOf('{!isSub && row.parentId')
    assert.ok(forkTagStart >= 0, 'fork Tag 块锚点已移动：请更新本断言')
    // fork Tag 块结束：</Tooltip>)} 闭合
    const afterFk = dashSource.slice(forkTagStart)
    const fkEndMatch = afterFk.match(/<\/Tooltip>\s*\)\s*\}/)
    assert.ok(fkEndMatch, 'fork Tag 块结束位已移动：请更新本断言')
    const forkTagBlock = forkTagStart >= 0 && fkEndMatch
      ? dashSource.slice(forkTagStart, forkTagStart + fkEndMatch.index + fkEndMatch[0].length)
      : ''

    // 扫全文件 .parentId 出现位
    const parentIdRe = /\.parentId\b/g
    let m
    const violations = []
    while ((m = parentIdRe.exec(dashSource)) !== null) {
      const pos = m.index
      if (pos >= pdStart && pos <= pdStart + pdBlock.length) continue
      if (forkTagBlock.length > 0 && pos >= forkTagStart && pos <= forkTagStart + forkTagBlock.length) continue
      const line = dashSource.slice(Math.max(0, pos - 60), pos + 60).replace(/\n/g, '↵')
      violations.push(`pos ${pos}: …${line}…`)
    }
    assert.deepEqual(violations, [],
      'fork 终裁第 2 条违反：DashboardPanel.tsx 在 parentDisplay 块之外使用了 .parentId。\n'
      + '级联/血统传播只允许沿 buildTree 的 children map 走（fork 不在任何人的 children 里），'
      + '不得直走 .parentId 链——否则 fork 会被错误纳入级联。\n'
      + `违规位：\n${violations.join('\n')}`)
  })
})
