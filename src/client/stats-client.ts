/**
 * stats 路由客户端——轮询生命周期与降级处理。
 *
 * 轮询仅在面板打开且页面可见时运行；关闭/隐藏时清除定时器；
 * 批量操作完成后由面板手动拉一次（不依赖定时器）。
 *
 * @module client/stats-client
 */

import type { StatsResponse } from './types.ts'

/** fetch 超时（ms）：防御大库首扫挂起。 */
const FETCH_TIMEOUT_MS = 30_000

/**
 * 发现轮询间隔：优先页面全局注入。
 * @returns 毫秒数。
 */
function discoverPollInterval(): number {
  const injected = typeof window === 'undefined' ? undefined : window.__DSH_SESSION_BATCH_MANAGER__
  const interval = injected?.statsPollIntervalMs
  if (typeof interval === 'number' && interval >= 1000) return interval
  return 5000
}

/**
 * 发现路由前缀（与 ops.ts 同一逻辑）。
 * @returns 无尾斜杠的绝对路径。
 */
function discoverRouteBase(): string {
  const injected = typeof window === 'undefined' ? undefined : window.__DSH_SESSION_BATCH_MANAGER__
  const base = injected?.routeBase
  if (typeof base === 'string' && base.startsWith('/')) return base.replace(/\/+$/, '')
  return '/dsh-session-batch-manager/v1'
}

/**
 * 拉取 stats。
 * @param signal - 可选 AbortSignal（定时器触发时不带）。
 * @returns stats 响应或降级载荷。
 */
export async function fetchStats(signal?: AbortSignal): Promise<StatsResponse> {
  const routeBase = discoverRouteBase()
  let response: Response
  try {
    response = await fetch(`${routeBase}/stats`, {
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'cache-control': 'no-store' },
    })
  } catch {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: 'network' }
  }
  if (!response.ok) {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: `http-${String(response.status)}` }
  }
  try {
    return await response.json() as StatsResponse
  } catch {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: 'parse' }
  }
}

/** 轮询生命周期管理。 */
export interface StatsPoller {
  /** 启动轮询（幂等）。 */
  start(onData: (data: StatsResponse) => void): void
  /** 停止轮询（幂等）。 */
  stop(): void
  /** 是否正在轮询。 */
  readonly running: boolean
}

/**
 * 创建轮询管理器。
 * @returns 轮询句柄。
 */
export function createStatsPoller(): StatsPoller {
  let intervalId: ReturnType<typeof setInterval> | null = null
  let callback: ((data: StatsResponse) => void) | null = null
  let stopped = false

  const poll = (): void => {
    if (stopped || callback === null) return
    void fetchStats().then(callback)
  }

  const onVisibilityChange = (): void => {
    if (document.hidden || callback === null) {
      // hidden：暂停
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null }
      return
    }
    // visible 且 interval 已停 → 重启
    if (intervalId === null && !stopped) {
      poll()
      intervalId = setInterval(poll, discoverPollInterval())
    }
  }

  return {
    get running(): boolean { return intervalId !== null },
    start(onData) {
      callback = onData
      stopped = false
      if (!document.hidden && intervalId === null) {
        poll()
        intervalId = setInterval(poll, discoverPollInterval())
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
    },
    stop() {
      stopped = true
      callback = null
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}