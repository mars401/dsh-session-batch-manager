/**
 * v0.3 验收语料落盘取证——manifest ⇄ 日志 header ⇄ projcache ⇄ workspace.json ⇄ `/stats` 五方交叉核对。
 *
 * 生成器（`make-v4-corpus.mjs`）写完自称的形状，本脚本从**磁盘与运行中的宿主**独立复核一遍，
 * 不信任生成器的自检：语料是整轮验收的地基，地基对不上时后面每条判据都无意义（D11 的教训）。
 *
 * 复核项：
 * - 每条会话的日志首事件（= header，不在 `data.header`）：id/createdAt/cwd/origin/delegationDepth/
 *   parentSession/type/version/isSeeded，以及所在项目目录与「有无 cwd」是否一致（无 cwd → `_no-cwd/`）。
 * - projcache：`identity` 四字段（宿主 `currentLifecycleMatches` 的比对面，无 cwd 时该键必须**缺席**）、
 *   `sessionListMetadata.blank` 与轮次数一致、title、`sessionStats.turns`、`workingDirectory`、全行 seq 水位。
 * - 声明 `cache:'none'` 的行必须**真的没有**记录文件（cold fallback 组，Z2）。
 * - `/stats`：count/complete/pending/degraded、id 集合与 manifest 双向相等、error 行、无 model 行。
 * - `workspace.json`：工作区数、成员 id 全属语料、archived/pinned 清空、defaultWorkspaceId 已注册。
 * - 五个 cwd 目录的存在性（召回失败行的目录必须已被物理删除）。
 *
 * 用法（只在沙箱容器内跑；`/stats` 快照先在宿主机 curl 下来再 `docker cp` 进去）：
 *
 * ```sh
 * curl -s 'http://127.0.0.1:13080/dsh-session-batch-manager/v1/stats' \
 *   -H 'x-dsh-session-batch-manager: 1' -o /tmp/stats.json
 * docker cp /tmp/stats.json dsh-dev:/tmp/stats.json
 * docker exec dsh-dev node <repo>/tests/fixtures/verify-v4-corpus.mjs /tmp/stats.json
 * ```
 *
 * 环境变量与生成器同名同默认值：`FIXTURE_SESSIONS_ROOT` / `FIXTURE_PROJCACHE` /
 * `FIXTURE_WORKSPACE_STORE` / `FIXTURE_MANIFEST`。退出码 0 = 零不一致；1 = 有 `problems`（并打印明细）。
 *
 * @module tests/fixtures/verify-v4-corpus
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const SESSIONS_ROOT = process.env.FIXTURE_SESSIONS_ROOT ?? '/root/.dsh/sessions'
const PROJCACHE_DIR = process.env.FIXTURE_PROJCACHE ?? '/root/.dsh/storages/session_projcache/sessions'
const WORKSPACE_STORE = process.env.FIXTURE_WORKSPACE_STORE ?? '/root/.dsh/storages/workspace.json'
const LOG = 'session.v4.jsonl.zstd'

const statsFile = process.argv[2] ?? '/tmp/stats.json'
const manifest = JSON.parse(fs.readFileSync(process.env.FIXTURE_MANIFEST ?? '/tmp/v4-corpus.json', 'utf8'))
const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'))
const problems = []
const note = (m) => problems.push(m)

/** 建 id → 会话目录 的索引（目录布局：<projectKey(cwd)>/<id>/）。 */
const dirOf = new Map()
const noCwdIds = []
for (const proj of fs.readdirSync(SESSIONS_ROOT)) {
  const projDir = path.join(SESSIONS_ROOT, proj)
  if (!fs.statSync(projDir).isDirectory()) continue
  for (const id of fs.readdirSync(projDir)) {
    if (!fs.statSync(path.join(projDir, id)).isDirectory()) continue
    dirOf.set(id, { dir: path.join(projDir, id), proj })
    if (proj === '_no-cwd') noCwdIds.push(id)
  }
}

const readHeader = (id) => {
  const entry = dirOf.get(id)
  if (!entry) { note(`NO_DIR ${id}`); return null }
  const buf = fs.readFileSync(path.join(entry.dir, LOG))
  if (buf[0] !== 0x28) note(`NOT_ZSTD ${id}`)
  const first = zlib.zstdDecompressSync(buf).toString('utf8').split('\n')[0]
  return JSON.parse(first)
}

const readCache = (id) => {
  const file = path.join(PROJCACHE_DIR, `${id}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const report = { rows: [], disk: {}, stats: {}, workspace: {}, cwds: {} }

for (const row of manifest.rows) {
  const h = readHeader(row.id)
  const rec = readCache(row.id)
  const checks = {}
  if (!h) { checks.header = 'MISSING' } else {
    checks.headerId = h.id === row.id
    checks.createdAt = h.createdAt === undefined ? 'no-createdAt' : typeof h.createdAt === 'number'
    checks.cwd = h.cwd === row.cwd || (h.cwd === undefined && row.cwd === null)
    checks.origin = (h.origin ?? null) === (row.kind === 'subagent' ? 'subagent' : null)
    checks.depth = h.delegationDepth === row.delegationDepth
    checks.parent = (h.parentSession ?? null) === row.parentSession
    checks.type = h.type === 'session' && h.version === 4
    checks.isSeeded = h.isSeeded === false
    checks.projDir = row.cwd === null
      ? dirOf.get(row.id)?.proj === '_no-cwd'
      : dirOf.get(row.id)?.proj !== '_no-cwd'
    for (const [k, v] of Object.entries(checks)) if (v !== true) note(`HEADER ${row.id} ${k}=${JSON.stringify(v)} (header=${JSON.stringify({ cwd: h.cwd, origin: h.origin, depth: h.delegationDepth, parent: h.parentSession })})`)
  }
  if (row.projcache === 'none') {
    checks.cacheAbsent = rec === null
    if (rec !== null) note(`CACHE_UNEXPECTED ${row.id}`)
  } else if (!rec) {
    checks.cachePresent = false
    note(`CACHE_MISSING ${row.id}`)
  } else {
    const idn = rec.record.identity
    checks.identity = idn.formatVersion === 4 && idn.createdAt === h?.createdAt && idn.isSeeded === false &&
      (row.cwd === null ? !('cwd' in idn) : idn.cwd === row.cwd)
    checks.inherited = idn.inheritedEventCount === 0
    const blank = rec.record.rows.sessionListMetadata.val.blank
    checks.blankMatchesTurns = blank === (row.turns === 0)
    checks.title = rec.record.rows.title.val === row.title
    checks.turns = rec.record.rows.sessionStats.val.turns === row.turns
    checks.wd = row.cwd === null
      ? !('workingDirectory' in rec.record.rows)
      : rec.record.rows.workingDirectory.val === row.cwd
    checks.seq = Object.values(rec.record.rows).every(r => r.seq === 3)
    for (const [k, v] of Object.entries(checks)) if (v !== true) note(`CACHE ${row.id} ${k}=${JSON.stringify(v)} identity=${JSON.stringify(idn)} blank=${JSON.stringify(rec.record.rows.sessionListMetadata?.val)}`)
  }
  report.rows.push({
    role: row.role, id: row.id, kind: row.kind, turns: row.turns, projcache: row.projcache,
    blankOnDisk: rec ? rec.record.rows.sessionListMetadata.val.blank : '(no record → cold fallback false)',
    headerOk: Object.values(checks).every(v => v === true),
  })
}

report.disk = {
  sessionDirs: dirOf.size,
  manifestRows: manifest.rows.length,
  noCwdDirs: noCwdIds.length,
  noCwdIds,
  projcacheFilesTotal: fs.readdirSync(PROJCACHE_DIR).length,
  projcacheFilesForCorpus: manifest.rows.filter(r => readCache(r.id)).length,
}
if (dirOf.size !== manifest.rows.length) note(`DIR_COUNT disk=${dirOf.size} manifest=${manifest.rows.length}`)
if (noCwdIds.length !== manifest.rows.filter(r => r.cwd === null).length) {
  note(`NO_CWD_COUNT disk=${noCwdIds.length} manifest=${manifest.rows.filter(r => r.cwd === null).length}`)
}

report.stats = { count: stats.sessions.length, complete: stats.complete, pending: stats.pending, degraded: stats.degraded }
const statsIds = new Set(stats.sessions.map(s => s.id))
const manifestIds = new Set(manifest.rows.map(r => r.id))
report.stats.onlyInStats = [...statsIds].filter(i => !manifestIds.has(i))
report.stats.onlyInManifest = [...manifestIds].filter(i => !statsIds.has(i))
report.stats.errorRows = stats.sessions.filter(s => s.error).map(s => `${s.id}: ${JSON.stringify(s.error)}`)
report.stats.noModelRows = stats.sessions.filter(s => !s.model).map(s => s.id)
if (report.stats.onlyInStats.length) note(`STATS_EXTRA ${report.stats.onlyInStats.join(',')}`)
if (report.stats.onlyInManifest.length) note(`STATS_MISSING ${report.stats.onlyInManifest.join(',')}`)
if (report.stats.count !== 21) note(`STATS_COUNT ${report.stats.count}`)
if (stats.complete !== true) note('STATS_INCOMPLETE')
if (report.stats.errorRows.length) note(`STATS_ERRORS ${report.stats.errorRows.join(' | ')}`)

const ws = JSON.parse(fs.readFileSync(WORKSPACE_STORE, 'utf8'))
const tables = Object.values(ws.tables.workspaces)
report.workspace = {
  unitVersion: ws.unit.version,
  workspaceCount: tables.length,
  globalKeys: Object.keys(ws.global),
  workspaces: tables.map(w => ({ path: w.path, title: w.title, members: w.sessionIds, fields: Object.keys(w) })),
  archived: ws.global.archivedSessionIds.length,
  pinned: ws.global.pinnedSessionIds.length,
  defaultIsRegistered: ws.global.workspaceIds.includes(ws.global.defaultWorkspaceId),
}
if (tables.length !== 1) note(`WS_COUNT ${tables.length}`)
if (tables[0].sessionIds.length !== 4) note(`WS_MEMBERS ${tables[0].sessionIds.length}`)
if (ws.global.archivedSessionIds.length !== 0) note('WS_ARCHIVED_NOT_EMPTY')
for (const id of tables[0].sessionIds) if (!manifestIds.has(id)) note(`WS_MEMBER_UNKNOWN ${id}`)

for (const [name, dir] of Object.entries({ ...manifest.cwds })) {
  const p = dir.replace(/（.*$/, '')
  report.cwds[name] = { path: p, exists: fs.existsSync(p) }
}
if (report.cwds.RECALL_B.exists) note('RECALL_B_STILL_EXISTS')
for (const k of ['PROJ_A', 'PROJ_B', 'RECALL_A', 'EDGE']) if (!report.cwds[k].exists) note(`CWD_MISSING ${k}`)

console.log(JSON.stringify({ report, problems }, null, 2))
process.exit(problems.length === 0 ? 0 : 1)
