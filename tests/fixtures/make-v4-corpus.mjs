/**
 * v0.3 验收语料生成器——按 design §13 / ui §16 的新语义重造沙箱语料。
 *
 * ## 为什么重造（acceptance v3 §12.2 / D11）
 *
 * 上一版语料把三类「GUI 结构上看不见」的行混进了主语料，导致用户拿侧栏行数核对看板行数
 * 永远对不上：1 条 header 无 cwd 的冷子代理（宿主列表直接丢弃，`api/session-controller/
 * src/list.ts:149`）、3 条零轮次 blank 主会话（GUI 当「新会话」占位处理）。本版把主语料
 * 收敛成「与侧栏可见集一一对应」，边界行单独成组并在 manifest 里逐行标注**预期可见性**。
 *
 * ## 四组语料
 *
 * | 组 | 开关 | 内容 | 验的是 |
 * |---|---|---|---|
 * | main | 恒开 | 5 条主会话（含 1 条 fork）+ 7 条子代理（含 1 条 depth 2 孙代理、1 条 cwd 与父不同） | §13.1 两档、§13.2 压平两层、§13.4 子行纯展示、§11.7 项目列树级值、fork 不缩进不级联 |
 * | boundary | `FIXTURE_BOUNDARY`（默认 1） | 无 cwd 冷孤儿子代理、有 cwd 孤儿子代理、召回语料（2 条成功 + 1 条目录已删） | §13.3 孤儿不发射、§13.5 stats-only 行不发射（D10）、§13.6/ui §16 召回全链路 |
 * | blank | `FIXTURE_BLANK`（默认 1） | 零轮次主会话（**写全 projcache**，blank=true）、零轮次主会话（**故意不写 projcache**）、零轮次子代理（blank=true，挂 P1） | 产品经理裁决「看板口径 = 至少一轮对话」的**两头钉**，见下 |
 *
 * ## blank 的两头钉（系统架构师 2026-11-04 键控结论）
 *
 * blank 是持久化投影 fold：init 为 true、**首个 `turn/start` 翻 false**（`list.ts:47-58/93`），
 * 「落盘与否」不参与判定。列表只读会话存活期写的 `session_projcache`，**从不按日志现算**
 * （`list.ts` 注释原文「a listing never seeds a fold」）：live 路径 `metadata?.blank ?? session.seq === 0`、
 * cold 路径 `metadata?.blank ?? false`（注释「remains unknown and visible」——缓存缺失时宿主故意保守可见）。
 *
 * 所以本组造两头，缺一不可：
 *
 * - **Z1 / Z3（写全 projcache、零轮次）** → 宿主报 `blank=true` → 看板**四档皆无、不计 chips**，
 *   侧栏只在「当前占位」时可见。这是产品经理裁决要排除的那一类，也是真实用户会有的形态
 *   （桌面 114 条 projcache 零缺失、其中 5 条主会话 blank=true，与按日志独立数的「70 主会话里
 *   5 条零轮次」同集合）。
 * - **Z2（故意不写 projcache、零轮次）** → cold fallback `blank=false` → **看板与侧栏同显**。
 *   这不是缺陷、也不许「顺手排除」：侧栏走同一个 wire 字段，强行排除反而制造看板≠侧栏的新 Δ。
 *   真实数据 0/114 例，此行为**兜底路径**而设。
 *
 * 结论落到实现：join 用 `session.blank === true` **单一键**（现有 `if (session?.blank) continue`
 * 已正确，无需第二把钥匙）；**不要按 turns 键控**——`/stats` 载荷没有 turns 字段。
 *
 * ## 夹具写 projcache 的边界（重要，别当成通用做法）
 *
 * 记录模板取自沙箱里一条**合成**零轮次会话被宿主 hydrate 后写下的真实记录
 * （`tests/fixtures/projcache-record-template.json`，5KB / 29 行，零用户数据）。生成器只重写
 * 5 处：`identity`（宿主 `currentLifecycleMatches` 比对的 formatVersion/createdAt/cwd/isSeeded
 * 四字段，`inheritedEventCount` 恒 0）、`sessionListMetadata.val`、`title.val`、
 * `workingDirectory.val`、`sessionStats.val.turns`；其余 24 行保留模板的零轮次值。
 *
 * 这样做的依据：所有行的 `seq` 水位都是 3（= 三个建立期事件），1 轮次行的轮次事件在 seq 3 之后，
 * 宿主 hydrate 时从水位续折日志会把累计行（turnBoundary/sessionStats/tokenUsage/title…）重算正确；
 * 列表路径只读 summary 键（title、sessionListMetadata 等），拿到的就是这里写的值。
 * **若发现某个面显示 0 轮次或空 outline，先怀疑这里的模板残留值，不要怀疑实现。**
 *
 * ## workspace 账本（§13.6 召回的前提）
 *
 * 侧栏分组按**显式成员** `tables.workspaces.<id>.sessionIds`（`ui-workspace/src/client/tree.ts:30`），
 * 不按 cwd；非成员落「未分组」。本工具会重写 `workspace.json`：只注册 `PROJ_A` 一个工作区
 * （成员 = 4 条主会话），其余 cwd 一律不注册 → 那些主会话在侧栏是「未分组」，正是用户
 * 问题 5 的前置状态。**召回用的两个工作区故意不注册**：横幅靠快照 diff 里的新 workspaceId
 * 触发（ui §16.1），预注册就不会触发，必须由验收人在 GUI 里手动添加。
 *
 * ⚠️ 直写 `workspace.json` 只是**夹具**行为（先备份、后重启）。产品侧改成员必须走
 * `registry.resolveByPath(path)` + `workspace.attachSession(id)`——直接改文件会绕过 attach
 * 校验、`updatedAt` 戳、无效候选剪枝与 pending-mutation 回滚四道机制（系统架构师 2026-11-04）。
 *
 * ## 用法（只在沙箱容器内跑）
 *
 * ```sh
 * docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-v4-corpus.mjs
 * cd dev-dsh && ./dsh-dev.sh restart   # 必须重启：宿主不热扫描会话目录，也不热读 workspace 账本
 * ```
 *
 * 环境变量：`FIXTURE_SESSIONS_ROOT`（默认 `/root/.dsh/sessions`）、`FIXTURE_PROJCACHE`
 * （默认 `/root/.dsh/storages/session_projcache/sessions`）、`FIXTURE_WORKSPACE_STORE`
 * （默认 `/root/.dsh/storages/workspace.json`）、`FIXTURE_BASE`（默认 `/root`）、
 * `FIXTURE_WIPE`（默认 1：先备份再清空旧会话目录）、`FIXTURE_BOUNDARY`（默认 1）、
 * `FIXTURE_BLANK`（默认 1）、`FIXTURE_KEEP_RECALL_B`（默认 0：写完即删召回失败行的项目目录；
 * 置 1 保留，供 GUI 目录选择器先添加工作区、再手动删）、`FIXTURE_MANIFEST`（默认 `/tmp/v4-corpus.json`）。
 *
 * 日志布局与格式硬要求（多帧 zstd、目录名 = `projectKey(cwd)`、`tools` 不可为空数组、
 * 标题投影懒生成、注入后需重启）见同目录 `session-log.mjs` 模块头。全部文案自撰，零用户数据。
 *
 * @module tests/fixtures/make-v4-corpus
 */

import fs from 'node:fs'
import path from 'node:path'
import { sessionHeader, setupEvents, titledTurnEvents, writeSession, uuid } from './session-log.mjs'

const SESSIONS_ROOT = process.env.FIXTURE_SESSIONS_ROOT ?? '/root/.dsh/sessions'
const PROJCACHE_DIR = process.env.FIXTURE_PROJCACHE ?? '/root/.dsh/storages/session_projcache/sessions'
const WORKSPACE_STORE = process.env.FIXTURE_WORKSPACE_STORE ?? '/root/.dsh/storages/workspace.json'
const BASE = process.env.FIXTURE_BASE ?? '/root'
const WIPE = process.env.FIXTURE_WIPE ?? '1'
const BOUNDARY = (process.env.FIXTURE_BOUNDARY ?? '1') !== '0'
const BLANK_GROUP = (process.env.FIXTURE_BLANK ?? '1') !== '0'
/** 置 1 则保留召回失败行的项目目录（GUI 目录选择器需要目录存在时用；随后手动删）。 */
const KEEP_RECALL_B = process.env.FIXTURE_KEEP_RECALL_B ?? '0'

/** 五个项目目录：A/B 是主语料，RECALL_* 是召回语料，EDGE 是边界行。 */
const PROJ_A = `${BASE}/v4-proj-a`
const PROJ_B = `${BASE}/v4-proj-b`
const RECALL_A = `${BASE}/v4-recall-a`
const RECALL_B = `${BASE}/v4-recall-b`
const EDGE = `${BASE}/v4-edge`

const NOW = Date.now()
const HOUR = 3600_000

/** projcache 记录模板（宿主为一条合成零轮次会话写下的真实记录，29 行、零用户数据）。 */
const TEMPLATE = JSON.parse(fs.readFileSync(
  new URL('./projcache-record-template.json', import.meta.url),
  'utf8',
))

/** 用量四桶，让各行数据列可区分（成本归因验收用）。 */
const usage = (input, output, cacheRead, cacheWrite) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
  totalTokens: input + output + cacheRead + cacheWrite,
})

/** 已写出的行，进 manifest。 */
const rows = []

/**
 * 写一条 projcache 记录，让宿主列表拿到与日志一致的 blank / title。
 *
 * 只重写身份四字段与四个列表相关行，其余保留模板值（依据见模块头「夹具写 projcache 的边界」）。
 * @param options - 记录参数。
 * @param options.id - 会话 id。
 * @param options.createdAt - 必须**逐字等于**日志 header 的 createdAt。
 * @param options.cwd - 必须逐字等于 header 的 cwd；`undefined` 表示 header 无 cwd（身份里也省略该键）。
 * @param options.title - 持久化标题；零轮次为 `null`。
 * @param options.turns - 轮次数（0 或 1）。
 * @param options.blank - `sessionListMetadata.blank`；零轮次为 true。
 * @param options.lastPromptAt - 最后一次用户消息时间；零轮次为 null。
 * @returns 写入的文件路径。
 */
function writeProjcache({ id, createdAt, cwd, title, turns, blank, lastPromptAt }) {
  const record = structuredClone(TEMPLATE)
  const identity = { formatVersion: 4, createdAt, isSeeded: false, inheritedEventCount: 0 }
  // 宿主 lifecycleIdentityOf 在 header 无 cwd 时**省略该键**，比对是 stored.cwd === expected.cwd
  if (cwd !== undefined) identity.cwd = cwd
  record.record.identity = identity
  const cacheRows = record.record.rows
  cacheRows.sessionListMetadata.val = { blank, lastPromptAt: lastPromptAt ?? null }
  cacheRows.title.val = title ?? null
  cacheRows.sessionStats.val = { ...cacheRows.sessionStats.val, turns }
  if (cwd === undefined) delete cacheRows.workingDirectory
  else cacheRows.workingDirectory.val = cwd
  fs.mkdirSync(PROJCACHE_DIR, { recursive: true })
  const file = path.join(PROJCACHE_DIR, `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(record, null, 2))
  // 自检：回读并镜像宿主 currentLifecycleMatches 的四字段比对，写错当场炸而不是静默 fallback
  const back = JSON.parse(fs.readFileSync(file, 'utf8'))
  const got = back.record.identity
  if (got.formatVersion !== 4 || got.createdAt !== createdAt || got.cwd !== cwd || got.isSeeded !== false) {
    throw new Error(`projcache identity mismatch for ${id}: ${JSON.stringify(got)}`)
  }
  if (back.record.rows.sessionListMetadata.val.blank !== blank) {
    throw new Error(`projcache blank mismatch for ${id}`)
  }
  return file
}

/**
 * 写出一条会话（日志 + 可选 projcache）并登记到 manifest。
 * @param spec - 会话规格。
 * @param spec.role - 语料角色（manifest 里的行标签）。
 * @param spec.id - 会话 id；主会话惯例 `session-<uuid>`，子代理裸 uuid。
 * @param spec.title - 持久化标题；`null` 表示零轮次（无 `session/title`）。
 * @param spec.cwd - 工作目录；`undefined` = header 不带 cwd（落 `_no-cwd`）。
 * @param spec.delegationDepth - 委派深度。
 * @param spec.parentSession - 父会话 id。
 * @param spec.origin - 来源标记；子代理为 `'subagent'`，fork **不带**。
 * @param spec.ageHours - 相对当前的小时数（决定行序：新→旧）。
 * @param spec.usage - 用量四桶。
 * @param spec.cache - `'full'`（默认，写 projcache）或 `'none'`（故意不写，验 cold fallback）。
 * @param spec.expect - 预期可见性说明（进 manifest，验收逐行对照）。
 * @returns 该行的 manifest 记录。
 */
function write(spec) {
  const createdAt = NOW - spec.ageHours * HOUR
  const header = sessionHeader({
    id: spec.id,
    createdAt,
    delegationDepth: spec.delegationDepth,
    cwd: spec.cwd,
    parentSession: spec.parentSession,
    origin: spec.origin,
  })
  const turns = spec.title === null ? 0 : 1
  // 零轮次行只写建立期三事件（无 turn/start、无 session/title）→ 投影 turns=0、title=null
  const events = spec.title === null
    ? setupEvents(0, createdAt + 1000)
    : titledTurnEvents({
      startTime: createdAt + 1000,
      title: spec.title,
      userText: `${spec.title}——这是 v0.3 验收语料，请忽略内容。`,
      assistantText: '已收到，这条会话用于看板 v0.3 验收。',
      usage: spec.usage,
    })
  writeSession({ sessionsRoot: SESSIONS_ROOT, header, events })
  const cache = spec.cache ?? 'full'
  if (cache === 'full') {
    writeProjcache({
      id: spec.id,
      createdAt,
      cwd: spec.cwd,
      title: spec.title,
      turns,
      blank: turns === 0,
      lastPromptAt: turns === 0 ? null : createdAt + 5000,
    })
  }
  const row = {
    role: spec.role,
    id: spec.id,
    title: spec.title,
    cwd: spec.cwd ?? null,
    kind: spec.origin === 'subagent' ? 'subagent' : spec.parentSession !== undefined ? 'fork' : 'main',
    delegationDepth: spec.delegationDepth,
    parentSession: spec.parentSession ?? null,
    turns,
    projcache: cache,
    hostBlank: cache === 'full' ? turns === 0 : 'false（cold fallback，缓存缺失）',
    expect: spec.expect,
  }
  rows.push(row)
  return row
}

// ---- 0) 清场：备份旧语料后清空会话目录（projcache 不清，新 id 天然无记录）----

const backup = path.join('/tmp', `v4-corpus-backup-${NOW}`)
if (WIPE === '1') {
  fs.mkdirSync(backup, { recursive: true })
  if (fs.existsSync(SESSIONS_ROOT)) {
    for (const entry of fs.readdirSync(SESSIONS_ROOT)) {
      fs.cpSync(path.join(SESSIONS_ROOT, entry), path.join(backup, entry), { recursive: true })
      fs.rmSync(path.join(SESSIONS_ROOT, entry), { recursive: true, force: true })
    }
  }
  if (fs.existsSync(WORKSPACE_STORE)) fs.cpSync(WORKSPACE_STORE, path.join(backup, 'workspace.json'))
}

// ---- 1) 项目目录（召回失败行的目录写完会话后立即删掉）----

for (const dir of [PROJ_A, PROJ_B, RECALL_A, RECALL_B, EDGE]) fs.mkdirSync(dir, { recursive: true })

// ---- 2) main 组：与侧栏可见集一一对应 ----

const p1 = write({
  role: 'P1 主会话（2 个可见子代理）', id: `session-${uuid()}`, title: '验收 A · 主会话',
  cwd: PROJ_A, delegationDepth: 0, ageHours: 1, usage: usage(2000, 600, 12000, 900),
  expect: '主会话档树根；徽标 N=2（blank 组开启时名下还有 1 条零轮次子代理 Z3，**不计入**）；项目列 v4-proj-a；侧栏 W_a 分组可见',
})
const a1 = write({
  role: 'A1 子代理（cwd 同父）', id: uuid(), title: '子代理 A1 · 检索',
  cwd: PROJ_A, delegationDepth: 1, parentSession: p1.id, origin: 'subagent', ageHours: 2,
  usage: usage(900, 240, 4000, 300),
  expect: 'P1 展开后 depth=1；纯展示无 checkbox；项目列取树级值 v4-proj-a',
})
const a2 = write({
  role: 'A2 子代理（cwd 与父不同）', id: uuid(), title: '子代理 A2 · 实现',
  cwd: PROJ_B, delegationDepth: 1, parentSession: p1.id, origin: 'subagent', ageHours: 3,
  usage: usage(1500, 480, 7000, 600),
  expect: '项目列仍显示 v4-proj-a（树级值），不显示自己的 v4-proj-b；真实语料 41/41 子代理 cwd 与父相同，此行是规格验证用的合成场景',
})

const p2 = write({
  role: 'P2 主会话（含孙代理，验压平）', id: `session-${uuid()}`, title: '验收 B · 主会话',
  cwd: PROJ_A, delegationDepth: 0, ageHours: 4, usage: usage(1800, 520, 9000, 700),
  expect: '主会话档树根；徽标 N=2（压平后代总数，不是直接子数 1）',
})
const b1 = write({
  role: 'B1 子代理（P2 的直接子）', id: uuid(), title: '子代理 B1 · 分析',
  cwd: PROJ_A, delegationDepth: 1, parentSession: p2.id, origin: 'subagent', ageHours: 5,
  usage: usage(700, 200, 3000, 250),
  expect: 'depth=1；无展开按钮（压平后它名下不再挂层）',
})
const b1a = write({
  role: 'B1a 孙代理（depth 2，父=B1）', id: uuid(), title: '孙代理 B1a · 校验',
  cwd: PROJ_A, delegationDepth: 2, parentSession: b1.id, origin: 'subagent', ageHours: 6,
  usage: usage(400, 120, 1500, 150),
  expect: '**挂到最近主会话祖先 P2、depth 恒 1**；DFS 先序紧跟 B1；不出现第三层缩进',
})

const p3 = write({
  role: 'P3 主会话（三步归档用）', id: `session-${uuid()}`, title: '验收 C · 主会话',
  cwd: PROJ_A, delegationDepth: 0, ageHours: 7, usage: usage(1600, 480, 8000, 640),
  expect: '主会话档树根；徽标 N=2；三步归档场景的树根',
})
const c1 = write({
  role: 'C1 子代理（第 1 步显式归档对象）', id: uuid(), title: '子代理 C1 · 待显式归档',
  cwd: PROJ_A, delegationDepth: 1, parentSession: p3.id, origin: 'subagent', ageHours: 8,
  usage: usage(600, 180, 2600, 220),
  expect: '第 1 步归档后：主会话档 P3 子树内显示归档徽标 + **行级恢复可点**（§13.4 存量例外分支）',
})
const c2 = write({
  role: 'C2 子代理（血统归档对照）', id: uuid(), title: '子代理 C2 · 血统归档对照',
  cwd: PROJ_A, delegationDepth: 1, parentSession: p3.id, origin: 'subagent', ageHours: 9,
  usage: usage(620, 190, 2700, 230),
  expect: '第 2 步归档 P3 后：血统归档，置灰 + Tooltip 点名最近显式归档祖先；第 3 步恢复 P3 后**不回主会话档**（C1 仍显式归档 → P3 子树仍血统归档）',
})

const p4 = write({
  role: 'P4 fork 会话（父=P1）', id: `session-${uuid()}`, title: '验收 D · fork 会话',
  cwd: PROJ_A, delegationDepth: 0, parentSession: p1.id, ageHours: 10,
  usage: usage(1100, 340, 5200, 430),
  expect: '主会话档**树根**、与普通主会话完全同权（有 checkbox、可勾选、可单独归档/恢复/删除）、depth=0 不缩进、不挂 P1 子树（产品经理 fork 终裁 2026-11-04，延伸裁决二）；不算 P1 的后代：P1 徽标不含它、归档 P1 后它**照常可见**、删除 P1 的级联集合不含它',
})
const d1 = write({
  role: 'D1 子代理（父=fork P4）', id: uuid(), title: '子代理 D1 · fork 名下',
  cwd: PROJ_A, delegationDepth: 1, parentSession: p4.id, origin: 'subagent', ageHours: 11,
  usage: usage(500, 150, 2100, 180),
  expect: '挂 P4、depth=1、P4 徽标 N=1；压平锚点 = 最近的**非 subagent** 祖先 = P4，**不得重挂到 P1**（重挂会让 P1 徽标 2→3、fork 名下子代理泄漏进 P1 子树）；删除 P1 的级联集合不含它（截断规则）',
})

const t1 = write({
  role: 'T1 主会话（无子代理、未分组）', id: `session-${uuid()}`, title: '验收 E · 对照主会话',
  cwd: PROJ_B, delegationDepth: 0, ageHours: 12, usage: usage(1300, 400, 6100, 500),
  expect: '主会话档树根、无展开控件无徽标；项目列 v4-proj-b；侧栏落「未分组」（该 cwd 未注册工作区）',
})

// ---- 3) boundary 组：孤儿 / stats-only / 召回 ----

let e2 = null, e3 = null, r1 = null, r1s = null, r2 = null, r3 = null
if (BOUNDARY) {
  e2 = write({
    role: 'E2 无 cwd 冷孤儿子代理（stats-only）', id: uuid(), title: '边界 E2 · 无 cwd 孤儿子代理',
    cwd: undefined, delegationDepth: 1, parentSession: `session-${uuid()}`, origin: 'subagent',
    ageHours: 13, usage: usage(300, 90, 1000, 100),
    expect: '**任何档、任何计数都不得出现**（D10 判据：∉ ids 的 stats-only 行在 join 层丢弃）；侧栏结构上不可能显示它（list.ts:149）；projcache 已写全，所以它缺席的唯一原因就是无 cwd',
  })
  e3 = write({
    role: 'E3 有 cwd 孤儿子代理', id: uuid(), title: '边界 E3 · 父已删除的孤儿子代理',
    cwd: EDGE, delegationDepth: 1, parentSession: `session-${uuid()}`, origin: 'subagent',
    ageHours: 14, usage: usage(320, 95, 1100, 110),
    expect: '**不发射**（§13.3）；与 DSH lineage.ts 的 degrade-to-root 是有意分歧，契约测试须钉住',
  })
  r1 = write({
    role: 'R1 召回候选（RECALL_A）', id: `session-${uuid()}`, title: '召回 R1 · 待回项目空间',
    cwd: RECALL_A, delegationDepth: 0, ageHours: 15, usage: usage(800, 240, 3400, 280),
    expect: '未分组；添加工作区 v4-recall-a 后进召回清单、默认可勾选；召回后侧栏归组、看板项目列不变（cwd 未改）',
  })
  r1s = write({
    role: 'R1s 子代理（父=R1）', id: uuid(), title: '子代理 R1s · 随主会话归位',
    cwd: RECALL_A, delegationDepth: 1, parentSession: r1.id, origin: 'subagent', ageHours: 16,
    usage: usage(260, 80, 900, 90),
    expect: '不进召回清单、membership 不回填（§13.6 取舍）；只计入横幅 {m} 亲缘计数；R1 召回后自动挂回其下',
  })
  r2 = write({
    role: 'R2 召回候选（RECALL_A）', id: `session-${uuid()}`, title: '召回 R2 · 待回项目空间',
    cwd: RECALL_A, delegationDepth: 0, ageHours: 17, usage: usage(840, 250, 3500, 290),
    expect: '同 R1；与 R1 一起构成横幅 {n}=2',
  })
  r3 = write({
    role: 'R3 召回失败行（目录已物理删除）', id: `session-${uuid()}`, title: '召回 R3 · 目录已删',
    cwd: RECALL_B, delegationDepth: 0, ageHours: 18, usage: usage(880, 260, 3600, 300),
    expect: '客户端裸 cwd 匹配命中 → 进清单；宿主 realpath 校验失败 → 单条失败不阻塞、notice 逐条点名（ui §16.3）。目录默认由本工具在写完后删除；设 FIXTURE_KEEP_RECALL_B=1 可保留（先在 GUI 里添加工作区、再手动删）',
  })
  if (KEEP_RECALL_B !== '1') fs.rmSync(RECALL_B, { recursive: true, force: true })
}

// ---- 4) blank 组：两头钉 ----

let z1 = null, z2 = null, z3 = null
if (BLANK_GROUP) {
  z1 = write({
    role: 'Z1 零轮次主会话（projcache 写全 → blank=true）', id: `session-${uuid()}`, title: null,
    cwd: EDGE, delegationDepth: 0, ageHours: 19,
    expect: '**四档皆无、不计 chips**（产品经理裁决：看板口径 = 至少一轮对话）；侧栏只在它是「当前占位」时可见。真实用户形态（桌面 5/70）',
  })
  z2 = write({
    role: 'Z2 零轮次主会话（**故意不写 projcache** → cold fallback）', id: `session-${uuid()}`, title: null,
    cwd: EDGE, delegationDepth: 0, ageHours: 20, cache: 'none',
    expect: '**看板与侧栏同显**（宿主 cold 路径 `?? false`、注释「remains unknown and visible」）；看板里标题回落 36 位 id、无 token 数据。不许「顺手排除」——那会制造看板≠侧栏的新 Δ。真实数据 0/114 例，此行只为兜底路径而设',
  })
  z3 = write({
    role: 'Z3 零轮次子代理（projcache 写全 → blank=true，父=P1）', id: uuid(), title: null,
    cwd: EDGE, delegationDepth: 1, parentSession: p1.id, origin: 'subagent', ageHours: 21,
    expect: '不发射、**且不计入 P1 的徽标 N**（P1 名下 3 条子代理，徽标必须是 2）；验 blank 排除对子行同口径。真实语料 41 条子代理 0 条 blank',
  })
}

// ---- 5) workspace 账本：只注册 PROJ_A，成员 = 4 条主会话（含 fork）----

const workspaceId = uuid()
const store = {
  unit: { name: 'workspace', version: 2 },
  global: {
    initialized: true,
    defaultWorkspaceId: workspaceId,
    workspaceIds: [workspaceId],
    archivedSessionIds: [],
    pinnedSessionIds: [],
  },
  tables: {
    workspaces: {
      [workspaceId]: {
        path: PROJ_A,
        title: path.basename(PROJ_A),
        sessionIds: [p1.id, p2.id, p3.id, p4.id],
        createdAt: new Date(NOW).toISOString(),
        updatedAt: new Date(NOW).toISOString(),
      },
    },
  },
}
fs.mkdirSync(path.dirname(WORKSPACE_STORE), { recursive: true })
fs.writeFileSync(WORKSPACE_STORE, JSON.stringify(store, null, 2))

// ---- 6) manifest ----

const mains = rows.filter(r => r.kind !== 'subagent')
const subs = rows.filter(r => r.kind === 'subagent')
const forks = mains.filter(r => r.kind === 'fork')
const inHostList = rows.filter(r => r.cwd !== null)
const blankRows = rows.filter(r => r.projcache === 'full' && r.turns === 0)
const cacheMissRows = rows.filter(r => r.projcache === 'none')
const rowById = new Map(rows.map(r => [r.id, r]))
/**
 * 不出现在看板树上的行——三类原因互不相同，验收时要能逐条点名：
 * - E2 = ∉ ids（header 无 cwd 被宿主列表丢弃 → join 层丢弃，§13.5 / D10）；
 * - E3 = 在行集内但孤儿子代理不发射（§13.3，与 DSH lineage 的 degrade-to-root 有意分歧）；
 * - blank 行 = 宿主报 `blank=true`（产品经理裁决一：看板口径「至少一轮对话」）。
 *
 * **fork 行不在此列**：产品经理 fork 终裁（2026-11-04，延伸裁决二）= fork 在主会话档作为
 * 独立树根、与普通主会话完全同权；血统/级联链在**非 subagent 行截断**，所以 fork 既不进
 * 起源会话的子树、也不进它的级联集合，但自己照常发射。
 */
const notEmittedIds = new Set([
  ...(e2 === null ? [] : [e2.id]),
  ...(e3 === null ? [] : [e3.id]),
  ...blankRows.map(r => r.id),
])
/**
 * 沿 `parentSession` 上溯到最近的非子代理祖先 = 压平后该行应挂的树根（§13.2）。
 * 客户端投影没有 `delegationDepth`，所以判据只能是 `kind`/`origin`（系统架构师 2026-11-04）；
 * fork 也是合法锚点（D1 挂 P4，不得越过 P4 重挂到 P1）。
 * @param row - 起始行。
 * @returns 锚点行；父不在语料里（孤儿）或成环时返回 null。
 */
function anchorOf(row) {
  let cur = row
  const seen = new Set([cur.id])
  while (cur.parentSession !== null && rowById.has(cur.parentSession)) {
    const parent = rowById.get(cur.parentSession)
    if (parent.kind !== 'subagent') return parent
    if (seen.has(parent.id)) return null
    seen.add(parent.id)
    cur = parent
  }
  return null
}
/** 全展开时真正发射的子行：自身未被排除，且锚点是已发射的树根（孤儿锚点 null → 不发射）。 */
const emittedSubs = subs.filter((s) => {
  if (notEmittedIds.has(s.id)) return false
  const anchor = anchorOf(s)
  if (anchor === null || notEmittedIds.has(anchor.id)) {
    notEmittedIds.add(s.id)
    return false
  }
  return true
})
const roots = mains.filter(r => !notEmittedIds.has(r.id))
/** 行集 = ∩(ids) 且非 blank；它**含** E3（发射阶段才丢孤儿），所以行集数 ≠ 展开可见行数。 */
const rowSetCount = inHostList.length - blankRows.filter(r => r.cwd !== null).length
/** 侧栏可见主会话（sessionVisible：非 subagent、非 blank）——fork 照常可见，终裁下它就是看板树根，故 Δ=0。 */
const sidebarMainCount = mains.filter(r => r.cwd !== null && !(r.projcache === 'full' && r.turns === 0)).length

const manifest = {
  generatedAt: new Date(NOW).toISOString(),
  generator: 'tests/fixtures/make-v4-corpus.mjs',
  spec: 'design §13 / ui §16（v0.3）',
  sessionsRoot: SESSIONS_ROOT,
  projcacheDir: PROJCACHE_DIR,
  backupDir: WIPE === '1' ? backup : null,
  groups: { main: true, boundary: BOUNDARY, blank: BLANK_GROUP },
  cwds: { PROJ_A, PROJ_B, RECALL_A, RECALL_B: `${RECALL_B}（已物理删除，召回失败行用）`, EDGE },
  workspaceStore: {
    path: WORKSPACE_STORE,
    registered: [{ id: workspaceId, path: PROJ_A, sessionIds: store.tables.workspaces[workspaceId].sessionIds }],
    notRegistered: [PROJ_B, RECALL_A, RECALL_B, EDGE],
    note: '未注册 cwd 下的主会话在侧栏落「未分组」= 用户问题 5 的前置状态；召回工作区必须由验收人在 GUI 里添加（横幅靠快照 diff 的新 workspaceId 触发，预注册不触发）',
  },
  counts: {
    total: rows.length,
    mains: mains.length,
    subagents: subs.length,
    byKind: rows.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {}),
    forkRoots: forks.length,
    inHostList: inHostList.length,
    droppedByHostList: rows.length - inHostList.length,
    blankTrue: blankRows.length,
    cacheMiss: cacheMissRows.length,
  },
  rows,
  expectedV03: {
    source: '按 design §13 + 系统架构师 blank 键控结论推导，**待实现落地后由 tests/fixtures/print-tree-expectations.mjs 从真实源码算出并覆盖**',
    hostListIds: inHostList.length,
    hostListDropped: rows.filter(r => r.cwd === null).map(r => `${r.id}（${r.role}）`),
    rowSet: `${inHostList.length} − ${blankRows.filter(r => r.cwd !== null).length}（blank=true）= ${rowSetCount} 行进看板；缓存缺失的 ${cacheMissRows.length} 条**照常进**`,
    rowSetCount,
    mainTabRoots: roots.map(r => r.role),
    mainTabRootCount: roots.length,
    chips: { main: roots.length, archived: 0 },
    collapsedVisibleRows: roots.length,
    expandedVisibleRows: roots.length + emittedSubs.length,
    expandedBreakdown: `${roots.length} 树根（含 fork P4）+ ${emittedSubs.length} 子行 = 11 条子代理 − Z3（blank）− E3（孤儿不发射）− E2（stats-only，∉ ids）`,
    rowSetVsExpandedNote: `行集 ${rowSetCount} 行含 E3（孤儿子代理：过了 join，发射阶段才丢）；全展开可见 ${roots.length + emittedSubs.length} 行。两个数不同是对的，别当成缺陷`,
    badgeN: {
      [p1.id]: 2, [p2.id]: 2, [p3.id]: 2, [p4.id]: 1, [t1.id]: 0,
      ...(r1 === null ? {} : { [r1.id]: 1 }),
      ...(r2 === null ? {} : { [r2.id]: 0, [r3.id]: 0 }),
      note: 'P1 名下实有 3 条子代理（A1、A2、Z3）+ 1 条 fork（P4）+ fork 名下 1 条子代理（D1）：Z3 blank 不计、P4 是独立根不算后代、D1 挂 P4 → P1 徽标必须 **2**；P2 的 2 = 压平后的 B1 + B1a（不是直接子数 1）；P4 的 1 = D1',
    },
    notEmitted: [
      ...(e2 === null ? [] : [`${e2.id}（E2 stats-only，∉ ids → §13.5 / D10）`]),
      ...(e3 === null ? [] : [`${e3.id}（E3 孤儿子代理 → §13.3）`]),
      ...blankRows.map(r => `${r.id}（${r.role.slice(0, 2)} blank=true → 裁决一排除）`),
    ],
    flattenCheck: b1a === undefined ? null : { grandchild: b1a.id, directParent: b1.id, expectedParentAfterFlatten: p2.id, expectedDepth: 1 },
    forkNoReparentCheck: d1 === undefined ? null : {
      subagent: d1.id, parent: p4.id, grandParent: p1.id,
      rule: '压平锚点 = 最近的**非 subagent** 祖先（P4；fork 也是合法锚点），不是再往上的 P1；实现若把 D1 重挂 P1，P1 徽标会变 3 且 fork 名下子代理泄漏进 P1 子树',
      expectedBadgeOfP1: 2, expectedBadgeOfP1IfWrong: 3, expectedBadgeOfP4: 1,
    },
    sidebarParity: {
      rule: '侧栏可见主会话 = 看板主会话档树根（同源于 ids、同按 blank 排除、同按 origin 排子代理；fork 两侧都是根行）',
      sidebarMainCount,
      mainTabRootCount: roots.length,
      expectedDelta: sidebarMainCount - roots.length,
      groupedInWorkspace: [p1.id, p2.id, p3.id, p4.id].length,
      ungrouped: roots.filter(r => r.cwd !== PROJ_A).map(r => r.role),
      note: `fork 终裁下 Δ 恒 **0**：侧栏 ${sidebarMainCount} 条可见主会话 = 看板 ${roots.length} 个树根。这是用户问题 1（他报的 4 vs 5）的收口判据。三类不显的行两侧口径一致：Z1/Z3（blank=true）两侧都不显、E2（header 无 cwd）两侧都不显、Z2（缓存缺失零轮次）两侧**同显**，都不贡献 Δ`,
    },
    cascadeTruncation: {
      rule: '血统/级联链在**非 subagent 行截断**（产品经理 fork 终裁第 2 条）：effectiveArchived 与删除级联的祖先遍历遇到 origin !== "subagent" 即止——fork 出生记录不是包含关系',
      archiveP1: {
        target: p1.id,
        expect: `P1 + A1 + A2 进已归档档；**P4 仍在主会话档、正常显示、不置灰、lineageArchived=false**；chips 主会话 ${roots.length}→${roots.length - 1}、已归档 0→1`,
      },
      deleteP1: {
        target: p1.id,
        cascadeSet: [p1.id, a1.id, a2.id],
        mustNotInclude: [p4.id, d1.id],
        confirmTextSubagentCount: 2,
        hostFact: '宿主 deleteOne **只删传入的单个 id**（src/host/index.ts:295-390，无原生血统级联）→ 级联集合完全由客户端算，确认文案的 N 只数子代理，永远不含 fork 与 fork 名下子代理',
        residueAfterDelete: {
          id: z3 === null ? null : z3.id,
          fact: 'Z3（P1 名下零轮次子代理、blank=true）不发射 → 不在客户端级联集合里 → 删除 P1 后它**留在磁盘上**，成为孤儿子代理（§13.3 不发射、侧栏按 origin 隐藏）= 永久不可见残留',
          statsCountAfterDelete: rows.length - 3,
          decision: '产品经理 2026-11-04 裁 **(a) 接受残留 + 文档化**：Z3 是零轮次空壳、无对话无 token 无标题，而删除语义按裁决一与批量确认文案一贯锚在「用户可见的管理单元」上；为不可见零数据壳扩删除范围，代价是确认文案 N 与实际范围失配（违反「文案明示范围」P0）+ collectDescendants 加一条不可见分支，收益是清掉一个用户永远遇不到、遇到也无感的空目录。桌面真实语料 41 条子代理 0 条 blank，(b) 分支触发概率为 0。**故 (a) 是设计内行为、不是缺陷**；判据 = 删 P1 后 /stats 21 → **18**（不是 17）。(b)「客户端把未发射的血统子代理一并纳入删除集（整棵树物理删干净）」**记录在案为产品选项、不进 0.2.0**；若将来实现它，本判据同步改为 17 且确认文案口径必须一起改',
        },
      },
      sourceAssertion: {
        target: 'src/client/DashboardPanel.tsx 的 effectiveArchived 与 collectDescendants',
        rule: '两个函数体（剥注释后）不得出现 `.parentId`——祖先遍历只允许沿 children map 走（children map 只装 subagent 行，fork 不在任何人的 children 里，故 fork 永不进级联）',
        precedent: '同 TC-18（titleOf 不得用 displayTitle）/ TC-20（src/client 运行时零 displayTitle 消费）的源码级断言手法',
      },
    },
  },
  forkScenario: {
    purpose: '验产品经理 fork 终裁（2026-11-04，延伸裁决二）：fork 在主会话档是独立树根、与普通主会话完全同权；级联链在非 subagent 行截断',
    corpus: { ancestor: p1.id, fork: p4.id, forkSubagent: d1.id },
    steps: [
      { step: 1, action: '打开看板主会话档', expect: `fork 行「验收 D · fork 会话」**作为树根出现**：depth=0 不缩进、有 checkbox 可勾选、徽标 N=1（D1）；树根总数 ${roots.length} = 侧栏可见主会话数 ${sidebarMainCount}（Δ=0）；chips 主会话 ${roots.length}（只数根行，子代理信息行不计入）` },
      { step: 2, action: `勾选 P1（${p1.id}）→ 归档`, expect: `P1 + A1 + A2 进已归档档；**P4 仍在主会话档、正常显示不置灰**（截断规则）；chips 主会话 ${roots.length - 1}、已归档 1` },
      { step: 3, action: '已归档档点 P1 的行级恢复 → 回主会话档', expect: `P1 + A1/A2 回来、chips 回到 ${roots.length}；P4 全程未动（它从没进过已归档档）` },
      { step: 4, action: '勾选 P4 → 归档 → 进已归档档', expect: 'P4 作为**独立根行**出现、有**自己的**行级恢复入口（不是挂在 P1 子树里的置灰行）；D1 随它置灰（血统归档、Tooltip 点名 P4）；恢复 P4 → 两者回主会话档' },
      { step: 5, action: '勾选 P1 → 删除（先看确认文案再执行）', expect: '文案点名 P1 + **2 个子代理**（A1/A2），不含 P4/D1；执行后 P4 仍是主会话档树根、D1 仍挂它；`/stats` 21 → 18（Z3 残留，见 cascadeTruncation.residueAfterDelete）' },
    ],
    trapForImpl: '契约测试三条（程序员已落 48/48）：① fork 进主会话档为根、可勾选；② D1 挂 P4 不重挂 P1；③ P1 归档后 P4.lineageArchived=false、descendantsOf(P1) 不含 P4/D1。另需补 产品设计 的**截断守卫**源码断言（cascadeTruncation.sourceAssertion）——防后人把 fork 塞回 P1 的 children map',
  },
  threeStepArchiveScenario: {
    purpose: '验 §13.4 的存量例外分支与整树归档/恢复语义',
    corpus: { parent: p3.id, explicitChild: c1.id, lineageChild: c2.id },
    steps: [
      { step: 1, action: `主会话档展开 P3（${p3.id}），对子行 C1 执行行级归档`, expect: 'C1 显式归档：主会话档子树内显示归档徽标 + 行级恢复**可点**' },
      { step: 2, action: `主会话档勾选 P3 → 归档`, expect: '整树进已归档档（P3 + C1 + C2）；chips 主会话 −1、已归档 +1' },
      { step: 3, action: '已归档档点 P3 行的行级恢复', expect: 'P3 + C2 回主会话档；**C1 仍留已归档档**（自有显式标记）；P3 子树内 C2 为血统归档 → 置灰 + Tooltip 点名 C1' },
    ],
  },
  recallHowTo: {
    purpose: '验 §13.6 / ui §16 全链路（横幅靠 workspace 快照 diff 触发，必须手动添加工作区）',
    steps: [
      { step: 1, action: `打开看板面板（建立快照基线），在侧栏添加工作区 ${RECALL_A}`, expect: '横幅出现：{name}=v4-recall-a、{n}=2（R1、R2）、{m}=1（R1s 亲缘计数）' },
      { step: 2, action: '点［查看］进召回模式', expect: '清单 2 行默认全选、R1s 不在清单里；五列（☑/标题/时间/cwd/状态）' },
      { step: 3, action: '反选 R2 后点［召回 1 条会话］', expect: 'busy「正在召回…」→ notice「已召回 1 条会话到 v4-recall-a」；侧栏 R1 归组、R2 仍未分组；看板项目列不变（cwd 未改）；R1s 未回填 membership 但仍挂 R1 下' },
      { step: 4, action: `再添加工作区 ${RECALL_B}`, expect: '横幅 {n}=1、{m}=0（多工作区命中逐条展示）。目录已删，若 GUI 的目录选择器选不到它，见 caveat 的替代顺序' },
      { step: 5, action: '点［查看］→［召回 1 条会话］', expect: '宿主 attach 校验失败 → notice「1 条召回失败」+ 明细点名 R3，文案用 attach 原生原因（`its cwd \'/root/v4-recall-b\' does not resolve, so it cannot be validated`）' },
      { step: 6, action: '重复第 3 步的同一批（或对已成功行再次召回）', expect: '幂等：不产生重复账目、结果仍全成功（也可用 curl 带 x-dsh-session-batch-manager:1 直打路由复验，不占 GUI 步骤）' },
    ],
    caveat: `RECALL_B 的目录已被本工具删除，GUI 的目录选择器可能选不到它。替代顺序：跑本工具前先设 FIXTURE_KEEP_RECALL_B=1 保留目录（或直接 mkdir ${RECALL_B}）→ 在 GUI 里添加该工作区 → 再 docker exec dsh-dev rm -rf ${RECALL_B} → 回面板执行召回看失败明细`,
    failureShapes: {
      authority: 'deepseek-harness packages/workspace/workspace/src/entity.ts:110-146（attachSession 的四道校验）；实测判定表见 tests/fixtures/probe-attach-branches.mjs',
      guiReachable: [
        '目录已删（R3 剧本）→ realpath 抛 ENOENT →「does not resolve, so it cannot be validated」',
        '目录被换成普通文件 → stat().isDirectory()=false →「is not a directory」（同属「添加后、执行前」竞态窗，需先注册再破形）',
        '悬空符号链接 / 链接环 → realpath 抛 ENOENT / ELOOP → 同「does not resolve」族',
      ],
      guiUnreachable: [
        '**chmod 555 的不可写目录 = 死夹具**：attachSession 全程不写 cwd（写的是 DSH_HOME 下的 workspace 表），且沙箱是 root（CapEff 含 CAP_DAC_OVERRIDE，实测往 555 目录 touch 成功）→ 这种行**召回会成功**。别用它造失败用例（系统架构师 2026-11-04 更正 + 我实测判定表 branch=0）',
        '**cwd 是符号链接的会话**：workspace 注册走 realpath，record.path 恒为 canonical；客户端只做裸串相等匹配（浏览器无 fs）→ 链接拼写的 cwd 与 canonical 路径永不相等 → 这类行**永远进不了召回清单**。桌面真实语料 112 条、8 个唯一 cwd，**0 条 symlink、0 条不可解析**，所以不是现实缺口；要验「realpath 相等则放行」只能用 curl 直打路由',
        '**cwd 是工作区子目录的会话**：同样过不了裸串匹配 → 不进清单（这正是 §13.6「子目录不算」的客户端侧体现；宿主侧 branch 4 只在直打路由时可达）',
      ],
      uniformVerdictFact: '同一工作区内所有候选行**共享同一个 cwd 字符串** → 宿主的 realpath/stat/相等三道判定对它们必然给出同一结论。所以「部分失败、其余成功」在一次 GUI 提交里**做不出来**（要么全成要么全败）',
      mixedFailureRecipe: '要观察 §16.3 的「单条失败不阻塞其余 + 逐条点名」，唯一可达配方是**逐行差异**：打开召回清单后、提交前，用 curl 打 /delete 删掉清单里的一条（attach 时 readSessionHeader 拿不到 header → 该行失败，其余成功）。这条建议放进单元测试（宿主路由 + 一条 stub 抛错）而不是 GUI 步骤',
    },
  },
  caveats: [
    '必须 ./dsh-dev.sh restart：宿主不热扫描会话目录，也不热读 workspace 账本',
    '标题投影：本轮已写全 projcache，标题应首屏即出（不再依赖懒生成）；若首屏仍是 id，先查该行的 projcache 是否存在',
    '夹具写的 projcache 只重写 5 处、其余 24 行是模板的零轮次值（依据见模块头）；某个面显示 0 轮次/空 outline 时先怀疑模板残留，不要怀疑实现',
    '直写 workspace.json 仅夹具行为；产品侧改成员必须走 attachSession',
    '**验收 Z2（缓存缺失组）要在打开它之前看**：Z2 靠「没有 projcache 记录」才成立，一旦在 GUI 里点开它，宿主可能补写记录 → 之后再看就变成 blank=true 的四档皆无。顺序：先在主会话档确认 Z2 在（标题=36 位 id、模型/token/上下文列为「—」），再去做别的步骤',
    '别用 chmod 555 造「不可写目录」失败用例（死夹具，理由见 recallHowTo.failureShapes.guiUnreachable）',
    `旧语料已备份在容器内 ${backup}（含旧 workspace.json）`,
  ],
}

const outFile = process.env.FIXTURE_MANIFEST ?? '/tmp/v4-corpus.json'
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({
  counts: manifest.counts,
  cwds: manifest.cwds,
  workspace: manifest.workspaceStore.registered,
  chips: manifest.expectedV03.chips,
  rowSetCount: manifest.expectedV03.rowSetCount,
  collapsedVisibleRows: manifest.expectedV03.collapsedVisibleRows,
  expandedVisibleRows: manifest.expectedV03.expandedVisibleRows,
  expandedBreakdown: manifest.expectedV03.expandedBreakdown,
  notEmitted: manifest.expectedV03.notEmitted,
  sidebarParityDelta: manifest.expectedV03.sidebarParity.expectedDelta,
  manifest: outFile,
  backup,
}, null, 2))
console.error(`written to ${SESSIONS_ROOT}; projcache ${PROJCACHE_DIR}; workspace store ${WORKSPACE_STORE}; manifest ${outFile}`)
