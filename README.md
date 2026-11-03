# @local/dsh-session-batch

dsh 会话批量管理插件：在侧栏多选会话，批量**归档 / 恢复 / 删除** + **会话管理**（可视化面板，查看 token 消耗、缓存、上下文占比）。

dsh GUI 原生只有单个会话的归档，没有任何删除入口。本插件补上：

- 每个会话行**最左侧**一个**选择框**（仅批量管理模式显示；勾选后一直保持勾选 + 行高亮，退出选择模式也不丢失；**任一批量操作（归档/恢复/删除）完成后自动清空选择集**，手动「清空」亦可）；
- 侧栏底部**「批量管理」开关**：进入选择模式后**点击行任意处 = 切换选中**（打开会话、双击重命名、拖拽排序、Enter/Space 都被接管），`Esc` / 退出按钮只退出模式、保留已选；右键菜单**「批量选择会话」**为可选贡献（0.2.2-alpha.2 发行版没有 `contextMenus` 服务，该入口安静缺席，带右键菜单系统的新版 dsh 自动生效）；
- 底部浮动工具条：**有选中即显示**（不限于选择模式）：计数 / 全选 / 清空 / **归档**（全部选中项已归档时变**恢复**）/ **删除**（先确认）/ 退出（仅选择模式）；
- 批量归档遇到「会话有运行中工作」时单独归类，通知里给**「停止并归档」一键重试**（与原生归档对话框同一升级路径）；
- 批量**删除**：确认对话框列出目标会话 → 宿主路由物理删除 JSONL 日志目录 → 广播 `api-session/removed`，所有已连接 GUI 立即掉行。

### 会话管理

侧栏底部「会话管理」入口（仪表盘图标）打开全屏面板，**只读扫描**所有本地会话的 token 消耗、缓存读写与上下文占用：

- **6 列表格**：选择框 / 会话（标题 + 运行中/子代理/已归档/置顶徽标）/ 模型 / Token 消耗（四桶合计 + 明细 tooltip）/ 缓存读·写 / 上下文百分比（进度条，≥90% 警告色）；
- **4 个过滤 chips**：全部 / 主会话 / 子代理 / 已归档；过滤切换自动清空选择集；
- **面板内批量操作**：归档/恢复/删除（复用现有核心，独立于侧栏选择集）；
- **渐进加载**：首扫 O(全量日志) 分帧填充，骨架屏 → 底部追加新行 → pending 递减 → progressbar；
- **5s 轮询**（面板打开期间），visibilitychange 暂停，配置项 `statsPollIntervalMs`；
- 损坏会话 per-id 隔离（警告图标 + tooltip），不炸整表；
- `session-query` 不可用时降级为「仅列表 + 批量操作」。

## 安装（沙箱）

```sh
cd dev-dsh
./dsh-dev.sh install-plugin /Users/jiawen.guang/AI/my-deepseek-harness/plugins/dsh-session-batch
./dsh-dev.sh dump-config | grep -B2 -A8 session-batch   # 一行：session-batch（裸包名）
curl -s http://127.0.0.1:13080/dsh-session-batch/v1/status
# {"ok":true,"service":"@local/dsh-session-batch","version":"0.1.0"}
```

手动装载：`dsh plugin --profile dev add <本目录绝对路径>` 后重启。

> **一行的原因**：client-modules 要求声明了 `dsh.client` 的包在 Loader 里只能有一条
> 活动行（多行会报 `resolves from multiple active Loader sources` 拒绝启动）。
> 裸包名行同时承担宿主 main（删除路由）与浏览器半锚点两个角色。

## 配置（cordis.patch.yml 的 `session-batch` 行）

| 字段 | 默认 | 说明 |
|---|---|---|
| `routeBase` | `/dsh-session-batch/v1` | 宿主路由前缀；经 `webserver/index-inject` 写入页面全局 `window.__DSH_SESSION_BATCH__`，浏览器半自动发现。 |
| `maxBatchSize` | `200` | 单次删除请求的会话数上限。 |
| `trustedHosts` | `[]` | Host 栅栏额外信任的权威（`host` 或 `host:port`）；仅非回环部署需要。 |
| `statsPollIntervalMs` | `5000` | 仪表盘面板打开时 stats 轮询间隔（ms）；经 index-inject 下发浏览器半。 |
| `statsSweepConcurrency` | `4` | 冷会话观察并发上限（对齐 `SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY=4`）。 |

### 路由

| 方法 | 路径 | 栅栏 | 用途 |
|---|---|---|---|
| GET | `{routeBase}/status` | 无 | 安装验证与探活。 |
| POST | `{routeBase}/delete` | Host + 自定义头 | 批量删除会话（见删除语义）。 |
| GET | `{routeBase}/stats` | 无（只读） | 会话统计：模型/token/缓存/上下文百分比；`cache-control: no-store`。 |

## 删除语义（v1，逐会话独立判定，单个失败不影响其余）

按顺序，任一步失败即返回该会话的分类失败（`code`）：

1. **拒绝有运行中工作的会话**（`active`）：`workspace/session-activity` 瀑布非空（进行中的轮次、subagent、后台任务、定时器）。先归档（可停止任务）再删。内存中挂载但**空闲**的 live 会话放行（与原生归档同语义）——GUI 打开过的会话其 Agent 随宿主进程常驻且无公开卸载 API，拒绝 live 会让它们重启前都删不掉。
2. **物理删除**：`sessionPersistence.stat` 定位 JSONL 目录；后端**延迟落盘**的 pending 会话（有快照无 `location`）先经 `persistence.flush()` 强制物化再定位；目录名必须等于 `encodeSegment(id)` 且真包含于持久化 root（双重校验防误删），然后 `rm -r`。
3. **注册表记账**（尽力而为）：挂载中的 live 会话（GUI 打开过；0.2.2-alpha.2 无在线卸载 API）走**墓碑**路径——文件删除后加入归档集，活动视图立即隐藏该行，仍打开的旧标签页会被原生「已归档」门拦截。墓碑**不做 GC**（宿主重启后仍开着的标签页会自动 resume 会话，留着墓碑可把重建的会话拦在归档门外、远离活动视图；无文件无 live 行时墓碑 id 不产生任何可见行）。非 live 会话移出归档集/置顶集，并从工作区记录摘除。
4. **客户端墓碑隐藏**：删除成功的 id 同时写入浏览器端墓碑集（localStorage 持久化，跨刷新存活），overlay 常驻注入 `display:none` 行规则——live 记录复活出来的残行在**活动视图与归档视图**都不再出现，也不进「全选」。宿主重启后 live 记录消失，规则自然失配（无害）。同一浏览器的其他已开标签页刷新后生效；其他浏览器由宿主端归档墓碑兜底（活动视图隐藏，归档视图中的残行在宿主重启后消失）。
4. **广播 `api-session/removed` 并幂等收尾**：GUI 立即掉行；**没有任何持久化产物**（此前已删 / 客户端残影「幽灵行」/ 重启前未落盘即丢失）同样广播掉行并按成功报告——「会话不存在」的目标状态已经达成，顺手把各 GUI 的残影行清掉。

安全栅栏（对齐 dsh `/api` 的浏览器信任模型）：仅接受携带 `x-dsh-session-batch: 1` 自定义头的 POST；Host 必须是回环拼写 / 绑定地址 / `trustedHosts`；`Sec-Fetch-Site: cross-site` 一票否决；Origin 必须同权威；OPTIONS 一律 403、不发 CORS 头——恶意网页无法跨源触发删除（自定义头触发 preflight 即被拦截）。

### 已知边界

- 删除只清理**会话日志目录**与注册表记账；附属状态（KV 存储条目、计划任务注册、附件缓存等）不在 v1 范围内——目标会话已按第 1 步排除运行态，残留条目惰性且无害。
- 删除 GUI 挂载中的 live 会话后：本浏览器由客户端墓碑直接隐藏残行（含归档视图）；其他客户端由归档墓碑隐藏活动视图行。仍打开的旧标签页里继续对话会被原生「会话已归档」门拦截（不会重建文件）；宿主重启且所有旧标签页关闭后，该会话不再以任何形式出现。
- subagent 会话不进「全选」（与原生列表行为对齐），但可以单独点选删除。
- 搜索结果列表里的行不渲染选择框（宿主没在该视图开放 row.action 槽）；批量操作面向主列表。
- 桌面 App（0.2.1-rc.3）未验证；沙箱与源码 0.2.2-alpha.2 为开发基线。
- **仪表盘**：首扫 O(全量日志)，大库（数百会话、长历史）可能分钟级——面板显示 pending 进度，新→旧渐进填充，此后仅 revision 变更的会话才重放日志；轮询仅面板打开期间（5s 默认），关闭零开销。
- **仪表盘 tooltip** 为纯文本（dsh Tooltip 原语的 `label` 类型是 `string`，不支持 JSX 富文本）；分桶明细以换行分隔的键值对呈现。
- **上下文百分比** 为参考值（`contextPressure` 非原子观测），切换模型后可能短暂滞后。
- 仪表盘过滤 chips 用的 `Pill` 控件计数在渐进加载期间随数据增长，属预期行为。

## 工程结构

```
src/host/index.ts     宿主半（包 main）：删除路由 + stats 路由 + index-inject 配置发布
src/host/stats.ts      SessionStatsAggregator（revision 缓存 + 并发 + per-id 隔离）
src/host/trust.ts     浏览器信任栅栏（/api 模型的紧凑复刻 + 自定义头）
src/host/segment.ts   encodeSegment 复刻（删除前目录名校验）
src/host/types.ts     dsh 服务的结构化类型（运行时零 dsh 依赖）
src/client/index.tsx  浏览器半入口（5 个槽位占位 + 右键菜单 + 字典）
src/client/ops.ts     批量归档/恢复/删除/全选实现（核心/侧栏包装两层）
src/client/store.ts   createSnapshotStore 状态 + 派生源（BatchState）
src/client/dashboard-store.ts  仪表盘面板独立状态（DashboardState）
src/client/stats-client.ts  fetchStats + 轮询生命周期
src/client/styles.ts  注入式样式表（--dsw-* 令牌 + 回退值）
src/client/DashboardPanel.tsx  全屏面板（表格/过滤/操作/骨架/错误态）
src/client/DashboardEntry.tsx  footer 仪表盘入口按钮
src/client/RowCheckbox.tsx / FooterToggle.tsx / BatchOverlay.tsx / DeleteDialog.tsx
```

构建：`pnpm install && pnpm build`（esbuild：宿主 ESM 零 external；浏览器 CJS + `__ModuleLoader__` 封套，external 仅平台模块表）。类型检查：`pnpm typecheck`。

## 与宿主的耦合点（升级 dsh 时复核）

- 行 DOM：`div[data-row-key^="session:"]`，子元素 `span.slot / span.title / span.rowResting / span.rowActions`（`packages/client/ui-workspace/src/client/rows/Rows.tsx`）；
- 槽位：`sidebar.workspaces.session.row.action` / `sidebar.footer.action` / `shell.overlay`；
- 服务：`sessions`（list/refresh）、`workspaces`（archive/unarchive/list）、`locale` 硬依赖 + `contextMenus` 可选等待、`slots`；宿主侧 `sessions` / `sessionPersistence` / `workspaceRegistry` / `webServer`；
- **发行版差异**：0.2.2-alpha.2 发行 bundle 里没有 `contextMenus`（源码仓 master 后加的），右键菜单贡献经 `ctx.inject` 等待、不阻塞启动；其余全部契约（三个槽位、行 DOM、`WorkspaceArchiveError`/`workspace/session-active`、`api-session/removed`、`workspace/session-activity`、归档集/置顶集/detachSession、全部图标与 Modal/Button）已逐一在发行 bundle 里核对存在；
- 事件：`webserver/index-inject`、`workspace/session-activity`（瀑布）、`api-session/removed`（发射）；
- 归档拒绝判别：`error.name === 'WorkspaceArchiveError'` 且 `rpcError.code === 'workspace/session-active'`（类身份跨 bundle 不可用）。
