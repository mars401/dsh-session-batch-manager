/**
 * 删除路由的浏览器信任栅栏——dsh `/api` 栅栏（`packages/client/connection/src/
 * api-request-trust.ts`）的紧凑复刻，另加一道自定义请求头。
 *
 * 防的还是同两条 confused-deputy 路径：
 * - **DNS rebinding**：Host 头指向攻击者域名而 socket 打到本机。Host 是 rebinding
 *   伪造不了的头，因此每个请求都必须过 Host 栅栏（回环拼写 / 绑定地址 / 配置的
 *   trustedHosts）。
 * - **跨站请求**：恶意页面从浏览器发 POST。三重防御：
 *   1. `x-dsh-session-batch-manager: 1` 自定义头——跨源携带它会触发 CORS preflight，
 *      而本路由对 OPTIONS 一律 403 且不发任何 CORS 头，浏览器直接拦截；
 *   2. `Sec-Fetch-Site: cross-site` 拒绝；
 *   3. Origin 出现时必须与本请求 Host 同权威。
 *
 * @module host/trust
 */

/**
 * 规范化后的 hostname 是否为回环权威（localhost、127/8、[::1]）。
 * @param hostname - WHATWG URL hostname（IPv6 字面量保留方括号）。
 * @returns 回环判定。
 */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** 栅栏可用的请求头读取。 */
function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** 把 `host[:port]` 权威解析为 URL；不可解析时返回 undefined。 */
function parseAuthority(authority: string, scheme: 'http:' | 'https:' = 'http:'): URL | undefined {
  try {
    return new URL(`${scheme}//${authority}`)
  } catch {
    return undefined
  }
}

/** 权威是否命中配置的 trustedHosts（hostname 相等，且配置带端口时端口也必须相等）。 */
function matchesTrustedHosts(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    if (entryUrl.hostname !== hostUrl.hostname) return false
    return entryUrl.port === '' || entryUrl.port === hostUrl.port
  })
}

/** 权威是否为监听自己的绑定地址（端口不参与判定；IPv6 带方括号比较）。 */
function matchesBindAddress(hostUrl: URL, bindHost: string | undefined): boolean {
  if (bindHost === undefined || bindHost === '') return false
  const bindUrl = parseAuthority(bindHost)
  if (bindUrl === undefined) return false
  const bindText = bindUrl.hostname.includes(':') ? `[${bindUrl.hostname}]` : bindUrl.hostname
  return bindText === hostUrl.hostname
}

/** 本路由自定义头的名字与唯一合法值。 */
export const BATCH_HEADER = 'x-dsh-session-batch-manager'

/**
 * 一个请求是否可以执行删除。
 * @param headers - 请求头（node:http 的小写键形态）。
 * @param options - 监听绑定地址与配置的额外信任权威。
 * @returns 通过栅栏与否。
 */
export function isTrustedBatchRequest(
  headers: Record<string, string | string[] | undefined>,
  options: { readonly bindHost?: string; readonly trustedHosts: readonly string[] },
): boolean {
  // 1) 自定义头：浏览器跨源发不出它（preflight 会被 403 拦下），非浏览器本地调用方需显式携带。
  if (header(headers, BATCH_HEADER) !== '1') return false
  // 2) Host 栅栏：rebinding 伪造不了 Host。
  const rawHost = header(headers, 'host')
  if (rawHost === undefined) return false
  const hostUrl = parseAuthority(rawHost)
  if (hostUrl === undefined) return false
  const hostTrusted = isLoopbackHostname(hostUrl.hostname)
    || matchesTrustedHosts(hostUrl, options.trustedHosts)
    || matchesBindAddress(hostUrl, options.bindHost)
  if (!hostTrusted) return false
  // 3) Fetch Metadata：cross-site 一票否决（same-origin / same-site / none 继续走后续检查）。
  if (header(headers, 'sec-fetch-site') === 'cross-site') return false
  // 4) Origin 出现时必须与本监听同权威（opaque 的 `null` 不可解析 → 拒绝）。
  const origin = header(headers, 'origin')
  if (origin !== undefined) {
    let originUrl: URL
    try {
      originUrl = new URL(origin)
    } catch {
      return false
    }
    const scheme = originUrl.protocol === 'https:' ? 'https:' : originUrl.protocol === 'http:' ? 'http:' : undefined
    if (scheme === undefined) return false
    const hostUnderScheme = parseAuthority(rawHost, scheme)
    if (hostUnderScheme === undefined || originUrl.host !== hostUnderScheme.host) return false
  }
  return true
}
