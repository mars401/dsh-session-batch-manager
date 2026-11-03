# 会话仪表盘功能测试报告（v1）· 2026-11-03

> 测试：测试工程师。被测对象：`@local/dsh-session-batch` 0.1.0（会话可视化仪表盘 + 既有批量操作），沙箱 dev-dsh（dsh 0.2.2-alpha.2，GUI 127.0.0.1:13080，容器 healthy）。
> 依据：design-session-dashboard.md §4.3（线上契约）/ §9（测试与验收）、ui-session-dashboard.md §6 / §11 / §12、review-implementation-v1.md（v2 复核移交项）、项目经理转达的用户实测 bug（仪表盘删除后行残留）。
> 方法：契约层/端到端全部自动化（curl + node 脚本对沙箱实测）；质量门独立复跑；GUI 视觉与交互项无法自动化（无浏览器驱动），单独列人工清单（§F）。

## 结论摘要

- **宿主侧 16 项自动化用例全部通过**，含评审移交的重点观察项「渐进填充端到端」：402 会话语料下首拉 32ms 立返、行渐进追加 1→15→267→402、pending=381 可见、~0.9s 收敛 `complete:true`。
- **用户实测 bug（删除后行残留）的修复已复核**：订阅链代码级验证通过（§C），沙箱运行产物确认为修复版；行为级最终确认需 GUI 人工操作（§F 第 1 项，P0）。
- 质量门独立复跑：`tsc --noEmit` 零错、单测 10/10、宿主机 build 成功且产物新于全部源码。
- 3 条不阻塞观察项记录在 §E。

## A. 质量门复跑（2026-11-03 07:46，修复重装后）

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | 容器内 `node_modules/.bin/tsc -p tsconfig.json --noEmit` | ✅ 零错误 |
| 单元测试 | 容器内 `node --test tests/stats.test.mjs` | ✅ 10/10 |
| 构建 | 宿主机 `node scripts/build.mjs`（2026-11-03 07:44 产物） | ✅ 成功，lib 新于全部 src |

注：构建必须在宿主机跑——插件 `node_modules` 是 darwin-arm64 安装的，容器内 esbuild 平台不匹配报错（环境事实，非缺陷）。

## B. 宿主契约与端到端用例（沙箱实测）

大语料用例（TC-A05~A13）于 2026-11-02 深夜执行：向沙箱注入 400 个正常克隆会话（dsh 双帧 zstd 布局：头行帧 + 事件帧，均带 checksum）+ 1 个事件帧损坏会话，语料共 402。其余用例在 2026-11-03 修复重装后以 5 个合成会话复跑冒烟（TC-A16）。测试语料已全部经删除路由清场，沙箱语料还原。

| ID | 用例 | 方法与预期 | 实测结果 |
|---|---|---|---|
| TC-A01 | status 探活 | `GET /v1/status` → 200 `{ok,service,version}` | ✅ `{"ok":true,"service":"@local/dsh-session-batch","version":"0.1.0"}` |
| TC-A02 | stats 契约字段 | 响应含 `ok/service/version/generatedAt/complete/pending/degraded/sessions[]`；行含 `id/model/usage{4桶}/pressure/error`，与 §4.3 逐字段一致 | ✅ 全部字段齐备、类型正确；`degraded:false` |
| TC-A03 | 缓存与 CORS 头 | `cache-control: no-store`；无 `access-control-allow-origin` | ✅ no-store；ACAO 缺席（含 403 响应） |
| TC-A04 | 方法门控 | `POST /status`、`POST /stats`、`PUT /stats`、`GET /delete` → 405 | ✅ 全部 405 |
| TC-A05 | fire-and-forget 立返 | 402 会话冷语料首拉不等全量 sweep | ✅ 首拉 **32ms**（返回旧快照 n=1）；全程最大单次响应 32ms |
| TC-A06 | 渐进填充（评审移交重点） | 轮询 100ms：行自底部追加、pending 可见且收敛、complete false→true、行数单调不减 | ✅ 行 1→15→267→402；观测到 `pending=381, complete=false`；**t=873ms 收敛** `complete:true, pending:0`；行数全程单调不减 |
| TC-A07 | 数据抽取正确性 | 每行 model=`provider/model`（request/header 尾扫 last-wins）、usage 四桶、pressure 三字段 | ✅ 400/400 行 model=`qwen/qwen3.8-max`、四桶数值齐备、`contextWindow=1000000` |
| TC-A08 | per-id 错误隔离 | 事件帧损坏的会话 → 该行 `error` 标记，其余行正常，路由恒 200 | ✅ 该行 `{"model":null,"usage":null,"pressure":null,"error":"corrupt"}`，其余 401 行不受影响 |
| TC-A09 | revision 缓存 | 语料不变时跨节流窗 5 连拉（间隔 600ms） | ✅ 数据逐字节一致、`complete:true`、响应 5~20ms |
| TC-A10 | revision 变更重观察 | 改写 1 个会话日志（request/header 换 provider/model）后轮询 | ✅ ~500ms 内该行 model 变为 `mockprov/mockmodel-x`（last-wins 生效） |
| TC-A11 | 删除信任栅栏 | 无自定义头 → 403；`OPTIONS` → 403；带头 + 跨站 Origin → 403；`sec-fetch-site: cross-site` → 403；伪造 Host 拒绝 | ✅ 403 untrusted-origin / 403 / 403 / 403 / 拒绝（无绕过路径） |
| TC-A12 | 入参校验 | 非 JSON → 400；空数组 → 400；201 个 id（超 maxBatchSize=200）→ 400；`../escape`、`a/b`、空串 → per-id `invalid-id` | ✅ 400/400/400；非法 id 走 200 + 逐条 `code:"invalid-id"` 结构化报告（路径穿越被拒） |
| TC-A13 | 批量删除 + prune | 401 个 id 先整体提交验证超限 400，再按 ≤200 分块删除；随后 stats 收敛 | ✅ 超限 400；分块删除 **401/401 ok、0 失败（421ms）**；~1s 内 stats 收敛至仅剩原始会话（prune 生效） |
| TC-A14 | index-inject | GUI 首页注入 `globalThis.__DSH_SESSION_BATCH__` | ✅ `{"routeBase":"/dsh-session-batch/v1","version":"0.1.0","statsPollIntervalMs":5000}` |
| TC-A15 | 空语料契约 | 语料为空时 sweep 收敛 | ✅ `complete:true, pending:0, n:0, degraded:false`（UI §6.3 空态的数据面成立） |
| TC-A16 | 重装后冒烟 | 5 个合成会话：list → 栅栏 → 删除 → prune | ✅ n=5 全 `error:null`；无头 403；删除 5/5 ok；prune 到空、目录清零 |

补充事实（合成 header-only 日志）：`usage` 返回四桶全 0、`pressure` 返回 `{}`（可选字段原样）、`model:null`——契约「或 null / 可选字段原样」语义正确，前端对缺失字段显示「—」。

## C. 用户实测 bug 回归复核（P0：删除后行残留、状态变「已归档」）

**根因**（项目经理定位，测试确认）：`dashPanelFace` 曾传挂载时快照 `store.get().tombstones`，`addTombstones` 更新后面板 memo 依赖不变、行过滤不重算。

**修复复核（代码级 + 产物级，全部通过）**：

1. 接线：`index.tsx:88` 传 `tombstoneSource: store.source`；`DashboardPanelSlot`（:126-129）`useSyncExternalStore(tombstoneSource.subscribe, () => …getSnapshot().tombstones)` 实时订阅；
2. 通知链：`store.addTombstones` 生成**新数组**（Set 合并 + 封顶切片）→ `store.set` 通知订阅者；无变更时快照引用稳定（uSES 无死循环风险）；
3. 过滤链：`DashboardPanel.tsx:112-134` `rows` memo 以 `sidebarOps.tombstones` 为依赖、行级 `!tombstones.has(s.id)` 过滤；**四个过滤视图**（全部/主会话/子代理/已归档）与 chips 计数全部派生自 `rows`（:136-150），一处过滤全视图生效；
4. 删除流程：`doDelete` → `runDeleteCore` → `addTombstones(okIds)` → `refreshSessions()` + `fetchStats()`（:248-253），与设计 §5.2 一致；
5. 墓碑经 localStorage 持久化（水合 + 封顶 200），GUI 刷新后仍隐藏——与宿主「live 会话删除走归档集墓碑路径、重启前 sessionQuery 仍返回该行」的语义配套，客户端过滤确为唯一防线；
6. 产物一致性：沙箱 `node_modules/@local/dsh-session-batch` 是指向工作区的符号链接；`lib/client.js` 07:44 重建（含 `tombstoneSource`），容器 07:45 重启——**运行中的即修复版**（浏览器需刷新页面加载新 bundle）。

**行为级验证需真 GUI 删除一个 live 会话**，无法自动化，列为 §F 人工清单第 1 项。

## D. 文案键审计（UI §11）

规格 40 个 `dash.*` 键在 `locales.ts` zh/en 双语字典 **40/40 齐备**，无单边缺失、无规格外多余键。

## E. 观察项（不阻塞，记录在案）

1. **分类期瞬时状态**：sweep 的分类循环会先预填占位行、后置 `pending/complete`，轮询可能短暂看到 `complete:true` 且行数仍在增长（实测 402 语料下该窗口 <340ms），随后切入 pending 态。面板表现为「已更新」短暂闪现后回到进度条——亚秒级 cosmetic，建议后续把 `completed=false` 提前到分类循环之前。
2. **dsh 平台行为**：头行帧损坏的日志会被 `persistence.list()` 静默跳过（不出现在 stats、无告警）；只有事件帧损坏才产生 per-id error 行。UI 的「会话日志已损坏」提示只能覆盖后者，属数据源限制，非插件缺陷。
3. 评审 v2 已记录的两条维持原判：stats.ts:164 注释与行为不符（cosmetic）；`listSessions` 失败分支 pending/complete 短暂自相矛盾（下轮自愈）。

## F. GUI 人工验收清单（需真人在沙箱 GUI 操作）

沙箱 GUI：`http://127.0.0.1:13080`（一次性 token 用 `cd dev-dsh && ./dsh-dev.sh status` 获取；**先刷新页面**确保加载修复后的 bundle）。当前语料为空，需先在 GUI 里创建/打开 2~3 个会话再测。

| # | 优先级 | 项 | 步骤与预期 |
|---|---|---|---|
| 1 | **P0（本次 bug 回归）** | 仪表盘删除 live 会话行立即消失 | 打开一个会话使其 live → 仪表盘勾选 → 删除 → 确认后：**行立即消失**，切遍「全部/主会话/子代理/已归档」四个视图均无残行、chips 计数同步减少；侧栏列表同步掉行；「已归档」视图无残行；**刷新 GUI 页面后仍不出现**（墓碑 localStorage 持久化） |
| 2 | P1 | 渐进填充视觉（UI §12.4） | 语料较多时打开面板：首载骨架行 → 行自底部追加不跳动 → header「正在读取 n 个会话…」+ 顶部进度条 → complete 后进度条隐藏、切「已更新 {time}」。（数据面已自动化验证，此项只验视觉） |
| 3 | P1 | 层级（§12.1） | 面板盖住页面与侧栏工具条；DeleteDialog 盖在面板上；Tooltip 不被面板裁剪；notice 显示在面板之上；关闭后工具条恢复 |
| 4 | P1 | 交互（§12.6） | 过滤切换清选择集；全选=当前视图；归档↔恢复语义切换；busy 中面板不可关、按钮 disabled、done/total 递增 |
| 5 | P2 | 双主题（§12.2） | 浅/深两套下核验 warn 进度条、「—」占位、骨架行、sticky 列背景 |
| 6 | P2 | 键盘/读屏（§12.7） | 打开焦点入面板 → Tab 循环 → Esc 关闭还焦入口；DeleteDialog 开时 Esc 归 Modal；progressbar/table 语义可遍历 |
| 7 | P2 | 窄窗四档（§12.8） | 1440/1024/768/390px：390 无页级横滚、模型列并入会话格、sticky 列背景随行态正确 |
| 8 | P2 | 触摸（§12.9）与动效（§12.10） | 点行选中无 hover 残留；点数值弹 Tooltip 不触发选中；`prefers-reduced-motion` 下无入场/进度动画 |
| 9 | P2 | macOS 安全区（§12.3） | 桌面 App 内 `--dsh-frame-top-clearance` 生效，header 不压标题栏（沙箱浏览器不适用，桌面端核验） |

## 测试数据与方法附注

- 造数方法：克隆真实会话日志并按 dsh JSONL zstd 容器布局重压（帧 1=头行、帧 2=事件体，`ZSTD_c_checksumFlag=1`）；**单帧整文件压缩会被 persistence 判为头帧校验失败而静默跳过**——首轮造数因此不可见，属造数方法问题，非产品缺陷。
- 损坏隔离用例：合法头帧 + 非 zstd 垃圾尾帧 → 可被 list、observe 失败 → `error:"corrupt"` 行。
- 全部测试语料已经删除路由清场并核验目录归零；原始会话数据无损（token/压力数值与测试前一致）；用户删除原会话发生在其自主 GUI 实测期间，与本轮测试无关。
