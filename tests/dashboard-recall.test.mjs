/**
 * 召回候选派生单元测试 —— computeRecallCandidates
 *
 * F1 教训：纯函数抽离后没人测，fork 截断问题被漏掉。
 * 本文件走 DSH 同款导入风格（await import .ts 源文件）。
 *
 * 运行：node --test tests/dashboard-recall.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { computeRecallCandidates } = await import('../src/client/dashboard-recall.ts')

/** 快捷构造一个 DashboardRow。 */
function row(id, overrides = {}) {
  return {
    id,
    title: id,
    origin: undefined,
    parentId: undefined,
    cwd: undefined,
    running: false,
    archived: false,
    pinned: false,
    updatedAt: 0,
    stats: { id, model: null, usage: null, pressure: null, error: null },
    ...overrides,
  }
}

describe('computeRecallCandidates', () => {
  it('空 rows → 空 Map', () => {
    const map = computeRecallCandidates([], new Set())
    assert.equal(map.size, 0)
  })

  it('所有 rows 已分组 → 空 Map', () => {
    const rows = [
      row('a', { cwd: '/a', updatedAt: 1000 }),
      row('b', { cwd: '/b', updatedAt: 2000 }),
    ]
    const map = computeRecallCandidates(rows, new Set(['a', 'b']))
    assert.equal(map.size, 0)
  })

  it('无 cwd 的主会话不进入候选', () => {
    const rows = [
      row('no-cwd', {}), // cwd undefined
      row('empty-cwd', { cwd: '' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    assert.equal(map.size, 0)
  })

  it('子代理不进入候选', () => {
    const rows = [
      row('sub', { origin: 'subagent', cwd: '/proj', parentId: 'main' }),
      row('main', { cwd: '/proj', updatedAt: 1000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    assert.equal(map.size, 1)
    const g = map.get('/proj')
    assert.equal(g.candidates.length, 1)
    assert.equal(g.candidates[0].id, 'main')
    assert.equal(g.subagentCount, 1) // 亲缘：main → sub
    assert.equal(g.candidates[0].subagentCount, 1)
  })

  it('cwd 尾斜杠归一', () => {
    const rows = [
      row('a', { cwd: '/proj/', updatedAt: 1000 }),
      row('b', { cwd: '/proj', updatedAt: 2000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    assert.equal(map.size, 1)
    const g = map.get('/proj')
    assert.equal(g.candidates.length, 2)
    assert.deepEqual(g.candidates.map(c => c.id), ['b', 'a']) // 降序
  })

  it('Windows 尾反斜杠同样归一', () => {
    const rows = [
      row('a', { cwd: 'C:\\proj\\', updatedAt: 1000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    assert.equal(map.size, 1)
    assert.ok(map.has('C:\\proj'))
  })

  it('candidates 按 updatedAt 降序', () => {
    const rows = [
      row('old', { cwd: '/proj', updatedAt: 1000 }),
      row('mid', { cwd: '/proj', updatedAt: 2000 }),
      row('new', { cwd: '/proj', updatedAt: 3000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj')
    assert.deepEqual(g.candidates.map(c => c.id), ['new', 'mid', 'old'])
  })

  it('updatedAt undefined 排末位', () => {
    const rows = [
      row('no-ts', { cwd: '/proj', updatedAt: undefined }),
      row('has-ts', { cwd: '/proj', updatedAt: 1000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj')
    assert.deepEqual(g.candidates.map(c => c.id), ['has-ts', 'no-ts'])
  })

  it('亲缘计数——子代理按 parentId 链归属', () => {
    // R1 → R1s（子代理），cwd 相同
    const rows = [
      row('R1', { cwd: '/proj-a', updatedAt: 1000 }),
      row('R1s', { origin: 'subagent', cwd: '/proj-a', parentId: 'R1' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj-a')
    assert.equal(g.subagentCount, 1)
    assert.equal(g.candidates[0].subagentCount, 1)
  })

  it('亲缘计数——同一组多个候选各自计亲缘子代理', () => {
    // R1 → A1；R2 无子代理。R1 +1、R2 0、组 {m}=1
    const rows = [
      row('R1', { cwd: '/proj-a', updatedAt: 2000 }),
      row('A1', { origin: 'subagent', cwd: '/proj-a', parentId: 'R1' }),
      row('R2', { cwd: '/proj-a', updatedAt: 1000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj-a')
    assert.equal(g.subagentCount, 1)
    // R1 (更新) before R2
    const r1 = g.candidates.find(c => c.id === 'R1')
    const r2 = g.candidates.find(c => c.id === 'R2')
    assert.equal(r1.subagentCount, 1)
    assert.equal(r2.subagentCount, 0)
  })

  it('亲缘——不按 cwd 字符串聚拢子代理（同目录别人家的不算）', () => {
    // R1 和 R3 同 cwd，但子代理 A1 的 parentId 是 R1——R3 不应沾光
    const rows = [
      row('R1', { cwd: '/proj-a', updatedAt: 1000 }),
      row('A1', { origin: 'subagent', cwd: '/proj-a', parentId: 'R1' }),
      row('R3', { cwd: '/proj-a', updatedAt: 500 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj-a')
    const r3 = g.candidates.find(c => c.id === 'R3')
    assert.equal(r3.subagentCount, 0)
    assert.equal(g.subagentCount, 1) // 只有 A1
  })

  it('亲缘——子代理 cwd 与父不同仍被亲缘计入（A2 形状）', () => {
    const rows = [
      row('P', { cwd: '/a', updatedAt: 1000 }),
      row('A2', { origin: 'subagent', cwd: '/b', parentId: 'P' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/a')
    assert.equal(g.candidates[0].subagentCount, 1) // P→A2 走 parentId，不受 cwd 影响
    assert.equal(g.subagentCount, 1)
  })

  it('F1 fork 截断——fork 不进起源会话的亲缘计数', () => {
    // P1（起源）→ A1, A2（子代理），P4（fork，有 parentId=P1、origin≠subagent）→ D1（子代理）
    // P1 亲缘只数 A1+A2=2，不含 P4/D1；P4 亲缘只数 D1=1
    const rows = [
      row('P1', { cwd: '/proj', updatedAt: 3000 }),
      row('A1', { origin: 'subagent', cwd: '/proj', parentId: 'P1' }),
      row('A2', { origin: 'subagent', cwd: '/proj', parentId: 'P1' }),
      row('P4', { cwd: '/proj', updatedAt: 2000, parentId: 'P1' }), // fork: 非 subagent
      row('D1', { origin: 'subagent', cwd: '/proj', parentId: 'P4' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj')
    // 组级 {m}=3（P1 亲缘 A1+A2=2，P4 亲缘 D1=1）
    assert.equal(g.subagentCount, 3)
    const p1 = g.candidates.find(c => c.id === 'P1')
    const p4 = g.candidates.find(c => c.id === 'P4')
    assert.equal(p1.subagentCount, 2, 'P1 亲缘 = A1 + A2，不含 P4/D1')
    assert.equal(p4.subagentCount, 1, 'P4 亲缘 = D1')
  })

  it('F1 fork 截断——fork 子代理不重计到起源', () => {
    // 简化版：起源 P1 → fork P4 → 子代理 D1。P1 亲缘=0（D1 挂在 P4 下，非 P1 亲缘）
    const rows = [
      row('P1', { cwd: '/proj', updatedAt: 3000 }),
      row('P4', { cwd: '/proj', updatedAt: 2000, parentId: 'P1' }),
      row('D1', { origin: 'subagent', cwd: '/proj', parentId: 'P4' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj')
    assert.equal(g.subagentCount, 1)
    const p1 = g.candidates.find(c => c.id === 'P1')
    const p4 = g.candidates.find(c => c.id === 'P4')
    assert.equal(p1.subagentCount, 0, 'P1 没有直接子代理，D1 是 P4 的')
    assert.equal(p4.subagentCount, 1)
  })

  it('多层嵌套亲缘——统计所有后代', () => {
    // P → A → B（A=cwd 同父，B=cwd 不同）。P 亲缘=2（A+B）
    const rows = [
      row('P', { cwd: '/proj', updatedAt: 1000 }),
      row('A', { origin: 'subagent', cwd: '/proj', parentId: 'P' }),
      row('B', { origin: 'subagent', cwd: '/other', parentId: 'A' }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    const g = map.get('/proj')
    assert.equal(g.candidates[0].subagentCount, 2) // P→A→B
    assert.equal(g.subagentCount, 2)
  })

  it('多个工作区分组——各自独立', () => {
    const rows = [
      row('a', { cwd: '/proj-a', updatedAt: 1000 }),
      row('b', { cwd: '/proj-b', updatedAt: 2000 }),
    ]
    const map = computeRecallCandidates(rows, new Set())
    assert.equal(map.size, 2)
    assert.equal(map.get('/proj-a').candidates.length, 1)
    assert.equal(map.get('/proj-b').candidates.length, 1)
  })

  it('部分分组——mixed groupedIds', () => {
    const rows = [
      row('grouped', { cwd: '/proj', updatedAt: 1000 }),
      row('free', { cwd: '/proj', updatedAt: 2000 }),
    ]
    const map = computeRecallCandidates(rows, new Set(['grouped']))
    const g = map.get('/proj')
    assert.equal(g.candidates.length, 1)
    assert.equal(g.candidates[0].id, 'free')
  })
})