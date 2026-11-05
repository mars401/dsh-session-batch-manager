# 会话看板行集修复 · 用户验收清单（v2）· 2026-11-03

> 被测对象：`dsh-session-batch-manager` 本地工作副本（2026-11-03 21:00 构建）。
> 本轮修复：① 看板默认过滤档 `all` → `main`（问题一）；② 标题回落会话 id，不经 `displayTitle` 的目录 basename 回落；③ 未落盘草稿行（`blank`）整体排除，含勾选（问题二）。
> 依据：`design-session-dashboard.md` §5.2 / §5.3、`ui-session-dashboard.md` §5.1。
> 自动化覆盖：`node --test tests/*.test.mjs` → 24/24 通过、`tsc --noEmit` → 0 错误。**本清单只覆盖自动化打不到的 GUI 视觉与交互项。**
> 执行方式：用户自助，约 10 分钟。沙箱路径的数据我已备好并逐项核实。

## 0. 选环境

### 路径 A（推荐）：dev-dsh 沙箱——已备好，可直接开验

沙箱当前状态（2026-11-03 21:40 重建产物并重启后核实）：插件已从 GitHub 版换成本地修复版（符号链接指向工作区）；语料 7 行 = 3 条真实会话（其中 1 条天然零轮次）+ 2 条空壳夹具 + 1 条有标题对照夹具 + 1 条子代理夹具；`/stats` 返回 7 行、`complete:true`、corrupt 0。

> 沙箱重启或首次打开时，统计聚合器是**内存缓存**，头几秒可能行数不全（`complete:false`）——等一次轮询（默认 5s）再看，不是缺陷。

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dev-dsh
./dsh-dev.sh status        # 打印带一次性 token 的 GUI URL（首次打开必需）
```

**开验前先确认沙箱跑的是修复版**（别省这步：本次排查发现沙箱原本装的是 GitHub 上的未修复版，bundle 里还是 `displayTitle ?? s.id`；后来又发现补完 Tooltip 后**产物没重建**，`src/` 修好了但沙箱服务的还是旧 `lib/client.js`）：

```sh
docker exec dsh-dev sh -c 'D=/root/.dsh/profiles/dev/node_modules/dsh-session-batch-manager; ls -ld $D; echo -n "旧表达式(应0): "; grep -c "displayTitle ?? s.id" $D/lib/client.js; echo -n "onlyWhenClipped(应2=标题列+模型列): "; grep -c "onlyWhenClipped: true" $D/lib/client.js; echo -n "默认档: "; grep -o "filter: *\"[a-z]*\"" $D/lib/client.js | head -1'
```

预期四项：符号链接指向 `…/my-deepseek-harness/dsh-session-batch-manager`；旧表达式计数 `0`；`onlyWhenClipped` 计数 `2`；输出 `filter: "main"`。

> 若你在宿主机重建过 `lib/`（`node scripts/build.mjs`），**必须重启沙箱**（`./dsh-dev.sh restart`）：客户端产物是服务启动时读进内存 vfs 的（`webworker-runtime/package-assets.ts:64`），光刷新页面拿不到新代码。重启后 token 会变，用 `./dsh-dev.sh status` 取新的。

**沙箱语料与预期标题对照表**（验收时逐行对）：

| 会话 id | cwd | 标题投影 | 修复前会显示 | **修复后应显示** | 主会话档 |
|---|---|---|---|---|---|
| `session-359f41d1-2760-4070-b187-b88a1ca21870` | `/root/test1` | 无（真实零轮次会话） | `test1` | 该行会话 id† | 可见 |
| `session-31ad5c79-4c16-437f-abf7-4531f58300a0` | `/root` | 无（夹具） | `root` | 该行会话 id† | 可见 |
| `session-79127200-29f8-4e53-85b0-0ae6aaff9ee5` | `/root` | 无（夹具） | `root` | 该行会话 id† | 可见 |
| `session-92766d07-29a4-473d-b153-79e0e7eb95d2` | `/root/test1` | 用户询问模型类型 | 同左 | 同左（不变） | 可见 |
| `session-6069197c-4453-4053-870f-8112d2c6edfd` | `/root` | 询问模型身份 | 同左 | 同左（不变） | 可见 |
| `session-814dff54-0790-4830-920e-06fd39424cd2` | `/root` | 验收对照会话 1（夹具） | 同左 | 同左（不变） | 可见 |
| `3288d463-27b0-4eef-ad5a-da4eb450607f` | `/root` | 无（子代理夹具） | `root` | 该行会话 id† | **不可见**（只在子代理档） |

> † 会话列窄，36 字符的 id 按 ui §5.1 的截断规则会显示成 `session-359f41d1…` 这种「前缀 + 省略号」，**属正常，不要判不通过**。逐字核对全文：**把鼠标悬停在该行标题上**，Tooltip 会显示完整 id（本轮已按 ui §5.1 补上 `onlyWhenClipped` Tooltip，见 §6 第 6 项）；只在真被截断时才弹，触屏按 ui §10 不显示。

需要重新造夹具（或造更多条）时：

```sh
docker exec dsh-dev node /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager/tests/fixtures/make-shell-corpus.mjs
# 可调环境变量：FIXTURE_SHELLS（默认 2）、FIXTURE_TITLED（默认 1）、FIXTURE_SUBAGENTS（默认 1）、FIXTURE_WORKSPACE_CWD（默认 /root）
# 清单输出到容器内 /tmp/shell-corpus.json
```

> ⚠️ **造完夹具必须重启沙箱**（`./dsh-dev.sh restart`）才会被列出来。实测（2026-11-03 22:05）：夹具已落盘（`ls /root/.dsh/sessions/--root--/` 能看到 4 个目录），但 `/stats` 连续轮询 60s 仍只返回原有的 1 行；重启后同一次请求立刻返回 5 行。会话目录不是热扫描的，别把这段延迟当成缺陷或「造数失败」。

### 路径 B（可选）：桌面真实语料——装插件由用户自己执行

**桌面本来不装也能验收**：路径 A 的沙箱语料已含真实复现样本，四条验收点在沙箱里全能验完。路径 B 只是多一层「真数据、真 App」的信心，代价是要动桌面实例。

桌面 profile 当前**没有**本插件（`GET /dsh-session-batch-manager/v1/status` 返回 404）。安装步骤：

```sh
# 宿主机 CLI（已验证可用，版本 0.2.1-rc.5；plugin 子命令把参数转发给 profile 目录下的 pnpm）
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
```

装完**必须重启桌面 App** 才会加载新 bundle。

> ⚠️ 重启桌面 App 会中断当前正在运行的会话与 Bot 团队（本群就在桌面实例里跑）。要么先把手头工作收一收，要么直接走路径 A。

我验证到哪一步、没验证哪一步（别当成已证事实）：

- ✅ CLI 存在且可执行、`--version` = 0.2.1-rc.5、`plugin --help` 说明它转发 pnpm（`add <pkg>` / `remove <pkg>`）
- ✅ 插件 `engines.dsh` 为 `>=0.2.1`，与桌面 0.2.1-rc.5 相容
- ✅ **已验证**（2026-11-03 22:01，沙箱 GitHub 全新安装路径）：`dsh plugin add github:mars401/dsh-session-batch-manager` **会**把包名写进 `package.json` 的 `dsh.profile.bundles`（装前该名字已被 `remove-plugin` 摘掉，装后 bundles 里重新出现，无需手工补），dependencies 记为 `"dsh-session-batch-manager": "github:mars401/dsh-session-batch-manager"`
- ❓ **未验证**：桌面实例的 GUI 端口是动态的，路由前缀需按实际端口拼

若装完插件没生效，按序自查：

```sh
grep -A12 '"dependencies"' ~/.dsh/profiles/desktop/package.json   # 应有 dsh-session-batch-manager 且为 link: 指向工作副本
grep -A12 '"bundles"' ~/.dsh/profiles/desktop/package.json        # 应含 "dsh-session-batch-manager"；缺就手工补上再重启
curl -s "http://127.0.0.1:<桌面端口>/dsh-session-batch-manager/v1/status"   # 期望 {"ok":true,...}，version 应与下面这条一致
grep -m1 '"version"' ~/.dsh/profiles/desktop/node_modules/dsh-session-batch-manager/package.json
```

> ⚠️ **`/status` 的 version 要与包版本一致**（v0.1.1 首推件曾不一致：包 `package.json` 是 `0.1.1`、`/status` 报 `0.1.0`，已在 `d577ed7` 重建产物修正，现两者均为 `0.1.1`）。根因值得记着：版本号由 `scripts/build.mjs` 在**构建期**注入 `__PLUGIN_VERSION__`（`src/host/index.ts:130/189/411` 三处用它），所以「先构建、后改版本号」会让提交的 `lib/` 嵌着旧号——**改完版本号必须重建再提交**。核对时以 `package.json` 为准，两条输出不同即说明产物早于版本号 bump。

**同样要确认跑的是修复版**（路径 A 那步在桌面一样适用，把路径换成桌面 profile）：

```sh
D=~/.dsh/profiles/desktop/node_modules/dsh-session-batch-manager
ls -ld $D
echo -n "旧表达式(应0): "; grep -c "displayTitle ?? s.id" $D/lib/client.js
echo -n "onlyWhenClipped(应2=标题列+模型列): "; grep -c "onlyWhenClipped: true" $D/lib/client.js
echo -n "默认档: "; grep -o 'filter: *"[a-z]*"' $D/lib/client.js | head -1
# 期望：link 指向工作副本 / 旧表达式 0 / onlyWhenClipped 2 / filter: "main"
```

> `onlyWhenClipped` 计数若为 `1`，说明装到的是**补 Tooltip 之前**的产物：回工作副本跑 `node scripts/build.mjs` 重建，再重装/重启桌面 App（沙箱那次就是这个坑，`src/` 修好了但服务的是旧 `lib/client.js`）。

装好后，`~/.dsh` 语料里这 3 条真实零轮次会话就是天然验收集：

| 会话 id | cwd | 修复前会显示 | 修复后应显示 |
|---|---|---|---|
| `session-93ac64a6-bd51-455c-b7c9-728cf38064ce` | `~/.dsh/bot/workspace` | `workspace` | 该行会话 id† |
| `session-00818cbf-343e-45bc-b91e-94a28cd483f2` | `~/AI` | `AI` | 该行会话 id† |
| `session-3e77360f-40f8-4cc3-9f7d-aca332c0f811` | `~/Research` | `Research` | 该行会话 id† |

> † 同路径 A 的脚注：id 会被截断成「前缀 + 省略号」，属正常；悬停标题即可看到完整 id（Tooltip 仅在被截断时弹出）。

桌面语料另有 41 条子代理会话（id 为裸 UUID），默认主会话档应全部看不到——这正好一并验问题一。

> ⚠️ 路径 B 下**不要验删除**（真数据不可逆）。归档/删除请回路径 A 用夹具验。

## 1. 验收点 1 · 空壳主会话行（P0）

打开看板，确认默认档是「主会话」，对照上表逐条看：

- [ ] 默认过滤档是**主会话**，不是「全部」（问题一）
- [ ] 三条无标题行的标题是**该行的会话 id**（列窄会截断成 `session-31ad5c79…` 这种前缀，悬停看全文），不是 `test1` / `root`（路径 B：不是 `workspace` / `AI` / `Research`）
- [ ] 同 cwd `/root` 的两条夹具标题**互异**（各自 id），不再是两条同名 `root`
- [ ] 这三条的模型列、token 列、缓存列、上下文列**全是「—」**
- [ ] 标题旁**没有**告警图标（空壳不是读取失败，不该报 corrupt/read-failed）
- [ ] 勾选 `session-31ad5c79…` → 归档走通：提示成功，行从主会话档消失、在「已归档」档出现
- [ ] 勾选 `session-79127200…` → 删除走通：确认后行消失，刷新页面不再出现
  - ⚠️ 只删这两条夹具；路径 B 下跳过这两项

## 2. 验收点 2 · blank 草稿行（P0，本轮优先级最高）

在侧栏点「新会话」创建草稿，**不要发任何消息**，然后打开看板：

- [ ] 看板里**没有**这条草稿行——四个过滤档都没有，包括「全部」
- [ ] 点「全选」：选中计数不包含草稿，已选清单里也没有它
- [ ] 侧栏那条「新会话」占位行**行为不变**（仍在原位、仍能点进去输入）
- [ ] 给草稿发一条消息后再看看板：此时它已落盘成为正常会话，应出现，且标题**不再是文件夹名**。
  - 标题是异步生成的，别急判：真实日志里先落一版回落标题（`session/title`，取首条用户消息），随后 `session/title-llm-request` 之后可能再落一版 LLM 标题改写它；看板轮询默认 5s（宿主可注入 `statsPollIntervalMs`）。**发完消息请等一次刷新（约 5~10s）再核对，期间显示会话 id 属正常。**
  - 本项只需确认「不是文件夹名」；标题最终文案不在本轮验收范围。

区分 blank 与空壳：blank **未落盘**（`~/.dsh/sessions/**` 下没有它的目录），空壳**已落盘**（有目录、约 1KB 日志）。看板只应显示后者。

## 3. 验收点 3 · 有标题会话不回退

- [ ] `session-92766d07…` 显示「用户询问模型类型」、`session-6069197c…` 显示「询问模型身份」、`session-814dff54…` 显示「验收对照会话 1」（路径 B：任选一条有标题会话，看板标题与侧栏一致）
- [ ] 三条都**不是**会话 id、也不是文件夹名（即有标题时不得回落）
- [ ] 标题过长时按原规则截断（`text-overflow: ellipsis`）；**悬停被截断的标题，Tooltip 显示完整标题**（ui §5.1；未被截断的行悬停不弹，属正常）

## 4. 验收点 4 · 四档过滤与计数一致

- [ ] 四档 chips 计数：全部 **7** / 主会话 **6** / 子代理 **1** / 已归档 **0**（沙箱当前语料；若已执行第 1 节的归档/删除，则相应变化）
- [ ] 每档 chips 数字与该档**实际行数一致**（逐档数一遍）
- [ ] 子代理档能看到 `3288d463-…`（标题为其 id），主会话档看不到它

## 5. 自动化回归（无需 GUI）

```sh
cd /Users/jiawen.guang/AI/my-deepseek-harness/dsh-session-batch-manager
# 宿主机 PATH 里没有 node，tsc 的 shim 会 exec node 失败（exit 127，不是类型错误）——先把 dsh 自带 runtime 挂上
export PATH="/Users/jiawen.guang/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
node --version                                      # 期望 v24.21.0
node --test tests/*.test.mjs                        # 期望 25 tests / 25 pass / 0 todo / exit 0
./node_modules/.bin/tsc -p tsconfig.json --noEmit   # 期望 exit 0
node scripts/build.mjs                              # 期望 built …（构建必须在宿主机跑，容器内 esbuild 平台不匹配）
```

> 重建 `lib/` 之后若要沙箱吃到新产物，**必须** `cd ../dev-dsh && ./dsh-dev.sh restart`（原因见 §0 路径 A 的注）。产物是确定性的：同一份 `src/` 连续两次构建 md5 相同（实测 `ca7a571f6e86661f4fb7a5d5789dc45f`），所以重建不会让已重启的沙箱与磁盘不一致。

## 6. 已知限制与不阻塞观察项

1. **夹具工具的「有标题对照会话」首版被判 `corrupt`，已修复**：根因是 `request/header` 的 `tools` 写成了空数组——v1 那轮的附注早就记着这条硬要求（「`tools` 不能为空数组，否则整读被判 corrupt」），我没先读就又踩了一次。改成至少 1 个工具后，同一条夹具 `model=deepseek-official/deepseek-chat`、四桶有值、`contextWindow=131072`、`error:null`，已进沙箱语料当验收点 3 的对照。注意**标题投影是懒生成的**（要等客户端列表 RPC 触发），首屏可能仍显示 id，等一次刷新再看。
2. **取证方法提醒**：会话日志是多帧 zstd 容器（空壳 3~4 帧，正常会话上百帧），Node 的 `zstdDecompressSync` 与 `createZstdDecompress` 都只解**首帧**。判定有没有用户轮次请读投影缓存 `~/.dsh/storages/session_projcache/sessions/<id>.json` 的 `sessionStats.turns` / `turnOutline.turns` / `title`，不要靠解压日志数事件。
3. ~~沙箱 profile 里的陈旧 `@local/dsh-session-batch` 符号链接~~ **已清理**（2026-11-03）：现 `@local/` 下只剩 `dsh-dev-agent`、`dsh-project-hub`，不会再有「验错代码」的入口。
4. ~~`plugins/dsh-session-batch/docs/` 旧文档快照~~ **已按项目经理决定处置**（2026-11-03）：独有的 §G「GitHub 全新安装验证」与「合成日志格式硬要求」已合并进 `docs/test-session-dashboard-v1.md`（§G 见 90 行、硬要求见 110 行），`gen-screenshot-corpus.mjs` 已迁入 `tests/fixtures/`（md5 `4b32f6ca…` 三方一致），随后整个旧快照目录**移出工作区**到 `/tmp/dsh-session-batch-snapshot-removed-20261103`（45M）——不是 `rm -rf`，因为父目录不是 git 仓库，留一条可恢复退路；要彻底删由项目经理发话。
5. 桌面 `~/.dsh` 的 projcache 有 3 条孤儿（`session-31333299…`、`session-b0247c56…`、`session-ee267df7…`，对应会话已删）。看板不读 projcache 目录，不会产生行；产品经理已记为独立待办，不进本期。
6. **标题列缺 Tooltip（本轮发现并已修复，不再是限制）**：ui §5.1 要求「截断时 Tooltip（`onlyWhenClipped`）显示完整标题」，此前实现里模型列有、标题列没有（CSS 已 `text-overflow: ellipsis`，截断发生但看不了全文）。本轮把无标题行改成回落 36 字符 id 后，截断从偶发变成这些行的默认形态，缺口被放大到主路径，产品经理拍板进本期。程序员按模型列同款做法给 `.dsh-dash-session-title` 外包 `<Tooltip portal label={row.title} onlyWhenClipped>`；TC-14 已从 `todo` 转正式断言（钉住 portal / `label={row.title}` / `onlyWhenClipped` / 真包裹 / 按 ui §10 不得加 `openOnClick`）。**验收时悬停核对是正式项，不再豁免。**

## 7. 验收结论（用户填）

| 验收点 | 结果 | 备注 |
|---|---|---|
| 1 空壳行标题 = 会话 id、同工作区互异、四列全「—」 | ☐ 通过 ☐ 不通过 | |
| 1 归档 / 删除走通 | ☐ 通过 ☐ 不通过 ☐ 跳过（桌面路径） | |
| 2 blank 不进看板、不可被全选 | ☐ 通过 ☐ 不通过 | |
| 3 有标题会话显示不变 | ☐ 通过 ☐ 不通过 | |
| 3 截断标题悬停显示全文（Tooltip） | ☐ 通过 ☐ 不通过 | |
| 4 四档过滤与计数一致 | ☐ 通过 ☐ 不通过 | |
| 问题一：默认档为主会话、子代理不显示 | ☐ 通过 ☐ 不通过 | |
