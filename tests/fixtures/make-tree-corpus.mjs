/**
 * 树形验收语料生成器——在隔离沙箱里造「一父带多子 + 嵌套 + 孤儿子代理」。
 *
 * 用途：验收 v0.2 树形结构与项目列（design §11、ui §15）时，真实语料的层级形状不可控，
 * 需要按验收点精确造出下列五种行：
 *
 * | 角色 | 形状 | 验的是什么 |
 * |---|---|---|
 * | 父会话 P | 主会话、有标题、cwd `PARENT_CWD` | 树根、展开按钮、项目列 = 自身 cwd basename |
 * | 子代理 C1 | P 的子、有标题、cwd 同 P | 缩进 + 连接线、子代理徽标、数据列照常 |
 * | 子代理 C2 | P 的子、有标题、**cwd 与 P 不同** | §11.7 项目列取**树级**值：C2 显示 P 的项目，不是自己的 |
 * | 孙代理 G1 | C1 的子（depth 2） | 递归缩进；**徽标 = 直接子数**：P 显示 2 而不是 3 |
 * | 孤儿 O | 子代理、父 id 不存在、**header 无 cwd** | §11.4 降根不丢弃 + §15.4 项目列「—」（不冒充他项目） |
 *
 * fork 会话与环 GUI 造不出来（需要宿主写侧配合），由 `tests/dashboard-tree.test.mjs` 单测覆盖
 * （design §11.10）；「运行中」态同样无法合成——它来自宿主 live 会话状态而非日志，
 * 级联原子性验收要在 GUI 里真发一轮消息（见 manifest 的 `cascadeAtomicityHowTo`）。
 *
 * 只在沙箱容器内运行：
 *
 * ```sh
 * docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-tree-corpus.mjs
 * ./dsh-dev.sh restart   # 必须重启，宿主不热扫描会话目录（见 session-log.mjs 硬要求 5）
 * ```
 *
 * 可调环境变量：`FIXTURE_SESSIONS_ROOT`（默认 `/root/.dsh/sessions`）、`FIXTURE_PARENT_CWD`
 * （默认 `/root/tree-proj`）、`FIXTURE_CHILD_CWD`（默认 `/root/other-proj`）、
 * `FIXTURE_NESTED`（默认 1，孙代理条数）、`FIXTURE_ORPHAN`（默认 1）、
 * `FIXTURE_MANIFEST`（默认 `/tmp/tree-corpus.json`）。
 *
 * 日志布局与格式硬要求见同目录 `session-log.mjs` 的模块头（多帧 zstd、目录名 = projectKey(cwd)、
 * `tools` 不可为空数组、标题投影懒生成、注入后需重启）。
 *
 * @module tests/fixtures/make-tree-corpus
 */

import fs from 'node:fs'
import { sessionHeader, titledTurnEvents, writeSession, uuid } from './session-log.mjs'

const SESSIONS_ROOT = process.env.FIXTURE_SESSIONS_ROOT ?? '/root/.dsh/sessions'
const PARENT_CWD = process.env.FIXTURE_PARENT_CWD ?? '/root/tree-proj'
const CHILD_CWD = process.env.FIXTURE_CHILD_CWD ?? '/root/other-proj'
const NESTED_COUNT = Number(process.env.FIXTURE_NESTED ?? 1)
const ORPHAN_COUNT = Number(process.env.FIXTURE_ORPHAN ?? 1)

const NOW = Date.now()
const HOUR = 3600_000

/**
 * 写出一条**有标题**会话（一轮完整问答），并返回其 id 与预期标题。
 * @param spec - 会话规格。
 * @param spec.id - 会话 id。
 * @param spec.title - 预期持久化标题。
 * @param spec.cwd - 工作目录；`undefined` 表示 header 不带 cwd。
 * @param spec.delegationDepth - 委派深度。
 * @param spec.parentSession - 父会话 id。
 * @param spec.origin - 来源标记（子代理为 `'subagent'`）。
 * @param spec.ageHours - 相对当前时间的小时数（决定行序：stats 新→旧）。
 * @param spec.usage - 用量四桶，让各行数据列可区分（成本归因验收）。
 * @param spec.userText - 用户消息正文。
 * @returns `{ id, title, cwd, parentSession, origin, delegationDepth }`。
 */
function writeTitled(spec) {
  const createdAt = NOW - spec.ageHours * HOUR
  const header = sessionHeader({
    id: spec.id,
    createdAt,
    delegationDepth: spec.delegationDepth,
    cwd: spec.cwd,
    parentSession: spec.parentSession,
    origin: spec.origin,
  })
  const events = titledTurnEvents({
    startTime: createdAt + 1000,
    title: spec.title,
    userText: spec.userText,
    assistantText: '已收到，这条会话是树形验收语料，用于验证层级与项目列显示。',
    usage: spec.usage,
  })
  writeSession({ sessionsRoot: SESSIONS_ROOT, header, events })
  return {
    id: spec.id,
    title: spec.title,
    cwd: spec.cwd ?? null,
    parentSession: spec.parentSession ?? null,
    origin: spec.origin ?? null,
    delegationDepth: spec.delegationDepth,
  }
}

const usage = (input, output, cacheRead, cacheWrite) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
  totalTokens: input + output + cacheRead + cacheWrite,
})

// 1) 父会话：主会话、有标题、depth 0
const parentId = `session-${uuid()}`
const parent = writeTitled({
  id: parentId,
  title: '树形验收 · 父会话',
  cwd: PARENT_CWD,
  delegationDepth: 0,
  ageHours: 1,
  usage: usage(2000, 600, 12000, 900),
  userText: '这是树形验收的父会话，请忽略内容。',
})

// 2) 子代理 C1：cwd 与父相同
const c1Id = uuid()
const child1 = writeTitled({
  id: c1Id,
  title: '子代理 A · 检索资料',
  cwd: PARENT_CWD,
  delegationDepth: 1,
  parentSession: parentId,
  origin: 'subagent',
  ageHours: 2,
  usage: usage(900, 240, 4000, 300),
  userText: '这是子代理 A 的委派任务，请忽略内容。',
})

// 3) 子代理 C2：**cwd 与父不同**——验项目列取树级值（应显示父项目，不是自己的 cwd）
const child2 = writeTitled({
  id: uuid(),
  title: '子代理 B · 落地实现',
  cwd: CHILD_CWD,
  delegationDepth: 1,
  parentSession: parentId,
  origin: 'subagent',
  ageHours: 3,
  usage: usage(1500, 480, 7000, 600),
  userText: '这是子代理 B 的委派任务，请忽略内容。',
})

// 4) 孙代理：C1 的子（depth 2）——验递归缩进与「徽标 = 直接子数」
const nested = []
for (let i = 0; i < NESTED_COUNT; i++) {
  nested.push(writeTitled({
    id: uuid(),
    title: `孙代理 · 结果校验 ${i + 1}`.trim(),
    cwd: PARENT_CWD,
    delegationDepth: 2,
    parentSession: c1Id,
    origin: 'subagent',
    ageHours: 4 + i,
    usage: usage(400, 120, 1500, 150),
    userText: '这是孙代理的委派任务，请忽略内容。',
  }))
}

// 5) 孤儿子代理：父 id 不存在 + **header 无 cwd**（落 `_no-cwd` 目录）
const orphans = []
for (let i = 0; i < ORPHAN_COUNT; i++) {
  orphans.push(writeTitled({
    id: uuid(),
    title: `孤儿子代理 · 父已删除 ${i + 1}`.trim(),
    cwd: undefined,
    delegationDepth: 1,
    parentSession: `session-${uuid()}`,
    origin: 'subagent',
    ageHours: 5 + i,
    usage: usage(300, 90, 1000, 100),
    userText: '这是孤儿子代理语料，请忽略内容。',
  }))
}

const subagents = [child1, child2, ...nested, ...orphans]
const manifest = {
  generatedAt: new Date(NOW).toISOString(),
  sessionsRoot: SESSIONS_ROOT,
  parentCwd: PARENT_CWD,
  childCwd: CHILD_CWD,
  parent,
  children: [child1, child2],
  nested,
  orphans,
  expectedTree: {
    [parentId]: {
      depth: 0,
      badge: subagents.filter(s => s.parentSession === parentId).length,
      projectLabel: PARENT_CWD.split('/').pop(),
      projectKey: PARENT_CWD,
      children: [
        { id: child1.id, depth: 1, badge: nested.length, projectLabel: PARENT_CWD.split('/').pop() },
        { id: child2.id, depth: 1, badge: 0, projectLabel: PARENT_CWD.split('/').pop(), note: '自身 cwd 不同，项目列仍取树级值' },
      ],
    },
  },
  expectedProjectColumn: {
    [parentId]: PARENT_CWD.split('/').pop(),
    [child1.id]: PARENT_CWD.split('/').pop(),
    [child2.id]: `${PARENT_CWD.split('/').pop()}（不是 ${CHILD_CWD.split('/').pop()}）`,
    ...Object.fromEntries(nested.map(s => [s.id, PARENT_CWD.split('/').pop()])),
    ...Object.fromEntries(orphans.map(s => [s.id, '—（header 无 cwd，不得冒充其他项目）'])),
  },
  expectedFilterDelta: {
    all: 1 + subagents.length,
    main: 1,
    subagent: subagents.length,
    archived: 0,
    note: '增量，不含语料里既有的其他会话；「全部」档含被折叠的子行',
  },
  threeStepArchiveScenario: {
    purpose: '验 design §11.6 的恢复边界与 ui §15.6 的两类置灰',
    corpus: { parent: parentId, explicitChild: child1.id, lineageOnlyChild: child2.id },
    steps: [
      { step: 1, action: `在「子代理」档勾选 ${child1.id}（${child1.title}）→ 归档`, expect: 'C1 显式归档，进「已归档」档；父与 C2 不受影响（勾选不级联）' },
      { step: 2, action: `在「全部」档勾选父 ${parentId} → 归档`, expect: '整树零写入归档：父 + C1 + C2 + 孙代理全部进「已归档」档（C2/孙代理是血统归档，无显式标记）' },
      { step: 3, action: '在「已归档」档点父行的行级「恢复」', expect: '父 + C2 + 孙代理回原档；**C1 仍留在已归档档**（它有自己的显式标记）' },
    ],
    greyOutExpectations: [
      '第 2 步之后、第 3 步之前：C1 的行级恢复按钮**置灰** + Tooltip「随父会话恢复」（显式归档但有已归档祖先，ui §15.6 第 ② 类）',
      '同上时刻：C2 与孙代理的恢复按钮也**置灰**（血统归档，ui §15.6 第 ① 类）',
      '第 3 步之后：C1 的恢复按钮**恢复可点**（已无已归档祖先），点它才真正取消 C1 的归档',
    ],
  },
  cascadeAtomicityHowTo: {
    why: '「运行中」来自宿主 live 会话状态，日志里合成不出来',
    how: '在沙箱 GUI 侧栏打开子代理 B（或父会话）发一条需要跑一会儿的消息，趁其运行中回看板：折叠态父行的子数徽标应带运行点；勾选父 → 归档/删除应被**整单拒绝**并在 notice 里点名该运行中会话（design §11.6 级联原子性）',
  },
  caveats: [
    '必须 ./dsh-dev.sh restart 后新语料才会出现在 /stats（宿主不热扫描会话目录）',
    '标题投影懒生成：首屏可能显示会话 id，等一次轮询（默认 5s）或打开侧栏触发列表 RPC 后再核对',
    '孤儿子代理写在 sessions/_no-cwd/ 下，header 不带 cwd——这是 §15.4「—」占位的唯一合法造法',
  ],
}

const outFile = process.env.FIXTURE_MANIFEST ?? '/tmp/tree-corpus.json'
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
console.error(`written to ${SESSIONS_ROOT}; manifest at ${outFile}`)
