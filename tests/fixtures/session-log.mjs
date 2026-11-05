/**
 * 合成会话日志的公共构造件（供 `tests/fixtures/make-*.mjs` 复用）。
 *
 * 只在**沙箱容器内**使用：写入容器自己的 `DSH_HOME`（`/root/.dsh`，命名卷），
 * 与宿主机 `~/.dsh` 完全隔离。不要在宿主机直接跑。
 *
 * ## 布局与格式硬要求（踩过三次，别再踩）
 *
 * 1. **容器必须是多帧 zstd**：帧 1 = header 行、帧 2 = 事件体，各自带 checksum
 *    （`ZSTD_c_checksumFlag=1`）。单帧整文件压缩会被 persistence 判为头帧校验失败而
 *    **静默跳过**（会话直接不出现在列表里，没有任何报错）。
 * 2. **目录名必须精确等于 `projectKey(cwd)`**：宿主会校验「header 的 id + cwd 推出的路径」
 *    与实际路径是否一致，不符即判损坏（`session-persistence-jsonl/src/index.ts:1627`）。
 *    规则见 `format.ts:225`（`--<slug>--`，分隔符折叠为 `-`、去掉前导 `-`）；
 *    **`cwd` 缺省时目录是 `_no-cwd`**（`format.ts:255`）。本模块的 {@link projectDirName}
 *    是该规则的镜像，改宿主实现时要同步。
 * 3. **`request/header` 的 `tools` 不能是空数组**（省略或至少 1 个工具），否则整读被判
 *    `corrupt`；`assistant/message` 必须带 `stream` 字段（空数组即可，usage 走 `data.usage`）。
 *    出处：`docs/test-session-dashboard-v1.md`「测试数据与方法附注」。
 * 4. **标题投影是懒生成的**：`session/title` 写进日志不等于立刻可查，要等客户端列表 RPC
 *    （打开侧栏/看板）触发；projcache 在此之前可能不存在，首屏可能仍显示会话 id。
 * 5. **新写入的会话目录不会被热扫描**：宿主启动时建立索引，注入语料后必须重启容器
 *    （`./dsh-dev.sh restart`）才会出现在 `/stats` 里（2026-11-03 实测：轮询 60s 无变化）。
 *
 * 全部文案自撰中性内容，零用户数据。
 *
 * @module tests/fixtures/session-log
 */

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** zstd 压缩参数：必须带 checksum，否则头帧校验失败被静默跳过。 */
const CK = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }

/** 会话日志文件名（v4 世代）。 */
export const LOG_FILE_NAME = 'session.v4.jsonl.zstd'

/** @returns 一个新的 uuid 字符串。 */
export const uuid = () => crypto.randomUUID()

/**
 * 镜像宿主的 `projectKey(cwd)`（`session-persistence-jsonl/src/format.ts:225`）。
 * @param cwd - 会话工作目录；`undefined` 表示 header 不带 cwd。
 * @returns 该会话所属的项目目录名（`--<slug>--`，或 cwd 缺省时的 `_no-cwd`）。
 */
export function projectDirName(cwd) {
  if (cwd === undefined) return '_no-cwd'
  let readable = ''
  let separatorRun = false
  for (const ch of cwd) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/**
 * 构造 session header 行，省略未提供的可选字段（宿主对 `undefined` 与「缺字段」区分严格）。
 * @param options - header 字段。
 * @param options.id - 会话 id（主会话惯例带 `session-` 前缀，子代理是裸 uuid）。
 * @param options.createdAt - 创建时间戳（毫秒）。
 * @param options.delegationDepth - 委派深度（必填字段；主会话 0，子代理 1，孙代理 2）。
 * @param options.cwd - 工作目录；省略则 header 不带 cwd（目录落 `_no-cwd`）。
 * @param options.parentSession - 父会话 id；仅子代理需要。
 * @param options.origin - 会话来源；子代理为 `'subagent'`。
 * @param options.agentPreset - 预设名，默认 `standard`。
 * @returns 可直接 JSON 序列化的 header 对象。
 */
export function sessionHeader({ id, createdAt, delegationDepth, cwd, parentSession, origin, agentPreset = 'standard' }) {
  return {
    type: 'session',
    version: 4,
    id,
    createdAt,
    ...(cwd === undefined ? {} : { cwd }),
    ...(parentSession === undefined ? {} : { parentSession }),
    ...(origin === undefined ? {} : { origin }),
    isSeeded: false,
    delegationDepth,
    agentPreset,
  }
}

/**
 * 把 header 与事件压成多帧 zstd 容器。
 * @param header - session 头行对象。
 * @param events - 事件体数组（可为空，空则只有头帧）。
 * @returns zstd 容器字节。
 */
export function buildLog(header, events) {
  const headerLine = JSON.stringify(header) + '\n'
  const body = events.length > 0 ? events.map(e => JSON.stringify(e)).join('\n') + '\n' : ''
  const frames = [zlib.zstdCompressSync(Buffer.from(headerLine, 'utf8'), CK)]
  if (body !== '') frames.push(zlib.zstdCompressSync(Buffer.from(body, 'utf8'), CK))
  return Buffer.concat(frames)
}

/**
 * 会话建立期的三个非轮次事件——零轮次空壳会话的全部内容。
 * @param seq0 - 起始序号。
 * @param time0 - 起始时间戳。
 * @returns 事件数组（不含 turn/user/message，故投影为 `turns=0`、`title=null`）。
 */
export function setupEvents(seq0, time0) {
  let seq = seq0
  let time = time0
  const out = []
  const push = (type, data) => { out.push({ type, seq: seq++, time, data }); time += 400 }
  push('permission/preset', { preset: 'workspace-write' })
  push('sandbox/mode', { mode: 'workspace-write' })
  push('approval/policy', { policy: 'ask' })
  return out
}

/**
 * 一轮完整问答 + 标题事件——让会话拥有**持久化标题**（不回落 id）与可抽取的模型/用量。
 * @param options - 轮次参数。
 * @param options.startTime - 起始时间戳。
 * @param options.title - 写进 `session/title` 的标题。
 * @param options.userText - 用户消息正文（自撰中性内容）。
 * @param options.assistantText - 助手回复正文。
 * @param options.usage - 用量四桶 + total；省略则用默认值。
 * @param options.provider - 提供方，默认 `deepseek-official`。
 * @param options.model - 模型名，默认 `deepseek-chat`。
 * @param options.contextWindow - 上下文窗口，默认 131072。
 * @returns 事件数组（含 setup 三事件、完整轮次、`session/title`）。
 */
export function titledTurnEvents({
  startTime,
  title,
  userText,
  assistantText,
  usage = { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 8000, cacheWriteTokens: 500, totalTokens: 10000 },
  provider = 'deepseek-official',
  model = 'deepseek-chat',
  contextWindow = 131072,
}) {
  const ev = setupEvents(0, startTime)
  let seq = ev.length
  let time = ev[ev.length - 1].time + 400
  const push = (type, data, extra) => { ev.push({ type, seq: seq++, time, data, ...extra }); time += 400 }
  push('turn/start', { turn: 1 })
  push('step/start', { turn: 1, step: 1 })
  const promptSeq = seq
  push('user/message', {
    content: [{ type: 'text', text: userText }],
    source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' },
    role: 'user',
    id: uuid(),
  }, { surfaceOp: 'append' })
  push('request/header', {
    header: {
      config: { provider, model },
      // tools 不能是空数组，否则整读被判 corrupt（见模块头硬要求 3）
      tools: [{ name: 'bash', description: '执行命令行并返回输出', parameters: { type: 'object', properties: {}, additionalProperties: true } }],
    },
    reason: 'initial',
  })
  push('request/context', { provider, model, contextWindow })
  push('session/title', { title, messageSeqs: [promptSeq], source: { kind: 'fallback' } })
  push('assistant/message', {
    turn: 1,
    step: 1,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: assistantText }],
      source: { kind: 'model', provider, model },
      id: uuid(),
    },
    usage,
    stream: [],
  }, { surfaceOp: 'append' })
  push('step/end', { turn: 1, step: 1 })
  push('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return ev
}

/**
 * 写出一条会话（建目录 + 落日志文件）。
 * @param options - 写入参数。
 * @param options.sessionsRoot - 会话根目录（容器内 `DSH_HOME/sessions`）。
 * @param options.header - {@link sessionHeader} 的返回值。
 * @param options.events - 事件数组。
 * @returns 该会话的目录绝对路径。
 */
export function writeSession({ sessionsRoot, header, events }) {
  const dir = path.join(sessionsRoot, projectDirName(header.cwd), header.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, LOG_FILE_NAME), buildLog(header, events))
  return dir
}
