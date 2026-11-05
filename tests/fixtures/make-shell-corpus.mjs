/**
 * 验收夹具生成器——在隔离沙箱里造「零轮次空壳会话」与「有标题对照会话」。
 *
 * 用途：验收看板标题回落修复（design §5.3）与 blank 草稿排除（§5.2）时，
 * 需要**同一工作区里两条无标题会话**才能验到「标题互异、不再显示成文件夹名」。
 * 真实语料里每个工作区只有一条空壳，验不到碰撞，故用本工具造。
 *
 * 只在沙箱容器内运行（写入容器自己的 `DSH_HOME`，与宿主机 `~/.dsh` 无关）：
 *
 * ```sh
 * docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-shell-corpus.mjs
 * ./dsh-dev.sh restart   # 必须重启，宿主不热扫描会话目录
 * ```
 *
 * 布局：dsh JSONL zstd 容器 = 帧1(header 行) + 帧2(事件体)，均带 checksum。
 * 空壳会话 = header + 三个非轮次事件（permission/preset、sandbox/mode、approval/policy），
 * **不含** turn/start、user/message、session/title——与真实空壳的投影一致
 * （`sessionStats.turns=0`、`titleInput.count=0`、`title=null`）。
 *
 * 全部文案自撰中性内容，零用户数据。
 *
 * **格式硬要求（多帧容器、目录名 = `projectKey(cwd)`、`tools` 不可为空数组、标题投影懒生成、
 * 注入后需重启）统一记在同目录 `session-log.mjs` 的模块头**，本工具通过它落盘。
 * 2026-11-04 起项目目录名由 `cwd` 推导（不再接受手写目录名）——宿主会校验 header 的
 * id + cwd 与实际路径一致，手写目录名一旦不符整条会话被判损坏。
 *
 * 需要更真实的语料（多轮、子代理层级、归档/置顶态、截图用）时，用同目录的
 * `gen-screenshot-corpus.mjs`（2026-11-03 自旧快照迁入，v1 那轮 402 条语料即出自它）；
 * 树形/项目列验收语料用 `make-tree-corpus.mjs`。
 *
 * @module tests/fixtures/make-shell-corpus
 */

import fs from 'node:fs'
import crypto from 'node:crypto'
import { sessionHeader, setupEvents, titledTurnEvents, writeSession, projectDirName } from './session-log.mjs'

/** 容器内会话根目录（DSH_HOME=/root/.dsh，命名卷，与宿主机隔离）。 */
const SESSIONS_ROOT = process.env.FIXTURE_SESSIONS_ROOT ?? '/root/.dsh/sessions'
const WORKSPACE_CWD = process.env.FIXTURE_WORKSPACE_CWD ?? '/root'
/** 空壳会话条数（≥2 才能验同工作区标题碰撞）。 */
const SHELL_COUNT = Number(process.env.FIXTURE_SHELLS ?? 2)
/** 有标题对照会话条数（验「有标题不回落 id」；标题投影懒生成，见 session-log.mjs 硬要求 4）。 */
const TITLED_COUNT = Number(process.env.FIXTURE_TITLED ?? 1)
/** 子代理会话条数（验 main 档默认过滤）。 */
const SUBAGENT_COUNT = Number(process.env.FIXTURE_SUBAGENTS ?? 1)

const NOW = Date.now()
const HOUR = 3600_000

/** @returns 一个新的 uuid 字符串。 */
const uuid = () => crypto.randomUUID()

const PROJECT_DIR = projectDirName(WORKSPACE_CWD)

const manifest = { projectDir: PROJECT_DIR, workspaceCwd: WORKSPACE_CWD, shells: [], titled: [], subagents: [] }

// 1) 零轮次空壳会话：同一工作区，旧版会全部显示成 `root`
for (let i = 0; i < SHELL_COUNT; i++) {
  const id = `session-${uuid()}`
  const createdAt = NOW - (i + 1) * HOUR
  writeSession({
    sessionsRoot: SESSIONS_ROOT,
    header: sessionHeader({ id, createdAt, cwd: WORKSPACE_CWD, delegationDepth: 0 }),
    events: setupEvents(0, createdAt + 1000),
  })
  manifest.shells.push({ id, expectedTitleInFixedBuild: id, folderNameInBuggyBuild: WORKSPACE_CWD.split('/').pop() })
}

// 2) 有标题对照会话：一轮完整问答 + session/title
for (let i = 0; i < TITLED_COUNT; i++) {
  const id = `session-${uuid()}`
  const createdAt = NOW - (10 + i) * HOUR
  const title = `验收对照会话 ${String(i + 1)}`
  writeSession({
    sessionsRoot: SESSIONS_ROOT,
    header: sessionHeader({ id, createdAt, cwd: WORKSPACE_CWD, delegationDepth: 0 }),
    events: titledTurnEvents({
      startTime: createdAt + 1000,
      title,
      userText: '这是一条用于验收的对照消息，请忽略。',
      assistantText: '已收到，这条会话用于验证标题不回落成会话 id。',
    }),
  })
  manifest.titled.push({ id, expectedTitle: title })
}

// 3) 子代理会话：验默认 main 档把它过滤掉
const parentId = manifest.titled[0]?.id ?? manifest.shells[0]?.id
for (let i = 0; i < SUBAGENT_COUNT; i++) {
  const id = uuid()
  const createdAt = NOW - (20 + i) * HOUR
  writeSession({
    sessionsRoot: SESSIONS_ROOT,
    header: sessionHeader({
      id,
      createdAt,
      cwd: WORKSPACE_CWD,
      delegationDepth: 1,
      parentSession: parentId,
      origin: 'subagent',
    }),
    events: setupEvents(0, createdAt + 1000),
  })
  manifest.subagents.push({ id, parent: parentId })
}

const outFile = process.env.FIXTURE_MANIFEST ?? '/tmp/shell-corpus.json'
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
console.error(`written to ${SESSIONS_ROOT}/${PROJECT_DIR}; manifest at ${outFile}`)
