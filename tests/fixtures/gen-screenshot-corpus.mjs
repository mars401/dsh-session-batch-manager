/**
 * 合成会话语料生成器（截图专用，隔离实例）。
 * 布局：dsh JSONL zstd 容器 = 帧1(头行) + 帧2(事件体)，均带 checksum。
 * 事件结构仿真实日志骨架；全部文案自撰中性内容，零用户数据。
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const ROOT = '/root/.dsh/sessions/--root--'
const CK = { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }
const NOW = Date.now()
const H = 3600_000, D = 24 * H

const uuid = () => crypto.randomUUID()

// 会话蓝图：title/prompt/reply/model/usage/时间偏移
const BLUEPRINTS = [
  { key: 's1', title: '周报整理', prompt: '帮我把本周的工作整理成一份周报提纲', reply: '已整理为三个部分：本周进展、风险与问题、下周计划，可直接粘贴到周报模板。', model: ['deepseek-official', 'deepseek-chat'], age: 1 * H, ctx: 131072,
    turns: [{ input: 1240, output: 386, cacheRead: 8100, cacheWrite: 620 }] },
  { key: 's2', title: 'API 设计方案讨论', prompt: '讨论一下公开 API 的版本化方案', reply: '建议以 v1 前缀区分 URL，破坏性变更走迁移指南，并保留六个月的弃用窗口。', model: ['deepseek-official', 'deepseek-chat'], age: 5 * H, ctx: 131072,
    turns: [{ input: 12480, output: 3260, cacheRead: 89210, cacheWrite: 4180 }] },
  { key: 's3', title: 'Bug 复现记录', prompt: '记录一下列表分页 Bug 的复现步骤', reply: '复现路径已整理：先将分页大小调到 200，翻到第 3 页后再切换过滤条件，即可看到总数不刷新。', model: ['deepseek-official', 'deepseek-v4-pro'], age: 1 * D, ctx: 131072,
    turns: [{ input: 8200, output: 1100, cacheRead: 41000, cacheWrite: 3900 },
            { input: 21400, output: 4860, cacheRead: 96500, cacheWrite: 5900 }] },
  { key: 's4', title: '数据库表结构重构', prompt: '评估一下订单表拆分后的迁移步骤', reply: '建议分三步：先加新列双写，再灰度回补历史数据，最后切换读路径并下线旧列。', model: ['deepseek-official', 'deepseek-chat'], age: 2 * D, ctx: 131072,
    turns: [{ input: 9800, output: 2140, cacheRead: 47300, cacheWrite: 2400 }] },
  { key: 's5', title: '发布说明草稿', prompt: '为 0.4 版本写一份发布说明草稿', reply: '草稿已完成：新增会话仪表盘、优化批量操作性能、修复归档状态显示异常，共三条主更新。', model: ['deepseek-official', 'deepseek-chat'], age: 3 * D, ctx: 131072,
    turns: [{ input: 2100, output: 640, cacheRead: 13200, cacheWrite: 0 }] },
  { key: 's6', title: '缓存命中率排查', prompt: '分析最近一周的缓存命中率变化', reply: '命中率从 62% 回升到 81%，主要原因是把前缀复用的请求批次做了合并。', model: ['deepseek-official', 'deepseek-chat'], age: 4 * D, ctx: 131072,
    turns: [{ input: 5400, output: 980, cacheRead: 33100, cacheWrite: 0 }] },
  { key: 's7', title: '日志分析（子任务）', prompt: '从近 24 小时错误日志里提取异常模式', reply: '共提取三类异常模式：连接超时占 54%，重试耗尽占 31%，限流拒绝占 15%。', model: ['deepseek-official', 'deepseek-v4-pro'], age: 1 * D - 2 * H, ctx: 131072, subagentOf: 's3',
    turns: [{ input: 7600, output: 1450, cacheRead: 64200, cacheWrite: 1200 }] },
  { key: 's8', title: '旧版接口探索', prompt: '看看旧版报表接口还有没有调用方', reply: '最近 30 天已无调用记录，可以按弃用流程下线该接口。', model: ['deepseek-official', 'deepseek-chat'], age: 6 * D, ctx: 131072, archived: true,
    turns: [{ input: 800, output: 210, cacheRead: 5400, cacheWrite: 300 }] },
]

const ids = {}
for (const bp of BLUEPRINTS) ids[bp.key] = 'session-' + uuid()

function buildLog(bp) {
  const id = ids[bp.key]
  const t0 = NOW - bp.age
  const [provider, model] = bp.model
  const header = {
    type: 'session', version: 4, id, createdAt: t0, cwd: '/root',
    isSeeded: false, delegationDepth: bp.subagentOf ? 1 : 0, agentPreset: 'standard',
    ...(bp.subagentOf ? { origin: 'subagent', parentSession: ids[bp.subagentOf] } : {}),
  }
  const ev = []
  let seq = 0, time = t0 + 1000
  const push = (type, data, extra) => { ev.push({ type, seq: seq++, time, data, ...extra }); time += 300 + Math.floor(Math.random() * 400) }

  push('permission/preset', { preset: 'workspace-write' })
  push('sandbox/mode', { mode: 'workspace-write' })
  push('approval/policy', { policy: 'ask' })

  for (let ti = 0; ti < bp.turns.length; ti++) {
    const turn = ti + 1
    const u = bp.turns[ti]
    push('turn/start', { turn })
    push('step/start', { turn, step: 1 })
    const promptSeq = seq
    push('user/message', {
      content: [{ type: 'text', text: ti === 0 ? bp.prompt : '继续，把结论整理成清单' }],
      source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' },
      role: 'user', id: uuid(),
    }, { surfaceOp: 'append' })
    push('request/header', { header: { config: { provider, model }, tools: [{ name: 'bash', description: '执行命令行并返回输出', parameters: { type: 'object', properties: {}, additionalProperties: true } }] }, reason: 'initial' })
    push('request/context', { provider, model, contextWindow: bp.ctx })
    if (ti === 0) push('session/title', { title: bp.title, messageSeqs: [promptSeq], source: { kind: 'fallback' } })
    push('assistant/message', {
      turn, step: 1,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: ti === 0 ? bp.reply : '已按清单格式整理完毕，共四项结论。' }],
        source: { kind: 'model', provider, model },
        id: uuid(),
      },
      usage: {
        inputTokens: u.input, outputTokens: u.output, cacheReadTokens: u.cacheRead,
        ...(u.cacheWrite ? { cacheWriteTokens: u.cacheWrite } : {}),
        totalTokens: u.input + u.output + u.cacheRead + (u.cacheWrite ?? 0),
      },
      stream: [],
    }, { surfaceOp: 'append' })
    push('step/end', { turn, step: 1 })
    push('turn/end', { turn, reason: { kind: 'completed' } })
  }

  const headerLine = JSON.stringify(header) + '\n'
  const body = ev.map(e => JSON.stringify(e)).join('\n') + '\n'
  return Buffer.concat([
    zlib.zstdCompressSync(Buffer.from(headerLine, 'utf8'), CK),
    zlib.zstdCompressSync(Buffer.from(body, 'utf8'), CK),
  ])
}

const manifest = { pinned: ids.s1, archived: ids.s8, subagent: ids.s7, all: ids }
for (const bp of BLUEPRINTS) {
  const dir = path.join(ROOT, ids[bp.key])
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), buildLog(bp))
}
fs.writeFileSync('/tmp/screenshot-corpus.json', JSON.stringify(manifest, null, 2))
console.log('generated:', JSON.stringify(ids, null, 1))
