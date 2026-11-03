# 会话可视化仪表盘（Session Dashboard）· 技术设计

> 插件：`@local/dsh-session-batch`（`plugins/dsh-session-batch`）
> 目标版本：dsh `0.2.2-alpha.2`（沙箱 dev profile，与源码仓 master 对齐）
> 状态：设计定稿，待实现。数据源结论由项目经理前期查证，本文全部经源码复核。

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
- join：行 = `stats.sessions` × `sessions.list.byId`（标题/origin/running/updatedAt）× `workspaces.list`（归档/置顶）− `tombstones`。

### 5.3 UI 结构（表格，纯 CSS 无图表库）

| 列 | 内容 |
|---|---|
| ☑ | 复选（dashboard 选中集；表头全选/清空） |
| 会话 | 标题（回落 id）+ 徽标：运行中 / 已归档 / 置顶 / subagent |
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
- 自建投影单元（`request/header` 折叠）替代事件尾扫——若模型展示需要 O(delta) 更新再评估。
