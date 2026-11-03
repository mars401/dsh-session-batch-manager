/**
 * 会话统计聚合器——扫全量语料，抽取 token/上下文/模型。
 *
 * 核心要点：
 * - revision 缓存：`persistence.stat(id).revision` 未变化 → 跳过，不进观察器 LRU(5)；
 * - live 会话直接观察（注册表快照 O(1)）；
 * - per-id 错误隔离（corrupt/persistence-failed）不炸整路由；
 * - sweep 并发去重 + 1s 节流窗，面板未打开时零开销；
 * - 渐进式：trigger() fire-and-forget 启动 sweep，snapshot() 立即返回当前缓存；
 *   大库首扫不会阻塞 HTTP 响应。
 *
 * @module host/stats
 */

import type {
  ContextPressureProjection, HostContextLike, SessionObservationLike,
  SessionPersistenceStatLike, SessionQueryLike, SessionStatRow,
  StatsResult, TokenUsageProjectionLike,
} from './types.ts'
import type { SessionIdString } from './types.ts'

/** sweep 节流窗（ms）：同窗内并发请求共享同一 sweep Promise。 */
const SWEEP_THROTTLE_MS = 1000

/** per-id 缓存的统计项。 */
interface CachedStat {
  /** 持久化修订号（live 会话无修订号时为空串）。 */
  readonly revision: string
  readonly row: SessionStatRow
}

/**
 * 会话统计聚合器。
 *
 * @param ctx - 宿主上下文（结构化视图）。
 * @param concurrency - 冷会话观察并发上限（Config `statsSweepConcurrency`）。
 */
export class SessionStatsAggregator {
  private readonly cache = new Map<SessionIdString, CachedStat>()
  private lastSweepStarted = 0
  private sweepPromise: Promise<void> | null = null
  private completed = false
  private pending = 0
  private degraded = false

  constructor(
    private readonly ctx: HostContextLike,
    private readonly concurrency: number,
  ) {}

  // ---- 公开 API ----

  /**
   * 触发一次 sweep（fire-and-forget）。
   *
   * 与 in-flight sweep 共享同一 Promise；节流窗内忽略重复触发。
   * 路由处理器调用此方法后应立即调用 `snapshot()` 返回当前缓存。
   */
  trigger(): void {
    const now = Date.now()
    if (this.sweepPromise !== null) return // in-flight 共享
    if (now - this.lastSweepStarted < SWEEP_THROTTLE_MS) return // 节流窗
    this.lastSweepStarted = now
    this.sweepPromise = this.sweep().finally(() => {
      this.sweepPromise = null
    })
  }

  /**
   * 返回当前缓存快照（同步）。
   *
   * 不触发任何 I/O；sweep 由 `trigger()` 在后台渐进填充缓存。
   */
  snapshot(): StatsResult {
    return {
      complete: this.completed,
      pending: this.pending,
      degraded: this.degraded,
      sessions: [...this.cache.values()].map(entry => entry.row),
    }
  }

  /**
   * 触发并等待 sweep 完成（用于测试）。
   * @returns sweep 完成后的缓存快照。
   */
  async sweepAndWait(): Promise<StatsResult> {
    this.trigger()
    if (this.sweepPromise !== null) {
      await this.sweepPromise
    }
    return this.snapshot()
  }

  // ---- 内部 ----

  /** 全量 sweep（去重调用靠 trigger 的 promise 共享）。 */
  private async sweep(): Promise<void> {
    const query = this.ctx.get('sessionQuery') as SessionQueryLike | undefined
    if (query === undefined) {
      this.degraded = true
      this.completed = true
      this.pending = 0
      return
    }
    this.degraded = false

    let records: readonly { id: SessionIdString; live: boolean }[]
    try {
      const raw = await query.listSessions()
      records = raw.map(record => ({
        id: record.header.id as SessionIdString,
        live: record.live,
      }))
    } catch {
      // listSessions 失败：保留缓存，本轮不更新。
      this.pending = this.cache.size
      return
    }

    // prune 缓存中已不在语料里的 id
    const activeIds = new Set(records.map(r => r.id))
    for (const id of this.cache.keys()) {
      if (!activeIds.has(id)) this.cache.delete(id)
    }

    // 按 revision 分：live 立即观察，persisted 比对 revision，变更的入观察队列
    const toObserve: SessionIdString[] = []
    for (const record of records) {
      if (record.live) {
        toObserve.push(record.id)
        continue
      }
      try {
        const stat = await this.readStat(record.id)
        if (stat === undefined) {
          // 无持久化产物：按无数据缓存（prune 已确保仅当记录列出时到这）。
          this.cache.set(record.id, { revision: '', row: emptyRow(record.id) })
          continue
        }
        const revision = stat.revision ?? ''
        const cached = this.cache.get(record.id)
        if (cached !== undefined && cached.revision === revision) continue
        // 预填 pending 标记
        this.cache.set(record.id, { revision, row: { id: record.id, model: null, usage: null, pressure: null, error: null } })
        toObserve.push(record.id)
      } catch {
        // stat 失败：per-id error
        this.cache.set(record.id, { revision: '', row: { id: record.id, model: null, usage: null, pressure: null, error: 'read-failed' } })
      }
    }

    this.pending = toObserve.length
    this.completed = false

    // 并发观察（上限 concurrency）
    const queue = [...toObserve]
    const workers: Promise<void>[] = []
    for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
      workers.push(this.observeWorker(query, queue))
    }
    await Promise.all(workers)

    // 未入队的 id（因并发限制）仍计入 pending；下次 sweep 补扫
    this.pending = queue.length
    if (this.pending === 0) this.completed = true
  }

  /** 观察工作线程：从队列取 id 逐条观察，per-id 错误不中断队列。 */
  private async observeWorker(query: SessionQueryLike, queue: SessionIdString[]): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) break
      try {
        const row = await this.observeOne(query, id)
        const existing = this.cache.get(id)
        this.cache.set(id, { revision: existing?.revision ?? '', row })
        this.pending = Math.max(0, this.pending - 1)
        if (this.pending === 0 && queue.length === 0) this.completed = true
      } catch (error: unknown) {
        // 字符串嗅探 corrupt——observation 未暴露结构化 code；
        // transient 失败也永久缓存：revision 不变时复用缓存跳过重试。
        const code = error instanceof Error && error.message.includes('corrupt') ? 'corrupt' : 'read-failed'
        const existing = this.cache.get(id)
        this.cache.set(id, { revision: existing?.revision ?? '', row: { id, model: null, usage: null, pressure: null, error: code } })
        this.pending = Math.max(0, this.pending - 1)
        if (this.pending === 0 && queue.length === 0) this.completed = true
      }
    }
  }

  /** 观察一个会话，抽取 stat 行。 */
  private async observeOne(query: SessionQueryLike, sessionId: SessionIdString): Promise<SessionStatRow> {
    let observation: SessionObservationLike
    try {
      observation = await query.observeSession(sessionId)
    } catch (err: unknown) {
      // 保留原始消息让 `corrupt` 嗅探生效
      throw new Error(`observeSession failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    try {
      const usage: TokenUsageProjectionLike | null =
        observation.projections?.values?.tokenUsage !== undefined
          ? observation.projections.values.tokenUsage
          : null

      const pressure: ContextPressureProjection | null =
        observation.projections?.values?.contextPressure !== undefined
          ? observation.projections.values.contextPressure
          : null

      const model = extractModel(observation.events ?? [])

      return { id: sessionId, model, usage, pressure, error: null }
    } finally {
      // SessionObservation 是 Disposable——释放租约，回收观察器 LRU 槽。
      // 真实 observation 只有 Symbol.dispose，dispose 普通方法分支为防御式兜底。
      if (typeof (observation as { dispose?: () => void }).dispose === 'function') {
        (observation as { dispose: () => void }).dispose()
      } else {
        const dispose = observation[Symbol.dispose]
        if (typeof dispose === 'function') dispose()
      }
    }
  }

  /** 读持久化快照的修订号。 */
  private async readStat(sessionId: SessionIdString): Promise<{ revision?: string } | undefined> {
    const persistence = this.ctx.get('sessionPersistence') as SessionPersistenceStatLike | undefined
    if (persistence === undefined) return undefined
    try {
      const snapshot = await persistence.stat(sessionId)
      return snapshot
    } catch {
      throw new Error('stat failed')
    }
  }
}

/** 空统计行（无持久化产物、无投影数据）。 */
function emptyRow(id: SessionIdString): SessionStatRow {
  return { id, model: null, usage: null, pressure: null, error: null }
}

/** 事件类型守卫：podom 头部事件。 */
interface RequestHeaderEvent {
  type: 'request/header'
  data: { header: { config: { provider?: string; model?: string } } }
}

/**
 * 从事件数组的尾部向前找第一个 `request/header` 事件，抽取 `provider/model`。
 * @param events - 观察到的全量事件。
 * @returns `provider/model` 格式名称，或无请求事件时 null。
 */
function extractModel(events: readonly Record<string, unknown>[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as RequestHeaderEvent | undefined
    if (event?.type === 'request/header') {
      const provider = event.data?.header?.config?.provider
      const model = event.data?.header?.config?.model
      if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
        return `${provider}/${model}`
      }
      return null
    }
  }
  return null
}