/**
 * 会话目录名编码——`packages/session/session-persistence-jsonl` 的 `encodeSegment`
 * 的逐字符复刻（该函数不在发行版的公开导出面上，而删除前的路径校验必须与存储后端
 * 的目录命名完全一致）。
 *
 * 规则：`[A-Za-z0-9._-]` 原样保留（`~` 除外）；其余每个字符编码为 `~XXXX`
 * （UTF-16 码元的 4 位十六进制，大写）。`.` 与 `..` 整体转义，杜绝路径回退。
 * @module host/segment
 */

/**
 * 把一个原始字符串编码为一个安全的文件路径段。
 * @param raw - 原始字符串（例如会话 id）。
 * @returns 编码后的路径段。
 * @throws 空字符串没有合法编码。
 */
export function encodeSegment(raw: string): string {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch
    } else {
      out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
    }
  }
  return out
}
