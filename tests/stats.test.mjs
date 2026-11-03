/**
 * SessionStatsAggregator 单元测试
 *
 * 覆盖：revision 命中跳过、并发上限（含屏障式断言）、per-id 错误隔离、模型 last-wins、
 * 空日志 null、prune 已删 id、projection 缺席、去重节流、dispose 租约释放、降级标记。
 *
 * 运行：node --test tests/stats.test.mjs
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// 动态导入构建产物
const { SessionStatsAggregator } = await import('../lib/host/index.js')

/** 构造模拟 HostContextLike。 */
function mockCtx(overrides = {}) {
  const services = new Map()
  return {
    get(name) {
      const svc = services.get(name)
      if (svc !== undefined) return svc
      if (overrides[name]) return overrides[name]
      return undefined
    },
    set(name, svc) { services.set(name, svc) },
    emit() {},
    on() { return () => {} },
    waterfall() { return Promise.resolve([]) },
    inject() {},
    logger: { warn() {}, error() {} },
  }
}

/** 构造一个 session-query mock。 */
function mockSessionQuery(records, observations) {
  return {
    listSessions() {
      return Promise.resolve(records.map(r => ({
        header: { id: r.id },
        live: r.live ?? false,
      })))
    },
    observeSession(id) {
      const obs = observations.get(id)
      if (obs === undefined) return Promise.reject(new Error('observeSession failed'))
      return Promise.resolve(obs)
    },
  }
}

/** 构造一个 persistence mock。 */
function mockPersistence(stats) {
  return {
    stat(id) {
      const stat = stats.get(id)
      if (stat === undefined) return Promise.resolve(undefined)
      return Promise.resolve(stat)
    },
  }
}

/** 构造投影的 token usage。 */
function tokenUsage(uncachedInput = 0, output = 0, cacheRead = 0, cacheWrite = 0) {
  return { uncachedInputTokens: uncachedInput, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }
}

/** 构造投影的 context pressure。 */
function contextPressure(pressureTokens, projectedTokens, contextWindow) {
  return { pressureTokens, projectedTokens, contextWindow }
}

/** 构造一个带有 projections 的 observation。 */
function observation(model, usage, pressure, opts = {}) {
  const events = []
  if (model !== null) {
    events.push({ type: 'request/header', data: { header: { config: model } } })
  }
  return {
    events,
    projections: {
      values: {
        tokenUsage: usage ?? undefined,
        contextPressure: pressure ?? undefined,
      },
    },
    ...opts,
  }
}

// ====== 测试 ======

describe('SessionStatsAggregator', () => {
  /** @type {import('../lib/host/index.js').SessionStatsAggregator} */
  let aggregator
  let ctx

  beforeEach(() => {
    ctx = mockCtx()
  })

  it('revision 命中跳过：未变更 id 不进观察器', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })
    ctx.set('sessionQuery', mockSessionQuery(sessions, new Map()))
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    // 首扫：无缓存，应观察
    const r1 = await aggregator.sweepAndWait()
    assert.equal(r1.complete, true)
    assert.equal(r1.pending, 0)
    assert.equal(r1.degraded, false)
    assert.equal(r1.sessions.length, 1)
    assert.equal(r1.sessions[0].error, 'read-failed') // 无 observation → per-id error

    // 次扫：revision 未变 → 跳过（缓存命中，不进观察器）
    const r2 = await aggregator.sweepAndWait()
    assert.equal(r2.sessions.length, 1)
    // 上次的 error 被缓存保留（revision 跳过意味着 read-failed 也被缓存）
  })

  it('并发上限：同时最多 concurrency 条在观察', async () => {
    const sessions = [
      { id: 's1', live: false },
      { id: 's2', live: false },
      { id: 's3', live: false },
      { id: 's4', live: false },
      { id: 's5', live: false },
    ]
    const stats = new Map()
    sessions.forEach(s => stats.set(s.id, { revision: `r-${s.id}` }))

    // 屏障式 mock：用 barrier 卡住所有观察，测并发上限
    let concurrent = 0
    let maxConcurrent = 0
    /** @type {() => void} */
    let release
    const barrier = new Promise(resolve => { release = resolve })

    let observeCount = 0
    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      async observeSession(id) {
        observeCount += 1
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await barrier // 等待释放
        concurrent -= 1
        return {
          events: [],
          projections: { values: {} },
          dispose() {},
        }
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 2) // 并发 2

    // fire-and-forget 启动 sweep
    aggregator.trigger()

    // 等待 worker 启动
    await new Promise(r => setTimeout(r, 100))

    // 此时应最多 2 条同时在观察
    assert.ok(maxConcurrent <= 2, `maxConcurrent=${maxConcurrent}, expected ≤ 2`)
    assert.ok(maxConcurrent >= 2, `maxConcurrent=${maxConcurrent}, expected ≥ 2`)

    // 释放 barrier，让 sweep 跑完
    release()
    await aggregator.sweepAndWait()

    assert.equal(observeCount, 5)
    assert.equal(maxConcurrent, 2)
  })

  it('去重节流：1s 窗内重复 trigger 共享同一 sweep', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })

    let observeCount = 0
    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession() {
        observeCount += 1
        return Promise.resolve(observation({ provider: 'openai', model: 'gpt-4' }, tokenUsage(100, 50)))
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    // 连续两次 trigger（< 1s）
    aggregator.trigger()
    aggregator.trigger()

    // 等待 sweep 完成
    await aggregator.sweepAndWait()

    // 应只触发一次 sweep
    assert.equal(observeCount, 1)
  })

  it('dispose 租约释放：观察完成后调用 Symbol.dispose', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })

    let disposeCalled = false
    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession() {
        return Promise.resolve(observation(
          { provider: 'openai', model: 'gpt-4' },
          tokenUsage(100, 50),
          undefined,
          {
            [Symbol.dispose]() { disposeCalled = true },
          },
        ))
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)
    const r = await aggregator.sweepAndWait()

    assert.equal(r.sessions[0].error, null)
    assert.equal(disposeCalled, true)
  })

  it('降级标记：无 sessionQuery 时 degraded=true', async () => {
    // 不注入 sessionQuery
    aggregator = new SessionStatsAggregator(ctx, 4)

    const r = await aggregator.sweepAndWait()
    assert.equal(r.degraded, true)
    assert.equal(r.complete, true)
    assert.equal(r.pending, 0)
    assert.equal(r.sessions.length, 0)
  })

  it('per-id 错误隔离：corrupt 会话不影响其他 id', async () => {
    const sessions = [
      { id: 'good', live: false },
      { id: 'bad', live: false },
    ]
    const stats = new Map()
    stats.set('good', { revision: 'r1' })
    stats.set('bad', { revision: 'r1' })

    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession(id) {
        if (id === 'bad') return Promise.reject(new Error('corrupt session log'))
        return Promise.resolve({
          events: [{ type: 'request/header', data: { header: { config: { provider: 'openai', model: 'gpt-4' } } } }],
          projections: { values: {} },
          dispose() {},
        })
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    const r = await aggregator.sweepAndWait()
    assert.equal(r.sessions.length, 2)
    const good = r.sessions.find(s => s.id === 'good')
    const bad = r.sessions.find(s => s.id === 'bad')
    assert.equal(good.error, null)
    assert.equal(good.model, 'openai/gpt-4')
    assert.equal(bad.error, 'corrupt')
    assert.equal(bad.model, null)
  })

  it('模型 last-wins：扫事件尾部最后一个 request/header', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })

    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession() {
        return Promise.resolve({
          events: [
            { type: 'request/header', data: { header: { config: { provider: 'anthropic', model: 'claude-3' } } } },
            { type: 'assistant/message', data: {} },
            { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'deepseek-chat' } } } },
            { type: 'assistant/message', data: {} },
          ],
          projections: { values: { tokenUsage: tokenUsage(100, 50) } },
          dispose() {},
        })
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    const r = await aggregator.sweepAndWait()
    assert.equal(r.sessions[0].model, 'deepseek/deepseek-chat')
    assert.equal(r.sessions[0].usage.uncachedInputTokens, 100)
    assert.equal(r.sessions[0].usage.outputTokens, 50)
  })

  it('空日志 null：无请求事件 → model null', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })

    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession() {
        return Promise.resolve({
          events: [],
          projections: { values: { tokenUsage: tokenUsage(0, 0) } },
          dispose() {},
        })
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    const r = await aggregator.sweepAndWait()
    assert.equal(r.sessions[0].model, null)
    assert.equal(r.sessions[0].usage.uncachedInputTokens, 0)
  })

  it('prune 已删 id：语料消失的 id 从缓存移除', async () => {
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })
    stats.set('s2', { revision: 'r2' })

    let firstCall = true
    ctx.set('sessionQuery', {
      listSessions() {
        if (firstCall) {
          firstCall = false
          return Promise.resolve([
            { header: { id: 's1' }, live: false },
            { header: { id: 's2' }, live: false },
          ])
        }
        // 第二轮：s2 消失
        return Promise.resolve([{ header: { id: 's1' }, live: false }])
      },
      observeSession() {
        return Promise.resolve({
          events: [],
          projections: { values: {} },
          dispose() {},
        })
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)

    // 首扫
    const r1 = await aggregator.sweepAndWait()
    assert.equal(r1.sessions.length, 2)
    assert.ok(r1.sessions.some(s => s.id === 's1'))
    assert.ok(r1.sessions.some(s => s.id === 's2'))

    // 等待节流窗过期（>1s）
    await new Promise(r => setTimeout(r, 1100))

    // 次扫（s2 消失 → prune）
    const r2 = await aggregator.sweepAndWait()
    assert.equal(r2.sessions.length, 1)
    assert.equal(r2.sessions[0].id, 's1')
  })

  it('projection 缺席时 usage/pressure 为 null', async () => {
    const sessions = [{ id: 's1', live: false }]
    const stats = new Map()
    stats.set('s1', { revision: 'r1' })

    ctx.set('sessionQuery', {
      listSessions() {
        return Promise.resolve(sessions.map(s => ({ header: { id: s.id }, live: false })))
      },
      observeSession() {
        return Promise.resolve({
          events: [{ type: 'request/header', data: { header: { config: { provider: 'test', model: 'test' } } } }],
          projections: { values: {} }, // 空 projections
          dispose() {},
        })
      },
    })
    ctx.set('sessionPersistence', mockPersistence(stats))

    aggregator = new SessionStatsAggregator(ctx, 4)
    const r = await aggregator.sweepAndWait()
    assert.equal(r.sessions[0].model, 'test/test')
    assert.equal(r.sessions[0].usage, null)
    assert.equal(r.sessions[0].pressure, null)
  })
})