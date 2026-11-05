# 会话可视化仪表盘（Session Dashboard）· 技术设计

> 插件：`@local/dsh-session-batch`（`plugins/dsh-session-batch`）
> 目标版本：dsh `0.2.2-alpha.2`（沙箱 dev profile，与源码仓 master 对齐）
> 状态：§1–10 已随 v0.1.1（`d577ed7`）实现上线；§11 树形增量已被 **§13（v0.3：两档压平、行集口径、fork 终裁、会话召回）修订替代**——实现与验收一律以 §12/§13 及 ui §15/§16 为准，合并进 0.2.0 实现。数据源结论由项目经理前期查证，本文全部经源码复核。

## 1. 需求与范围

在现有批量操作（侧栏多选 + 归档/恢复/删除）之上，新增一个**会话可视化界面**：

- 点击入口进入；全屏面板展示**所有** session 的状态；
- 每个 session 展示：**模型、token 消耗、缓存（读/写）、上下文已用百分比**；
- 面板内可**批量操作**（归档/恢复/删除），复用现有 ops；
- subagent 会话与归档会话纳入视图（带过滤）。

非目标（本期不做）：SSE/WS 推送、跨会话计费汇总、修改会话内容。

## 2. 总体决策（对项目经理所列问题的回答）

| 设计问题 | 决策 | 依据 |
|---|---|---|
| 宿主聚合路由形态 | `GET {routeBase}/stats`，**渐进式**（`complete`/`pending` 标志），聚合器自带按 revision 的增量缓存 | 首扫 O(全量日志)，必须分帧；同源 GET 免栅栏即可 curl 验证 |
| 全量 replay 开销摊法 | 聚合器缓存 `Map<id, {revision, stats}>`；每轮 sweep 先 `persistence.stat(id)` 比 revision，**只重新观察变更过的会话**；live 会话走注册表快照（O(1)）；扫描有并发上限 | `sessionQuery` 观察器内部 LRU 容量仅 5（`SESSION_QUERY_DEFAULT_PREPARED_SESSION_CACHE_SIZE`），若无外层 revision 缓存每轮会全量重载日志 |
| 前端面板挂载 | `shell.overlay` **第二占位**（`id: 'session-batch.dashboard'`），全屏 fixed 面板 | 该槽为多占位槽：ui-chat `chat.quota-notice`、ui-context-menu、ui-file-drag 同槽并存（AppFrame `renderSlot('shell.overlay')`） |
| 入口 | `sidebar.footer.action` 第二按钮（`order: 60`，批量开关之后） | 与现有 FooterToggle 同模式；右键菜单入口列为可选增强（contextMenus 可选注入已有先例） |
| 数据刷新 | **轮询**：仅面板打开期间，默认 5s（Config 下发），visibilitychange 暂停，批量操作后立即拉一次；SSE 推送列为后续演进 | 插件 webServer 路由无流式先例；api-remotes 广播不对外部插件开放 |
| subagent / 归档会话 | **全量纳入**：行带 origin/归档/置顶徽标；过滤 chips（全部/主会话/subagent/已归档） | 需求原文「所有 session」；`SessionRecord.header.origin === 'subagent'` 客户端 list 已有 |
| 仪表盘选择集 | **独立于侧栏选择集**，不进入侧栏 select 模式；ops 拆出「操作核心/选择副作用」两层 | 避免与 BatchOverlay 的文档级 Esc/点击拦截器打架（Esc 双触发、底部工具条穿透） |

## 3. 数据流

```
[浏览器]                          [宿主]
DashboardPanel (shell.overlay)
  └ stats-client 轮询 ──────────► GET {routeBase}/stats
                                   └ SessionStatsAggregator.maybeSweep()
                                      ├ sessionQuery.listSessions()      ← 全逻辑语料（live+persisted，新→旧）
                                      ├ 逐 id：persistence.stat(id).revision
                                      │   与缓存一致 → 跳过；live → 直接观察（注册表快照）
                                      ├ 变更 id（并发 ≤ statsSweepConcurrency）：
                                      │   sessionQuery.observeSession(id)
                                      │     ├ .projections.values.tokenUsage      ← dsh-token-meter 投影
                                      │     ├ .projections.values.contextPressure ← dsh-token-meter 投影
                                      │     └ .events 从尾向前扫 → 最后一个 request/header
                                      │        → data.header.config.provider/model
                                      └ 更新 stats 缓存（prune 已删 id）
  ◄────────────────────────────── { complete, pending, sessions[] }
  与客户端数据 join 渲染：
    sessions.list（标题/origin/running/updatedAt）+ workspaces.list（归档/置顶）
    + tombstones 过滤（复用现有墓碑）
```

**上下文百分比算法与 GUI 完全一致**（`packages/client/ui-conversation/src/client/context-occupancy.ts:15-24`）：

```ts
used = projectedTokens ?? pressureTokens          // 都缺 → 显示「—」
percent = min(100, round(used / contextWindow * 100))
```

`ContextPressureProjection` 的字段是 last-wins 而非一次原子观测（模型切换后短暂错配）——沿用 GUI 的「参考值」口径，面板 tooltip 注明。`tokenUsage` 四桶为全日志累计（fork 继承前缀也计入），展示口径 =「该会话累计消耗」。

## 4. 宿主侧设计

### 4.1 路由（`src/host/index.ts` 扩展）

- `GET {routeBase}/stats`：**只读、免栅栏**（与 `/status` 同策略；不发 CORS 头，跨源 JS 读不到响应；载荷无标题、无密钥，只有 id/模型名/token 数）。返回 `cache-control: no-store`。
- 处理器调用聚合器 `maybeSweep()`（并发去重：进行中的 sweep 共享同一 Promise；固定 1s 节流窗是协议常量，非部署参数），随后返回缓存快照。**没有客户端请求就没有任何宿主开销**（无后台定时器）。
- 降级链：`ctx.get('sessionQuery')` 缺席 → `{ ok: false, code: 'session-query-unavailable' }`，面板降级为「仅列表 + 批量操作」并提示；`sessionProjections` 缺席时 `observeSession` 走 `projectionMode` 缺省仍可用（事件扫描给模型名，token 列为空）。

### 4.2 聚合器（`src/host/stats.ts`，新增）

```
SessionStatsAggregator
  sweep(): 1) listSessions() → 记录集（新→旧）
           2) prune 缓存中已消失的 id
           3) 对每条记录：
              live（ctx.sessions 有）→ 观察（注册表快照，O(1)）
              persisted → stat(id).revision 命中缓存 → 跳过
                          未命中 → 入队（并发 ≤ statsSweepConcurrency）
           4) 观察一个 id：observeSession(id) → 抽取（见下）→ 写缓存
           5) 每会话错误隔离：corrupt/persistence-failed 记为 per-id error
              （SessionQueryError 分类），不使整路由 500
```

**抽取**（对一次 observation）：

- `usage`：`projections.values.tokenUsage` → `{uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}`（字段名与投影保持一致，免翻译层）；
- `pressure`：`projections.values.contextPressure` → 原样透传可选字段（`pressureTokens/projectedTokens/contextWindow`）；
- `model`：`events` 自尾向前找第一个 `type === 'request/header'` 事件 → `data.header.config.provider` + `data.header.config.model`（`EpochHeader.config` 是 `LlmCallConfig`）。最后一个 request/header 距日志尾通常仅一回合事件，扫描成本近常数；无请求事件（空/草稿会话）→ `null`。

**缓存与内存**：聚合器缓存 O(会话数) 小对象；观察器内部 LRU(5) 限制驻留事件数组 ≤ 5 个会话；扫完即释放。首扫成本 = O(全语料日志)，按新→旧渐进填充（表格顶部先出来），面板显示 `pending` 计数。

### 4.3 线上契约（v1）

```jsonc
// GET /dsh-session-batch/v1/stats
{
  "ok": true, "service": "@local/dsh-session-batch", "version": "…",
  "generatedAt": 1730550000000,
  "complete": true,          // 本轮 sweep 是否完成
  "pending": 0,              // 尚未观察的会话数（渐进进度）
  "sessions": [              // 新→旧
    {
      "id": "…",
      "model": "deepseek/deepseek-chat",   // 或 null
      "usage": { "uncachedInputTokens": 0, "outputTokens": 0,
                 "cacheReadTokens": 0, "cacheWriteTokens": 0 },  // 或 null（无投影）
      "pressure": { "pressureTokens": 12000, "projectedTokens": 12100,
                    "contextWindow": 131072 },                    // 可选字段原样
      "error": null           // 'corrupt' | 'persistence-failed' | …
    }
  ]
}
```

**不**下发标题/updatedAt/running/origin/归档态——浏览器已持有（`sessions.list` + `workspaces.list`），按 id join，载荷最小化。

### 4.4 配置（`cordis.patch.yml` + zod）

```yaml
config:
  routeBase: '/dsh-session-batch/v1'
  maxBatchSize: 200
  trustedHosts: []
  statsPollIntervalMs: 5000   # 面板打开时轮询间隔（随 index-inject 下发浏览器）
  statsSweepConcurrency: 4    # 冷会话观察并发上限
```

- `statsPollIntervalMs`：`z.number().step(1).min(1000).max(60000).default(5000)`
- `statsSweepConcurrency`：`z.number().step(1).min(1).max(16).default(4)`（对齐 `SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY = 4`）
- `index-inject` 的 global 值扩展为 `{ routeBase, version, statsPollIntervalMs }`（`window.__DSH_SESSION_BATCH__`，浏览器半发现轮询间隔的唯一通道）。

## 5. 浏览器侧设计

### 5.1 挂载与入口

- `shell.overlay` 第二占位：`slots.inject('shell.overlay', …slots.register({ name:'shell.overlay', id:'session-batch.dashboard', locale: NS, inject: face }, DashboardPanel))`；
- 面板本体 `createPortal(…, document.body)` 全屏 fixed（层级高于现有底部工具条；同 BatchOverlay 的 portal 理由）；
- 入口 `sidebar.footer.action` 第二占位 `id: 'batch-dashboard'`, `order: 60`（FooterToggle 是 50）；图标走 `dsh-client-ui-primitives`（已在 externals 表内）；
- Esc / 背景点击关闭；关闭时丢弃仪表盘选择集（不影响侧栏选择集）。

### 5.2 状态与轮询

- `dashboard-store.ts`（新增，`createSnapshotStore`）：`{ open, filter, selected, stats: { rows, complete, pending, generatedAt, error } }`；
- `stats-client.ts`（新增）：`fetchStats()`（GET，无自定义头）+ 轮询生命周期（open→启动 interval、close/hidden→清除；unmount 清理定时器——评审必查项）；批量操作完成后立即 `sessions.refresh()` + 手动拉一次 stats（sweep 节流窗内直接命中去重）；
- join：行 = `stats.sessions` × `sessions.list.byId`（标题/origin/running/updatedAt）× `workspaces.list`（归档/置顶）− `tombstones` − 未落盘草稿行（`sessions.list` 中 `blank === true`：未落盘、零数据、无归档/删除语义，不进看板行集，也不可被勾选——与侧栏全选的既有排除规则一致）。（v0.2 树形增量：管线扩展为 join → tree → filter → 折叠可见性，filter 判据改为血统归档派生——**有意变更**，见 §11.5/§11.9。）

### 5.3 UI 结构（表格，纯 CSS 无图表库）

> v0.2 树形增量：本节表格新增「项目」列（七列）、会话列树形化（展开按钮/缩进/子数徽标）、chips 计数改为各档会话总数——差异以 §11 为准（§11.9 有逐条对照），本节保留 v0.1 原文。

| 列 | 内容 |
|---|---|
| ☑ | 复选（dashboard 选中集；表头全选/清空） |
| 会话 | 标题（取 `sessions.list` 的 `title` 字段；空值直接回落会话 id，**不经** `displayTitle` 的「项目目录 basename」回落——避免无标题会话伪装成文件夹名；该规则已升格为**全局不变量**，适用于所有渲染标题的面，见 §12）+ 徽标：运行中 / 已归档 / 置顶 / subagent |
| 模型 | `provider/model`，无 → 「—」 |
| token 消耗 | 四桶合计（紧凑格式 12.3k），详情气泡分桶 |
| 缓存 | 读 / 写 两数 |
| 上下文 | `used / window (percent%)` + div 进度条；数据缺 → 「—」 |

- 过滤 chips：全部 / 主会话 / subagent / 已归档（客户端过滤，不改路由）；
- 操作条（面板内）：归档、恢复（选中全归档时切换）、删除（复用 `DeleteDialog`）、立即刷新、关闭；
- 进行中显示 busy 进度（复用现有 notice 模式报结果与失败明细）。

### 5.4 ops 重构（选择集解耦）

`ops.ts` 拆两层：

- **操作核心**（不触碰任何选择集，返回结构化结果）：`runArchiveCore(ids, opts)` / `runUnarchiveCore(ids)` / `runDeleteCore(ids)`——现循环抽出；
- **侧栏包装**（现行为不变）：完成后 `store.clearSelection()`（用户既有要求）；
- **仪表盘调用**：核心 + 完成后清理 `dashboard.selected`。

## 6. 复用面清单（全部既有资产，零新框架依赖）

| 资产 | 用途 |
|---|---|
| trust 栅栏（`src/host/trust.ts`） | 不变：POST delete 仍走栅栏；stats 只读免栅栏（同 status 先例） |
| `webserver/index-inject` | 扩展 global 值，向浏览器半下发 `statsPollIntervalMs` |
| webServer.register（exact 路由） | 新增一条 GET，注册/注销随 `ctx.inject(['webServer'])` |
| `sessions` / `workspaces` 客户端服务 | 标题/origin/归档集、归档/恢复 API |
| 现有删除路由 + `DeleteDialog` + 墓碑 | 仪表盘删除直接复用 |
| `createSnapshotStore` + `deriveSource` | dashboard store 同模式 |
| `sidebar.footer.action` / `shell.overlay` 槽位 | 入口 + 面板（均多占位语义） |
| `dsh-token-meter` 投影（宿主已装配） | tokenUsage / contextPressure 数据源 |
| `ctx.sessionQuery`（observeSession/listSessions） | live 优先观察 + LRU + 修订号 |

## 7. 文件级改动清单

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/host/stats.ts` | **新增** | SessionStatsAggregator：sweep / revision 缓存 / 抽取 / 并发 / 每会话错误隔离 |
| `src/host/index.ts` | 修改 | 注册 `GET stats` 路由；index-inject 扩展；Config 两个新字段 + zod |
| `src/host/types.ts` | 修改 | `sessionQuery`（observeSession/listSessions/observation/projection values）、`SessionStatSnapshot.revision` 结构类型 |
| `src/client/DashboardPanel.tsx` | **新增** | 全屏面板：表格 + 过滤 + 操作条 + Esc/背景关闭 |
| `src/client/DashboardEntry.tsx` | **新增** | footer 入口按钮 |
| `src/client/dashboard-store.ts` | **新增** | 面板状态 store |
| `src/client/stats-client.ts` | **新增** | fetchStats + 轮询生命周期 |
| `src/client/index.tsx` | 修改 | 注册两个新占位；face() 注入扩展 |
| `src/client/ops.ts` | 修改 | 拆操作核心/选择副作用两层 |
| `src/client/types.ts` | 修改 | DashboardProps / StatsRow / 窗注入类型扩展 |
| `src/client/locales.ts` | 修改 | zh/en 全部新文案 |
| `src/client/styles.ts` | 修改 | 面板/表格/进度条样式 |
| `cordis.patch.yml` | 修改 | 新 config 键及注释 |
| `README.md` | 修改（实现期） | 仪表盘功能、路由、配置、已知限制 |
| `docs/design-session-dashboard.md` | **新增（本文）** | 设计文档 |

构建无需改：`scripts/build.mjs` 按入口打包，新文件经相对导入自动进 bundle（宿主 ESM 全打包零 external；浏览器半 externals 不变）。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| **首扫开销** = 全语料日志 replay（大库分钟级） | 渐进式 + `pending` 进度；新→旧填充；此后仅 revision 变更才重放；面板关闭零开销 |
| 观察器 LRU=5 导致重扫 | 聚合器自带 revision 缓存，跳过未变更 id（不进 LRU） |
| `contextPressure` 非原子（换模型短暂错配） | 沿 GUI 口径展示为参考值，tooltip 注明（token-meter 源码注释原意） |
| 大库响应体偏大（~200 会话 ≈ 30KB；数千级会话） | v1 接受；记录为已知限制，后续 `?ids=`/`?since=` 分页 |
| 每轮 sweep 的 `listSessions()` + `stat()` 头部读放大 | 轮询仅面板打开期间；成本 = 每会话两次头部读，5s 一轮可接受；异常大库调大 `statsPollIntervalMs` |
| 0.2.2-alpha.2 结构类型漂移 | 与现有 `types.ts` 同纪律：只声明实际调用成员；沙箱 dump-config + curl 验证 |
| corrupt 会话拖垮路由 | per-id error 行（SessionQueryError 分类映射），路由恒 200 |
| Esc/点击拦截器冲突（BatchOverlay 文档级监听） | 仪表盘不进侧栏 select 模式（独立选择集 + ops 分层），彻底隔离 |
| 文案硬编码 | 全部走 `locales.ts` 字典（对齐 verify-client-ui-i18n 精神） |
| 泄露面 | stats 只读免栅栏但无 CORS 头（跨源不可读）；载荷不含标题/路径/密钥 |

## 9. 测试与验收

**分层测试**（实现 PR 内）：

1. 宿主单元：聚合器（revision 命中跳过、并发上限、per-id 错误隔离、模型 last-wins、空日志 null、prune）；路由（降级码、no-store、并发去重）。
2. 客户端组件：面板 join 渲染、百分比与「—」、过滤、选择 + ops 调用（core 层）、轮询启停（mount/unmount/visibility）、墓碑过滤。
3. ops 回归：拆层后侧栏批量行为不变（清选择集语义保持）。

**沙箱验收**（dev-dsh，给证据）：

```sh
node scripts/build.mjs
cd ../../dev-dsh && ./dsh-dev.sh install-plugin ../plugins/dsh-session-batch
./dsh-dev.sh dump-config session-batch        # 新 config 键生效
curl -s http://127.0.0.1:13080/dsh-session-batch/v1/status
curl -s http://127.0.0.1:13080/dsh-session-batch/v1/stats | jq '{complete, pending, n: (.sessions|length)}'
# GUI：打开面板 → 列/过滤/批量归档→恢复→删除 → 截图 + curl 前后对比
```

**代码评审清单**（系统架构师 review 用）：注册全部经 `ctx.effect`/`slots.inject`（HMR 可卸载）；轮询定时器与监听器随 unmount 清理；结构类型与 0.2.2-alpha.2 逐成员核对；Config zod 校验 + 非法值 fail loud（沿 `normalizeRouteBase` 先例）；文案全走字典；无 `as unknown` 新增、空 catch 命名错误；每会话失败不外溢；响应 `no-store`；README 同步。

## 10. 后续演进（记录，不在本期）

- SSE 推送（webServer 流式响应 + 变更广播）替代轮询；
- 大语料分页（`?ids=` / `?since=`）；
- 仪表盘内嵌会话详情抽屉（session-query 已有 `readSession`/`traceSession` 能力）；
- 自建投影单元（`request/header` 折叠）替代事件尾扫——若模型展示需要 O(delta) 更新再评估；
- 召回常驻入口：未分组区「查找可召回会话」按钮，彻底不依赖快照 diff——兜底**一切 diff 方案的共同残余**：插件未运行期间（GUI 未开，含 CLI 途径）添加的工作区、以及应用启动前的存量数据，在下次启动的首个 ready 快照里已是旧成员、diff 恒空，无任何召回入口（架构师 2026-11-05 核定并落档：**此为设计内已知边界，不是缺陷**——防将来被当「召回没反应」报 bug；测试工程师倾向 (b)+(c)，2026-11-05 项目经理拍板 (c) 本期不做，仅记录）；
- 「未挂账子代理清理区」：存量孤儿子代理 / 无 cwd 冷记录的 GUI 清理入口（§13.3 / §13.5 取舍记录，用户提出再做）。

## 11. 树形结构与项目列（v0.2 增量 · 定稿）

> 状态：**定稿**（项目经理 2026-11-03 拍板；产品经理验收点六条细则已吸收）。像素级/文案规格见 [ui-session-dashboard.md](./ui-session-dashboard.md) §15。
> ⚠️ **2026-11-04 用户验收修订**：档位结构、树层级、子代理可操作性、孤儿子代理归置已被 **§13** 修订（用户 GUI 验收反馈），冲突处以 §13 为准（§13.7 有逐条处置清单）；本节其余条款（血统归档派生、级联原子性、项目列、§12 不变量等）继续有效。
> 数据事实经系统架构师跨版核对：桌面 **0.2.1-rc.5**（asar 内 `projectList()` 实测）≡ 源码 0.2.2-alpha.2（`service.ts:645`），逐字同构，跨版无险。
> §1–10 为 v0.1 原文（已随 v0.1.1 落地）；与本节冲突处以本节为准，差异逐条列于 §11.9。

### 11.1 需求

用户原话：「进行功能完善，会话管理中，将主会话和子代理整合在一起，子代理作为主会话的子集，可以使用树形结构来展示，同时需要展示每个会话所属的项目」。

- **R1**：主会话为父节点、子代理为子节点的树形整合视图；
- **R2**：每个会话展示所属项目。

非目标（本增量不做）：子树 token 聚合行、按项目分组/排序、删除时「保留子代理」选项、展开状态持久化、SSE/推送。

### 11.2 数据事实（已验证的设计前提）

| 事实 | 结论 | 设计影响 |
|---|---|---|
| 客户端 byId 投影字段 | 含 `cwd` / `parentId` / `origin` / `title`（两版同构） | 组树与项目列**零新增快照面** |
| 父字段名 | 线协议 `parentSessionId`，客户端 byId 为 **`parentId`** | `SessionRowSummary` 补 `parentId?: string` |
| `delegationDepth` | 线协议 schema 有，客户端投影**丢弃** | 树深度必须派生（沿树递增） |
| 合成子代理行（retainedBy 兜底） | `parentId + origin:'subagent'`，**无 cwd** | 项目列取树级值（§11.7） |
| 归档血统语义 | DSH 核心 `underArchivedSession`（archived-session-gate.ts:34-55）：subagent 祖先链上任一归档 ⇒ 视为归档；visited 防环；桌面包同语义 | 归档级联 = 复刻核心**读侧**语义，零写入（§11.6） |
| unarchive 守卫 | 插件 `host/index.ts:368` 只认显式归档集合 | 血统归档子单独恢复天然 no-op → 交互只给置灰入口（§11.6） |
| 删除 | DSH 核心**不级联** | 删除级联由客户端 `descendantsOf` 展开（§11.6） |
| fork 会话 | 有 `parentId` 但 `origin` 非 subagent，不属 subagent 血统 | 根节点、不缩进、归「主会话」档 |
| 组树先例 | DSH `lineage.ts`：孤儿降根（"degrade to root, never drop"，lineage.ts:69）、环成员补发为根（lineage.ts:91-94）；`lineage.client.spec.ts` 有现成环/孤儿用例 | 树构建纯函数复刻，测试用例可平移 |

### 11.3 管线与模块

渲染管线（对 §5.2 的扩展）：**join → tree（血统归档标记 + 项目标签）→ filter → 折叠可见性 → 渲染**。

- 新增 `src/client/dashboard-tree.ts`：纯函数、**只允许 `import type`**（硬约束同 `dashboard-rows.ts`：插件 node_modules 无客户端运行时依赖，Node 24 type stripping 可裸 import `.ts`，契约测试直接打真实源码）；
- 导出：`buildDashboardTree(rows, inputs) → TreeRow[]`、`descendantsOf(id) → 平铺 id 列表`、`visibleRows(tree, expanded) → 可见行`；
- `TreeRow` 新增字段：`depth` / `childCount`（**直接**子数）/ `hasChildren` / `runningDescendants` / `lineageArchived` / `projectKey`（规范化全路径）/ `projectLabel`（basename）；
- `types.ts`：`SessionRowSummary` 补 `parentId?: string`；`DashboardRow` 透传 `parentId` / `cwd`（纯加法）；
- 项目标签在**树根算一次向下传**（含降级为根的孤儿：无 cwd 则 projectKey/projectLabel 为空，不冒充他项目）；
- store 新增 `expanded` 集合（会话级，不持久化）+ toggle；
- 性能：join/tree/filter 各 O(n)，几百会话 5s 轮询全量重算毫秒级，不做 memoize 特殊设计（架构评估④）。

### 11.4 组树语义

- 子节点条件：`origin === 'subagent' && parentId !== undefined && parentId 在行集中`；
- 孤儿子代理（父已删除/不在行集）降级为顶层平面行，保留子代理徽标；
- 环防御：visited 集合，环成员补发为根（同 lineage.ts:91-94）；
- fork → 根、不缩进；
- root/sibling 顺序沿用 join 行序（stats 新→旧，同 §8 排序结论）；
- `depth` 自 0 沿树递增（delegationDepth 不可得，派生）。

### 11.5 过滤四档语义（**有意的语义变更**）

判据从显式 `row.archived` 换为 **`effectiveArchived = archived ∨ lineageArchived`**，filter 顺移到 tree 之后（否则血统归档的子会漏在全部/子代理档——架构师指出的漏档点）：

| 档 | 形态 | 行集 |
|---|---|---|
| 全部 | **树形** | 全量行（含归档行，带徽标） |
| 主会话（默认档，问题一不回退） | 平面 | `origin !== 'subagent' && !effectiveArchived`（fork 归此档） |
| 子代理 | 平面 | `origin === 'subagent' && !effectiveArchived`；行附「所属主会话」小字（ui §15.5） |
| 已归档 | 平面 | `effectiveArchived`（显式 + 血统） |

- chips 计数 = 各档**会话总数**（「全部」档含被折叠的子行），与展开/折叠状态无关；
- **平面档规范化**（D1 缺陷裁决，2026-11-04）：主会话/子代理/已归档三个平面档的行一律 `depth=0`、无展开按钮、**无子数徽标**——「▸N」徽标及其运行点只在树形「全部」档呈现。理由：①平面档留不可展开的徽标就是「点了没反应」坑（§11.6 明令避免的同类）；②子数与运行信号在操作决策点已有承载——级联确认文案「及其 N 个子代理」、原子性拒绝明细点名运行中会话（§11.6）；③需要浏览子树的用户切「全部」档即一次点击。实现落点：`filterDashboardRows` 三个平面档统一归一化（depth/hasChildren 清零），一处消掉丢行/缩进/展开按钮/徽标四个症状；
- 契约测试影响：旧语义用例（如「子代理行不受父归档影响」）属**有意变更**，连测试一起改并在注释写明原因，不当回归修回去（项目经理指令）。

### 11.6 批量操作语义

- **勾选不级联**：父/子 checkbox 独立；父行三态——checked = 自身在选中集；indeterminate = 自身未选但任一后代已选；点击只增/删自身，永不触碰后代。
- **全选** = 当前档**可见**行（树形折叠时 = 顶层行，子行靠级联覆盖；展开时含子行）。
- **归档 = 整树、零写入**：只调一次 `archiveSession(rootId)`，`effectiveArchived` 派生使整树进已归档档；确认/结果文案明示「及其 N 个子代理」。
- **恢复只在树根**：已归档档的树根行提供行级恢复入口（操作条批量恢复保留）；置灰行按钮 **disabled**，Tooltip **动态点名最近的显式归档祖先**（产品经理 2026-11-04 拍板）——不写死「随父会话」，孙代场景会指错层（恢复 P 后 G1 因 C1 留档，用户刚点的是 P）；点名祖先恢复后：血统归档行自动回原档、显式归档子行按钮转可点。两类置灰情形与文案键见 ui §15.6，不做成点了没反应。**推导边界**：子先于父被显式归档 → 父恢复后子仍留已归档档（正确语义），期间其按钮置灰、点名仍归档的祖先。
- **删除 = 级联**：`descendantsOf` 把选中集展开为平铺 id 列表；父子同时勾选按**去重后的会话集合**执行、计数不重复（细则）；DeleteDialog 文案明示「将删除 X 及其 N 个子代理会话（不可恢复）」；不提供「保留子代理」选项（YAGNI，孤儿子代理无管理价值）。
- **级联原子性（新拍板规则）**：同一勾选节点的级联归档/删除，若自身或任一后代**运行中** → 该节点**整单拒绝**，notice 明细点名运行中的会话——不做「删父留子/归父留子」制造新孤儿；无祖先-后代关系的独立勾选项之间照旧逐 id 执行、互不牵连；归档被拒沿用「停止并归档」重试入口。
- Esc/关闭丢弃看板选择集（既有语义不变）；**档位切换保留选择集**（v0.1 实现为切换即清空，本增量有意变更，产品经理 P1）。

### 11.7 项目列

- 第 7 列，紧随会话列（列宽/断点见 ui §15.1）；
- 值 = **树级**：所属树根 cwd 的 basename；`projectKey` = 规范化全路径；子行一律显示树根项目（即使自身另有 cwd——合成行本无 cwd，同树出现两个项目名只制造困惑）；
- Tooltip 恒可用显示全路径（同名 basename 消歧是本列设计目的）；
- 孤儿根（无 cwd）→「—」空占位，**不得冒充其他项目**；
- 分组键 = cwd 而非 workspace id（架构③：workspace 显式注册制不保证全量归属，会多「无项目」孤儿组还要扩快照面；cwd 每行自带零依赖）；
- **不做分组头**：会把层级叠成「项目→主会话→子代理」三层（树已两级），且四档 filter 下产生大量空组/单行组；
- 本列同时补上标题回落修复（v0.1）的既有取舍——当时拍板原话「目录信息从行里消失，用户将来若在意再加列」，本期即该将来。

### 11.8 折叠/展开与子代理行密度

- **默认全折叠**（用户问题一原始诉求即清爽）；关面板重开回默认折叠（允许，不持久化）；
- 父行「▸ N」徽标：**N = 直接子数**（产品经理细则）；
- 运行指示不许被折叠藏掉（级联原子性的前置可见性）：自身运行 = 既有标题前 StateDot；**后代运行** = 折叠态子数徽标带运行点（StateDot ongoing）；
- 展开控件是**独立按钮命中区**（行 body 点击 = 勾选，两区分离，点击不冒泡）；`expanded` 按 id 跨轮询稳定（就地更新不重置折叠）；
- 子代理行密度：七列完全对齐（表格不缺列）；精简走视觉层次——缩进 + 树连接线、标题次级色、字号不变；徽标保留运行中/子代理/已归档，**无置顶**（子代理无置顶语义、不可操作）；数据列照常显示（挂在父下即「该主会话花了多少钱」的成本归因）；不做子树聚合行；
- 展开/收起无动画（表格行插拔，避免动效债）。

### 11.9 与 v0.1 原文的差异清单（防漂移，实现与测试对照用）

| v0.1 位置 | 原行为 | v0.2 增量 |
|---|---|---|
| §5.2 join 管线 | join → filter → 渲染 | join → **tree** → filter → **折叠可见性** → 渲染；filter 判据换 `effectiveArchived` |
| §5.3 表格 | 六列 | **七列**（新增项目列）；会话列树形化（缩进/连接线/展开按钮/子数徽标） |
| §5.3 chips 计数 | 过滤后可见行数 | 各档**会话总数**（含折叠子行） |
| 选择集（ui §14 注记） | 档位切换即清空 | 档位切换**保留** |
| §5.4 / ops 删除 | 按选中集逐 id | 选中集经 `descendantsOf` 展开（去重）；**级联原子性**拒绝运行中 |
| 恢复 | 仅操作条切换 | 操作条 + 已归档树根**行级入口**；血统归档行（及有已归档祖先的显式归档行）置灰 |

### 11.10 验收锚点与语料

- 产品语义验收以产品经理验收点为准（四档语义/树形行为/批量操作/项目列/回归，P0/P1 已标注）；UI 验收清单增量见 ui §15.9；
- GUI 语料准备（测试工程师）：一父带 2 子（不同标题）、一条孤儿子代理、「先显式归档子 → 归档父 → 恢复父」三步边界场景；fork 与环 GUI 造不出来，用单测覆盖（`lineage.client.spec.ts` 用例平移进 `tests/dashboard-tree.test.mjs`）。

## 12. 全局不变量：会话标题取值与孤儿判定（2026-11-04 拍板，D7 缺陷升格）

**规则一（标题不变量）**：插件内**任何渲染会话标题的面**一律走同一取值：`title || id`（持久化 `title` 字段，空值**含空串**回落会话 id）。**禁止采信宿主 `displayTitle`**——其回落链「持久化标题 → 项目目录 basename → 会话 id」会把无标题会话显示成文件夹名。这是问题二的产品不变量，不是某个代码位置的补丁：v0.1.1 在行标题处修过一次，v0.2 新增的子代理档小字与置灰 Tooltip 又各自取了 `displayTitle`（D7）——**每个新渲染面不得再自行决定取标题方式，一律继承本规则**。

当前面清单（新增面自动继承）：

| 渲染面 | 规格位置 |
|---|---|
| 看板行标题 | §5.3（`dashboard-rows.ts` 的 `titleOf`） |
| 子代理档「所属主会话」小字 | ui §15.5 |
| 置灰恢复 Tooltip 的 `{title}` 参数 | ui §15.6 |
| 归档/删除/恢复 notice 与 DeleteDialog 级联文案 | ui §15.7 |
| 未来任何新面 | 本节 |

**规则二（孤儿判定，配套）**：「父会话是否存在」一律用**行集成员判定**（`byId[parentId] === undefined` 或等价行集查询），禁止用标题/ id 字符串相等判定——规则一回落之后，无标题但存在的父会话也返回 id，字符串判定会把它误判成孤儿（D7 连带陷阱）。

**防漂移机制**：源码级断言钉住「面板标题取值不得引用 `displayTitle`」（测试工程师落进契约测试，产品经理已背书）；规则正文以本节为准，§5.3 与 ui 文档各处均为指针。

## 13. 用户验收修订（v0.3，2026-11-04）：两档 · 两层 · 子代理纯展示 · 会话召回

> 来源：用户 GUI 验收不通过的五条反馈。项目经理定性：2/4 为产品语义变更（照用户意图改）、3 压平两层、5 召回提前进本期、1 待测试查实口径。
> 本节**优先于 §11/§15**，逐条处置清单见 §13.7；§12 全局不变量继续有效（含召回清单等一切新渲染面）。
> 技术边界依据：系统架构师可行性核查（attachSession 接缝、cwd 规范化精确匹配、DSH 不自动吸收、`workspaces.list` 快照已带 `items`）。

### 13.1 档位结构：四档 → 两档

用户原话：「不需要显示子代理和全部，就是以主 session 为基础，子代理可以通过点击主 session 查看」。

- 仅保留两档：**「主会话」（默认，树形）** + **「已归档」**；砍掉「全部」「子代理」两档；
- 主会话档行集 = 主会话（`origin !== 'subagent'`，fork 暂含，见 §13.5）且 `effectiveArchived === false`；行可展开查看其子代理子树（展开控件与树形渲染规则沿用 ui §15.2，层级压缩见 §13.2）；
- 已归档档行集 = **显式归档的主会话**（平面列表，同套行组件、同样可展开看子树）；
- chips 计数 = 各档**主会话数**（子代理不计入）——对齐用户「与侧栏可见会话数一致」的心智模型；
- 「子代理档小字（所属主会话）」随档位删除，ui §15.5 整节废弃——但「↳ 父标题」小字与 `dash.parent.label` 键**保留在树形档子代理行**（压平后点名真实父会话，2026-11-05 项目经理拍板移出废弃清单，见 ui §15.5 修订注记）。

### 13.2 树压平：一律两层

用户原话：「正常不可能出现三层的情况，顶多就是主 session 下面有多个子 session」。

- 任意深度的子代理一律挂到**最近的主会话祖先**（沿 `parentId` 链上溯至第一个 `origin !== 'subagent'` 的根），子行 `depth` 恒为 1；
- 规则与真实深度**无关**：桌面真实语料 111 条实测 depth 仅 0/1（0 条孙代链），DSH 默认 `maxDepth=1`；但 acp/codex/claude-code 等 provider-managed 配置报 `depthLimit:false`，深链可能出现（测试工程师查实，2026-11-04）——中间层子代理不单独成层级，一律并入压平子列表，本规则天然覆盖；
- 排序保持原树 DFS 先序（孙代理紧跟其直接父，亲缘相邻不重排）；
- 「▸ N」徽标 **N = 压平后的后代总数**（该主会话名下全部子代理，替代原「直接子数」细则）；
- **中间层级信息丢弃**（不做「经由某子代理」标注）——简化取舍，用户产品预期即两层；
- 环成员、断链导致上溯不到主会话祖先的：按 §13.3 孤儿处理。

### 13.3 孤儿子代理：不进看板

- 父已删除/断链/环成员、找不到主会话祖先可挂的子代理：**不显示在任何档**（用户心智 = 看板与侧栏对齐，侧栏从不显示子代理）；
- 新增孤儿从源头堵死：删除主会话 = 级联删除全部后代（§11.6 保留）；
- **取舍记录**：存量孤儿（如历史语料）暂无 GUI 清理入口，列入 §10 后续演进（「未挂账子代理清理区」），用户提出再做；
- **有意分歧记录**：DSH `lineage.ts` 对孤儿是「degrade to root, never drop」（降级为根行），本插件**不发射孤儿行**——这是有意分歧不是实现疏漏；契约测试须钉住「插件不发射孤儿行」，防后人照 DSH 语义好心修正回去（架构师提议，项目经理已录入任务单素材）。

### 13.4 子代理纯展示

用户原话：「子 session 不可以多选，删除都是主 session，删除主 session，子 session 也会一起删除即可」。

- 子行：**无 checkbox、无删除/归档入口、不可被选中**；全选 = 当前档全部（可见）主会话行；
- **三态勾选废弃**：子行不可勾选则无 indeterminate 态——前轮 P0「三态勾选」随需求变更作废，**不是实现回归**；
- 子行内容：标题（§12 不变量）、运行中指示、归档徽标（见下）、数据四列照常；**子代理徽标省略**（挂在主会话下即是子代理，冗余）；置顶无（沿用 §11.8）；
- 操作全部收敛到主会话行：**归档 = 整树**（血统派生零写入，一次 `archiveSession`，§11.6 保留）；**删除 = 级联后代**（`descendantsOf` 展平，确认文案明示「及其 N 个子代理」）；**级联原子性保留**（自身或任一后代运行中 → 整单拒绝、明细点名）；
- 恢复：已归档档主会话行的行级恢复（= 整树回主会话档）+ 操作条批量恢复，均保留；
- **存量防死锁（唯一例外分支）**：主会话档子树内**显式归档**的子行（历史数据/旧版本操作产物）——显示归档徽标 + 行级恢复按钮（恢复仅作用该子自身）；**血统归档**的子行（经由子树内某显式归档中间祖先）——置灰 + Tooltip「随祖先会话 {title} 恢复」（点名最近的显式归档祖先，§15.6 规则保留）。已归档档内展开的子树全为血统归档：纯展示、无按钮（恢复随树根）。

### 13.5 行集口径（问题 1 修复 · 事实已查实 + 产品裁决齐，2026-11-04 定稿）

测试工程师查实（acceptance v3 §12，D10/D11）：多算的那条 = `ba223092`（`origin:"subagent"`、父不存在、header 无 cwd 的冷记录）——**宿主列表没有它、仅 `/stats` 有**，旧口径 join 落空 `byId` 后 origin 缺失，被 `origin !== 'subagent'` 判成主会话。根因：看板与侧栏的行集根本不是一个集合。口径定死如下：

- **看板会话口径 = 至少一轮对话（行为语义）**（产品经理裁决一）：已落盘零轮次行**不进任何档、不进任何计数**（chips/全选/召回候选同口径）；未落盘草稿继续排除（v0.1.1 拍板不变）。此裁决**推翻** 2026-11-03「空壳保留可勾选清理」拍板：当时事实基础只有「未落盘草稿」一层，现已查实宿主本体论——零轮次即占位，侧栏所有桶只在「当前」时显示它；看板作为同一世界的统计面，口径跟宿主走。「看到刚建的空会话」是侧栏占位的职责，发出首轮消息后自然进看板；真要清理属宿主侧数据卫生，列入 §10 演进。**键控字段已定案**（架构师 2026-11-04 桌面 0.2.1-rc.5 + 沙箱 0.2.2-alpha.2 两版实测 → 项目经理任务单 A.2 终稿）：**`session.blank === true` 单键**，现有 join 过滤本来就正确、**零代码改动**——blank 是持久化投影 fold（init 为 true、首个 `turn/start` 翻 false，`list.ts:47-58/93`），已落盘零轮次恒为 true；projcache 的 blank 与客户端行 blank 是同一物（「a listing never seeds a fold」）。「blank=false 且零轮次」只存在于投影缓存缺失时的 cold fallback（`?? false`），真实数据不存在（桌面 0/114）——**缓存缺失行预期「看板与侧栏同显」**（宿主自己保守显示、侧栏也显示，强行排除反而制造新 Δ），夹具两头钉。原「不论其 blank 标志取值」半句随之**收回**（架构师建议、项目经理采纳——行为口径与 blank 单键经实测同界，裁决一无需重议）。/stats 载荷无 turns 字段，勿按 turns 键控；实现以 `isZeroTurnOrBlank()` 单键判定承载（函数壳保留作语义文档）。**验收断言按行为写死**：造已落盘零轮次会话（blank=true）→ 任何档皆无、计数不计；缓存缺失组（无 sessionListMetadata）→ 看板与侧栏同显；
- **行集以 `SessionListState.ids` 为基准**（`service.ts:62-65` 明写 only `ids` expresses Host-list membership；`byId` 还含子代理回退行，不能作行集依据）：主会话档行集 = `id ∈ ids` 且 `byId[id].origin !== 'subagent'` 且非 `effectiveArchived` 且非 `blank`；join 基准翻转按架构师规格落地——**ids ∪ byId 合成子代理行（父存在）** 为行集，`/stats` 降为富集（缺席照常发射、显示降级字段），**stats-only 行在 join 层直接丢弃**（D10 修在数据层而不是过滤层）；契约测试钉两条：stats-only 行不发射、ids 有而 stats 无的行照常发射；
- **`byId[id] === undefined` 不得默认按主会话处理**（仅 `/stats` 有的冷记录，如无 cwd 冷子代理）——不渲染，与 §13.3 孤儿同取舍（冷记录清理列入 §10 演进）；
- **fork = 独立主会话树根，与普通主会话完全同权**（产品经理 2026-11-04 **终裁**，延伸裁决二）：主会话档**作为树根**显示——有 checkbox、可勾选、可单独归档/恢复/删除；不缩进、不挂起源会话子树；其名下子代理照常挂它（**压平锚点 = 最近的非 subagent 祖先 = fork 自身，不得重挂到 fork 的父**——重挂会让父徽标虚增、fork 的子代理泄漏进父子树）。**血统/级联链在非 subagent 行截断**（终裁唯一新语义点）：`effectiveArchived` 与删除级联的祖先遍历遇到 `origin !== 'subagent'` 即止——P1 归档，fork（P4）照常可见；删除 P1 的级联集合**不含** P4 及其子代理（D1）；删除确认文案的 N 永远只数子代理。已归档档：fork **只经自身显式归档**进档，为**独立根行 + 自有恢复入口**（不发生经由祖先的血统归档——ui §15.6）。`parentId` 是出生记录不是包含关系；**Δ=0**（树根数 = 主会话档 chips = 侧栏可见主会话数，chips 一律数管理单元=根行）；**不做**灰提示行 /「不含 N 条 fork」注记。契约测试钉三条：① fork 进主会话档、为根、可勾选；② D1 挂 P4 不重挂 P1；③ P1 显式归档后 P4 仍可见 + 删除 P1 的 descendants 不含 P4/D1。**P1 可选（产品经理委托规格，产品设计已决定做）**：fork 根行加轻量「派生」Tag——纯信息、不参与过滤/排序/级联/计数、不阻塞验收，像素级规格见 ui §15.2/§15.8（`dash.fork.tag`/`dash.fork.origin`，Tooltip 点名起源会话标题，补回不挂树损失的出生关系信息）；
  - **「裁决三」风波记录（防漂移）**：2026-11-04 晚曾出现转述版「裁决三」（fork 不进主会话档、已归档档以置灰血统归档形态出现、Δ=fork 数）——产品经理、产品设计、测试工程师三方留档均查无原文，产品经理**按实质重裁推翻**：该形态同时踩三条自立规矩（Δ≠0 是问题 1 的反向重演；「不可见却在删除爆炸半径里」违反「确认文案明示范围」P0；fork 是有轮次有 token 的真实会话，不可勾选不可归档与侧栏本体论打架）。**一切与此相悖的表述无效**（语料/manifest 中「裁决三」字样已按终裁回滚），后人以本条为准，勿再翻检转述；
- 此口径下问题 1 的 Δ 归零：`ba223092`（∉ ids）与零轮次 blank 都不再计入，看板与侧栏同源同口径。

### 13.6 会话召回（问题 5，技术边界已核清，零宿主改造）

场景：删除工作空间 → DSH 把会话移到「未分组」（宿主既有行为，插件不管删除侧）；重新添加同路径工作空间 → 支持把相关会话移回。**DSH 不会在重建 workspace 时自动吸收**（`createCanonical` 建空账本，架构师已钉死）——插件做召回是补缺，不是造轮子。

- **数据面**：客户端 `workspaces.list` 快照的 `items: WorkspaceView[]`（path + sessionIds + title）**宿主本来就下发**，插件本地类型补声明即可——**`items` 与 `phase` 一起收**（`WorkspaceSnapshot.phase: 'pending' | 'ready'`，`model.ts:29`：初始 pending、follow baseline 一到单调翻 ready；这是「未加载」与「真为空」的唯一可靠区分信号，baseline 守卫的键控，见触发条）；未分组 = 主会话行不属于任何 `items[].sessionIds`（DSH GUI 同口径）；
- **触发**：客户端监听 workspace 快照 diff——**diff 基线 = `dashStore`（订阅级/应用会话级）订阅建立后首个 `phase === 'ready'` 的快照**（架构师 2026-11-05 核定：`pending` 不抓——防「挂载早于首拍、空 baseline 把存量全误标为新」；**`ready` 且 items 为空照抓**——零工作区是可达态而非边缘（default 只在空库首启创建、删除后永久不自动重建，`index.ts:250-275`），baseline=空集时随后添加的第一个工作区照常弹横幅），存 store 而非组件 effect，**面板开关不影响**（2026-11-05 项目经理拍板 (b)：现实操作顺序常是「先在侧栏加工作区、之后才打开批量面板」，mount 级 baseline 会让该工作区的横幅永不出现、那批未分组会话失去召回入口）；新 workspaceId 出现且其 path 命中 ≥1 条未分组主会话（**裸 cwd 匹配做预览、两侧去尾斜杠后比较**——架构师加固：realpath 吃掉尾斜杠、宿主 attach 对尾斜杠会话必然成功，唯一风险是预览漏配静默不进清单；权威校验在宿主 attach：`realpath` 规范化后**逐字等于** workspace 路径，**子目录不算**）→ 表格区顶部弹**召回横幅**（复用降级通知条形态、带操作、可忽略——与降级条「常驻不可关」的区分见 ui §16.1）：「发现工作区 {name} 可召回 {n} 个会话（含 {m} 个子代理）」（**{name} 必须在横幅文案内**——多工作区排队靠它辨识当前条；{m} = **parentId 亲缘链**计数，不按 cwd 字符串聚拢——D14 教训）+［查看］［忽略］；
- **忽略** = **本次应用会话内**收起（store 级记忆，随 baseline 一起提级到 store——面板开关不清除，否则同一次会话反复开关面板会重复弹同一条横幅；2026-11-05 项目经理拍板 (b)）；不做持久化：宿主重启/插件重载后 baseline 重置，旧成员 diff 为空、同横幅不再弹（老数据入口缺口列 §10 演进）；**待处理队列同为 store 级**——召回完成后的 workspace 快照刷新只更新数据、**不清空待处理队列**（测试工程师发现三：否则多工作区「处理完展示下一条」当场断链）；
- **召回清单**（点「查看」展开）：平面行 = ☑ + 标题（§12 不变量）+ updatedAt + cwd（「状态」列随置灰态一并**砍除**，见下条）；**支持部分召回**（默认全选、可反选——勾选成本低、场景真实）；底部［召回 {k} 条会话］［取消］；
- **无置灰态**（产品设计 2026-11-04 定案，采架构师可行性结论 (a)）：客户端判不出目录存在性（浏览器无 fs），且结构上预览清单行几乎必然 attach 成功——workspace 是注册制（添加时目录必须已存在，create 走 realpath+stat 校验）、字符串不匹配形态（符号链接/子目录）在预览阶段就进不了候选清单、唯一真实失败窗是「添加后、执行前目录被删」的竞态（测试工程师判定表实测：GUI 可达失败仅「注册后破形」一族；桌面 112 条真实语料 0 symlink、0 不可解析）。因此清单**全部行可选、无置灰态、无状态列**；失败收敛到执行明细逐条点名（宿主 attach 原生错误文案：does not resolve / not a directory / resolves to 别处）。dry-run 预检**否**（实体层无 validate-only，需复刻 attach 四步校验——双份逻辑漂移 + TOCTOU 买不到确定性）；workspace-files 探测**否**（session 作用域文件读取、非目录 stat，接缝不对）。「目录存在但不可写」夹具**不造**（attach 不写 cwd、恒成功——死夹具，架构师结论 + 测试工程师 uid=0 实测 WRITE_OK）；**部分失败在一次 GUI 提交里做不出来**（同工作区候选共享同一 cwd 字符串，宿主判定必然同结论）——逐条点名覆盖走逐行差异配方（清单打开后、提交前 curl 删一条）或单测（宿主路由 + stub 抛错），进 acceptance v4；宿主逐条执行时单条失败不阻塞其余（逐条回报，attach 幂等、失败重试安全）；
- **执行与安全**：新增宿主 POST 路由（**写操作，必须过 `isTrustedBatchRequest` 信任栅栏**，同 delete 路由先例）；宿主 `resolveByPath(path)` + 逐条 `attachSession(id)`，**幂等**（架构师已确认），失败重试安全；**`resolveByPath` 未命中直接 400，不得 `registry.create(cwd)` 凭空注册工作区**——召回只把会话挂回**已注册**的工作区（2026-11-05 项目经理 D21 拍板：该分支唯一效果是凭空注册，违反本条口径）；**工作区目录已被删（realpath ENOENT）时宿主转 200 + 每条 per-row `cwd-unresolvable` 失败**（D13 拍板：整批 400 不外泄到 GUI，客户端只留一种失败处理形态）；客户端**必查 `res.ok`**——任何非 2xx 独立分支落 failure notice（fail=提交数、逐条 `titleOf(id)` + 宿主 message），绝不静默成功（D12 教训：400 的合法 JSON body 不进 catch、曾被渲染成绿色成功）；结果走 notice 形态（成功「已召回 {n} 个会话到 {name}」，失败/部分「召回完成：{ok} 成功，{fail} 失败」+ 明细 = 行标题（§12 不变量，禁裸 id——D18）+ `notice.code.*` 本地化标签（补 5 键——D19 拍板）+ 宿主 message 原文不翻译（排查用），15s）；busy 进度复用操作条形态；
- **语义说明**：召回改的是 workspace membership，**不改 cwd**——看板「项目」列（cwd basename，§11.7）召回前后不变，变化发生在侧栏分组；attach 会把会话排到该 workspace 列表头部（宿主行为，接受）；
- **取舍记录**：召回只操作**主会话** id；子代理的 membership 不回填（侧栏不可见面，且其管理已被级联语义覆盖）。

### 13.7 对 §11 / ui §15 的处置清单（防漂移，实现与测试对照用）

| 原条款 | 处置 |
|---|---|
| §11.4 多层递归树 / 孤儿降根 | 被 §13.2（两层压平）/ §13.3（孤儿不显示）替代；环防御、fork→主会话保留 |
| §11.5 四档 filter 表 | 两档（§13.1）；`effectiveArchived` 判据保留用于主会话行归档判断 |
| §11.6 三态勾选 / 勾子独立操作 | **废弃**（§13.4）；归档整树、删除级联、级联原子性、Esc 丢弃选择集、档位切换保留选择集全部继续有效 |
| §11.8 徽标 = 直接子数 | 改为**压平后代总数**（§13.2）；默认折叠、运行指示、展开态跨轮询稳定、无动画保留 |
| §11.7 项目列 | 保留不变（召回不改 cwd，§13.6） |
| §12 全局不变量 | 保留不变，适用于召回清单等一切新面 |
| §5.2 blank 排除（未落盘草稿） | **扩展**：零轮次（含已落盘）一律不进看板——看板会话口径 = 至少一轮对话（行为语义；**键控 = `session.blank === true` 单键已定案**，架构师两版实测、缓存缺失 fallback 行「看板与侧栏同显」，见 §13.5。产品经理 2026-11-04 裁决一，推翻 11-03「空壳保留」拍板）；行集基准同时翻转为 ids（架构师规格） |
| ui §15.1 七列/列宽 | 保留；chips 减为两个 |
| ui §15.2 树形会话格 | 保留骨架，`depth ∈ {0,1}`；子代理徽标不再渲染（§13.4） |
| ui §15.3 三态勾选 | **整节废弃** |
| ui §15.5 子代理档小字 | **整节废弃**（子代理档已删）；但「↳ 父标题」小字**保留在树形档子代理行**（压平后点名真实父会话），`dash.parent.label` 键**移出废弃清单**（2026-11-05 项目经理拍板，复验实测仍在消费——闸门「三键零命中」判据改「两键」）；短 id 规则、§12 取值、Tooltip 两分支、`role="note"` 纪律照常适用（ui §15.5 修订注记） |
| ui §15.6 两类置灰 + 行级恢复 | 收敛为 §13.4 例外分支（显式归档子行可恢复 / 血统子行置灰点名 / 已归档档行级恢复保留） |
| ui §15.7 级联文案 | 保留（`dash.delete.cascade` 两形态、原子性拒绝 notice） |
| ui §15.8 文案键 | `dash.filter.all` / `dash.filter.subagent` 废弃（locales 定义应删，零消费）；**`dash.parent.label` 移出废弃清单**（树形子行小字仍在消费，见上行）；**`dash.recall.unavailable` 随无置灰态定案 (a) 废弃**（实现零命中 ✓）；`dash.recall.*` **全量 11 键**（2026-11-05 改名定案：review→`view`、ignore→`dismiss`、submit→`execute`、done→`success`、failed→`failure`——跨模块动词一致）：banner「发现工作区 {name} 可召回 {n} 个会话（含 {m} 个子代理）」（{name} 必须在文案内）/ view / dismiss / back / busy / title「召回未分组会话 · {name}」（兼 `<caption>`，实现增补核准）/ selectAll「全选 {n} 个可召回会话」（替代复用 `dash.selectAll.aria`，{n} 播报有用）/ execute「召回 {k} 条会话」/ cancel / success「已召回 {n} 个会话到 {name}」/ failure「召回完成：{ok} 成功，{fail} 失败」；`dash.recall.failureDetail` 死键删除（D20）；`notice.code.*` 补 5 个召回失败码键（cwd-mismatch / no-cwd / attach-failed / cwd-unresolvable / cwd-not-directory——D19 拍板：code 标签本地化，宿主 message 原文不翻译）；fork Tag 两键 `dash.fork.tag`「派生」/ `dash.fork.origin`「派生自会话 {title}」（P1，ui §15.2/§15.8）（en 进 locales，sentence case；zh 占位全量以 ui §16.5 对账表为准） |
| ui §15.9 验收清单 | 按 §13 重出（测试工程师更新 acceptance v3 → v4） |

### 13.8 事实记录与剩余项（2026-11-04 更新）

- 问题 1 已查实：Δ=1 恒为 `ba223092`，与 live 状态无关（acceptance v3 §12/D10）；语料设计失误（blank 混入致行数不可能对上）记 D11，语料按新语义重造中；
- 问题 3 已查实：三层来自夹具显式 `delegationDepth:2`（`make-tree-corpus.mjs:144-147`），桌面真实语料 111 条无孙代链、无孤儿、无「无 cwd」主会话；§13.2 压平规则与深度无关，天然覆盖 provider-managed 深链场景；
- 召回 UI 像素级规格：**已落 ui §16**（拍板定稿，含「数量口径=主会话数」）；横幅文案含「含 {m} 个子代理」亲缘计数（项目经理采纳架构师微调——子代理可见性来自 parentId 不来自账本，主会话召回后树自动完整归位）；
- **设计侧全部闭合（2026-11-05 更新）**：① 零轮次会话不进看板（行为口径，推翻 11-03「空壳保留」拍板），**键控 = `session.blank === true` 单键已定案**（架构师两版实测，任务单 A.2 零代码改动；缓存缺失 fallback 行「看板与侧栏同显」两头钉）；② **fork 终裁** = 独立主会话树根完全同权 + 血统/级联链在非 subagent 行截断 + 已归档档独立根行（转述版「裁决三」已被产品经理重裁推翻，风波记录见 §13.5——后人勿再翻检）；③ 召回清单**无置灰态**（定案 (a)，失败收敛执行明细逐条点名），预览匹配两侧去尾斜杠；④ 召回横幅 baseline 提级 `dashStore` 订阅级、忽略记忆 = 本次应用会话内、待处理队列 store 级（2026-11-05 项目经理拍板 (b)；(c) 常驻入口列 §10 演进）；⑤ fork「派生」Tag P1 做（ui §15.2/§15.8）。无待决项，0.2.0 按此实现（程序员 A/B 段已交付 49/49 全绿，C 召回进行中）。
