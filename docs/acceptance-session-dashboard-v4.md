# 会话看板 v0.2 GUI 验收清单（v4）· 2026-11-05

分两段交付（项目经理 2026-11-05 拍板）：

- **A/B 段（本清单 §1–§2）现在就可验**：两档过滤、树形展开折叠、压平、子代理纯展示、项目列、Δ=0、fork 同权、归档/删除级联。对应你报的问题 1–4。
- **C 段（召回，问题 5）延后**：复验抓到 P0（召回链路在 GUI 里触发不了，见 §4 D29/D30），修复 + 语料重造后单独交验。§3 是 C 段的验收底稿与已完成的路由级实测。

预期值来源：`tests/fixtures/make-v4-corpus.mjs` 生成的 manifest（`/tmp/v4-corpus.json`）+ 测试工程师独立复核（`tests/fixtures/verify-v4-corpus.mjs`，`problems: []`）。所有数字由脚本从真实语料算出，不是人推。

---

## 0. 开验闸门

### 0.1 沙箱现状（2026-11-05 21:47 换装重启后取证）

| 项 | 值 | 取证 |
|---|---|---|
| 容器 / DSH 版本 | `dsh-dev` / `@deepseek-ai/dsh@0.2.2-alpha.2` | `./dsh-dev.sh status`、容器内 package.json |
| 插件安装方式 | link（`/root/.dsh/profiles/dev/package.json`） | 版本号区分不了构建，**认 md5** |
| `/stats` 行数 | **24** = 21 条语料 + 3 条真实 GUI 操作产生的零轮次空壳 | `curl -H 'x-dsh-session-batch-manager: 1' …/v1/stats` |
| 3 条空壳 | `session-fc175f0c…`(cwd v4-proj-a)、`session-2b310527…`(v4-edge)、`session-f990d137…`(v4-proj-b)；各 3 个 setup 事件、title=null、**projcache `blank=true`** | projcache `record.rows.sessionListMetadata.val.blank` |
| 账本 | 4 个工作区：v4-proj-a(成员 5=空壳+P1/P2/P3/P4)、v4-edge(1=空壳)、v4-proj-b(1=空壳)、**v4-recall-a(0，21:00 由 GUI 创建)**；`archivedSessionIds` 1 条 = `session-41cd93f5…`（**不在语料**，live 墓碑形态） | `/root/.dsh/storages/workspace.json` |
| 对判据的影响 | 空壳全是 blank → 看板/侧栏都不可见 → **9 根 / 折叠 9 / 展开 17 / chips 9·0 / Δ=0 / 行集 18 全部不变**；但「`/stats`=21」失效，改判「21 条语料 id 全在 + 额外行必须全是 blank 空壳」 | 实测复核 |
| **判据取证口径修正** | `/stats` 载荷**没有 `blank` 字段**（实测 24 行全 undefined）→「额外行是 blank」只能从 projcache 取证，不能靠 `/stats` | 2026-11-05 实测 |
| 召回场景已消耗 | v4-recall-a 已注册 → 横幅 diff 恒空，**C 段第 1–6 条在此沙箱验不了**，须重造 | 账本取证 |

### 0.2 开验三步

```sh
cd dev-dsh && ./dsh-dev.sh status      # 复制输出里的 GUI 链接（一次性 token；21:47 重启后旧链接作废）
md5 -q ../dsh-session-batch-manager/lib/client.js ../dsh-session-batch-manager/lib/host/index.js
```

A/B 段基线产物：`lib/client.js` = `03148490b615e5e1a758989e585ddc92`、`lib/host/index.js` = `402fe40dd9e2f9cc3b15319f86ed10aa`（50/50 pass、tsc 0）。
**注意**：程序员正在修 C 段 P0，`lib/client.js` 会再变（只动召回链路，A/B 判据不受影响）；**但重启沙箱会作废用户手上的一次性 token**，故 P0 修完后不要立刻 restart，等 A/B 验完由测试工程师统一「重造语料 + 重启」。

---

## 1. A/B 段 · 逐行预期可见性表（主会话档，当前沙箱 24 行语料态）

**树根恰好 9 行**（顺序不判）：

| # | 标题（用户可见） | 项目列 | 徽标 N | 展开后子行（depth 恒 1） |
|---|---|---|---|---|
| 1 | 验收 A · 主会话 | v4-proj-a | **2** | 子代理 A1 · 检索；子代理 A2 · 实现 |
| 2 | 验收 B · 主会话 | v4-proj-a | **2** | 子代理 B1 · 分析；孙代理 B1a · 校验 |
| 3 | 验收 C · 主会话 | v4-proj-a | **2** | 子代理 C1 · 待显式归档；子代理 C2 · 血统归档对照 |
| 4 | 验收 D · fork 会话 | v4-proj-a | **1** | 子代理 D1 · fork 名下 |
| 5 | 验收 E · 对照主会话 | v4-proj-b | 无 | — |
| 6 | 召回 R1 · 待回项目空间 | v4-recall-a | **1** | 子代理 R1s · 随主会话归位 |
| 7 | 召回 R2 · 待回项目空间 | v4-recall-a | 无 | — |
| 8 | 召回 R3 · 目录已删 | v4-recall-b | 无 | — |
| 9 | `session-b81c74a1-9b6a-43e1-b534-06846e27acdc`（Z2：无标题 → 回落全 id） | v4-edge | 无 | — |

- chips：**主会话 9 / 已归档 0**（账本里那条语料外墓碑 `session-41cd93f5…` 磁盘上不存在 → 不成行、不进 chips，属正常）。
- 折叠可见 **9 行**；全部展开 **17 行**（9 根 + 8 子行 = 11 条子代理 − Z3(blank) − E3(孤儿) − E2(stats-only)）。
- 行集 **18**（17 可见 + Z3 虽不发射但…… 不，行集口径 = join 后发射的行 = 17；18 是「ids ∪ 可达子代理 − blank」的中间集合，含 Z3 之前的一层。用户只判 17/9）。

**不得出现（四条排除判据）**：

| 行 | 原因 |
|---|---|
| 边界 E2 · 无 cwd 孤儿子代理 | **D10 本体**：∉ Host `list.ids` 的 stats-only 行在 join 层丢弃（`list.ts:149` 侧栏结构上也不可能显示） |
| 边界 E3 · 父已删除的孤儿子代理 | §13.3 孤儿子代理不发射——与 DSH `lineage.ts` 的 degrade-to-root 是**有意分歧**，契约测试已钉 |
| 3 条 GUI 空壳（无标题、零轮次） | `blank=true` → 看板与侧栏同时隐藏（裁决一：看板口径 = 至少一轮对话） |
| Z1 / Z3（语料内零轮次） | 同上；Z3 还**不得计入 P1 的徽标**（P1 名下 3 条子代理，徽标必须是 2） |

**Z2 必须可见**（唯一 cold-fallback 行）：故意不写 projcache → 宿主 `?? false` 保守可见、侧栏同样可见。不许「顺手排除」，那会制造看板≠侧栏的新 Δ。真实桌面数据 0/114 例，此行只为兜底路径而设。

---

## 2. A/B 段 · 用户验收步骤（8 步，可逆的排前面）

1. **两档 + 树根清单**：主会话档对照 §1 表核 9 行、徽标、项目列；「已归档」档应为空（chips 0）。
2. **压平（问题 3）**：「孙代理 B1a · 校验」必须**直接挂在「验收 B · 主会话」下、只一层缩进**、DFS 先序紧跟 B1；不得出现第三层。
3. **子代理纯展示（问题 4）**：8 条子行**都没有 checkbox**、点击不选中；表头全选只选 9 个主会话行；子行带「↳ 所属主会话」小字；**A2 的项目列显示 v4-proj-a**（树级值，不是它自己的 v4-proj-b）。
4. **Δ=0（问题 1 本体）**：侧栏可见主会话数 = 看板树根数 = **9**。侧栏：v4-proj-a 组内 4 条（验收 A/B/C/D）+ 未分组 5 条（验收 E、召回 R1、召回 R2、召回 R3、无标题 id 那条）；侧栏不出现任何子代理、不出现 3 条空壳。
5. **fork 同权（终裁）**：「验收 D · fork 会话」是**独立树根**、depth 0 不缩进、有 checkbox、可单独勾选/归档/恢复/删除；不在「验收 A」子树里；A 的徽标是 2（不含 D/D1）。
6. **三步归档（可逆）**：① 展开「验收 C」，对子行 C1 行级归档 → C1 显式归档：子树内显示归档徽标 + 行级恢复**可点**（§13.4 存量例外）；② 勾选「验收 C」→ 归档 → 整树进已归档档（C+C1+C2），chips **8/1**；③ 已归档档点 C 的行级恢复 → C+C2 回主会话档、chips 回 **9/0**，**C1 仍留已归档档**，且 C2 在 C 子树内为血统归档 → 置灰 + Tooltip 点名 C1。（若 ① 找不到子行归档入口 → 记问题，说明存量例外分支没落地。）
7. **fork 级联截断（可逆）**：勾选「验收 A」→ 归档 → A+A1+A2 进已归档档（chips 8/1），**「验收 D」仍在主会话档、不置灰**；恢复 A → 9/0，D 全程未动。再勾选「验收 D」→ 归档 → 它作为**独立根行**进已归档档、有**自己的**恢复入口，D1 随它置灰（Tooltip 点名 D）；恢复。
8. **删除级联（不可逆，最后做）**：勾选「验收 A」→ 删除 → **先看确认文案**：点名 A + **2 个子代理**，不含「验收 D」/D1。执行后 A/A1/A2 消失、D 仍是树根、D1 仍挂它、树根变 **8**；`/stats` 24 → **21**（测试工程师可代核）。做完这步语料即废，随后重造。
   - **设计内残留（不算缺陷）**：A 名下的零轮次子代理 Z3 不被发射 → 不在客户端级联集合 → 删除后留在磁盘上永久不可见。产品经理 2026-11-05 裁 (a)：接受 + 文档化；(b)「把未发射的血统子代理纳入删除集」记为在案产品选项、不进 0.2.0。若将来实现 (b)，判据改 21 → 20 且确认文案口径同步。

---

## 3. C 段（召回）· 延后验收底稿

### 3.1 §16.7 九条映射与当前状态

| # | 验收项 | 路由级（已实测） | GUI 级 |
|---|---|---|---|
| 1 | 横幅触发（新工作区命中未分组会话，含 `{name}`/`{n}`/`{m}`） | — | **阻塞**：D29/D30（P0）+ 沙箱 v4-recall-a 已注册 |
| 2 | 忽略（本次应用会话内不再弹；页面刷新会重置——已文档化） | — | 阻塞同上 |
| 3 | 清单默认全选 + 四列 + 排序降序 | — | 阻塞同上 |
| 4 | 部分召回（反选后只召回选中） | — | 阻塞同上 |
| 5 | 执行反馈（全成功 6s / 有失败 15s + 明细） | — | 阻塞同上（D12 已修，待 GUI 复核） |
| 6 | 失败明细逐条点名（标题 + 本地化标签 + 宿主原文） | ✅ 五种 code 全部可达且文案正确 | 阻塞同上 |
| 7 | 信任栅栏 403 / 405 / 400 三形状 | ✅ 实测通过 | 无需 GUI |
| 8 | 窄窗 <760px（时间列与 cwd 列隐藏、cwd 并入标题第二行、☑ 44px） | — | 待验（CSS 已落，`@media (max-width:759px)` 三条规则实测在源码） |
| 9 | 幂等重试（同一批重复提交） | **未跑**（刻意跳过成功路径，避免污染账本） | 待重造后验 |

### 3.2 路由级实测记录（2026-11-05 21:5x，构建 host `402fe40d…`）

| 探针 | 实测 |
|---|---|
| `GET` / `OPTIONS`(正确头) / `POST` 无头 / 头值 `0` | 405 / 403 / 403 `untrusted-origin` / 403 |
| 缺 cwd / 空 ids / 非法 JSON | 400，三条文案各自正确（上限 200） |
| cwd=存在但未注册（临时 `/root/v4-probe-unreg`，探完 rmdir） | **400 `{"error":"not-found","message":"未找到工作区：…"}`，未创建工作区**（D21 ✓） |
| cwd=已物理删除 `/root/v4-recall-b` + [R3] | **200 + per-row `code:"cwd-unresolvable"`**，message 带宿主 ENOENT 原文（D13 ✓；旧构建此处是整批 400） |
| cwd=`/root/v4-proj-a` + [E2] / [T1] / [R3] | `no-cwd` / `cwd-mismatch` / `cwd-unresolvable`（三码全可达） |
| cwd=`/root/v4-proj-a` + [格式合法的不存在 id] | `attach-failed`「session persistence holds no such session」 |
| 混合批 [E2, T1, bogus] | 200，三条各自失败、**互不阻塞** |
| 探针前后账本 | **逐字未变**（4 工作区 / 成员 5-1-1-0 / archived 1）；`/stats` 24 行 0 错误 → 零写入 |

### 3.3 死夹具组（GUI 不可达，改由判定表脚本 + curl 覆盖）

`tests/fixtures/probe-attach-branches.mjs` 复现 `entity.ts:110-146` 的四道校验，实测判定表（容器 uid=0、CapEff `00000000a80425fb`）：

| 形态 | 分支 | 结论 |
|---|---|---|
| 755 目录 | 0 | 正常 |
| **`chmod 555` 目录** | 0 且 `WRITE_OK` | **死夹具**——attach 不写 cwd（写的是 `~/.dsh/storages` 工作区表），不可写目录照样挂账成功，永远变不出失败 |
| 普通文件 | 3「is not a directory」 | `WRITE_FAIL(ENOTDIR)` |
| 已删目录 | 2 ENOENT | — |
| 悬空符号链接 | 2 ENOENT | — |
| 符号链接环 | 2 ELOOP | — |
| 链接指向别处 | 4「resolves to '…'」 | — |
| 工作区子目录 | 4 | — |

故语料**不造** W1(chmod 555)/W2(悬空链接)/W3(子目录)/W4(symlink→同目录) 四行：注册制 + 客户端裸串匹配下 GUI 全部不可达。桌面真实语料扫描（112 条会话、8 个唯一 cwd）实测 **0 条 symlink、0 条不可解析、0 条非目录、0 条无 cwd** → 这些形态在真实数据里也不存在。

### 3.4 重造流程（P0 修完后一次性执行）

```sh
export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
# 1) purge 上一轮 id 的 projcache（容器内）；2) 跑生成器（默认 FIXTURE_WIPE=1，先备份到 /tmp/v4-corpus-backup-<NOW>）
node tests/fixtures/make-v4-corpus.mjs
# 3) 删中间备份，只留最早那份 pre-v4 备份；4) 重启并轮询 /stats 至 complete:true（首次调用会返回 complete:false，6–20s 后才 ready）
cd ../dev-dsh && ./dsh-dev.sh restart
# 5) 独立复核，要 problems: []
docker cp /tmp/stats-now.json dsh-dev:/tmp/stats-now.json
node tests/fixtures/verify-v4-corpus.mjs /tmp/stats-now.json
```

复核覆盖：manifest ⇄ 日志 header ⇄ projcache ⇄ workspace.json ⇄ `/stats` 五方交叉核对（21 目录=21 行、header 九字段全等、`_no-cwd` 恰 1 条、`blank=true` 恰 Z1+Z3、Z2 无 projcache 记录文件——实证「a listing never seeds a fold」）。

---

## 4. 缺陷登记表（D10 起；D1–D9 见 v3 清单 §0.4）

| 编号 | 级别 | 描述 | 状态（2026-11-05 22:0x） |
|---|---|---|---|
| D10 | P0 | 看板行集取自 `/stats`（零过滤）而非 Host list；无 cwd 的 stats-only 行照样显示并被误判为主会话 | **已修**（A1 行集翻转，join 以 `ids` 为基准）；判据 = E2 不发射 |
| D11 | P1（测试资产） | v3 语料含无 cwd + 零轮次行，导致「侧栏 vs 看板」行数核对不可能成立 | **已修**（v4 语料 21 行，Δ=0 可判） |
| D12 | P0 | `doRecall` 不检查 `res.ok`：整批 400 被渲染成绿色「已召回 0 个会话」 | **已修**（`!res.ok` 独立分支 + 逐条 `titleOf`）；残留见 D24 |
| D13 | P1 | 目录已删时宿主整批 400，规格承诺的「逐条点名」在 GUI 不可达 | **已修**（`resolveByPath` 抛错 → 200 + per-row `cwd-unresolvable`），路由实测通过 |
| D14 | P1 | 横幅 `{m}` 与行级 `+N` 按 cwd 字符串聚拢计数、且组级值累加错（R2 也显示 `+1`） | **已修**（改 parentId 亲缘链、组级/行级分开）；截断问题另见 F1 |
| D15 | P1 | §16.2 像素级规格大面积未落地（截断/Tooltip、时间格式、<760px、底部操作条、焦点、排序） | **已修**（含 F4/F5 收尾） |
| D17 | P2 | 召回候选派生内联在组件 `useMemo`、不可单测 | **已修**（抽 `src/client/dashboard-recall.ts` 纯函数） |
| D18 | P2 | 失败明细点名用裸 id（违反 §12 规则一与 D9 先例） | **已修**（`titleOf()`） |
| D19 | — | 5 个召回失败 code 无 `notice.code.*` 条目 → 中英混排 | **已修**（5 键中英双语；zh 文案对齐见 F3） |
| D20 | P2 | `dash.recall.failureDetail` 死键（零消费） | **已修**（删键） |
| D21 | P2 | 路由在 `resolveByPath` 未命中时 `registry.create(cwd)` → 可凭空注册任意路径为工作区 | **已修**（未命中直接 400 `not-found`，实测零创建）；注释残留见 D27 |
| D22/F2 | 闸门阻断 | `dash.recall.execute` 成死键 + 多出第 12 键 `executeK` | **已修**（合并回 `execute` 带 `{k}`，键数回 11） |
| D23/F3 | 闸门阻断 | 5 个 `notice.code.*` zh 文案与 ui §16.5 对账表不符（5/5），且中文里夹英文 token「cwd」 | **已修**（逐字对齐 §16.5，en `attach-failed` 同步） |
| D24 | P2 | `!res.ok` 分支把 code 硬写 `'cwd-unresolvable'` → D21 的 400 `not-found` 被贴错标签 | **待修**（建议透传 `body.error`，`notice.code.not-found` 字典已有） |
| D25 | P1 | 召回全链路**零自动化测试**：两轮修复测试数都停在 50，`grep -rl "computeRecallCandidates\|handleRecall" tests/` 零命中 | **待修**（建议 `tests/dashboard-recall.test.mjs` + host 路由测；判据见 §3.1/§2 F1） |
| D26/F1 | P1 | 亲缘计数未在非 subagent 行截断：fork 自身被计进起源会话 `+N` 与横幅 `{m}`（实测 P1 `+4` 应 `+2`、`{m}=5` 应 3）；v4 语料盖不住 | **已修**（`childrenOf` 只装 subagent、`countDescendants` 只遍历 subagent）；探针复验 P1 `+2`/P4 `+1`/`{m}=3` ✓ |
| D27 | P3 | `handleRecall` 文档注释仍写「按 cwd 查找或**创建**工作区」，与 D21 决定矛盾 | **待修**（改注释） |
| D28 | P3 | `invalid-id` 分支不可达：`validSessionId`(index.ts:233-238) 只校验类型/长度/控制字符与斜杠，实测 `"not-an-id"` 也通过 → 走 attach → `attach-failed` | **待裁**（加格式校验，或删分支 + 注释说明 `attach-failed` 已覆盖） |
| **D29** | **P0** | **`workspaces.items` 在 DSH 里不存在**：`IWorkspaces` 只有 `list`（service.ts，`grep items` 零命中）；`items`/`phase` 是 **list 快照的属性**（model.ts:33-41/354）。插件 `?.` + 回落把它静音 → `workspaceItems` 恒 `[]`、`wsPhase` 恒 `'pending'` → baseline 永不抓取 → **横幅永不出现**、`groupedIds` 恒 ∅（所有主会话都被当候选）、`enterRecallMode` 的 `find` 恒 undefined → **点也点不进去**。§16.7 第 1–9 条在 GUI 全部不可达 | **修复中**（改读 `workspaces.list` 快照单一源） |
| **D30** | **P0** | 字段名错：DSH `WorkspaceView` 是 **`workspaceId`**（types.ts:19），插件声明并读取 `item.id`（types.ts:64 + 面板五处）→ 恒 undefined，baseline Set 塞满 undefined、`find(w=>w.id===wsId)` 永不命中 | **修复中**（五处改 `workspaceId`、类型同步） |
| **D32** | **P0（阻断）** | `useSyncExternalStore(workspaces.list.subscribe, …)`（DashboardPanel.tsx:159-162）**未绑定 `this` 传原型方法**：DSH `service.ts:129` `this.list = model`（`ClientWorkspaceModel` 实例本体），`model.ts:334-337` `subscribe()` 是原型方法且用 `this.listeners`（:81），全文件 `grep bind(` 零命中 → React 在 passive effect 里裸调 → `TypeError: Cannot read properties of undefined (reading 'listeners')`（node 语义复现已实测）。**影响面不是召回**：`DashboardPanelSlot` 无条件渲染 `<DashboardPanel>`（index.tsx:131-140）、`if (!open) return null` 在 :486 位于所有 hooks 之后 → 面板关着也挂载订阅 → 插件 slot 一挂载即抛，可能整棵树白屏。插件自有 source 安全是因为 `store.ts:183` 是箭头属性 | **待修**（一行：`useCallback(cb => wsList.subscribe(cb), [wsList])`）。修好前**不得重启沙箱/刷新 GUI** |
| **D31** | P2 | D24 改透传 `body.error` 后 code 冲突：recall 的「工作区未注册」返回 `error:'not-found'`，而 `notice.code.not-found` 现文案是 delete 路由语义的**「未找到持久化日志」**（locales.ts:44/165）→ 明细自相矛盾 | **待修**（宿主改专属码 `workspace-not-found` + 新键，或客户端在 recall 分支映射） |
| F4 | P2 | 标题列 minWidth 120（规格 min 200） | **已修**（→200）；时间列 120 由产品设计核准并改文档 |
| F5 | P2 | 退出召回模式无焦点归还（键盘用户焦点掉 body） | **已修**（rAF → `bannerViewRef` → 回落 `.dsh-dash-close`） |

### 4.1 根因与防线（D29/D30 的教训）

`ctx.get('workspaces') as ClientWorkspacesLike` 这类**自定义接口 + 强转**会让 tsc 对宿主真实形状完全失效——类型成了橡皮图章。三道防线：

1. 复验清单加一条硬规则：客户端访问的每个 DSH 服务成员，必须在 DSH 源码里核 existence 与字段名（本轮已存进测试工程师记忆）。
2. D25 的契约测试：用 DSH `packages/test-support/client-runtime`（:268 就 provide 真 `workspaces`）跑一次组件级派生，成员不存在会当场炸。
3. 闸门脚本加「虚构成员」检查：`ClientWorkspacesLike`/`SessionsLike` 等 `*Like` 接口的每个成员名，必须能在 DSH 对应 `I*` 接口里找到同名成员。

### 4.2 已否决 / 不再提（避免重复讨论）

镜像 + 防漂移守卫式测试；`grep '<col'` 作列数判据；人推预期值（一律打印器从真实源码算）；实现进行中把沙箱换本地副本；「不论 blank 取值」；按 turns 键控（`/stats` 无 turns 字段）；给 fork 加任何可发现性提示（「派生」Tag 已裁不做）；W1–W4 四行死夹具。

---

## 5. 其他遗留（不阻断发版，记 issue）

- `buildTree` 的 dead 参数 `archivedSessionIds`（已加 JSDoc 注记）。
- `node --test tests/`（**目录**形式）1 fail（`test at tests:1:1 'test failed'`），glob 形式 50/50 全绿 → 复跑必须用 `npm test`；疑似 `tests/fixtures/` 下生成器被当测试执行。
- 宿主机 `/tmp/dsh-session-batch-snapshot-removed-20261103`（45M）发版收口后再删。
- 桌面 projcache 3 条孤儿（`session-31333299…`、`session-b0247c56…`、`session-ee267df7…`）不进本期。
- 预览裸 cwd 两侧去尾斜杠：**实现已做**（`DashboardPanel.tsx` 行侧/工作区侧 + `dashboard-recall.ts:67`），探针实测 `/root/v4-recall-a/` 与 `/root/v4-recall-a` 归为同组 → 架构师的可选加固已落地，无需再加语料行。

## 6. 验收结论（用户填）

| 段 | 结论 | 备注 |
|---|---|---|
| A/B（§2 八步） | 待填 | |
| C（§3，延后） | 待 P0 修复 + 语料重造 | |
