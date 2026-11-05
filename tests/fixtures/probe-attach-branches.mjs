/**
 * attachSession 失败分支判定表——按 deepseek-harness `packages/workspace/workspace/src/entity.ts:110-146`
 * 的四道校验逐条复现，用来决定「召回失败组」语料要造哪些形状（只在沙箱容器内跑）。
 *
 * 权威顺序（entity.ts attachSession）：
 *   1) `header.cwd === undefined`            → throw「carries no cwd to validate against」
 *   2) `realpathNormalize(header.cwd)` 抛错  → throw「does not resolve, so it cannot be validated」
 *   3) `!(await stat(cwd)).isDirectory()`    → throw「is not a directory」
 *   4) `cwd !== this.record.path`            → throw「its cwd resolves to '<cwd>'」
 *   5) `mutate(...)` 写 workspace.json 失败   → 存储在 DSH_HOME，不在项目目录
 * 关键事实：**全程不写 header.cwd 指向的目录**——所以目录权限（chmod 555）不参与判定。
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = '/tmp/attach-probe'
await fs.rm(ROOT, { recursive: true, force: true })
await fs.mkdir(ROOT, { recursive: true })

/** 造出各种形状，返回 [名字, 会话 header 里的 cwd 字符串, 工作区 record.path]。 */
const shapes = []
const mk = async (name, cwd, recordPath, build) => { await build(); shapes.push({ name, cwd, recordPath }) }

await mk('ok-dir（对照，755）', `${ROOT}/ok`, `${ROOT}/ok`, async () => { await fs.mkdir(`${ROOT}/ok`, { recursive: true }) })
await mk('ro-dir（chmod 555）', `${ROOT}/ro`, `${ROOT}/ro`, async () => {
  await fs.mkdir(`${ROOT}/ro`, { recursive: true })
  await fs.chmod(`${ROOT}/ro`, 0o555)
})
await mk('regular-file（路径是普通文件）', `${ROOT}/file`, `${ROOT}/file`, async () => { await fs.writeFile(`${ROOT}/file`, 'x') })
await mk('deleted（目录已删）', `${ROOT}/gone`, `${ROOT}/gone`, async () => {
  await fs.mkdir(`${ROOT}/gone`, { recursive: true })
  await fs.rm(`${ROOT}/gone`, { recursive: true, force: true })
})
await mk('dangling-symlink（悬空链接）', `${ROOT}/link`, `${ROOT}/link`, async () => {
  await fs.symlink(`${ROOT}/no-such-target`, `${ROOT}/link`)
})
await mk('symlink-loop（链接环）', `${ROOT}/loop`, `${ROOT}/loop`, async () => {
  await fs.symlink(`${ROOT}/loop-b`, `${ROOT}/loop`)
  await fs.symlink(`${ROOT}/loop`, `${ROOT}/loop-b`)
})
await mk('symlink-to-other-dir（链接指向别的真实目录）', `${ROOT}/via`, `${ROOT}/via`, async () => {
  await fs.mkdir(`${ROOT}/real-target`, { recursive: true })
  await fs.symlink(`${ROOT}/real-target`, `${ROOT}/via`)
})
await mk('subdir-of-workspace（工作区的子目录）', `${ROOT}/ok/sub`, `${ROOT}/ok`, async () => {
  await fs.mkdir(`${ROOT}/ok/sub`, { recursive: true })
})

/** 复现 entity.ts 的四道校验，返回命中的分支。 */
async function branchOf(cwd, recordPath) {
  let canonical
  try {
    canonical = await fs.realpath(cwd)   // realpathNormalize 的核心
  } catch (error) {
    return { branch: 2, message: `does not resolve, so it cannot be validated（${error.code}）` }
  }
  let st
  try {
    st = await fs.stat(canonical)
  } catch (error) {
    return { branch: '2/3', message: `stat 失败（${error.code}）` }
  }
  if (!st.isDirectory()) return { branch: 3, message: 'is not a directory' }
  if (canonical !== recordPath) return { branch: 4, message: `its cwd resolves to '${canonical}'` }
  return { branch: 0, message: '校验全过 → attach 成功（写 workspace.json）' }
}

const out = []
for (const s of shapes) {
  const r = await branchOf(s.cwd, s.recordPath)
  // 额外实测：这个形状下能否往目录里写（验证「root 绕过 555」与「attach 不需要写权限」）
  let writeProbe = 'n/a'
  try {
    await fs.writeFile(path.join(s.cwd, '.probe'), 'x')
    writeProbe = 'WRITE_OK'
  } catch (error) { writeProbe = `WRITE_FAIL(${error.code})` }
  out.push({ shape: s.name, cwd: s.cwd, recordPath: s.recordPath, branch: r.branch, attachMessage: r.message, writeProbe })
}
console.log(JSON.stringify({ uid: process.getuid(), results: out }, null, 2))
await fs.rm(ROOT, { recursive: true, force: true })
