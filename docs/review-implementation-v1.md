# 会话仪表盘实现评审（v1）· 2026-11-02

> 评审人：系统架构师。范围：程序员对 design-session-dashboard.md 的实现 + 项目经理五项裁决的落实。
> 方法：全量源码走读（宿主 5 文件 / 客户端 13 文件 / 测试）+ 质量门独立复跑（`node --test` 7/7、`tsc --noEmit` 零错、沙箱 `curl /status` `/stats` 200 且数据正确、`no-store` 头实测）+ 与重构前 ops.ts 逐行对照。

## 结论：有条件通过

架构方向、复用面、线上契约、UI 层级契约（z-index 950 / bar 隐藏 / reduced-motion）全部按设计落地，质量门真实。但有 **3 个必修项（P0）**与 4 个条件项（P1）：P0 中第 1 项是设计核心机制的缺失，第 2、3 项是 PM 标记的最高回归风险点上的**真实行为回归**（重构前代码逐行比对确认）。修完 P0+P1 复核后进测试环节。

## P0 · 必修（进测试前）

### P0-1 渐进式契约未实现——`GET /stats` 阻塞等待全量 sweep

`handleStats`（host/index.ts:406）`await aggregator.maybeSweep()`，而 `maybeSweep`（stats.ts:52-69）所有分支都等 sweep 完成才返回。后果：

- 首扫大库（数百会话）时首个请求挂起数分钟，无任何渐进填充；`pending`/`complete`/进度条在响应里恒为终值——设计 §4.1/§8 的核心开销摊销机制（「触发不等待，立即返回当前快照」）实际不存在；
- README 第 78 行已宣称「面板显示 pending 进度，新→旧渐进填充」——**宣称与实现不符**，测试环节用大库验证渐进行为会直接失败；
- 连带：面板打开时 `poller.start()` 的首次 poll 与 DashboardPanel.tsx:86 的额外 `fetchStats()` 叠成两个挂起请求；轮询 fetch 无超时、无重叠保护。

**修法**：`maybeSweep` 拆成 `trigger()`（fire-and-forget，共享 in-flight Promise + 保留 1s 节流）与 `snapshot()`（同步返回当前缓存 + in-flight 的 pending/complete）；路由立即 200。客户端 `fetchStats` 加 `AbortSignal.timeout`（建议 30s）防御；顺带消掉面板打开时的双重首拉。注意 sweep 内 `listSessions` 失败分支（stats.ts:96-99）会把状态置成 `complete: true + pending: N` 的自相矛盾——一并整理。

### P0-2 侧栏「停止并归档」重试回归（ops.ts:296 + 232-238）

原实现：`run: () => { void runArchiveLoop(active, true) }`——**一个**批量重试，busy 0/N 推进、一条聚合结果通知。现实现：`active.forEach(id => runArchiveLoop([id], true))`——N 个**并发**单条循环，每个都 `dismissNotice → setBusy(0,1) → … → clearBusy → clearSelection → showNotice`，互相覆盖：busy 闪烁 0/1、通知逐条闪替、最终只剩最后一个 id 的结果，聚合信息丢失。PM 抽查看到的是仪表盘路径（DashboardPanel.tsx:200 `runArchiveCore(active, …, true)`，该处正确）；侧栏路径的回归漏网。

**修法**：侧栏重试恢复为单次批量调用（对齐仪表盘写法即可）。

### P0-3 busy 进度不再逐条推进（ops.ts:104-123 / 134-150）

原实现在循环体内每完成一条 `store.advanceBusy()`；拆层后 core 无进度回调，侧栏与仪表盘的 busy 都冻结在 `0/N` 直到结束（dashboard-store 里 `advanceBusy` 因此成了死代码）。

**修法**：core 层加可选 `onProgress` 回调（或逐条回调参数），两个包装层传入 `() => store.advanceBusy()`。

## P1 · 条件项（与 P0 同批修复）

1. **降级契约断链**：host 永不发 `ok:false + 'session-query-unavailable'`（sweep 里 sessionQuery 缺席直接静默返回空成功，host/index.ts:82-87），面板 `isDegraded`（DashboardPanel.tsx:161）是死代码——用户在无 sessionQuery 的组合里看到的是「没有会话」空态而非降级提示。按设计 §4.1 让 sweep 返回降级码。
2. **仪表盘 NoticePanel 退化**（DashboardPanel.tsx:532-556）：失败原因直接渲染原始 `failure.code`（'archive-failed' 等，未走 `notice.code.*` 字典，与 BatchOverlay 的 `reasonOf` 不一致）；通知无自动收起（UI 规格 §1 要求 6s/15s）；删除 catch 里 `code: 'network'` 硬编码且 `message: String(reason)`。建议复用/对齐 BatchOverlay 的 NoticePanel 而不是抄一份删功能。
3. **操作后未立即拉 stats**：设计 §5.2 要求「批量操作完成后 sessions.refresh() + 手动拉一次 stats」；doArchive/doUnarchive/doDelete 都只做前者——删除后的行要等下一轮 5s 轮询才消失（墓碑 prop 是注册时快照，立即过滤也不生效）。在三个操作完成后补一次 `fetchStats()`。
4. **Esc 关闭不清理选择集**：`doClose` 清（DashboardPanel.tsx:164-168），Esc 路径直接 `onToggle()`（:105）不清——重开面板残留旧选择。统一走 `doClose`。

## P2 · 随手清理（不阻塞，建议同批顺手）

- stats.ts:197-198 两处 `as unknown as`：`SessionObservationLike` 已声明 `[Symbol.dispose]?: () => void`，直接 `observation[Symbol.dispose]?.()` 即可；`dispose` 普通方法分支是死代码（真实 observation 只有 Symbol.dispose）。
- 错误分类靠 `message.includes('corrupt')`（stats.ts:162）字符串嗅探；`observeOne` 重包装又丢结构——建议穿透 `error.name === 'SessionQueryError'` 及其 code。
- dashboard-store 死代码：`advanceBusy`/`open()`/`close()` 无调用方（「死代码 zero」的说法不实）；`DashboardState.open` 与模块级 `dashStore` 双真源。建议把 DashToggle 并入 dashboard-store（顺带消掉 index.tsx:30 模块级可变 `let dashStore` + apply 内重置的写法，回到插件自身「工厂 + apply 闭包」纪律）。
- 面板 model 双列重复显示（session 单元格的 `dsh-dash-session-model-sub` 与模型列同值）。
- `discoverRouteBase` 三处复制（ops.ts / stats-client.ts / DashboardPanel.tsx）。
- 删除确认重写了一份 Modal 弹窗而非复用 `DeleteDialog`（UI 规格 §1 明确复用；其 props 完全够用）。
- 未用键 `dash.badge.running`/`dash.noData`、未用 `panelRef`、表头 aria `n: 0` 硬编码。
- 错误行缓存到 revision 变更才重试（transient 失败也永久缓存）——可接受，建议加注释说明。

## 测试覆盖缺口（PM 裁决 #3 的回答）

7 例覆盖了核心路径且全绿，但缺口明确：

- **并发上限未真正断言**：现有「并发上限」测试只验证了 5 条全被观察，没验证「同时最多 2 条」（需要屏障式 mock 观察重叠）；
- `maybeSweep` 去重（并发请求共享 sweep）与 1s 节流窗无测试——P0-1 重构后这两条必须补；
- **dispose 租约释放无断言**：观察器 LRU 解钉全靠它（测试里 `dispose(){}` 全是 no-op 从未 assert 被调用）；
- sessionQuery 缺席降级无测试（P1-1 修复后补）。
- 设计 §9 的客户端组件测试（join 渲染/百分比/轮询生命周期/墓碑过滤）整体缺席——插件此前无客户端测试设施，是否本期补由 PM 裁决；GUI 沙箱实测目前是唯一客户端行为验证。

## 独立验证记录（复跑通过）

- `node --test tests/stats.test.mjs`（容器内）：7/7 pass；
- `tsc -p tsconfig.json --noEmit`（容器内，插件自身 node_modules）：零错误；
- `curl /dsh-session-batch/v1/status`：200 `{"ok":true,…}`；`curl /stats`：200、`cache-control: no-store`、单会话四桶 + 压力数据完整（qwen 模型、cacheRead 13312、contextWindow 1000000）；
- lib 产物时间戳晚于全部 src（构建新鲜）；`shell.overlay`/`sidebar.footer.action` 多占位注册、三条路由注册均在 `ctx.inject(['webServer'])` 子 ctx effect 内（HMR 可卸载）；index-inject 已携带 `statsPollIntervalMs`；poller 定时器与 visibilitychange 监听启停配对；结构类型（listSessions/observeSession/projections/revision/Symbol.dispose）与 0.2.2-alpha.2 源码逐成员核对一致；zod 两新字段 min/max 校验齐全；UI 规格 §14 注记与实现一致。

## 下一步

1. @程序员 修 P0-1/2/3 + P1-1~4（建议同批带上 P2 顺手项），补 P0-1 相关单测（去重/节流/dispose 断言）；
2. 修复后我复核 P0 三项 + 新增测试，通过即交测试工程师（按 ui-session-dashboard.md §12 验收清单 + 设计 §9 沙箱步骤）。

---

## 复核记录（v2 · 2026-11-02 23:47）

**结论：复核通过，P0/P1 全部关闭，进入测试环节。**

逐项核验（源码走读 + 独立复跑）：

- **P0-1 ✅** `trigger()`（fire-and-forget，in-flight 共享 + 1s 节流）/ `snapshot()`（同步无 I/O）/ `sweepAndWait()`（测试面）三分；`handleStats` 不再 await；`fetchStats` 带 `AbortSignal.timeout(30s)`；面板双重首拉已删。实测 `/stats` 连续三次响应 **1.2ms / 0.7ms / 0.8ms**（立返成立）。
- **P0-2 ✅** `showArchiveNotice` 改 `retryBatch` 单批回调；侧栏 `runArchiveLoop` 捕获 `activeIds` 整批重试，busy 0/N 递进 + 聚合通知，与重构前行为一致。
- **P0-3 ✅** core 层 `onProgress` 回调，侧栏/仪表盘包装层均接 `store.advanceBusy()`。
- **P1-1 ✅** host 无 sessionQuery 时 `degraded: true`（sweep 内复位逻辑正确），面板 `isDegraded` 读 `data.degraded`；单测「降级标记」覆盖。
- **P1-2 ✅** NoticePanel 失败原因走 `notice.code.*` 字典（带回退）；auto-dismiss error 15s / success 6s；删除 catch 用 `DeleteRequestError.code`。
- **P1-3 ✅** doArchive/doUnarchive/doDelete（含归档重试路径）完成后均补 `fetchStats`。
- **P1-4 ✅** Esc 路径统一走 `doClose()`（清选择集）。
- **P2 部分 ✅** `as unknown as` 两处已删（dispose 结构化析取）；corrupt 嗅探与 transient 缓存策略已加注释。其余 P2（模块级 dashStore、DeleteDialog 复用、model 双列、discoverRouteBase 三份等）**未做**，按原裁定不阻塞——转入后续清理清单。

质量门独立复跑：`node --test` **10/10**（新增并发屏障断言 maxConcurrent∈[2,2]、去重节流、dispose 租约、降级标记）；`tsc --noEmit` 零错；沙箱 `/stats` 200、`degraded:false`、数据完整。

遗留（不阻塞，记录在案）：

- stats.ts:164 注释「未入队的 id…」与实际行为不符（worker 会清空队列）——cosmetic；
- `listSessions` 失败分支 `pending=N` 且 `complete` 可能残留 true——下一轮轮询自愈，建议后续整理；
- 渐进填充的端到端 UX（大库首扫分帧可见）单库沙箱无法直接观测，unit 级证据已足——**列为测试工程师 GUI 验收的关注项**（ui-session-dashboard.md §12）。
