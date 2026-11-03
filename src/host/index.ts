/**
 * `dsh-session-batch-manager` 宿主半（包的 main 入口）：会话批量删除的 HTTP 路由 + stats 路由。
 *
 * 本包在 cordis.patch.yml 里只有一条 Loader 行（裸包名）：client-modules 要求
 * 声明了 `dsh.client` 的包只能有一条活动行，同一行既装配宿主 main（本文件），
 * 又让 web 启动图解析 `exports["./client"]` 装配浏览器半。
 *
 * dsh 没有「删除会话」的远端 API（GUI 原生只有归档），而浏览器半无法直接触达文件系统，
 * 所以删除由本模块在 `webServer` 上开一条同源路由完成，浏览器半用带自定义头的 POST 调用。
 *
 * 单个会话的删除语义（按顺序，任一步失败即报告该会话的分类失败，不影响其余会话）：
 *
 * 1. **拒绝有运行中工作的会话**（`workspace/session-activity` 瀑布非空）。归档
 *    （GUI 原生能力，可停止任务）是停止它们的正确入口。
 *    内存中挂载但空闲的 live 会话**放行**（与原生归档同语义）：GUI 打开过的会话，
 *    其 Agent 随宿主进程常驻（无公开的卸载 API），拒绝 live 等于重启前都删不掉。
 *    若用户随后在仍打开的标签页里继续对话，写入方可能重建目录——这与原生归档的
 *    风险同级，如实记录在 README。
 * 2. **删除持久化产物**：`sessionPersistence.stat(id)` 定位 JSONL 世代文件，删除其所在
 *    的会话目录。JSONL 后端可**延迟物理落盘**——本进程挂载的 pending 会话有快照但
 *    `location` 缺失，此时先 `persistence.flush()`（服务级持久化屏障）强制物化再定位。
 *    目录名必须等于 `encodeSegment(id)`，且（后端报告 root 时）必须真包含于 root——
 *    双重校验后才 `rm -r`。
 * 3. **注册表记账**（尽力而为）：挂载中的 live 会话（GUI 打开过；本版本无在线卸载
 *    API）走**墓碑**路径——加入归档集让活动视图隐藏该行（文件已删，旧标签页续聊会被
 *    原生「已归档」门拦截）。墓碑**不做 GC**：宿主重启后仍开着的浏览器标签页会自动
 *    resume 会话，墓碑若已被清掉，重建的会话会直接回到活动视图；留着则被门拦住且
 *    不可见（无文件无 live 行时归档集里的 id 不产生任何行）。
 *    非 live 会话移出归档集/置顶集，并从每个记录它的工作区摘除。
 * 4. **广播 `api-session/removed` 并幂等收尾**：已连接的 GUI 立即掉行。**没有任何持久化
 *    产物**（此前已删 / 客户端残影行 / 重启前未落盘即丢失）同样广播掉行并按成功报告——
 *    「会话不存在」这一目标状态已经达成；session-query 索引在下次读取时对账自愈。
 *
 * 配置经 `webserver/index-inject` 的 `global` 行发布到页面
 * （`window.__DSH_SESSION_BATCH_MANAGER__`），浏览器半由此发现生效的 routeBase——
 * 浏览器侧的 Loader 行不携带 config，这是宿主配置到达浏览器半的唯一通道。
 *
 * @module host/index
 */

import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { encodeSegment } from './segment.ts'
import { BATCH_HEADER, isTrustedBatchRequest } from './trust.ts'
import { SessionStatsAggregator } from './stats.ts'
import type {
  DeleteResult, HostContextLike, HttpRequestLike, HttpResponseLike,
  SessionPersistenceLike, SessionStoreLike, WebServerLike, WorkspaceRegistryLike,
} from './types.ts'

/** 插件名。 */
export const name = 'session-batch-manager'

/** 导出聚合器类供测试使用。 */
export { SessionStatsAggregator } from './stats.ts'

/** 本插件的版本号（构建时经 esbuild define 内联）。 */
declare const __PLUGIN_VERSION__: string

/** 路由行配置。 */
export interface Config {
  /** 宿主路由前缀（绝对路径，无尾斜杠）。 */
  routeBase?: string
  /** 单次删除请求允许的会话数上限。 */
  maxBatchSize?: number
  /** Host 栅栏额外信任的权威（`host` 或 `host:port`）。 */
  trustedHosts?: string[]
  /** 面板打开时轮询间隔（ms），经 index-inject 下发浏览器半。 */
  statsPollIntervalMs?: number
  /** 冷会话观察并发上限。 */
  statsSweepConcurrency?: number
}

/** 校验并 defaulted 之后的配置。 */
interface ResolvedConfig {
  readonly routeBase: string
  readonly maxBatchSize: number
  readonly trustedHosts: readonly string[]
  readonly statsPollIntervalMs: number
  readonly statsSweepConcurrency: number
}

export const Config = z.object({
  routeBase: z.string().default('/dsh-session-batch-manager/v1'),
  maxBatchSize: z.number().step(1).min(1).max(1000).default(200),
  trustedHosts: z.array(z.string()).default([]),
  statsPollIntervalMs: z.number().step(1).min(1000).max(60000).default(5000),
  statsSweepConcurrency: z.number().step(1).min(1).max(16).default(4),
})

/** 发布到页面全局的键名；浏览器半从这里读取生效配置。 */
export const WINDOW_CONFIG_KEY = '__DSH_SESSION_BATCH_MANAGER__'

/** 请求体字节上限（一份 id 列表远小于它；超限按 400 处理）。 */
const MAX_BODY_BYTES = 1_000_000

/** 单个会话 id 的长度上限（防御异常输入）。 */
const MAX_ID_LENGTH = 256

/**
 * 校验并规范化 routeBase：绝对路径、无尾斜杠、不含回退段。
 * @param raw - 配置的原始值。
 * @returns 规范化前缀。
 * @throws 非法值在加载时失败（misconfiguration fails loud）。
 */
function normalizeRouteBase(raw: string): string {
  if (!raw.startsWith('/') || raw.endsWith('/') || raw.split('/').some(segment => segment === '..')) {
    throw new Error(`session-batch-manager: routeBase ${JSON.stringify(raw)} must be an absolute path without a trailing slash or ".." segment`)
  }
  return raw
}

/**
 * 插件入口：注册 index 注入与两条路由。
 *
 * `webServer` 是可选等待（`ctx.inject`）：没有 web 组合的 profile 里本行保持静默，
 * 浏览器半的删除按钮会得到明确的「宿主路由不可用」失败，归档/恢复不受影响
 * （它们走 dsh 原生的 workspace API）。
 * @param ctx - Cordis 宿主上下文。
 * @param config - 校验后的行配置。
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  const host = ctx as unknown as HostContextLike
  const routeBase = normalizeRouteBase(config.routeBase)

  // 页面全局：把生效配置交给浏览器半（浏览器侧 Loader 行没有 config 通道）。
  ctx.effect(() => host.on('webserver/index-inject', (table: unknown[]) => {
    table.push({ kind: 'global', name: WINDOW_CONFIG_KEY, value: { routeBase, version: __PLUGIN_VERSION__, statsPollIntervalMs: config.statsPollIntervalMs } })
  }), 'session-batch-manager: index-inject')

  ctx.inject(['webServer'], (childCtx: Context) => {
    const webServer = childCtx.get('webServer') as WebServerLike | undefined
    if (webServer === undefined) return
    const fence = { bindHost: webServer.host, trustedHosts: config.trustedHosts }
    const aggregator = new SessionStatsAggregator(host, config.statsSweepConcurrency)
    const disposeStatus = webServer.register({
      kind: 'exact',
      path: `${routeBase}/status`,
      handler: (req, res) => { handleStatus(req, res) },
    })
    const disposeDelete = webServer.register({
      kind: 'exact',
      path: `${routeBase}/delete`,
      handler: (req, res) => { handleDelete(host, req, res, fence, config.maxBatchSize) },
    })
    const disposeStats = webServer.register({
      kind: 'exact',
      path: `${routeBase}/stats`,
      handler: (req, res) => { handleStats(req, res, aggregator) },
    })
    childCtx.effect(() => () => {
      disposeStats()
      disposeDelete()
      disposeStatus()
    }, 'session-batch-manager: web routes')
  })
}

/** 信任栅栏的输入。 */
interface Fence {
  readonly bindHost?: string
  readonly trustedHosts: readonly string[]
}

/**
 * 发送一个 JSON 响应。
 * @param res - node:http 响应。
 * @param status - HTTP 状态码。
 * @param value - JSON 可序列化载荷。
 */
function sendJson(res: HttpResponseLike, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/**
 * `GET <base>/status`：安装验证与探活。故意不做栅栏（只读、无敏感信息），
 * 便于 `curl` 直接验证插件宿主半已加载。
 * @param req - 请求。
 * @param res - 响应。
 */
function handleStatus(req: HttpRequestLike, res: HttpResponseLike): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method-not-allowed' })
    return
  }
  sendJson(res, 200, { ok: true, service: 'dsh-session-batch-manager', version: __PLUGIN_VERSION__ })
}

/**
 * 读取并解析 JSON 请求体。
 * @param req - 请求。
 * @returns 解析结果；超限或非 JSON 时抛错。
 */
function readJsonBody(req: HttpRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 校验一个待删除的会话 id：非空、限长、不含路径分隔符与控制字符。
 * @param value - 请求体里的原始条目。
 * @returns 合法的 id，或 undefined。
 */
function validSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > MAX_ID_LENGTH) return undefined
  if (/[\u0000-\u001f/\\]/.test(value)) return undefined
  return value
}

/**
 * `POST <base>/delete`：批量删除会话。
 * @param ctx - 宿主上下文（结构化视图）。
 * @param req - 请求。
 * @param res - 响应。
 * @param fence - 信任栅栏输入。
 * @param maxBatchSize - 单请求会话数上限。
 */
async function handleDelete(
  ctx: HostContextLike, req: HttpRequestLike, res: HttpResponseLike, fence: Fence, maxBatchSize: number,
): Promise<void> {
  try {
    // CORS preflight 一律拒绝且不发 CORS 头：浏览器跨源携带自定义头的请求到不了处理器。
    if (req.method === 'OPTIONS') {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    if (!isTrustedBatchRequest(req.headers, fence)) {
      sendJson(res, 403, { error: 'untrusted-origin' })
      return
    }
    let body: { sessionIds?: unknown } | null
    try {
      body = await readJsonBody(req) as { sessionIds?: unknown } | null
    } catch {
      // 请求体超限或不是合法 JSON：调用方错误，按 400 报告。
      sendJson(res, 400, { error: 'bad-request', message: 'request body must be JSON within the size limit' })
      return
    }
    const rawIds = body?.sessionIds
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > maxBatchSize) {
      sendJson(res, 400, { error: 'bad-request', message: `sessionIds must be a non-empty array of at most ${String(maxBatchSize)} entries` })
      return
    }
    const ids = [...new Set(rawIds)]
    const results: DeleteResult[] = []
    for (const raw of ids) {
      const id = validSessionId(raw)
      if (id === undefined) {
        results.push({ sessionId: typeof raw === 'string' ? raw.slice(0, MAX_ID_LENGTH) : String(raw), ok: false, code: 'invalid-id', message: '会话 id 非法' })
        continue
      }
      results.push(await deleteOne(ctx, id))
    }
    sendJson(res, 200, { results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.logger?.error(`session-batch-manager: delete request failed: ${message}`)
    sendJson(res, 500, { error: 'internal', message })
  }
}

/**
 * 删除一个会话（语义见模块文档）。
 * @param ctx - 宿主上下文。
 * @param sessionId - 通过校验的会话 id。
 * @returns 单会话结果。
 */
async function deleteOne(ctx: HostContextLike, sessionId: string): Promise<DeleteResult> {
  const sessions = ctx.get('sessions') as SessionStoreLike | undefined
  const persistence = ctx.get('sessionPersistence') as SessionPersistenceLike | undefined
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  if (persistence === undefined) {
    return { sessionId, ok: false, code: 'no-persistence', message: '会话持久化服务不可用' }
  }

  // 1) 运行中的工作：归档（可停止任务）是停止它们的原生入口。
  //    空闲的 live 会话放行（与原生归档同语义）——GUI 打开过的会话其 Agent 随宿主
  //    进程常驻且无公开卸载 API，拒绝 live 会让它们重启前都删不掉。
  try {
    const activity = await ctx.waterfall(
      'workspace/session-activity', { sessionId }, () => Promise.resolve([]),
    )
    if (activity.length > 0) {
      return { sessionId, ok: false, code: 'active', message: '会话有正在运行的任务；请先归档（可停止任务）再删除' }
    }
  } catch (error: unknown) {
    return { sessionId, ok: false, code: 'internal', message: `活动检查失败：${error instanceof Error ? error.message : String(error)}` }
  }

  // 2) 删除持久化产物（双重路径校验后才 rm -r）。
  //    JSONL 后端可延迟物理落盘：本进程挂载的 pending 会话 stat 有快照但 location
  //    缺失——先服务级 flush()（持久化屏障）强制物化，再重新定位。
  let removedFiles = false
  try {
    let snapshot = await persistence.stat(sessionId)
    if (snapshot !== undefined && snapshot.location === undefined) {
      try {
        await persistence.flush()
      } catch (error: unknown) {
        // AggregateError 会点名 flush 失败的会话，其余句柄仍已落盘——继续尝试定位。
        ctx.logger?.warn(`session-batch-manager: flush before deleting "${sessionId}" reported: ${error instanceof Error ? error.message : String(error)}`)
      }
      snapshot = await persistence.stat(sessionId)
    }
    const location = snapshot?.location
    if (location !== undefined) {
      if (location.kind !== 'jsonl') {
        return { sessionId, ok: false, code: 'unsupported-backend', message: `不支持的持久化后端：${location.kind}` }
      }
      const dir = path.dirname(location.path)
      if (path.basename(dir) !== encodeSegment(sessionId)) {
        return { sessionId, ok: false, code: 'unsafe-path', message: '会话目录名与其 id 不符，拒绝删除' }
      }
      const root = typeof persistence.config?.root === 'string' ? path.resolve(persistence.config.root) : undefined
      if (root !== undefined) {
        const rel = path.relative(root, dir)
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
          return { sessionId, ok: false, code: 'unsafe-path', message: '会话目录不在持久化根内，拒绝删除' }
        }
      }
      await rm(dir, { recursive: true, force: true })
      removedFiles = true
    }
  } catch (error: unknown) {
    return { sessionId, ok: false, code: 'internal', message: `删除日志失败：${error instanceof Error ? error.message : String(error)}` }
  }

  // 3) 注册表记账。0.2.2-alpha.2 里挂载中的 live 会话没有在线卸载 API（AgentHandle
  //    被 session-controller 丢弃，生命周期随宿主进程）：文件虽删，sessions store 的
  //    live 行仍会让 GUI 列表显示它。所以 live 会话走「墓碑」路径——加入归档集，
  //    活动视图立即隐藏该行，仍打开的旧标签页会被原生「已归档」门拦截（不会复活文件）。
  //    墓碑不做 GC：重启后仍开着的标签页会自动 resume，清掉的墓碑会让重建的会话直接
  //    回到活动视图；留着的墓碑不可见（无文件无 live 行就没有行）且有门保护。
  //    非 live 会话彻底清理（取消归档/置顶）。全部尽力而为，失败只记日志。
  const wasLive = sessions?.get(sessionId) !== undefined
  if (registry !== undefined) {
    try {
      if (wasLive) {
        await registry.archiveSession(sessionId)
      } else {
        if (registry.archivedSessionIds.includes(sessionId)) await registry.unarchiveSession(sessionId)
        if (registry.pinnedSessionIds.includes(sessionId)) await registry.unpinSession(sessionId)
      }
      for (const workspace of registry.list()) {
        if (workspace.sessionIds.includes(sessionId)) await workspace.detachSession(sessionId)
      }
    } catch (error: unknown) {
      ctx.logger?.warn(`session-batch-manager: registry cleanup for "${sessionId}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 4) 广播 api-session/removed（api-remotes 转发给所有已连接 GUI，立即掉行）。
  //    **没有持久化产物也广播**：既可能是此前已删除，也可能是客户端残留的幽灵行
  //    或重启前未落盘即丢失的 pending 会话——「该会话不存在」这一目标状态已经达成，
  //    按幂等成功报告，并借这次广播把各 GUI 里的残影行清掉。
  ctx.emit('api-session/removed', sessionId)
  if (!removedFiles) {
    return { sessionId, ok: true, message: '会话已不存在；已广播清理残留行' }
  }
  return wasLive
    ? { sessionId, ok: true, message: '会话已删除；宿主仍挂载该会话，列表行已按归档隐藏，重启后彻底清理' }
    : { sessionId, ok: true }
}

/**
 * `GET <base>/stats`：会话统计（只读免栅栏，与 status 同策略）。
 * @param req - 请求。
 * @param res - 响应。
 * @param aggregator - 统计聚合器。
 */
async function handleStats(
  req: HttpRequestLike, res: HttpResponseLike, aggregator: SessionStatsAggregator,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method-not-allowed' })
    return
  }
  // fire-and-forget 渐进式：trigger 不阻塞响应，snapshot 立即返回当前缓存
  aggregator.trigger()
  const result = aggregator.snapshot()
  sendJson(res, 200, {
    ok: true,
    service: 'dsh-session-batch-manager',
    version: __PLUGIN_VERSION__,
    generatedAt: Date.now(),
    ...result,
  })
}
