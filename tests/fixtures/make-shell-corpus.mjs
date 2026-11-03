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
 * ```
 *
 * 布局：dsh JSONL zstd 容器 = 帧1(header 行) + 帧2(事件体)，均带 checksum。
 * 空壳会话 = header + 三个非轮次事件（permission/preset、sandbox/mode、approval/policy），
 * **不含** turn/start、user/message、session/title——与真实空壳的投影一致
 * （`sessionStats.turns=0`、`titleInput.count=0`、`title=null`）。
 *
 * 全部文案自撰中性内容，零用户数据。
 *
 * ## 合成日志的格式硬要求（踩过两次，别再踩）
 *
 * 1. **容器必须是多帧**：帧 1 = 头行、帧 2 = 事件体，各自带 checksum
 *    （`ZSTD_c_checksumFlag=1`）。单帧整文件压缩会被 persistence 判为头帧校验失败而**静默跳过**。
 * 2. **`request/header` 的 `tools` 不能是空数组**（省略或至少 1 个工具），否则整读被判 `corrupt`；
 *    `assistant/message` 必须带 `stream` 字段（空数组即可，usage 走 `data.usage`）。
 *    出处：`docs/test-session-dashboard-v1.md`「测试数据与方法附注」。
 *    2026-11-03 复踩一次：本工具首版写了 `tools: []`，对照会话被宿主判 `error:"corrupt"`，
 *    修正后同一夹具 `model`/四桶/`contextWindow` 全部正常抽出。
 * 3. **标题投影是懒生成的**：`session/title` 事件写进日志不等于立刻可查，
 *    要等客户端列表 RPC（打开侧栏/看板）触发；projcache 文件在此之前可能不存在。
 *    所以「有标题对照会话」的首屏可能仍显示 id，等一次轮询刷新再看。
 *
 * 需要更真实的语料（多轮、子代理层级、归档/置顶态、截图用）时，用同目录的
 * `gen-screenshot-corpus.mjs`（2026-11-03 自旧快照迁入，v1 那轮 402 条语料即出自它）。
 *
 * @module tests/fixtures/make-shell-corpus
 */

import zlib from 'node:zlib'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

/** 容器内会话根目录（DSH_HOME=/root/.dsh，命名卷，与宿主机隔离）。 */
const SESSIONS_ROOT = process.env.FIXTURE_SESSIONS_ROOT ?? '/root/.dsh/sessions'
/** 夹具工作区目录名与 header.cwd：basename `root` 就是旧版会显示出来的「文件夹名」。 */
const PROJECT_DIR = process.env.FIXTURE_PROJECT_DIR ?? '--root--'
const WORKSPACE_CWD = process.env.FIXTURE_WORKSPACE_CWD ?? '/root'
/** 空壳会话条数（≥2 才能验同工作区标题碰撞）。 */
const SHELL_COUNT = Number(process.env.FIXTURE_SHELLS ?? 2)
/** 有标题对照会话条数（验「有标题不回落 id」；标题投影懒生成，见上方硬要求 3）。 */
const TITLED_COUNT = Number(process.env.FIXTURE_TITLED ?? 1)
/** 子代理会话条数（验 main 档默认过滤）。 */
const SUBAGENT_COUNT = Number(process.env.FIXTURE_SUBAGENTS ?? 1)

const CK = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }
const NOW = Date.now()
const HOUR = 3600_000

/** @returns 一个新的 uuid 字符串。 */
const uuid = () => crypto.randomUUID()

/**
 * 构造一个会话日志的 zstd 双帧容器。
 * @param header - session 头行对象。
 * @param events - 事件体数组（可为空）。
 * @returns zstd 容器字节。
 */
function buildLog(header, events) {
  const headerLine = JSON.stringify(header) + '\n'
  const body = events.length > 0 ? events.map(e => JSON.stringify(e)).join('\n') + '\n' : ''
  const frames = [zlib.zstdCompressSync(Buffer.from(headerLine, 'utf8'), CK)]
  if (body !== '') frames.push(zlib.zstdCompressSync(Buffer.from(body, 'utf8'), CK))
  return Buffer.concat(frames)
}

/**
 * 造零轮次事件体：只有会话建立期的三个非轮次事件。
 * @param seq0 - 起始序号。
 * @param time0 - 起始时间戳。
 * @returns 事件数组。
 */
function setupEvents(seq0, time0) {
  let seq = seq0
  let time = time0
  const out = []
  const push = (type, data) => { out.push({ type, seq: seq++, time, data }); time += 400 }
  push('permission/preset', { preset: 'workspace-write' })
  push('sandbox/mode', { mode: 'workspace-write' })
  push('approval/policy', { policy: 'ask' })
  return out
}

const projectRoot = path.join(SESSIONS_ROOT, PROJECT_DIR)
fs.mkdirSync(projectRoot, { recursive: true })

const manifest = { projectDir: PROJECT_DIR, workspaceCwd: WORKSPACE_CWD, shells: [], titled: [], subagents: [] }

// 1) 零轮次空壳会话：同一工作区，旧版会全部显示成 `root`
for (let i = 0; i < SHELL_COUNT; i++) {
  const id = `session-${uuid()}`
  const createdAt = NOW - (i + 1) * HOUR
  const header = {
    type: 'session', version: 4, id, createdAt, cwd: WORKSPACE_CWD,
    isSeeded: false, delegationDepth: 0, agentPreset: 'standard',
  }
  const dir = path.join(projectRoot, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), buildLog(header, setupEvents(0, createdAt + 1000)))
  manifest.shells.push({ id, expectedTitleInFixedBuild: id, folderNameInBuggyBuild: path.basename(WORKSPACE_CWD) })
}

// 2) 有标题对照会话：一轮完整问答 + session/title
for (let i = 0; i < TITLED_COUNT; i++) {
  const id = `session-${uuid()}`
  const createdAt = NOW - (10 + i) * HOUR
  const header = {
    type: 'session', version: 4, id, createdAt, cwd: WORKSPACE_CWD,
    isSeeded: false, delegationDepth: 0, agentPreset: 'standard',
  }
  const title = `验收对照会话 ${String(i + 1)}`
  let seq = 0
  let time = createdAt + 1000
  const ev = []
  const push = (type, data, extra) => { ev.push({ type, seq: seq++, time, data, ...extra }); time += 400 }
  for (const e of setupEvents(seq, time)) ev.push(e)
  seq = ev.length
  time = ev[ev.length - 1].time + 400
  push('turn/start', { turn: 1 })
  push('step/start', { turn: 1, step: 1 })
  const promptSeq = seq
  push('user/message', {
    content: [{ type: 'text', text: '这是一条用于验收的对照消息，请忽略。' }],
    source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' },
    role: 'user', id: uuid(),
  }, { surfaceOp: 'append' })
  push('request/header', {
    header: {
      config: { provider: 'deepseek-official', model: 'deepseek-chat' },
      // tools 不能是空数组，否则整读被判 corrupt（见 docs/test-session-dashboard-v1.md「测试数据与方法附注」）
      tools: [{ name: 'bash', description: '执行命令行并返回输出', parameters: { type: 'object', properties: {}, additionalProperties: true } }],
    },
    reason: 'initial',
  })
  push('request/context', { provider: 'deepseek-official', model: 'deepseek-chat', contextWindow: 131072 })
  push('session/title', { title, messageSeqs: [promptSeq], source: { kind: 'fallback' } })
  push('assistant/message', {
    turn: 1, step: 1,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '已收到，这条会话用于验证标题不回落成会话 id。' }],
      source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-chat' },
      id: uuid(),
    },
    usage: {
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 8000, cacheWriteTokens: 500, totalTokens: 10000,
    },
    stream: [],
  }, { surfaceOp: 'append' })
  push('step/end', { turn: 1, step: 1 })
  push('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const dir = path.join(projectRoot, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), buildLog(header, ev))
  manifest.titled.push({ id, expectedTitle: title })
}

// 3) 子代理会话：验默认 main 档把它过滤掉
const parentId = manifest.titled[0]?.id ?? manifest.shells[0]?.id
for (let i = 0; i < SUBAGENT_COUNT; i++) {
  const id = uuid()
  const createdAt = NOW - (20 + i) * HOUR
  const header = {
    type: 'session', version: 4, id, createdAt, cwd: WORKSPACE_CWD,
    parentSession: parentId, origin: 'subagent',
    isSeeded: false, delegationDepth: 1, agentPreset: 'standard',
  }
  const dir = path.join(projectRoot, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), buildLog(header, setupEvents(0, createdAt + 1000)))
  manifest.subagents.push({ id, parent: parentId })
}

const outFile = process.env.FIXTURE_MANIFEST ?? '/tmp/shell-corpus.json'
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
console.error(`written to ${projectRoot}; manifest at ${outFile}`)
