/**
 * 树形看板预期值打印器——用**真实源码**算出 GUI 验收清单里的每一个数字。
 *
 * 为什么需要它：`docs/acceptance-session-dashboard-v3.md` 的 §1 对照表、§2 四档计数、
 * §3 折叠可见行数与徽标、§4 级联去重计数、§7 三步归档边界的预期值，全部是**推导**出来的；
 * 推导错过两次（归档子代理会通过血统把孙代理一起带进已归档档；恢复父之后孙代理仍因
 * 自己的父留档），所以预期值必须由代码算，不能由人猜。
 *
 * 它不是测试（无断言），是把沙箱当前 10 行语料的形状喂进
 * `joinDashboardRows → buildTree → filterDashboardRows → visibleRows` 后打印结果，
 * 供人肉比对 GUI。语料形状变了就改下面的 `corpus`，或直接从 `/tmp/tree-corpus.json` 取 id。
 *
 * 运行（宿主机，Node 24 直接 import `.ts`，type stripping 默认开启）：
 *
 * ```sh
 * export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
 * node tests/fixtures/print-tree-expectations.mjs               # 基线 + §7 三步归档场景
 * node tests/fixtures/print-tree-expectations.mjs --c2-running  # 叠加「C2 运行中」，验折叠态运行点传播
 * ```
 *
 * fork 与环这两类形状 GUI 造不出来，由 `tests/dashboard-tree.test.mjs` 单测覆盖（design §11.10）。
 *
 * @module tests/fixtures/print-tree-expectations
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const R = `${repoRoot}/src/client`
const { joinDashboardRows, filterDashboardRows } = await import(`${R}/dashboard-rows.ts`)
const { buildTree, descendantsOf, visibleRows } = await import(`${R}/dashboard-tree.ts`)

const P='session-8ca3549a-7e68-4db2-ab5d-24510cca104b'
const C1='9ccb3c70-1e39-44a3-b591-f0868f31e39f'
const C2='5832e5c6-2a04-4309-a9bb-27dfecb56864'
const G1='cf9fe1b3-3080-4160-8c52-ac9ed4f95b74'
const O='ba223092-d247-4302-b0ca-852a3cc1bb16'
const S1='session-ff21eaad-3a04-4271-9aeb-94cda6d34605'
const S2='session-755887f4-1e97-4cab-9dbb-dc367c2d623c'
const T1='session-ac8e9808-763c-4e76-ae78-bab9b3988b8a'
const SB='4ee4b5eb-fb1d-4499-ab09-b195551fc68f'
const RL='session-359f41d1-2760-4070-b187-b88a1ca21870'

const corpus = [
  { id:P,  title:'树形验收 · 父会话',      cwd:'/root/tree-proj' },
  { id:C1, title:'子代理 A · 检索资料',    cwd:'/root/tree-proj',  origin:'subagent', parentId:P },
  { id:C2, title:'子代理 B · 落地实现',    cwd:'/root/other-proj', origin:'subagent', parentId:P },
  { id:G1, title:'孙代理 · 结果校验 1',    cwd:'/root/tree-proj',  origin:'subagent', parentId:C1 },
  { id:O,  title:'孤儿子代理 · 父已删除 1', cwd:undefined,          origin:'subagent', parentId:'session-ded2d6c8-f169-44fe-b318-39f3cecdc82e' },
  { id:S1, title:undefined, cwd:'/root' },
  { id:S2, title:undefined, cwd:'/root' },
  { id:T1, title:'验收对照会话 1', cwd:'/root' },
  { id:SB, title:undefined, cwd:'/root', origin:'subagent', parentId:T1 },
  { id:RL, title:undefined, cwd:'/root/test1' },
]
const runningSet = new Set(process.argv.includes('--c2-running') ? [C2] : [])
const data = { ok:true, sessions: corpus.map(c => ({ id:c.id, model:null, usage:null, pressure:null, error:null })) }
const byId = Object.fromEntries(corpus.map(c => [c.id, { ...c, running: runningSet.has(c.id) }]))

const short = id => id.startsWith('session-') ? id.slice(8,16) : id.slice(0,8)
function scenario(label, archivedIds) {
  const rows = joinDashboardRows({ data, byId, archivedSessionIds:archivedIds, pinnedSessionIds:[], tombstones:[] })
  const tree = buildTree(rows, new Set(archivedIds))
  const f = k => filterDashboardRows(tree, k)
  console.log(`\n===== ${label}（显式归档: ${archivedIds.map(short).join(',')||'无'}）=====`)
  console.log(`chips 计数: 全部 ${f('all').length} / 主会话 ${f('main').length} / 子代理 ${f('subagent').length} / 已归档 ${f('archived').length}`)
  console.log(`已归档档行: ${f('archived').map(r=>`${short(r.id)}(${r.archived?'显式':'血统'})`).join(' ')||'（空）'}`)
  const all = f('all')
  const vis = ex => visibleRows(all, new Set(ex))
  console.log(`全部档 折叠可见 ${vis([]).length} 行: ${vis([]).map(r=>`${'  '.repeat(r.depth)}${short(r.id)}${r.hasChildren?`[▸${r.childCount}${r.runningDescendants?'·跑':''}]`:''}〈${r.projectLabel??'—'}〉`).join(' | ')}`)
  console.log(`展开 P → ${vis([P]).length} 行；再展开 C1 → ${vis([P,C1]).length} 行；再展开 T1 → ${vis([P,C1,T1]).length} 行`)
  console.log(`descendantsOf(P) = ${descendantsOf(P,tree).length} 个: ${descendantsOf(P,tree).map(r=>short(r.id)).join(',')}`)
  console.log(`主会话档行: ${f('main').map(r=>short(r.id)).join(' ')}`)
  console.log(`子代理档行: ${f('subagent').map(r=>`${short(r.id)}↰${r.parentId?short(r.parentId):'?'}`).join(' ')}`)
  console.log(`子代理档小字(§15.5 预期): ${f('subagent').map(r=>`${short(r.id)}「↳ ${r.parentTitle ?? '(孤儿→短id)'}」`).join(' | ')}`)
  // 平面档探针：chips 计数来自 filterDashboardRows，表格行来自 visibleRows(filteredRows)。
  // 平面档（主会话/子代理/已归档）的行仍带着树里的 depth 与 hasChildren，若 visibleRows
  // 对它们也做折叠隐藏，就会出现「chips 说 N 行、表格只有 M 行」。两者必须相等。
  for (const k of ['main','subagent','archived']) {
    const rows = f(k)
    const v0 = visibleRows(rows, new Set())
    const vE = visibleRows(rows, new Set([P,C1,T1]))
    const lost = rows.filter(r => !v0.includes(r)).map(r => short(r.id))
    console.log(`${k} 档: chips=${rows.length} 表格(全折叠)=${v0.length} 表格(全展开)=${vE.length} ` +
      (lost.length === 0 ? '一致' : `不一致 ← 折叠态丢失 ${lost.join(',')}`))
  }
  const mixed = new Set([...descendantsOf(P,tree).map(r=>r.id), P, S1])
  console.log(`勾 P+S1 去重后总数 = ${mixed.size}（含子代理 ${[...mixed].filter(id=>byId[id].origin==='subagent').length}）`)
  console.log(`全选(全部档折叠) = ${vis([]).length} 行；P.runningDescendants = ${tree.find(r=>r.id===P).runningDescendants}`)
}
scenario('基线：无归档', [])
scenario('§7 步1：显式归档 C1', [C1])
scenario('§7 步2：再归档 P（C1 仍显式）', [C1,P])
scenario('§7 步3：恢复 P（C1 仍显式）', [C1])
