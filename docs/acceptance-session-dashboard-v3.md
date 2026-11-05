# 会话看板 · 树形结构与项目列（v0.2）GUI 验收清单（v3）· 2026-11-04

> **验收对象**：[design-session-dashboard.md](./design-session-dashboard.md) §11 + [ui-session-dashboard.md](./ui-session-dashboard.md) §15 的树形结构与项目列增量（含四档过滤的**有意语义变更**）。
> **依据**：ui §15.9 的 GUI 清单增量（底稿）+ 产品经理五块验收点（四档语义 / 树形行为 / 批量操作 / 项目列 / 回归）+ 六条细则（徽标=直接子数、chips=会话总数、全选=可见行、级联原子性、父子同勾去重、子行恢复置灰）。
> **P0/P1 分级为测试工程师拟定**，待产品经理确认（§10 待确认项 1）。
> **状态**：**D1–D9 与 P2 全部已修并复验通过**（2026-11-04 21:40 产物，md5 `619f03c8ca580ee06657e842e0eaadd5`，与 程序员 自报值一致）：闸门 **53/53 键已接**、**46 tests / 46 pass / 0 fail / 0 todo**、tsc exit 0、干跑四场景 × 三平面档一致、子代理档小字预期值由真实源码算出（§0.4.3）。design §12 两条全局不变量在代码库中**零违反**，并由 TC-18/19/20/21 四层守卫钉住（TC-20 已做变异测试）。**清单可交用户执行。**
> 上一轮（v0.1.1 标题回落 / blank 排除 / 默认主会话档 / 标题 Tooltip）的清单见 [acceptance-session-dashboard-v2.md](./acceptance-session-dashboard-v2.md)，其验收点在本文 §6 精简复验，不回退。

---

## 0. 环境与开验闸门

### 0.1 沙箱现状（2026-11-04 21:40 换装后核实）

- 容器 `dsh-dev`（healthy），GUI `http://127.0.0.1:13080`，token 一次性：`cd dev-dsh && ./dsh-dev.sh status` 取（当前 `8cCC2e_…`，**测试工程师全程未消耗**）
- profile 装的是**本地工作副本**（含 D1–D9 + P2 修复）：`dsh plugin --profile dev list` 显示 `dsh-session-batch-manager@link:…/dsh-session-batch-manager`（GitHub 条目已被 pnpm 取代，不是并存）；容器内 `lib/client.js` md5 = `619f03c8ca580ee06657e842e0eaadd5`（含 D7/D8/P2/D9），与我在宿主机**连续两次重建**的结果逐字节一致（host md5 `1928942aedfcb5cae88c5ab29cd0fe3e` 未变，本轮只动 client）
- 语料 **10 行**就位（§1）：`/stats` 的 **`sessions`** 数组长度 10、`complete:true`、`pending:0`、`degraded:false`。**字段名是 `sessions` 不是 `rows`**（写临时解析器时踩过，会误报「语料丢了」）；冷启动头 ~20s 会是 `sessions 0 / complete:false`，等一次轮询再看。语料在磁盘上，与插件版本无关，换装不动它
- 路由与栅栏复核：`/status` 200；旧路由 `/dsh-session-batch/v1/status` **404**；`POST /delete` 无自定义头 **403 `untrusted-origin`**、带 `Origin: http://evil.example` 同样 **403**（探针用不存在的 id，非破坏性）；`GET /stats` 跨源返回 **200 属设计**——栅栏 `isTrustedBatchRequest` 只挂在唯一的写路由 `handleDelete`（`src/host/index.ts:255`），读路由不设栅栏
- 本次启动日志里唯一一条 error 是 `@local/dsh-tdlc: cannot get property "services" without inject`（另一项目的插件，非本插件）。日志里那条 `startup failed: 1 required plugin did not activate` / `@local/dsh-session-batch resolves from multiple active Loader sources` 是 **11-02 11:32** 的历史记录（旧包名重复注册），与本轮无关
- `/status` 报 **`0.1.1`**——`package.json` 本轮还没 bump，所以**版本号区分不了 v0.1.1 与 v0.2**，只能靠 §0.3 闸门。发版时务必**先 bump 再构建**（`__PLUGIN_VERSION__` 是构建期注入，`d577ed7` 就是这个坑）

### 0.2 换成待验版本（必须）

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"   # 宿主机 PATH 里没有 node，否则 tsc/构建报 127
node scripts/build.mjs                                                                  # 构建必须在宿主机跑（容器内 esbuild 平台不匹配）
cd ../dev-dsh && ./dsh-dev.sh install-plugin /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
```

`install-plugin` 会自动重启。**重启后头 5~10 秒 `/stats` 可能返回 0 行 `complete:false`**（统计聚合器是内存缓存，冷启动），等一次轮询再看，不是缺陷。

发版后若要验「用户真实拿到的东西」，改走 GitHub 安装（同 v2 §0 流程）：`./dsh-dev.sh remove-plugin dsh-session-batch-manager` → `docker exec -w /Users/jiawen.guang/AI/my-deepseek-harness dsh-dev dsh plugin --profile dev add github:mars401/dsh-session-batch-manager` → `./dsh-dev.sh restart`。

### 0.3 闸门：确认待验产物含全部 UI 项

判据：`locales.ts` 里每个键定义 **2 次**（zh + en），渲染层每引用一次 **+1** → 产物里出现 **≥3 次 = 已接渲染**、**恰 2 次 = 只定义未用**。

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
for k in dash.col.project dash.tree.expand dash.tree.collapse dash.tree.childrenRunning \
         dash.parent.label dash.restore.row dash.restore.row.aria dash.restore.withParent \
         dash.restore.ancestorFirst dash.delete.cascade dash.delete.cascade.summary \
         dash.archive.cascade dash.cascade.blocked dash.noData; do
  n=$(grep -o "\"$k\"" lib/client.js | wc -l | tr -d ' ')
  [ "$n" -ge 3 ] && s="已接渲染" || s="仅定义未用 ← 对应验收块先别验"
  printf "%-30s %s  %s\n" "$k" "$n" "$s"
done
echo "三态勾选 indeterminate: $(grep -c 'indeterminate' lib/client.js)"
echo "树连接线 connector:     $(grep -c 'dsh-dash-tree-connector' lib/client.js)"
echo "项目列单元格:           $(grep -c 'dsh-dash-project-label' lib/client.js)"
echo "列数（应为 7）:         $(grep -o '"col", {' lib/client.js | wc -l | tr -d ' ')"
echo "表头数（应为 7）:       $(grep -o '"th", ' lib/client.js | wc -l | tr -d ' ')"
```

> 列数判据别写成 `grep '<col'`：JSX 编译后是 `(0, jsx)("col", {…})`，源码里的尖括号在产物中不存在（实测计数恒为 0，会把好产物判成坏的）。
> 顺带可对列宽（ui §15.1 的 ≥1080px 档）：`grep -o '"col", { style: { [^}]*} }' lib/client.js` 应见 40px / minWidth 200px / **160px（项目列）** / 100px / 120px / 240px，第七列（模型 180px）写法不同不被这条窄正则匹配，属正常。

**2026-11-04 20:27 产物实测**（`lib/client.js` md5 `9bda5d2184a7499762c4823ce30eedfa`；refs = 产物计数 − 2 处定义）：本轮 13 个新键 **12 个已接**，唯一 refs=0 的是 `dash.parent.label`（D5）。全库 53 个 `dash.*` 键中 52 个已接。

| 键 | refs | 状态 | 影响的验收块 |
|---|---|---|---|
| `dash.col.project` / `dash.tree.expand` / `dash.tree.collapse` | 1 / 1 / 1 | 已接 | §5 项目列 / §3 树形行为 |
| `dash.tree.childrenRunning` | 1 | 已接（sr-only aria）；Tooltip 未接（D6） | §3 折叠态运行点 |
| `dash.delete.cascade` / `.summary` / `dash.archive.cascade` / `dash.cascade.blocked` | 1 / 1 / 1 / 1 | 已接 | §4 级联文案 / §8 原子性拒绝 |
| `dash.restore.row` / `.aria` | 2 / 2 | 已接（可点 + 置灰两处按钮） | §7 行级恢复 |
| `dash.restore.withParent` | 1 | **静态已接、运行时不可达**（D2 死分支） | §7 2b 第 ① 类置灰 |
| `dash.restore.ancestorFirst` | 1 | 已接 | §7 2b 第 ② 类置灰 |
| `dash.parent.label` | **0** | **仅定义未用**（D5） | §4 小字 aria-label |
| `dash.noData` | 5 | 已接（五处「—」占位全补 sr-only ✓） | §5 / §6 |

其余探针：`"col", {`=**7**、`"th", `=**7**、`indeterminate`=6、`dsh-dash-tree-connector`=2、`dsh-dash-project-label`=3、`dsh-dash-sr-only`=8、`openOnClick`=**4**（项目 / Token / 缓存 / 上下文——项目列已补 ✓）、`onlyWhenClipped`=**2**（标题 + 模型，v0.1.1 回归不回退 ✓）、`displayTitle ??`=**0** ✓。

> **闸门的局限（本轮新学到）**：它数的是**静态引用次数**，数不出**死分支**。`dash.restore.withParent` refs=1 过了闸门，但它的取值条件 `row.archived === false` 与 `showRestore` 的前提 `row.archived === true` 互斥 → 运行时永远取不到（D2）。闸门只能证明「接上了」，不能证明「跑得通」；语义可达性得靠 §7 的 GUI 实测或单测兜。

### 0.4 本轮实现缺陷（2026-11-04 代码审计 + 真实源码干跑）

D1–D3 是 **P0 功能缺陷，修完再交用户**；D4–D6 是 P1。证据都来自真实源码，不是推导。

| # | 级别 | 缺陷 | 证据 / 规格 | 最小修法 |
|---|---|---|---|---|
| **D1** | **P0** | **平面档被折叠隐藏**：`DashboardPanel.tsx:143` 的 `displayRows = visibleRows(filteredRows, expanded)` 对四档一律套用，而平面档的行仍带 `buildTree` 给的 `depth`/`hasChildren` → 折叠父吃掉子行。实测（`print-tree-expectations.mjs` 平面档探针）：子代理档 chips **5** / 表格 **4**（丢孙代理 `cf9fe1b3`）；§7 步2 已归档档 chips **4** / 表格 **1**（只剩树根 P）。连带 `:338` `selectAll(displayRows…)` → 已归档档步2 全选只选 **1** 个（应 4）。平面档还因此带**缩进**（`indentPx = depth×16`）与**展开按钮**（`row.hasChildren && <button>`） | design §11.5 四档表：全部=**树形**，主会话/子代理/已归档=**平面**；§11.6「全选 = 当前档可见行」。单测 TC-15 / TC-17 已挂 todo 复现 | `filterDashboardRows` 的三个平面档返回 `{ …row, depth: 0, hasChildren: false }`——一处改动同时消掉「丢行 / 缩进 / 展开按钮」三个症状 |
| **D2** | **P0** | **血统归档行拿不到任何恢复按钮，`dash.restore.withParent` 是死代码**：`showRestore = filter === 'archived' && !hasError && row.archived` 要求**显式**归档，血统归档行（C2、G1，`archived=false`）根本不进恢复按钮分支；而 `restoreKey` 的 `withParent` 分支只在 `row.archived === false` 时取到 → 静态可达、运行时不可达 | ui §15.6 第 ① 类：血统归档子行须**置灰 + Tooltip「随祖先会话 {title} 恢复」**（`{title}` = 最近显式归档祖先） | `showRestore` 判据换成 `row.archived \|\| row.lineageArchived`（即 `effectiveArchived`） |
| **D3** | **P0** | **`restoreActive` 多了 `row.depth === 0` 条件**：C1 在 §7 步3（P 已恢复、C1 仍显式归档、`lineageArchived=false`、**depth=1**）→ `restoreActive=false` 且 `restoreDisabled=false` → **两种按钮都不渲染**，行级恢复入口消失（§7 3b「C1 变为可点」不成立）。用户仍可用操作条批量恢复，不是完全死路 | ui §15.6 可点条件只有「显式归档且无已归档祖先」，**没有 depth 条件** | 去掉 `&& row.depth === 0`（D1 的平面化也会让 depth 恒 0，两处都改最稳） |
| **D4** | P1 | **TC-14 被削弱成三条全文件级 `includes`**：`onlyWhenClipped` 模型列也有、`dsh-dash-session-title` 是类名字符串、`label={row.title}` 文件里任何位置出现就过 → 把标题的 Tooltip **整个删掉这三条照样全绿**；`openOnClick` 禁令被删（注释说「只检查标题附近的即可跳过」，但代码里没有任何「标题附近」的检查） | 上一轮 产品经理 拍板把 TC-14 从 todo 转正式断言，钉了五条 + 反向禁令 | **测试工程师已修**：锚点换成含降层三元表达式的整个 span，五条断言 + `openOnClick` 禁令（作用域限定在标题那一个开标签）全部恢复；另补 TC-16 钉五处 `dash.noData`。现 **42 tests / 40 pass / 0 fail / 2 todo** |
| **D5** | P1 | **§15.5 小字四项未落地**：`DashboardPanel.tsx:658` 是 `<span className="dsh-dash-parent-label">↳ {titleOf(row.parentId)}</span>`——① 孤儿走 `titleOf` 回落**完整 id**，不是短 id，也没有「恒可用 Tooltip 给父完整 id」；② 无 `aria-label`（这就是 `dash.parent.label` refs=**0** 的原因，自报 4）；③ 无 `onlyWhenClipped` Tooltip 给完整父标题；④ `styles.ts:531` 的 `.dsh-dash-parent-label` 缺 `max-width: 12em` + `overflow/text-overflow`（也无 `min-width:0`）→ 孤儿的完整 UUID 在 flex 行里不收缩，可能顶宽会话格 | ui §15.5 已按我报的缺陷**修正过规格**（「不可取裸 id 前 8 位……测试工程师干跑证据，2026-11-04 修正」）：保留 `session-` 前缀取其后 8 位 + 省略号；裸 UUID 取前 8 位；短 id 时 Tooltip 恒可用 | 按修正后的 §15.5 实现短 id + 两个 Tooltip + aria-label + CSS 截断 |
| **D6** | P1 | **运行点补了 aria、没补规格要求的 Tooltip**：`:612-615` 自身运行、`:623-626` 徽标运行点都只有 sr-only `role="img"` + `aria-label`，无外包 Tooltip。产物侧可验：`dash.badge.running` refs=1、`dash.tree.childrenRunning` refs=1（补了 Tooltip 应为 2） | ui §5.1「`role="img"` + `aria-label={t('dash.badge.running')}`，**外包 Tooltip（portal）同文案**」；§15.2 同款要求 | 两处各包一层 `<Tooltip portal label={同文案}>`。**aria 那半（产品经理 拍的 P0）已修好 ✓**，Tooltip 那半是否本期做请产品经理定 |

### 0.4.1 D1–D6 复验结论（2026-11-04 21:05 产物，md5 `76c33a7ceb86968878a95561053c1814`）

| # | 结论 | 独立取到的证据 |
|---|---|---|
| **D1** | ✅ 已修 | 干跑打印器的平面档探针：**四个场景 × 三个平面档全部「一致」**（基线子代理 chips 5 / 表格 5；§7 步2 已归档 chips 4 / 表格 4；全折叠与全展开都相等）。归一化只在 `filter !== 'all'` 分支执行，树形档未受影响（全部档仍 6→8→9→10）。`selectAll` 取 `displayRows`，计数随之自动修正 |
| **D2** | ✅ 已修 | `showRestore` 已含 `lineageArchived`（`:581`）、`restoreDisabled = showRestore && !restoreActive`（`:584`）→ 血统归档行（`archived=false`）落到 `restoreKey = withParent`，**运行时可达**。另核了一个边界：`:666` 的 `restoreDisabled && row.closestArchivedAncestorId` 附加条件不会漏按钮——`lineageArchived` 与 `closestArchivedAncestorId` 在同一次 DFS 里同步下传（`dashboard-tree.ts:102/104`），前者为真必然伴随后者非空 |
| **D3** | ✅ 已修 | `restoreActive = showRestore && row.archived && !row.lineageArchived`（`:583`），depth 条件已去掉；C1 在 §7 步3 可点 |
| **D4** | ✅ 已闭环 | TC-14 恢复强度后通过；TC-15/TC-17 去 todo 后**断言未被削弱**（两条 `deepEqual` 原样保留，只改了夹具：给父行加 `archived: true`） |
| **D5** | ⚠️ 部分 | `shortId` 与修正后的 §15.5 逐字对齐（`session-` 前缀 + uuid 前 8 位 + 省略号；裸 UUID 取前 8 位）；CSS 四项补齐；`dash.parent.label` refs **0→1** ✓。但 Tooltip 那半不符规格 → **D8**；父标题的来源另有 **D7** |
| **D6** | ✅ 已修 | 两处运行点各包 `<Tooltip portal label={t(…)}>`（`:627/:640`）；`dash.badge.running` 与 `dash.tree.childrenRunning` refs 均 **1→2**，正是 产品经理 给的判据。（自报的「refs 4」是**产物出现次数**，减掉 2 处定义才是 refs=2——判据达标，没有超标） |

**闸门复算**：**53 个 `dash.*` 键，0 个未接**（上一轮 52/53）。探针：`col`=7、`th`=7、`indeterminate`=6、`sr-only`=8、`parent-label`=2、`openOnClick`=4、`onlyWhenClipped`=2、`displayTitle ??`=0、`closestArchivedAncestorId`=7、`hasChildren: false`=1（D1 归一化）。**42 tests / 42 pass / 0 fail / 0 todo**，tsc exit 0。

**关于 `buildTree` 的 dead 参数**（程序员 提议记 issue，我同意，另加一条建议）：`archivedSessionIds` 形参在整个函数体里**从未被读取**，血统传播走 `row.archived`（`dashboard-tree.ts:102/104`）。**这不影响 §7 的预期值**——干跑打印器是经 `joinDashboardRows({ archivedSessionIds })` 填 `row.archived` 的（`dashboard-rows.ts:52` `archived: archived.has(stats.id)`），死的那条路没用上、活的那条是对的，四个场景的计数因此都成立。除记 issue 外，建议在 `buildTree` 的 JSDoc 补一句「`archivedSessionIds` 当前未消费，血统归档以 `row.archived` 为准」——否则下一个人照签名就会以为它有用（我这轮差点被它骗到，TC-15 的夹具最初就是这么写错的）。

### 0.4.2 复验中新发现的两条 P1（都在子代理档小字这一处）

| # | 级别 | 缺陷 | 证据 | 修法 |
|---|---|---|---|---|
| **D7** | P1（**建议本期修**） | **面板 `titleOf` 取 `displayTitle`，无标题会话会显示成文件夹名——用户上一轮报的「问题二」在新位置复现**。`DashboardPanel.tsx:76` 取 `row?.displayTitle`，而宿主 `displayTitleOf`（`deepseek-harness/packages/api/session-controller/src/client/sessions/service.ts:123`）的回落链是 **持久化 title → 项目目录 basename → id**。v0.1.1 正是为此在 `dashboard-rows.ts:91` 写了注释「不采信 `displayTitle`」，行标题改走 `title \|\| id`。本轮新增**两个行内可见面**消费面板的 `titleOf`：① 子代理档小字 `↳ {父标题}`（`:589-593`）② 恢复按钮置灰 Tooltip 的 `{title}`（`:667`）；既有的归档/删除确认与结果 notice 也用同一个函数（v0.1 就在，非本轮引入） | 无标题父会话在子代理档显示成 `↳ workspace`、notice 里说「将删除 workspace 及其 3 个子代理」。桌面真实语料有 3 条无标题主会话（`session-93ac64a6…`→`workspace`、`session-00818cbf…`→`AI`、`session-3e77360f…`→`Research`），它们一旦有子代理就撞上。**本沙箱语料的所有父会话都有标题，所以 GUI 上看不出来**——这条只能靠源码审计发现 | `titleOf` 改用 `row?.title \|\| id`（`types.ts:39` 已有 `title` 字段，注释明写「不经 displayTitle 的目录回落链」）。**连带陷阱**：`isOrphan = parentTitle === row.parentId`（`:590`）靠字符串相等判孤儿，改完后**无标题但存在的父会话**也返回 id → 会被误判成孤儿、显示短 id。孤儿判据必须同时换成**行集成员判定**（`byId[row.parentId] === undefined`） |
| **D8** | P1 | **子代理小字的 Tooltip 与 §15.5 不符**：实现（`:676`）恒可用且 label 恒为**父完整 id**；§15.5 要求两种情形分开——显示短 id 时「Tooltip **恒可用**给父完整 id」，其余情形「Tooltip `onlyWhenClipped` 完整**父标题**」。孤儿分支对了，非孤儿分支错了 | C1 的 `↳ 树形验收 · 父会话` 被 `max-width: 12em` 截断后，悬停看到的是 `session-8ca3549a-…` 而不是完整标题 | 一行：`label={isOrphan ? fullId : parentTitle}` + `onlyWhenClipped={!isOrphan}` |

> **观察（不判缺陷，P2，归 产品设计）**：`aria-label` 挂在裸 `<span>` 上（`:677`，无 role）——ARIA 对 generic 元素的作者命名不保证被读屏播报。规格 §15.5 就是这么写的，实现无过错；同文件运行点用的是 `role="img"` + sr-only span（有效做法）。要不要补 `role="note"` 或改 sr-only 前缀由设计定。

### 0.4.3 D7 / D8 / P2 复验结论（2026-11-04 21:26 产物，md5 `a511b759811cb08394d42c0a9b6d35b8`）

| # | 结论 | 独立取到的证据 |
|---|---|---|
| **D7** | ✅ 已修 | 面板 `titleOf`（`:74-79`）改取 `row?.title`，空串也回落 id；`TreeRow.parentTitle` 由 `buildTree` 从 `byId.get(parentId)?.title` 取（`dashboard-tree.ts:143`），**不经面板 `titleOf`**；孤儿判据 = `parentTitle === undefined`（`:592`），即行集成员判定，§12 规则二达标。新增 **TC-19** 行为钉：父在行集但无标题 → `parentTitle` 是回落后的 id（**不是** `undefined`，即不构成假孤儿）；父不在行集 → `undefined`；孤儿仍降根 `depth 0` |
| **D8** | ✅ 已修 | `:677` `label={parentDisplay.isOrphan ? parentDisplay.fullId : row.parentTitle!}` + `onlyWhenClipped={!parentDisplay.isOrphan}`——孤儿恒可用给父完整 id、非孤儿 `onlyWhenClipped` 给完整父标题，与 §15.5 两条逐项对齐；产物 `onlyWhenClipped` 2→**3** |
| **P2** | ✅ 已补 | `:678` `<span className="dsh-dash-parent-label" role="note" aria-label=…>`；产物 `role: "note"` **1** 处 |
| **TC-18** | ✅ 强度合格 | 锚 `titleOf` 函数体、**剔除注释后**禁 `displayTitle`、并要求出现 `row?.title`——双向钉住。第一版被自己的解释性注释命中（`// D7 修复：不采信 displayTitle…`），改成先去注释再判，这个处理是对的 |

**闸门复算**：53 个 `dash.*` 键 **0 个未接**；`dash.parent.label` refs **2**、`dash.badge.running` refs 2、`dash.tree.childrenRunning` refs 2、`parentTitle` ×5、`onlyWhenClipped` ×3、`displayTitle ??` ×0、`col`/`th` 各 7。**44 tests / 44 pass / 0 fail / 0 todo**（新增 TC-19），tsc exit 0。构建确定性：同一份 src 连续两次重建 md5 均 `a511b759811cb08394d42c0a9b6d35b8`。沙箱已换装到该产物（容器内 md5 一致、`role: "note"` 在、`/status` 200、`/stats` 10 条 session `complete:true`、`POST /delete` 栅栏 403、本次启动唯一 error 仍是无关的 `@local/dsh-tdlc`）。

> ⚠️ **提交前必须重建并核对 md5**：程序员 自报的 md5 是 `bab970ffaed714a245e3e8b3350e2a89`，**当前 src 构建不出这个值**（P2 那行改动落在 21:22:37，其自报的产物计数 `parentTitle=4` / `dash.parent.label=6` 也与现产物的 `5` / `4` 不符）——最可能是 P2 之后没重建就报了 md5。`lib/` 是**被 git 跟踪的产物**，若照旧值提交，仓库里就少一个 `role="note"`，重演 v0.1.1 那次「GUI 上验收的是旧产物」。发版流程固定成：**改完 src → `node scripts/build.mjs` → 核对 md5 → 提交**。

**§4 小字的 GUI 预期值**（干跑打印器新增输出，由真实源码算出，非人推）：

| 行 | 子代理档小字 | Tooltip |
|---|---|---|
| `9ccb3c70`（C1） | `↳ 树形验收 · 父会话` | 截断时给完整标题 |
| `cf9fe1b3`（G1） | `↳ 子代理 A · 检索资料` | 截断时给完整标题 |
| `5832e5c6`（C2） | `↳ 树形验收 · 父会话` | 截断时给完整标题 |
| `ba223092`（O，孤儿） | `↳ session-ded2d6c8…` | **恒可用**，给父完整 id |
| `4ee4b5eb`（SB） | `↳ 验收对照会话 1` | 截断时给完整标题 |

子代理档行序（DFS 序，平面档不重排）：**C1 → G1 → C2 → O → SB**。

### 0.4.4 D9（复验中新发现，P2，**范围待产品经理裁**）

`src/client/ops.ts:271-274` 还有一个**自己的** `titleOf`，仍取 `displayTitle`：

```ts
const titleOf = (sessionId: SessionIdString): string => {
  const title = sessions.list.getSnapshot().byId[sessionId]?.displayTitle
  return typeof title === 'string' && title !== '' ? title : sessionId
}
```

消费者是**侧栏**批量操作的失败/结果明细（`:128` 归档失败、`:157` 取消归档失败、`:210` / `:216` 删除结果）——侧栏 notice 里无标题会话仍会显示成**文件夹名**。这是 v0.1 就有的面、不是本轮引入，但 design §12 规则一写的是「**任何**渲染会话标题的面一律 `title || id`……新增面自动继承本规则」，而防漂移断言 TC-18 只扫面板文件：**§12 作为全局不变量，当前代码库里还剩一处违反，且守卫扫不到它。**

两条出路：**(a)** 一并修（同样一行：`?.displayTitle` → `?.title`），并把 TC-18 的扫描范围从「面板 `titleOf`」扩到「`src/client/` 下所有 `titleOf` 定义」；**(b)** 把 §12 的适用范围明确收窄到看板，并在文档里把侧栏 notice 记为已知负债 + 开 issue。**测试工程师倾向 (a)**：成本一行，而 (b) 会让刚立的全局规则第一天就带例外。
**裁决与落地（2026-11-04 21:40）**：产品经理 裁 **(a) 一并修**，已落地并复验通过——

- `src/client/ops.ts:271-274` 的 `titleOf` 改取 `?.title`，**空串兜底保留**（`typeof title === 'string' && title !== '' ? title : sessionId`）。产品经理 提醒的陷阱（`displayTitle` 链永不返回空、裸换成 `title` 会让 notice 出现空白会话名）被既有写法接住了，没踩
- `dashboard-tree.ts` 的 `buildTree` JSDoc 补了死参数注记（`archivedSessionIds` **当前未消费**，血统归档以 `row.archived` 为准）
- **design §12 规则一在代码库中零违反**：全库 `displayTitle` 只剩 8 处，其中 6 处是注释、2 处是 `types.ts` 的类型声明（宿主契约字段，形状必须与宿主一致），**运行时消费 0 处**
- **守卫三层**：① 程序员 把 TC-18 从「只扫面板」扩到「扫 `src/client/` 全部 `.ts/.tsx` 的每个 `titleOf` 定义」；② 测试工程师加 **TC-20**（产品经理 要的更狠那版：**不限函数名**，断言整个 `src/client` 运行时零 `displayTitle` 消费；`types.ts` 的类型声明豁免且数量钉死为 2，兼作净化器自检）；③ **TC-21**（两处 `titleOf` 都必须接住空串标题——`??` 只接 `undefined`/`null`；外加**防 TC-18 空转**：定义正则至少扫到 2 个 `titleOf`，形态一变就红，不允许「扫到 0 个 → 0 违反 → 通过」这种静默失效）
- **TC-20 做了变异测试**（守卫自身也得被验）：往一个**没有 `titleOf`** 的文件（`stats-client.ts`）注入一处 `s?.displayTitle` 消费 → TC-20 立刻红，而 TC-18 结构上抓不到这种；`git checkout` 还原后文件 md5 一致、46/46 全绿。净化器用**状态机**（code / 行注释 / 块注释 / 三种引号）而非正则删注释，且**保留字符串字面量**——下标写法 `row["displayTitle"]` 同样是运行时消费，不能因为去注释被吃掉；正则版会被字符串里的 `//`（URL、路由前缀）误伤
- 复验：44 → **46 tests / 46 pass / 0 fail / 0 todo**，tsc exit 0；同一份 src 连续两次重建 md5 均 **`619f03c8ca580ee06657e842e0eaadd5`**，**与 程序员 自报值一致**（这次先修后建，`bab970ff` 那次的口径问题没再出现）；沙箱已换装到该产物，token `8cCC2e_…` 未消耗


**已核对通过、不用返工的项**：构建确定性（我从同一份 src 连续两次重建，md5 均 `76c33a7ceb86968878a95561053c1814`；本轮我只动 `tests/` 与 `docs/`，未碰 `src/`）；产品设计的徽标裁决已落档且与实现一致（design §11.5「平面档规范化」条、ui §15.2「仅树形全部档渲染」）；七列 colgroup 与 §15.1 宽度；会话格元素顺序；连接线 `aria-hidden`；三态走 DOM `indeterminate`；项目列树级取值与「—」占位 + `openOnClick`；五处 `dash.noData` sr-only；`closestArchivedAncestorId` 字段——它正是 §15.6「Tooltip 动态点名**最近的显式归档祖先**」（产品经理 2026-11-04 拍板）需要的，把我上一轮报的「孙代场景文案指错层」解掉了 ✓。

---

## 1. 语料与预期对照表（沙箱当前 10 行）

| # | 角色 | 会话 id | 预期标题 | cwd | 父 | 出现在 | 项目列 | 子数徽标 |
|---|---|---|---|---|---|---|---|---|
| 1 | 父会话 P | `session-8ca3549a-7e68-4db2-ab5d-24510cca104b` | 树形验收 · 父会话 | `/root/tree-proj` | — | 全部（树根）、主会话 | `tree-proj` | **▸ 2** |
| 2 | 子代理 C1 | `9ccb3c70-1e39-44a3-b591-f0868f31e39f` | 子代理 A · 检索资料 | `/root/tree-proj` | P | 全部（P 下 depth 1）、子代理 | `tree-proj` | **▸ 1** |
| 3 | 子代理 C2 | `5832e5c6-2a04-4309-a9bb-27dfecb56864` | 子代理 B · 落地实现 | **`/root/other-proj`** | P | 全部（P 下 depth 1）、子代理 | **`tree-proj`**（不是 `other-proj`） | 无 |
| 4 | 孙代理 G1 | `cf9fe1b3-3080-4160-8c52-ac9ed4f95b74` | 孙代理 · 结果校验 1 | `/root/tree-proj` | C1 | 全部（C1 下 depth 2）、子代理 | `tree-proj` | 无 |
| 5 | 孤儿子代理 O | `ba223092-d247-4302-b0ca-852a3cc1bb16` | 孤儿子代理 · 父已删除 1 | **header 无 cwd** | `session-ded2d6c8…`（不存在） | 全部（**顶层行**）、子代理 | **「—」** | 无 |
| 6 | 空壳 S1 | `session-ff21eaad-3a04-4271-9aeb-94cda6d34605` | **完整会话 id**（无标题） | `/root` | — | 全部、主会话 | `root` | 无 |
| 7 | 空壳 S2 | `session-755887f4-1e97-4cab-9dbb-dc367c2d623c` | **完整会话 id**（无标题） | `/root` | — | 全部、主会话 | `root` | 无 |
| 8 | 对照 T1 | `session-ac8e9808-763c-4e76-ae78-bab9b3988b8a` | 验收对照会话 1 | `/root` | — | 全部（树根）、主会话 | `root` | **▸ 1** |
| 9 | 子代理（无标题） | `4ee4b5eb-fb1d-4499-ab09-b195551fc68f` | **完整会话 id**（裸 uuid） | `/root` | T1 | 全部（T1 下）、子代理 | `root` | 无 |
| 10 | 真实零轮次 | `session-359f41d1-2760-4070-b187-b88a1ca21870` | **完整会话 id** | `/root/test1` | — | 全部、主会话 | `test1` | 无 |

**预期 chips 计数**：全部 **10** / 主会话 **5**（P、S1、S2、T1、真实零轮次）/ 子代理 **5**（C1、C2、G1、O、4ee4b5eb）/ 已归档 **0**。

**「全部」档默认全折叠时可见 6 行**（树根：P、O、S1、S2、T1、真实零轮次）；展开 P → 8 行，再展开 C1 → 9 行，展开 T1 → 10 行。

> 造数说明：C2 的 cwd 与父不同是**刻意造的合成边界**，用来钉 §11.7「子行一律显示树根项目，即使自身另有 cwd」；真实语料里子代理通常继承父的 cwd，所以这一行在生产中少见。O 无 cwd 是 §15.4「—」占位的唯一合法造法（落 `sessions/_no-cwd/`）。重造命令见 §9.3。

---

## 2. 验收点 A · 四档过滤语义（P0）

判据已从显式 `archived` 换成 **`effectiveArchived = archived ∨ lineageArchived`**，且 filter 顺移到组树之后（design §11.5，**有意的语义变更**）。

> ✅ **D1 已修**（21:05 产物）：平面档已归一化 `depth=0`/`hasChildren=false`（无缩进、无展开按钮、无子数徽标——产品设计 裁决），干跑四场景 × 三档的 chips 计数与表格行数**全部一致**。本节可正常验收。

- [ ] 默认档仍是**主会话**（问题一不回退）
- [ ] **全部**档是**树形**，且**含已归档行**（带徽标）；本轮语料无归档行，可用 §7 三步场景制造后回看
- [ ] **主会话**档是**平面**（无缩进、无展开按钮），5 行，只含 `origin !== 'subagent'` 且未归档；孤儿子代理 O **不在**本档
- [ ] **子代理**档是平面，5 行（C1、C2、G1、O、4ee4b5eb）；每行带子代理徽标
- [ ] **已归档**档含**显式归档 + 血统归档**两类（§7 第 2 步后应为 4 行：P、C1、C2、G1）
- [ ] chips 计数 = 各档**会话总数**，「全部」档计数 **10 含被折叠的子行**，且**与展开/折叠状态无关**（展开 P 后「全部」仍是 10，不是 8）
- [ ] fork 会话归主会话档且为根节点——**GUI 造不出来**，由单测覆盖（`tests/dashboard-tree.test.mjs`，design §11.10），本项在 GUI 清单里**跳过**

## 3. 验收点 B · 树形行为（P0）

- [ ] 「全部」档**默认全折叠**（用户问题一的原始诉求即清爽）；关闭面板再打开仍回默认折叠（不持久化，允许）
- [ ] 只有 `hasChildren` 的行有展开按钮（P、C1、T1 有；S1/S2/O/真实零轮次 没有）；字符 ▸（收起）/ ▾（展开）
- [ ] **子数徽标 = 直接子数**：P 显示 **▸ 2**（不是 3——G1 是孙代理，不计入）；C1 显示 **▸ 1**；T1 显示 **▸ 1**
- [ ] 子行缩进 = `depth × 16px`，缩进起点有「└」连接线；G1 是 depth 2，缩进比 C1 深一级
- [ ] 展开控件是**独立命中区**：点展开按钮只展开/收起，**不改变勾选**；点行 body 只切换勾选，**不展开**（两区严格分离）
- [ ] **展开态跨 5s 轮询保持**：展开 P 后等两次轮询（约 10s），P 仍是展开的、子行仍在
- [ ] 子代理行标题**次级色**（主会话行是主色），字号不变；子代理行**无置顶徽标**
- [ ] 折叠态运行指示两条路径：自身运行 = 标题前 StateDot；**后代运行** = 子数徽标内嵌运行点（需 §8 造出运行中态才验得到；`dash.tree.childrenRunning` 的 aria/Tooltip 见 §0.3 闸门，未接前只验视觉）
- [ ] 展开/收起**无动画**（表格行直接插拔）
- [ ] 孤儿子代理 O 是**顶层行**（降根不丢弃）、保留子代理徽标、无展开按钮

## 4. 验收点 C · 批量操作（P0，标注 P1 者除外）

- [ ] **勾选不级联**：勾 P 不会自动勾 C1/C2/G1；勾 C1 不会自动勾 G1
- [ ] **三态勾选**：勾 C1（不勾 P）→ P 的 checkbox 呈 **indeterminate**（横杠）；再勾 P → P 变 checked；取消 C1、G1 后 P 回未选。点击父行 checkbox **只增/删自身，永不触碰后代**
- [ ] **全选 = 当前档可见行**：「全部」档折叠态点全选 → 选中 **6** 行（顶层），不含被折叠的 C1/C2/G1/4ee4b5eb；展开 P 后点全选 → 选中 8 行
- [ ] **父子同勾去重**：同时勾 P 与 C1 → 删除确认文案的总数**不重复计数**（P 的子树已含 C1）
- [ ] **级联删除文案**两种形态：
  - 只勾 P（单根）→ 「将删除 树形验收 · 父会话 及其 **3** 个子代理会话（不可恢复）」（C1、C2、G1）
  - 勾 P + S1（混合）→ 「将删除 **5** 个会话（含 **3** 个子代理，不可恢复）」+ 明细区逐根列「树形验收 · 父会话：及其 3 个子代理」
- [ ] **归档 = 整树、零写入**：只勾 P → 归档，结果 notice「已归档 树形验收 · 父会话 及其 3 个子代理」；P/C1/C2/G1 全部进「已归档」档（宿主只写了一次 P 的归档标记）
- [ ] **档位切换保留选择集**（**P1**，design §11.6；v0.1 是切换即清空，本增量有意变更，别当回归改回去）：在「全部」档勾 S1 → 切到「主会话」档 → 选择计数仍是 1；切回「全部」档 S1 仍勾着
- [ ] Esc / 关闭面板丢弃看板选择集（既有语义不变）；看板选择集与侧栏选择集**互相独立**
- [ ] **子代理档「所属主会话」小字**（ui §15.5）：切到「子代理」档，每行标题行尾有 `↳ {父标题}`（11px 次级色，`max-width: 12em` 截断，悬停 Tooltip 看全文，`aria-label` = `dash.parent.label`「所属主会话：{title}」）——C1/C2 → `↳ 树形验收 · 父会话`，G1 → `↳ 子代理 A · 检索资料`，4ee4b5eb → `↳ 验收对照会话 1`，O → 父不在行集，显示短 id **`session-ded2d6c8…`**（保留 `session-` 前缀、取其后 8 位 + 省略号；Tooltip **恒可用**给父完整 id）。**已全部修好并复验通过（D1/D5/D7/D8 + P2）**：短 id 规则、`aria-label`、`role="note"`、CSS 截断、Tooltip 分支全部到位。**每行的预期文本已由干跑打印器从真实源码算出，见 §0.4.3 的表**（含孤儿的 `↳ session-ded2d6c8…` 与子代理档行序 C1→G1→C2→O→SB）

## 5. 验收点 D · 项目列（P0）

- [ ] 表格是**七列**，项目列紧随会话列；表头文案「项目」
- [ ] 值 = **树级**：P/C1/G1 → `tree-proj`；**C2 → `tree-proj`（不是它自己 cwd 的 `other-proj`）**；T1/4ee4b5eb/S1/S2 → `root`；真实零轮次 → `test1`
- [ ] **子行的项目列与树根一致**，同树不出现两个项目名
- [ ] 悬停项目列 → Tooltip 显示**规范化全路径**（如 `/root/tree-proj`）；Tooltip **恒可用**，不是「仅截断时」（全路径消歧是本列设计目的）
- [ ] 孤儿子代理 O 的项目列是 **「—」**，**不冒充其他项目**（它 header 无 cwd）
- [ ] 触屏（或窄窗 <760px）：项目并入会话格第二行 `{项目} · {模型名}`，点按可看全路径；表格容器横向滚动（min-width 640px），选择框列 + 会话列 sticky

## 6. 验收点 E · 上轮回归不回退（P0）

v0.1.1 已验收项的快速复验（详见 [v2 清单](./acceptance-session-dashboard-v2.md)）：

- [ ] 三条无标题行（S1、S2、真实零轮次）标题是**该行会话 id**，不是 `root` / `test1` 这类文件夹名；列窄截断属正常，悬停标题有 Tooltip 显示全文
- [ ] S1 与 S2 同 cwd `/root`，两条标题**互异**（各自 id），不是两条同名 `root`
- [ ] 无标题空壳行的模型列 / Token / 缓存 / 上下文四列**全是「—」**，且标题旁**无**告警图标（空壳不是读取失败）
- [ ] 有标题会话（T1「验收对照会话 1」、P、C1、C2、G1、O）**不回落** id
- [ ] 侧栏点「新会话」造 blank 草稿、不发消息 → 看板**四个档都没有**这一行，全选也不含它；侧栏占位行行为不变
- [ ] 子代理默认不在主会话档（问题一）

## 7. 三步归档边界（P0）· 验恢复语义与两类置灰

语料：父 `session-8ca3549a…`（P）、显式归档子 `9ccb3c70…`（C1）、仅血统归档子 `5832e5c6…`（C2）、C1 的子 `cf9fe1b3…`（G1）。

下表的计数与行集**不是人肉推导，是用真实源码干跑出来的**（`tests/fixtures/print-tree-expectations.mjs`，见 §9.4）。推导曾经错过两处：以为归档 C1 只影响它自己（漏了 G1 经血统跟随），以为恢复 P 后 G1 会回原档（它的父 C1 仍显式归档）。

| 步 | 操作 | 预期（干跑实测值） |
|---|---|---|
| 1 | 「子代理」档勾 **C1** → 归档 | C1 显式归档；**G1 经血统一起进「已归档」档**（G1 的父是 C1）。P、C2 不受影响（勾选不级联）。计数：已归档 **2**（C1 显式 + G1 血统）、子代理 **5→3**、主会话 **5 不变**、全部 **10 不变** |
| 2 | 「全部」档勾 **P** → 归档 | 整树零写入归档。计数：已归档 **4**（P 显式、C1 显式、G1 血统、C2 血统）、主会话 **5→4**、子代理 **3→2**、全部 **10 不变**（「全部」档含归档行） |
| 2b | 在「已归档」档看行级恢复按钮 | **P 可点**（树根、显式归档）；**C1 置灰**（显式归档但有已归档祖先 P，ui §15.6 第 ② 类）；**C2、G1 置灰**（血统归档，第 ① 类）。置灰项悬停有 Tooltip「随父会话恢复」，**不是点了没反应** |
| 3 | 点 **P** 行的行级「恢复」 | 一次 `unarchive(P)`：**P 与 C2 回原档**；**C1 与 G1 仍留在「已归档」档**——C1 有自己的显式标记，G1 的血统来自 C1 而非 P。计数：已归档 **2**、主会话 **4→5**、子代理 **2→3** |
| 3b | 再看 C1 与 G1 的恢复按钮 | **C1 变为可点**（已无已归档祖先），点它才真正取消 C1 的归档；**G1 仍置灰**（血统经 C1，属第 ① 类）。取消 C1 归档后 G1 才跟着回原档 |

> ✅ **D1/D2/D3 已修**（21:05 产物），本节可正常验收：已归档档整档可见（步2 是 4 行）、血统归档行（C2、G1）有置灰按钮 + 第 ① 类 Tooltip「随祖先会话 {title} 恢复」、步3 的 C1 恢复按钮**可点**。
> ⚠️ 但置灰 Tooltip 里的 `{title}` 走面板 `titleOf`（`displayTitle` 回落链）——本语料的祖先都有标题所以显示正常；**换到桌面真实语料遇到无标题祖先时会显示成文件夹名**（D7，§0.4.2）。
> 做完本节语料的归档态已改动，若要重跑 §2 的计数预期，先按 §9.3 重造语料或逐条恢复。

## 8. 级联原子性（P0）· 需要真人造「运行中」态

「运行中」来自宿主 live 会话状态，**日志里合成不出来**，必须现场制造。

- [ ] 在侧栏打开 **C2**（子代理 B · 落地实现），发一条会跑一会儿的消息（例如「运行 `sleep 30` 然后告诉我结果」）
- [ ] 趁 C2 运行中回看板「全部」档（保持折叠）：**P 的子数徽标内嵌运行点**（折叠态也看得到「有后代在跑」）
- [ ] 勾 **P** → 删除：应**整单拒绝**，notice 标题「存在运行中的会话，已拒绝该节点的级联操作」，明细**点名 C2**；不做「删父留子」制造新孤儿
- [ ] 勾 **P** → 归档：同样整单拒绝，且提供「停止并归档」重试入口（既有机制）
- [ ] 勾 **P 与 S1**（S1 不运行）→ 删除：P 这一节点整单拒绝，**S1 与 P 无祖先-后代关系**，按既有逐 id 语义处理（明细里分别报结果，不因 P 被拒而牵连）
- [ ] C2 跑完后再勾 P → 删除：正常走级联，确认文案「及其 3 个子代理」

> ⚠️ 本节会**改动 C2 的日志**（多一轮对话），之后 C2 的 Token/上下文数值会变、标题可能被 LLM 改写——属正常。**请把本节放在最后做**，别影响 §1 对照表的其他核对。
> ⚠️ 删除会真删数据（沙箱语料，可重造，见 §9.3）。要保留语料给后面的人验，就用「归档」验原子性，删除项只走到确认弹窗**取消**即可。

## 9. 自动化回归与语料重造

### 9.1 单测与类型

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
node --test tests/*.test.mjs                        # 2026-11-04 21:40：46 tests / 46 pass / 0 fail / 0 todo / exit 0
                                                    # TC-15/TC-17 钉 D1、TC-18 全量扫 titleOf、TC-19 钉 §12 规则二（假孤儿陷阱）、
                                                    # TC-20 钉「src/client 运行时零 displayTitle 消费」（不限函数名，已变异测试）、TC-21 钉空串兜底 + 防 TC-18 空转
./node_modules/.bin/tsc -p tsconfig.json --noEmit   # 期望 exit 0
node scripts/build.mjs                              # 期望 built …
```

fork 会话、环（互相指为父）这两类形状 **GUI 造不出来**，由 `tests/dashboard-tree.test.mjs` 覆盖（平移自 DSH `lineage.client.spec.ts` 的语义，design §11.10）。所以 GUI 清单里没有它们，不是漏了。

### 9.2 路由与语料自检（无需 GUI）

```sh
curl -s http://127.0.0.1:13080/dsh-session-batch-manager/v1/status    # {"ok":true,…,"version":"<待验版本>"}
curl -s http://127.0.0.1:13080/dsh-session-batch-manager/v1/stats | head -c 400
# 期望 10 行、complete:true、corrupt 0；空壳行 model:null + usage 四桶 0 + pressure:{}
```

### 9.3 重造语料

```sh
# 树形语料（父 + 2 子 + 孙代理 + 孤儿，本清单 §1 的 1~5 行）
docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-tree-corpus.mjs
# 空壳 / 有标题对照 / 子代理（§1 的 6~9 行；v2 那轮的夹具）
docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-shell-corpus.mjs
cd /Users/jiawen.guang/AI/my-deepseek-harness/dev-dsh && ./dsh-dev.sh restart   # 必须重启，宿主不热扫描会话目录
```

两个工具都会**追加**语料（不清场），重复跑会让行数与 §1 对照表不符——重跑后请按 `/stats` 实际输出更新预期，或先清掉旧夹具目录。可调环境变量与格式硬要求见 `tests/fixtures/session-log.mjs` 模块头。

### 9.4 预期值打印器（本清单所有数字的来源）

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
export PATH="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
node tests/fixtures/print-tree-expectations.mjs               # 基线 + §7 三步归档场景
node tests/fixtures/print-tree-expectations.mjs --c2-running  # 叠加「C2 运行中」，验折叠态运行点传播
```

它把 §1 那 10 行语料的形状喂进**真实源码**（`joinDashboardRows → buildTree → filterDashboardRows → visibleRows`），打印四档计数、折叠/展开可见行数与顺序、子数徽标、项目列标签、`descendantsOf` 去重计数、以及 §7 三步归档的每一步结果。GUI 上看到的东西应当与它的输出逐项一致；不一致就是实现缺陷，不是清单写错。

已用它验过的两项（数据层，无需 GUI）：**徽标 = 直接子数**（P 得 `▸2`，不含孙代理 G1）；**折叠态运行传播**（`--c2-running` 时 P 的徽标带运行点、`runningDescendants = true`）。

本轮给它加了**平面档探针**：对主会话/子代理/已归档三档分别打印 `chips 计数`（= `filterDashboardRows` 长度）与 `表格行数`（= `visibleRows` 长度，全折叠 / 全展开两种），两者不等就点名丢了哪些行。**D1 就是这条探针抓出来的**——加它之前，我只对「全部」档算过可见行数，平面档的行数是照着 chips 数想当然写的。

> 语料 id 换了（重造过）就改脚本顶部的常量，或从容器内 `/tmp/tree-corpus.json` 取新 id——脚本里的 id 与 §1 对照表必须一致，否则预期值对不上。

---

## 10. 待确认项与已知观察（验收前请先读）

1. **P0/P1 分级待产品经理确认**：本清单的分级是测试工程师按 design §11 的标注拟的（已确认的只有两处原文：「档位切换保留选择集」= 产品经理 P1，design §11.6；「归档确认从简」= P1，ui §15.7）。其余按「核心语义 P0 / 视觉与无障碍细节 P1」拟定。
2. ~~**§15.5「父短 id（前 8 位）」规则有缺陷，待产品设计定**~~ → **已定案**：产品设计改了规格，ui §15.5 现在明写「保留 `session-` 前缀（若有），取前缀之后 8 位 + 省略号；裸 UUID 父取 uuid 前 8 位；**不可取裸 id 前 8 位**」，并引了我的干跑证据（2026-11-04 修正）。**实现尚未跟上** → 转 §0.4 的 **D5**。
3. ~~**运行中态对读屏不可见**~~ → **aria 半边已修**：两处运行点（`:612-615` 自身、`:623-626` 徽标）各补 `<span className="dsh-dash-sr-only" role="img" aria-label=… />`（`StateDot` 原语 ongoing 态自带 `aria-hidden`，可访问名必须调用方补——产品经理 拍的 P0）。规格还要求**外包 Tooltip 同文案**，未做 → 转 **D6**，是否本期做仍待产品经理定。
4. ~~**项目列 Tooltip 缺 `openOnClick`**~~ → **已修**（`DashboardPanel.tsx:666`；产物 `openOnClick`=4，分别是项目/Token/缓存/上下文）。
5. ~~**`dash.noData` 的 sr-only 占位未实现**~~ → **已修**：五处「—」占位（项目 + 模型 + Token + 缓存 + 上下文）全部补上，`dash.noData` refs=5。已加 **TC-16** 钉住（`t('dash.noData')` 引用数必须 = 5，且视觉「—」必须带 `aria-hidden`）。
6. 沙箱 GUI token 是一次性的，本清单不写死；`./dsh-dev.sh status` 随时可取。**测试工程师全程未消耗 token、未打开页面**，所以本清单的 GUI 项都还没有真人实测记录——§0.4 的 D1–D6 全部来自**源码审计 + 真实源码干跑**，不是 GUI 观察。
7. ~~平面档要不要保留「▸N」子数徽标~~ → **产品设计已裁决：不保留**，并已落档（design §11.5「平面档规范化」、ui §15.2「仅树形全部档渲染」）；实现与裁决一致 ✓（产品经理 的同向意见也是去掉）。
9. ~~新增待裁（D9 范围）~~ → **产品经理裁 (a) 一并修，已落地并复验通过**：`ops.ts` 的 `titleOf` 改取 `?.title`（空串兜底保留），design §12 规则一在代码库中**零违反**（全库 `displayTitle` 只剩 6 处注释 + 2 处 `types.ts` 类型声明）。守卫三层：TC-18（全量扫 `titleOf` 定义）+ TC-20（**不限函数名**，整个 `src/client` 运行时零消费，已做变异测试）+ TC-21（空串兜底 + 防 TC-18 空转）。详见 §0.4.4。
8. ~~新增待裁（D7 范围）~~ → **产品经理已拍板进本期，已修并复验通过**（§0.4.3）；产品设计 同时把标题不变量升格为 design §12 全局规则并采纳了 P2 的 `role="note"`。原待裁内容：：面板 `titleOf` 用 `displayTitle` → 无标题会话显示成文件夹名，即用户上一轮报的问题二在新位置复现（子代理小字、置灰 Tooltip、以及 v0.1 就有的 notice 文案）。**是否本期修待产品经理定**；修的话孤儿判据要一起换成行集成员判定，否则无标题父会话会被误判成孤儿（§0.4.2）。

## 11. 验收结论（用户填）

| 验收点 | 结果 | 备注 |
|---|---|---|
| **实现缺陷 D1–D6（§0.4.1）** | ☑ 已修（D5 残 D8） | 21:05 产物复验通过：闸门 53/53、42 tests 全绿、干跑四场景一致 |
| **新增 D7、D8 + P2（§0.4.2 / §0.4.3）** | ☑ 已修 | 21:26 产物复验通过；TC-18/TC-19 钉住 §12 两条规则 |
| **D9（§0.4.4）** | ☑ 已修 | 产品经理裁 (a) 一并修；§12 规则一代码库零违反，TC-18/20/21 三层守卫 + 变异测试 |
| A 四档语义（§2） | ☐ 通过 ☐ 不通过 | D1 已修，阻塞解除 |
| B 树形行为（§3） | ☐ 通过 ☐ 不通过 ☐ 未验 | |
| C 批量操作（§4） | ☐ 通过 ☐ 不通过 ☐ 未验 | |
| D 项目列（§5） | ☐ 通过 ☐ 不通过 ☐ 未验 | |
| E 上轮回归不回退（§6） | ☐ 通过 ☐ 不通过 | |
| 三步归档边界（§7） | ☐ 通过 ☐ 不通过 ☐ 部分（置灰项未接） | |
| 级联原子性（§8） | ☐ 通过 ☐ 不通过 ☐ 跳过 | |
| 窄窗/触屏/双主题/键盘（§5、§9 及 ui §15.9 前半） | ☐ 通过 ☐ 不通过 ☐ 跳过 | |
| **用户 GUI 验收（11-04）** | ☒ **不通过** | 用户报 5 个问题；1、3 已复现定性（§12），2、4 是产品语义变更，5 是新增能力（session 召回） |

## 12. 用户验收反馈复现结论（11-04，测试工程师）

用户 GUI 验收判**不通过**，报 5 个问题。项目经理 派我复现其中两条事实题（问题 1「侧栏 4 条 vs 看板 5 条主会话」、问题 3「树出现三层」）。以下全部是源码 + 磁盘取证，不是推断。

### 12.1 问题 1 根因：两个面的行集不是同一个集合

| 面 | 行集来源 | 过滤 |
|---|---|---|
| 看板 | `/stats` ← 宿主 `sessionQuery.listSessions()`（`packages/session-query/session-query/src/corpus.ts:57-84`，注释即「complete logical corpus」= 全部持久化记录 + 全部 live 会话） | **零过滤**：cwd / blank / origin / archived 一道都没有 |
| 侧栏 | Host list（`packages/api/session-controller/src/list.ts:137-170`） | `:149` **header 无 `cwd` 的冷记录直接不进列表**；再经客户端 `sessionVisible`（`packages/client/ui-workspace/src/client/tree.ts:229-248`）：`origin==='subagent'` 不可见、`blank` 除「当前占位」外不可见、归档按过滤器；最后按 **workspace 显式成员 `sessionIds`** 分桶（`tree.ts:30`），非成员落「未分组」 |

看板唯一的收窄是 `src/client/dashboard-rows.ts:44` 的 `if (session?.blank) continue`，它读的是**客户端**的 blank 标志，而该标志会因 first-send / running 翻成 false（`manager.ts:302-304 effectiveBlank`、`:289-297 onEngaged`、`:868`）——所以 blank 行在两个面上口径不一致，且随 GUI 交互态漂移。

**多算的那条已定位：`ba223092-d247-4302-b0ca-852a3cc1bb16`（D10）**

- header 特征：`origin: "subagent"`、`parentSession: session-ded2d6c8-f169-44fe-b318-39f3cecdc82e`（语料中不存在）、`delegationDepth: 1`、**无 `cwd` 字段**（日志落 `_no-cwd/`）、1 个 `turn/start`、有 `session/title`（「孤儿子代理 · 父已删除 1」）、未归档、非 fork、无 projcache 记录。
- 链条：无 cwd → Host list 丢弃 → 侧栏**结构上不可能显示**；`/stats` 保留 → 看板保留；join 时 `byId[id] === undefined` → `origin` 取不到 → `filterDashboardRows('main')` 的判据 `row.origin !== 'subagent'` 成立 → **一个子代理被算成主会话**，标题只能回落成 36 位 id、项目列「—」。
- 判别技巧（真实语料同样成立）：桌面 111 条里**主会话 id 70/70 带 `session-` 前缀、子代理 id 41/41 是裸 UUID**。主会话档里出现裸 UUID 行 = 误分类。（经验规律、非文档契约，只作诊断用。）
- **D10 成立**：任何被 Host list 丢弃的行，看板都会显示、且一律误判为主会话。修法方向：行集以 `SessionListState.ids` 为准（`service.ts:62-65` 明写「only `ids` expresses Host-list membership」；`byId` 还含子代理回退行，不代表成员资格），`/stats` 只作数据补充；`session === undefined` 的行不得默认按主会话处理。

### 12.2 问题 1 的另一半：我的验收语料让「4 vs 5」这个比法本身失效（D11）

语料 5 条主会话里有 **3 条是零轮次 blank**：`session-ff21eaad-3a04-4271-9aeb-94cda6d34605`、`session-755887f4-1e97-4cab-9dbb-dc367c2d623c`（cwd `/root`）、`session-359f41d1-2760-4070-b187-b88a1ca21870`（cwd `/root/test1`）——每条日志 5 行、`turn/start` 0 个、无 `session/title`、projcache `sessionListMetadata.blank=true` + `sessionStats.turns=0`。侧栏把 blank 当「新会话」占位（同 workspace 复用，`service.ts:43-50`），只有当前占位可见；沙箱只注册 2 个 workspace（`/root`、`/root/test1`）。

按源码规则算：侧栏可见主会话应为 2 条（`session-8ca3549a…`「树形验收 · 父会话」+ `session-ac8e9808…`「验收对照会话 1」）+ 至多 2 条占位；看板主会话应为 3 条（这 2 条 + D10 的 `ba223092…`）。用户实见 4 / 5，差额正好是「2 条零轮次行当时处于可见态」——**这一环依赖客户端 live 状态（engaged / 占位复用），磁盘取不到证，我不硬判**；但 Δ=1 恒等于 D10 那条，与 live 状态无关。

真实数据同样有这类行：桌面 70 条主会话中 **5 条零轮次 blank**、**2 条不是任何 workspace 的成员**（会落「未分组」）。所以「blank 行进不进看板」是产品必须定的口径，不是夹具专有问题。

**我的失误**：验收语料里混进了 1 条无 cwd 会话（`tests/fixtures/make-tree-corpus.mjs:154-163` 显式 `cwd: undefined`）和 3 条零轮次 blank 会话——前者是 GUI 结构上不可能显示的行、后者是 GUI 当占位处理的行，用这种语料核对「侧栏 vs 看板」行数本就不可能对上。重造规则：主语料所有主会话 ≥1 个 turn、所有子代理都带 cwd；边界行（无 cwd 孤儿、零轮次 blank、非 workspace 成员）单独成组，只在验排除规则时加载，且预期值明写「侧栏不可见」。

### 12.3 问题 3 根因：三层是夹具造的，真实数据没有

- 沙箱那条链（磁盘取证）：`session-8ca3549a-7e68-4db2-ab5d-24510cca104b`（`delegationDepth: 0`，主会话）← `9ccb3c70-1e39-44a3-b591-f0868f31e39f`（`delegationDepth: 1`、`origin: subagent`）← `cf9fe1b3-3080-4160-8c52-ac9ed4f95b74`（**`delegationDepth: 2`**、`parentSession: 9ccb3c70…`）。出处：`tests/fixtures/make-tree-corpus.mjs:144-147` 显式写了 `delegationDepth: 2`。
- 桌面真实语料 111 条（0 解析失败）：`delegationDepth` 直方图 **0→70、1→41，无 ≥2**；「父本身也是子代理」的链 **0 条**；孤儿子代理 **0 条**；无 cwd 记录 **0 条**；41 条子代理的 cwd **全部与父相同**（0 条不同）。
- 机制边界：`packages/subagent/subagent/src/index.ts:196` `maxDepth` 默认 **1**，`child-agent.ts:49 resolveChildDepth` 超限抛 `SubagentDepthError` → 默认配置下 depth 2 不可达。但 `subagent-acp` / `subagent-codex` / `subagent-claude-code` / `out-of-process` 报 `depthLimit: false`（`tool-subagent/src/index.ts:170-174` 要求这类 provider 用 `maxDepth: 'provider-managed'`，深度不由 DSH 兜底），DSH 自己的 `tool-subagent-control/src/list-agents.ts:93` 也写明「entries deeper than 1 accept only interrupt_agent」→ **深链在换 provider 或抬高 maxDepth 时可能出现**。
- 结论：用户的两层预期与默认配置一致，压平两层对真实数据安全；压平规则仍需定义 depth≥2 行的归置（建议挂到最近的 depth-0 祖先，中间层不单独成行）。

### 12.4 给问题 5（session 召回）的实测数据点

workspace 存储在 `~/.dsh/storages/workspace.json`（`unit.version = 2`）：成员是**显式** `tables.workspaces.<id>.sessionIds`（桌面 7 个 workspace、共 68 个成员 id，与 70 条主会话差的 2 条即上面的非成员）；另有全局 `archivedSessionIds`（桌面 41 / 沙箱 15）、`pinnedSessionIds`、`defaultWorkspaceId`。沙箱 `/root` 的 `sessionIds` 是空数组而 3 条语料会话 cwd=`/root` → 证实分桶按成员而非 cwd，非成员落「未分组」，与用户描述的「删除工作空间后 session 被移动到未分组」一致。

### 12.5 缺陷登记

| 编号 | 级别 | 描述 | 状态 |
|---|---|---|---|
| **D10** | P0 | 看板行集取自 `/stats`（零过滤）而非 GUI 目录；被 Host list 丢弃的行（无 cwd）照样显示，且因 `origin` 缺失被误判为主会话 | 待修（修法见 §12.1） |
| **D11** | P1（测试资产） | 验收语料含 1 条无 cwd 会话 + 3 条零轮次 blank 会话，导致「侧栏 vs 看板」行数核对不可能成立 | 待重造（规则见 §12.2） |

问题 2（砍档位）、4（子代理纯展示、删除只作用主会话）、5（session 召回）属产品语义变更/新增能力，不在本节范围；等 产品设计 修订稿落地后我按新语义重造语料并出 v4 清单（含 D10/D11 判据）。
