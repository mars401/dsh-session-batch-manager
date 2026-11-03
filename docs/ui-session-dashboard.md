# 会话可视化仪表盘（Session Dashboard）· UI/交互规格

> 插件：`@local/dsh-session-batch`（`plugins/dsh-session-batch`）
> 配套文档：[design-session-dashboard.md](./design-session-dashboard.md)（技术设计，数据流/契约/文件清单以其为准）
> 本文管辖：浏览器侧视觉规格、交互行为、状态展示、无障碍与文案键名。
> 文案键只定**键名 + 中文占位**，最终 zh/en 字典进 `src/client/locales.ts`（英文 sentence case）。

## 1. 设计原则与复用基线

对齐 dsh 客户端 UX 纪律（`deepseek-harness/.agents/skills/dsh-client-ui-ux`、`dsh-responsive-ui`）与本插件既有形态（`styles.ts` / `BatchOverlay` / `DeleteDialog` / `FooterToggle`）：

1. **复用优先于新增**：
   - 视觉语言沿用既有 `--dsw-*` 令牌 + 回退值模式（`styles.ts` 头注释所述：外部插件拿不到宿主 CSS module 类名，全部走自有全局类 + 令牌）；
   - 工具条按钮/计数/分隔线**直接复用现有类**：`.dsh-batch-btn`、`.dsh-batch-btn-danger`、`.dsh-batch-sep`、`.dsh-batch-count`、`.dsh-batch-busy`，保证两处批量 UI 视觉一致；
   - 删除确认复用 `DeleteDialog`（宿主 `Modal` 原语）；操作结果通知复用现有 notice 面板形态（`.dsh-batch-notice` 全套，含失败明细与自动收起时长 6s/15s）；
   - 控件优先用 `dsh-client-ui-primitives`（已在基线 externals，现有代码已 import）：过滤 chips 用 **`Pill`**、行内徽标用 **`Tag`**、运行中指示用 **`StateDot`**、浮层用 **`Tooltip`（portal 变体）**、复选用原生 `input[type=checkbox]`（表格内不套 `Checkbox` 原语，避免其 label 布局）。
2. **新增类名前缀 `dsh-dash-*`**，追加进 `STYLE_TEXT`（沿用幂等注入/卸载机制）；不复用 `dsh-batch-*` 前缀以免与选择模式样式互相污染（`body.dsh-session-batch-mode` 规则不得命中面板）。
3. **新增样式字重 ≤ 500**（dsh 纪律；既有 `.dsh-batch-count` 的 600 是遗留，不扩大到新类）。主字号 13px（`--dsw-font-xs-13` 口径），辅助 12px/11px（`--dsw-font-xxs-12`/`--dsw-font-xxxs-11`），面板标题 16px/500。
4. 所有颜色走令牌带回退（生产以宿主主题为准）；**浅色/深色双主题都要人工核验**，尤其 warn 色在进度条与文字上的可读性。
5. 动效尊重 `prefers-reduced-motion: reduce`（面板淡入、进度条 transition 均降级为无动画）。

## 2. 层级与挂载（z-index 契约）

面板经 `createPortal(…, document.body)` 全屏 fixed（技术设计 §5.1）。**层级是本规格最重要的实现约束**，定案如下（实测宿主原语层级：Modal=1000，Menu/Toast/Tooltip-portal=1100，插件 bar/notice=1200）：

| 层 | z-index | 说明 |
|---|---|---|
| 仪表盘面板 | **950** | 低于宿主 `Modal`(1000)，让复用的 `DeleteDialog` 天然盖在面板上，不需要任何越权覆盖 |
| DeleteDialog（Modal 原语） | 1000（原语自带） | 面板内触发，正常压住面板 |
| 面板内 Tooltip | 必须用 **`portal` 变体**(1100) | 非 portal 的 Tooltip z=100，会被面板盖住——**面板内一律 `portal`** |
| 结果 notice / 侧栏底部工具条 | 1200（既有） | notice 高于面板：操作结果永远可见；工具条见下 |

- **面板打开期间隐藏侧栏批量工具条**：面板开时给 body 加标记类 `dsh-dashboard-open`，插件自有样式表加规则 `body.dsh-dashboard-open .dsh-batch-bar { display: none }`。理由：工具条属于下层侧栏 UI、其选择集与仪表盘独立，浮在全屏面板上会造成两套选择集同屏混淆。notice **不**隐藏（操作结果需要在面板之上可见）。
- macOS 顶部安全区：面板 `padding-top: var(--dsh-frame-top-clearance, 0px)`，不改全局变量、不加 `[data-platform]` 覆盖（消费即可，与 Modal/Menu 原语同一策略）。
- 禁止把面板 z-index 抬到 ≥1000「修复」任何遮挡问题——那会压掉 DeleteDialog；层级冲突按本表排查。

## 3. 入口按钮（sidebar.footer.action 第二占位）

- 形态与 `FooterToggle` 完全同款（`.dsh-batch-footer` 类复用）：图标 + wide 布局下显示文字标签。
- 图标：**`IconGaugeOutlineRegular`**（size 16，仪表盘语义；与批量开关的 `IconChecklistOutlineRegular` 成对区分）。不新增 glyph。
- 文字/`title`/`aria-label`：键 `dash.entry`（占位「会话仪表盘」）。
- 点击 = 切换面板开/关（再点关闭）；面板开着时按钮加 `.dsh-batch-footer-on` 高亮 + `aria-expanded="true"`（按钮语义是 disclosure，不用 `aria-pressed`）。
- 带 `data-dsh-batch-ui` 标记（选择模式点击拦截放行，同 FooterToggle）。

## 4. 面板布局与视觉规格

```
┌────────────────────────────────────────────────────────┐
│ Header  会话仪表盘          正在读取 37 个会话… / 已更新 22:41:05   ✕ │
│ ▓▓▓▓▓▓▓▓░░░░░░░  (渐进进度条 2px，complete 后隐藏)          │
│ Toolbar [全部 120][主会话 98][子代理 15][已归档 7]              │
│                    已选择 3 个会话 全选 清空 │ 归档 删除 │ 刷新   │
├────────────────────────────────────────────────────────┤
│ ☑ │ 会话            │ 模型      │ Token 消耗│ 缓存读/写 │ 上下文   │ ← sticky 表头
│ ☑ │ ● 标题 [子代理]…  │ deepseek/…│  12.3k   │ 1.2M/45k │ ▬▬▬░ 9% │
│ …                                                      │
└────────────────────────────────────────────────────────┘
```

### 4.1 容器

- `position: fixed; inset: 0; z-index: 950`；背景 `var(--dsw-alias-bg-base, #1e1e1e)` 不透明（全屏面板即「一页」，用页面基底色）；`display: flex; flex-direction: column`。
- 入场：opacity 0→1 + translateY(8px)→0，150ms ease-out；reduced-motion 时无动画。
- 容器语义：`role="dialog"` `aria-modal="true"` `aria-label={t('dash.panel.aria')}`；打开时 body 加 `dsh-dashboard-open` 类（关闭/HMR 卸载必须移除）。

### 4.2 Header（52px + 顶部安全区）

- `padding: 0 16px`，底边 `1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2))`。
- 左：标题 `dash.title`（16px/500，`--dsw-alias-label-primary`），完整显示不截断（窄窗时状态区先让位，见 §10）。
- 右状态区（12px，`--dsw-alias-label-tertiary`，`font-variant-numeric: tabular-nums`）：
  - `pending > 0` → `dash.pending`「正在读取 {n} 个会话…」；
  - `complete` → `dash.updatedAt`「已更新 {time}」（time = `generatedAt` 的 `toLocaleTimeString`，时:分:秒）；
  - 手动刷新 fetching 中 → 沿用 pending 文案。
  - 状态区**不加 `aria-live`**（轮询每 5s 变化，避免读屏骚扰）；操作结果的播报由 notice 的 `role="status"` 承担（既有模式）。
- 关闭按钮：28×28，`IconCloseOutlineRegular` 14px，radius 8px，hover `--dsw-alias-interactive-bg-hover`，`aria-label={t('dash.close')}`；busy（批量操作进行中）时 disabled（见 §6.5）。

### 4.3 Toolbar（min-height 44px，可换行）

- `padding: 8px 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center`，底边 1px `--dsw-alias-border-l2`。
- 左组：4 个过滤 `Pill`（全部 / 主会话 / 子代理 / 已归档），active 态由 Pill 自管；label = 文案 + 空格 + 当前计数（如「全部 120」，计数 = 墓碑过滤后该条件的行数，渐进期间随读取增长，属预期）。计数拼接格式 zh/en 相同，不单独设键。
- 右组（`margin-left: auto`，复用既有类）：
  - `dash.selected` 计数（复用 `.dsh-batch-count` + 既有键 `bar.selected`「已选择 {n} 个会话」）；
  - 「全选」「清空」（复用 `bar.selectAll` / `bar.clear`，`.dsh-batch-btn`）——全选语义 = **当前过滤视图内**全部行，aria-label 用 `dash.selectAll.aria`「全选当前视图的 {n} 个会话」；
  - `.dsh-batch-sep`；「归档/恢复」（选中项全部已归档时切「恢复」，同既有 bar 语义，键复用 `bar.archive`/`bar.unarchive`）；「删除」（`.dsh-batch-btn-danger`，键复用 `bar.delete`，触发 `DeleteDialog`）；
  - `.dsh-batch-sep`；「刷新」（`dash.refresh`，手动拉一次 stats；fetching 中 disabled）。
- 无选中时右组操作按钮 disabled（同既有工具条语义），**不隐藏、不换位**（布局稳定）。
- busy 时右组尾部显示 `dash.busy` 文本（复用 `.dsh-batch-busy` + `role="status"` + 既有键 `bar.busyArchiving` 等 + `{done}/{total}`，同 BatchOverlay）。
- **过滤切换时清空仪表盘选择集**。理由：防止对「被过滤隐藏的已选行」误操作；与既有「操作完成即清空」的习惯一致。

### 4.4 表格区

- `flex: 1; overflow: auto`；滚动条用共享令牌（`--dsw-alias-scrollbar-bg-l2` / `--dsw-alias-scrollbar-hover-l2`），容器内留 2px inset 不贴圆角边。
- 渐进进度条：表格区顶缘 2px 细条（不随内容滚动），`width = loaded/(loaded+pending)`，fill `var(--dsw-alias-button-primary-fill, #3b6cf6)`，transition 200ms ease-out；`role="progressbar"` + `aria-valuemin/max/now` + `aria-label={t('dash.progress.aria')}`；`complete` 后隐藏。
- 用**原生 `<table>`**（不是 div 网格）：`table-layout: fixed` + `<colgroup>`；读屏行列导航免费获得。`<caption>` 用 sr-only 类渲染 `dash.table.caption`「会话资源用量统计」。
- 表头：`<th scope="col">`，sticky top 0（背景 = 面板底色不透明，遮滚动行），高 36px，12px/500 `--dsw-alias-label-secondary`，底边 1px `--dsw-alias-border-l2`；数值列表头右对齐。
- 列宽（colgroup）：

| 列 | ≥1080px | 760–1079px | <760px |
|---|---|---|---|
| ☑ 选择 | 40px | 40px | 44px（sticky left 0） |
| 会话 | auto（min 200px） | auto（min 180px） | auto（min 160px，sticky left 40/44px） |
| 模型 | 180px | 140px | **隐藏**（并入会话格第二行，见 §10） |
| Token 消耗 | 100px，右对齐 | 100px | 92px |
| 缓存读/写 | 120px，右对齐 | 110px | 100px |
| 上下文 | 240px | 168px | 150px |

- 行：高 40px（`(pointer: coarse)` 下 44px）；`td padding: 0 8px`，13px；行分隔 `1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12))`。
- 行 hover：`@media (hover: hover)` 下背景 `var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18))`（触屏无 hover 残留，dsh 响应式纪律 §6.1）。
- 行选中：背景 `var(--dsw-alias-bg-multi-select, rgba(59,108,246,.16))`（与侧栏 `.dsh-batch-selected` 同令牌），优先级高于 hover。
- **行点击 = 切换选中**（与侧栏选择模式交互一致）；例外放行：复选框、Tooltip 触发区（数值详情）上的点击不冒泡为行选中。
- 行 `key` = session id；轮询更新就地改单元格，不重排行序（渐进新行只 append 在底部，见 §6.2）。
- 数值单元格统一 `font-variant-numeric: tabular-nums`（对齐 ContextMeter 先例）。

## 5. 单元格与徽标视觉细节

### 5.1 会话列

结构：`[StateDot 运行中] [标题] [Tag 子代理] [Tag 已归档] [Tag 置顶] [error 警告图标]`，gap 6px，单行，标题弹性截断（`text-overflow: ellipsis`）。

- 标题：13px `--dsw-alias-label-primary`；无标题回落显示会话 id（同截断规则）。截断时 Tooltip（`onlyWhenClipped`）显示完整标题；触屏不显示（辅助信息，行本身可见，dsh 响应式纪律 §7.1）。
- **运行中**：`StateDot` 的 `ongoing` 态（14px 旋转灰点，原语自带 reduced-motion 处理），放标题**前**；`role="img"` + `aria-label={t('dash.badge.running')}`，外包 Tooltip（portal）同文案。它是状态不是属性，不进 Tag 组。
- **徽标 Tag**（只读属性，`Tag` 原语，tone 按原语语义选）：
  - 子代理 → `tone="info"`（信息性分类），文案 `dash.badge.subagent`「子代理」；
  - 已归档 → `tone="neutral"`（中性事实），文案 `dash.badge.archived`「已归档」；
  - 置顶 → `tone="quiet"`（次要事实，最轻），文案 `dash.badge.pinned`「置顶」。
  - 顺序固定如上（重要性递减）；不叠加其他徽标；Tag 自带字号不覆写。窄窗下徽标**不隐藏**（主要状态不可省略），标题截断让位。
- **per-id error**（stats.error ≠ null）：标题组尾部 `IconWarningOutlineRegular` 12px，色 `var(--dsw-alias-state-warn-label, #f2555a)`；Tooltip（portal）label = `dash.error.<code>` 文案（未知 code 回落宿主 message 再回落 code，同既有 `reasonOf` 模式）；图标带同文案 `aria-label`。该行的模型/Token/缓存/上下文四列显示「—」；**行仍可勾选、可参与归档/删除**（读取失败不影响操作）。

### 5.2 模型列

- `provider/model` 原样 13px `--dsw-alias-label-secondary`，单行截断，Tooltip `onlyWhenClipped` 显示全名（内容是数据不走字典）。
- `model === null`（空/草稿会话，无 request/header）→ 「—」（占位规则见 §5.6）。

### 5.3 Token 消耗列

- 显示四桶合计的紧凑格式（§5.6），13px `--dsw-alias-label-secondary`，右对齐。
- `usage === null`（投影缺席降级）→ 「—」。
- Tooltip（portal，`openOnClick=true` 支持触屏点按）：分桶明细，见 §7.2。

### 5.4 缓存读/写列

- `{读} / {写}` 两个紧凑数，13px `--dsw-alias-label-secondary`，右对齐；列头「缓存读/写」即口径（读在前）。
- 两值都为 0 显示 `0 / 0`（正常数据不是缺失）；`usage === null` → 「—」。
- Tooltip（portal，openOnClick）：`dash.tip.cacheRead`「缓存读」/ `dash.tip.cacheWrite`「缓存写」两行，**全量精确值**（千分位），补紧凑格式丢掉的精度。

### 5.5 上下文列（核心扫描列）

单行布局：`[进度条 64×6px] [percent 13px 右对齐 min-width 36px] [≥1080px 时追加小字 ~{used} / {window}]`。

- 进度条：div 实现，radius 3px；track `var(--dsw-alias-border-l3, rgba(128,128,128,.3))`；fill 宽度 = percent%（算法与 GUI `context-occupancy.ts` 一致：`used = projectedTokens ?? pressureTokens`，`percent = min(100, round(used/window*100))`，宿主已算好下发）。
- **阈值着色（仅一档）**：percent ≥ 90 → fill 与 percent 文本改 `var(--dsw-alias-state-warn-primary, #e8a33d)`。理由：仪表盘的核心任务是扫出「快满」的会话，一档 warn 足够，不做三档噪音；GUI 对话内 ContextMeter 不着色是因为它只看当前一个会话，语境不同。双主题可读性列入验收。
- 小字（仅 ≥1080px）：`~12.3k / 131k`，11px `--dsw-alias-label-tertiary`，tabular-nums；`~` 前缀沿用 GUI 口径（projected 是启发式预估）。
- percent 文本 13px `--dsw-alias-label-primary`。
- 数据缺（used 或 window 缺）→ 「—」，无进度条。
- Tooltip（portal，openOnClick）：见 §7.3，含「参考值」口径说明。

### 5.6 数字格式与「—」占位

- **紧凑格式**（表内；对齐 GUI ContextMeter 的 formatTokens 口径）：`< 1000` 原样整数；`< 1e6` → `{v/1000}k`；`≥ 1e6` → `{v/1e6}M`；缩放值 ≥100 取整、否则保留 1 位小数（12.3k、152k、1.2M）。zh/en 同格式，不设单位键。
- **全量格式**（Tooltip 内）：`Intl.NumberFormat()` 千分位。
- **「—」占位**：`--dsw-alias-label-tertiary`，居中（数值列右对齐例外：占位仍右对齐保持列轴线）；标记为 `<span aria-hidden="true">—</span>` + sr-only 文本 `dash.noData`「无数据」（sr-only 工具类插件自有：1px clip 标准写法）。

## 6. 状态：加载 / 渐进 / 空 / 错误 / 降级

一个面板只用**一套**加载语言（dsh 纪律：one loading treatment per page）。

### 6.1 首载（rows = 0 且首轮请求未回/首扫未出行）

表格区渲染 **8 条骨架行**（列表用骨架，不用居中 spinner）：会话格 60% 宽 × 12px 条、数值格 40px × 12px 条，radius `var(--dsw-radius-xs, 4px)`，背景 `var(--dsw-alias-bg-skeleton, rgba(128,128,128,.18))`，静态无动画。表头正常渲染。

### 6.2 渐进（rows > 0 且 pending > 0）

- 行集 = stats.sessions（新→旧），未读取的会话**随后追加为底部行**——已有行不移动、不闪跳；
- Header 状态区显示 `dash.pending`「正在读取 {n} 个会话…」，表格顶缘 2px 进度条（§4.4）；
- complete 后：进度条隐藏，状态区切「已更新 {time}」。

### 6.3 空态（complete 且过滤后 0 行）

表格区**居中**（这是唯一居中的面状态）：

- 语料为空：主文案 `dash.empty.title`「没有会话」（13px label-secondary），副文案 `dash.empty.desc`「创建会话后会出现在这里」（12px label-tertiary）。不加插画。
- 过滤后为空：主文案 `dash.emptyFiltered.title`「该过滤条件下没有会话」+ 文字按钮 `dash.emptyFiltered.clear`「清除过滤」（`.dsh-batch-notice-action` 样式）。

### 6.4 错误态

| 场景 | 展示 |
|---|---|
| **路由失败·已有数据**（网络/非 200，表格有旧行） | 表格区顶部**紧凑通知条**（不遮数据、不推挤布局：overlay 在表格上方或预留一行高度）：warn 图标 + `dash.loadFailed`「统计数据加载失败」+ `dash.retry`「重试」文字按钮。**保留旧数据可见**（dsh 纪律：failed operation keeps the data visible）；轮询继续，下轮成功自动消除通知条 |
| **路由失败·无数据**（首拉即败） | 表格区居中错误态：`IconWarningOutlineRegular`（`--dsw-alias-state-warn-label` 色）+ `dash.loadFailed` + `Button variant="outline"` `dash.retry`「重试」 |
| **降级**（`ok:false, code:'session-query-unavailable'`） | 表格区顶部**常驻**通知条（不可关闭，状态持续期间一直在）：`dash.degraded`「会话统计服务不可用，仅显示列表与批量操作」。行集回落为客户端 `sessions.list` 能提供的全集（可能少于全量语料，属数据源限制），模型/Token/缓存/上下文四列全「—」，徽标/过滤/批量操作照常 |
| **per-id error** | 行内警告图标 + Tooltip（§5.1），数值列「—」；不影响整表 |

错误文案口语化、短句、不带内部术语（dsh 纪律）；code 仅在 Tooltip 明细里以文案键呈现。

### 6.5 批量操作进行中（busy）

- 工具条右组显示 busy 文本（复用 `bar.busy*` + `{done}/{total}`，`role="status"`）；全部操作按钮与刷新 disabled；
- **面板不可关闭**：关闭按钮 disabled、Esc 忽略。理由：进行中关闭会让 notice 生命周期与操作状态失配（notice 由面板层渲染语义最简单），且与 `DeleteDialog`「删除中禁止关闭」的既有语义一致；
- 完成 → notice 面板报结果（复用既有 `.dsh-batch-notice` 全套：成功/失败明细/「停止并归档」后续动作，z 1200 高于面板）；被删行经墓碑过滤消失；`sessions.refresh()` + 手动拉一次 stats（技术设计 §5.2）。

## 7. Tooltip 规格

统一用 `Tooltip` 原语 **portal 变体**（层级 1100 > 面板 950，§2），`delayMs={200}`（ContextMeter 先例）；触屏策略见 §10。多行 label：优先传多行节点；若原语 label 仅可靠支持纯文本，退化为「 · 」分隔的单段拼接（信息不删减）。**面板内禁用 HoverCard**（其 z=100 会被面板盖住）。

### 7.1 触发矩阵

| 目标 | 触发 | 内容 |
|---|---|---|
| 会话标题 | hover / 键盘 focus，`onlyWhenClipped` | 完整标题（数据，不走字典） |
| 模型名 | 同上 | 完整 `provider/model` |
| 运行中圆点 | hover / focus | `dash.badge.running`「运行中」 |
| per-id error 图标 | hover / focus | `dash.error.<code>` 文案 |
| Token 消耗单元格 | hover / focus / **openOnClick** | §7.2 分桶明细 |
| 缓存单元格 | 同上 | 读/写全量值两行 |
| 上下文单元格 | 同上 | §7.3 占比 + 口径 |

### 7.2 Token 分桶明细（键名与顺序）

```
输入（未缓存）  12,345        ← dash.tip.input
输出            6,789         ← dash.tip.output
缓存读          1,234,567     ← dash.tip.cacheRead
缓存写          45,678        ← dash.tip.cacheWrite
─────────────
该会话累计总量，含 fork 继承的前缀   ← dash.tip.usageNote（口径脚注）
```

### 7.3 上下文明细

```
~12.3k / 131k · 9%            ← dash.tip.context（首行，紧凑值 + percent）
下一次请求的预估值，仅供参考；切换模型后可能短暂滞后
                               ← dash.tip.contextNote（「参考值」口径，技术设计 §3：
                                  contextPressure 为 last-wins 非原子观测）
```

## 8. 排序：本期结论

**默认且唯一排序 = 新→旧（updatedAt 降序，宿主 `listSessions()` 原生顺序，前端零成本）。本期不做列头排序。** 理由：

1. 渐进加载期间排序会导致行持续重排（新读取的旧会话插到表格中部），与「行稳定、底部追加」的渐进体验直接冲突；只有 complete 后才可稳定排序，而首扫可能分钟级；
2. 本期核心任务是「扫描状态 + 批量操作」，不是用量分析；新→旧覆盖主场景（找最近会话）；
3. 「—」（数据缺失）与 error 行的排序位次需要额外语义规则，收益低成本高；
4. v1 契约无排序参数，纯前端排序在数千行 + 5s 轮询下是无谓的重排开销。

**演进预留**（记录不实现）：complete 后允许按 Token 合计 / 上下文 percent 客户端排序；届时列头渲染为按钮，`th` 加 `aria-sort="ascending|descending|none"`，三态循环（升→降→回默认新→旧）；「—」行恒沉底。文案键位到时再定（`dash.sort.*` 预留前缀）。

## 9. 键盘操作与无障碍

- **焦点管理**：面板打开 → 焦点移入面板（关闭按钮）；`Tab`/`Shift+Tab` 在面板内循环（自实现 focus trap：keydown Tab 时约束 focusable 集合于面板内）；关闭 → 焦点还给 footer 入口按钮（若仍挂载）。
- **Esc**：面板挂 document 级捕获监听（同 BatchOverlay 模式）：`confirmDelete !== null` 时不处理（Esc 归 `Modal` 的 `useModalLayer`）；busy 时忽略；否则 `preventDefault + stopPropagation + 关闭`。面板未打开时监听器必须已卸载/短路（不影响侧栏选择模式的 Esc）。
- **全屏铺满无裸露背景** → 无「点击背景关闭」；关闭途径 = 关闭按钮 / Esc / 入口按钮再点一次。
- 行内键盘：复选框原生 `Space` 切换；行点击选中是鼠标/触摸增强，键盘路径 = Tab 到行首复选框（不做 roving tabindex，列入演进观察）。
- 语义与 aria 键位汇总：

| 元素 | 语义 | 文案键 |
|---|---|---|
| 面板容器 | `role="dialog"` `aria-modal="true"` | `dash.panel.aria`「会话仪表盘」 |
| 表格 | 原生 table + sr-only caption | `dash.table.caption`「会话资源用量统计」 |
| 表头全选框 | `input[type=checkbox]`（支持 indeterminate） | `dash.selectAll.aria`「全选当前视图的 {n} 个会话」 |
| 行复选框 | 同上 | `dash.row.select.aria`「选择会话 {title}」 |
| 过滤 chips | `Pill`（active 自管） | `dash.filter.*` |
| 渐进进度条 | `role="progressbar"` + valuenow/min/max | `dash.progress.aria`「会话统计读取进度」 |
| busy 文本 | `role="status"` | 复用 `bar.busy*` |
| 运行中圆点 | `role="img"` | `dash.badge.running` |
| 「—」占位 | `aria-hidden` 视觉 + sr-only 文本 | `dash.noData`「无数据」 |
| 关闭/刷新 | button + aria-label | `dash.close`「关闭」/ `dash.refresh`「刷新」 |
| 入口按钮 | `aria-expanded` | `dash.entry`「会话仪表盘」 |

- 焦点可见：自绘控件全部走 `:focus-visible` + `var(--dsw-focus-ring-color)` / `--dsw-focus-ring-width` 焦点环。
- 状态不靠颜色单传：≥90% warn 色之外，percent 数字本身可读；运行中除圆点外有 aria-label + Tooltip。

## 10. 移动端 / 窄窗行为

最小验收视口 **390 CSS px**（dsh 响应式纪律 §1）：无页级横向滚动（横滚只允许在表格容器内部）、无遮挡、主操作可达。

| 断点 | 行为 |
|---|---|
| ≥1080px | 全六列，上下文列带 `~used / window` 小字 |
| 760–1079px | 模型列压缩 140px 截断（Tooltip 全名）；上下文小字隐藏（详情在 Tooltip）；toolbar 允许换行为两行（chips 行 + 操作行） |
| <760px | **模型列隐藏**，模型名并入会话格第二行（11px `--dsw-alias-label-tertiary`，截断，Tooltip portal 全名）；表格容器横向滚动（表格 min-width 560px）；**选择框列 + 会话列 sticky left**（sticky 单元格背景必须不透明且随行态同步：普通行 = 面板底色、选中行 = multi-select 色——背景设在 td 而非 tr）；header 标题完整显示，状态区截断让位 |

- **触摸目标**：`(pointer: coarse)` 下行高 44px、复选框整格可点（≥40px 目标）；关闭按钮视觉 28px、命中区 padding 扩到 ≥40px。
- **hover**：全部包在 `@media (hover: hover)`；触摸点按不留 hover 残留（纪律 §6.2）；选中/焦点态与 hover 能力无关，保持可见。
- **触屏 Tooltip**（纪律 §7）：数值明细类（Token/缓存/上下文）`openOnClick=true` 点按可看，触发区 `stopPropagation` 不触发行选中；纯辅助类（标题截断、快捷键说明）触屏不显示。
- 工具条按钮**保持文字不 icon-only**（icon-only 需 tooltip 兜底，文字更直接；空间不足靠 flex-wrap 换行解决——纪律 §2 决策顺序：先换行再截断）。
- 无文本输入框 → 无自动弹键盘问题（纪律 §8 天然满足）。
- 宽度变化不 remount 控件、不丢焦点（纪律 §6.4）：断点切换纯 CSS 媒体查询实现，不靠 JS 重建组件树。

## 11. 文案键清单（键名 + zh 占位）

新增键统一 `dash.` 前缀（现有命名空间 `sessionBatch` 扁平点键风格）；**复用**既有键的直接标注。en 字典由 `locales.ts` 补齐（sentence case）。

| 键 | zh 占位 | 用途 |
|---|---|---|
| `dash.entry` | 会话仪表盘 | footer 入口 title/aria/文字 |
| `dash.title` | 会话仪表盘 | 面板 header 标题 |
| `dash.panel.aria` | 会话仪表盘 | 面板 dialog aria-label |
| `dash.close` | 关闭 | 关闭按钮 aria-label |
| `dash.refresh` | 刷新 | 刷新按钮文字/aria |
| `dash.filter.all` | 全部 | 过滤 chip |
| `dash.filter.main` | 主会话 | 过滤 chip |
| `dash.filter.subagent` | 子代理 | 过滤 chip |
| `dash.filter.archived` | 已归档 | 过滤 chip |
| `dash.selectAll.aria` | 全选当前视图的 {n} 个会话 | 工具条全选 + 表头复选框 aria |
| `dash.row.select.aria` | 选择会话 {title} | 行复选框 aria |
| `dash.col.session` | 会话 | 列头 |
| `dash.col.model` | 模型 | 列头 |
| `dash.col.tokens` | Token 消耗 | 列头 |
| `dash.col.cache` | 缓存读/写 | 列头 |
| `dash.col.context` | 上下文 | 列头 |
| `dash.table.caption` | 会话资源用量统计 | sr-only caption |
| `dash.pending` | 正在读取 {n} 个会话… | header 渐进状态 |
| `dash.updatedAt` | 已更新 {time} | header 完成状态 |
| `dash.progress.aria` | 会话统计读取进度 | progressbar aria |
| `dash.badge.running` | 运行中 | StateDot aria + Tooltip |
| `dash.badge.subagent` | 子代理 | Tag 文本 |
| `dash.badge.archived` | 已归档 | Tag 文本 |
| `dash.badge.pinned` | 置顶 | Tag 文本 |
| `dash.noData` | 无数据 | 「—」占位 sr-only |
| `dash.error.corrupt` | 会话日志已损坏 | per-id error Tooltip |
| `dash.error.read-failed` | 读取会话日志失败 | per-id error Tooltip（未知 code 回落 message/code，同 `reasonOf` 模式） |
| `dash.tip.input` | 输入（未缓存） | Token Tooltip 行 |
| `dash.tip.output` | 输出 | Token Tooltip 行 |
| `dash.tip.cacheRead` | 缓存读 | Token/缓存 Tooltip 行 |
| `dash.tip.cacheWrite` | 缓存写 | Token/缓存 Tooltip 行 |
| `dash.tip.usageNote` | 该会话累计总量，含 fork 继承的前缀 | Token Tooltip 口径脚注 |
| `dash.tip.context` | ~{used} / {window} · {percent}% | 上下文 Tooltip 首行 |
| `dash.tip.contextNote` | 下一次请求的预估值，仅供参考；切换模型后可能短暂滞后 | 上下文 Tooltip 口径 |
| `dash.empty.title` | 没有会话 | 空态主文案 |
| `dash.empty.desc` | 创建会话后会出现在这里 | 空态副文案 |
| `dash.emptyFiltered.title` | 该过滤条件下没有会话 | 过滤空态主文案 |
| `dash.emptyFiltered.clear` | 清除过滤 | 过滤空态按钮 |
| `dash.loadFailed` | 统计数据加载失败 | 错误态/通知条 |
| `dash.retry` | 重试 | 错误态按钮 |
| `dash.degraded` | 会话统计服务不可用，仅显示列表与批量操作 | 降级常驻通知条 |
| （复用）`bar.selected` / `bar.selectAll` / `bar.clear` / `bar.archive` / `bar.unarchive` / `bar.delete` / `bar.busy*` | — | 工具条计数与操作 |
| （复用）`delete.*` 全部 | — | DeleteDialog |
| （复用）`notice.*` 全部 | — | 结果通知与失败明细 |

## 12. UI 验收清单（沙箱 GUI 实测项）

1. **层级**：面板盖住页面与侧栏工具条（面板开时 `.dsh-batch-bar` 隐藏）；DeleteDialog 盖在面板上；面板内 Tooltip（portal）不被面板裁剪；notice 显示在面板之上；面板关闭后 body 标记类移除、工具条恢复。
2. **双主题**：全部令牌色浅/深核验（重点：warn 色进度条与文字、「—」占位、骨架行、sticky 列背景）。
3. **macOS**：`--dsh-frame-top-clearance` 顶部安全区生效，header 不压标题栏区。
4. **渐进**：首载骨架 → 行自底部追加不跳动 → pending 递减 → complete 后进度条隐藏、状态区切「已更新」。
5. **状态矩阵**：空语料 / 过滤空 / 路由失败（有旧数据、无数据两态）/ 降级 / per-id error 行，逐一目测 + 截图。
6. **交互**：过滤切换清选择集；全选 = 当前视图；归档↔恢复切换语义；busy 中面板不可关、按钮 disabled、done/total 递增；删除走行内消失（墓碑）。
7. **键盘/读屏**：打开焦点入面板 → Tab 循环 → Esc 关闭并还焦入口；DeleteDialog 开时 Esc 归 Modal；table/caption/th/progressbar/checkbox 语义可被读屏遍历。
8. **窄窗**：1440 / 1024 / 768 / 390px 四档截图；390px 无页级横滚、sticky 列背景随行态正确、触摸目标 ≥40px。
9. **触摸**：点行选中无 hover 残留；点数值弹 Tooltip 且不触发行选中；点空白处 Tooltip 收起。
10. **动效**：`prefers-reduced-motion` 下面板入场与进度条无动画。

## 13. 演进记录（不在本期）

- 列头排序（§8 预留方案）；标题搜索框；行点击打开会话 / 详情抽屉（技术设计 §10）；
- 行级 roving tabindex 键盘导航（大表格 Tab 距离优化）；
- 上下文列阈值分档细化（如 80% 提示档）——待真实使用反馈再议。

## 14. 实现注记（2026-11-02）

以下为第一版实现中与规格有差异的点，已确认可接受：

- **Tooltip label 为纯文本**：dsh `Tooltip` 原语的 `label` 类型是 `string | (() => string)`（`TooltipLabel`），不支持 JSX。Token 分桶明细、缓存明细、上下文明细均以换行分隔的 `key: value` 对呈现，信息不删减。
- **StateDot `state` 属性**：dsh `StateDot` 的 API 是 `state: StateDotState`（`'done' | 'warning' | 'ongoing' | 'error' | 'idle'`），而非 `tone`。运行中指示使用 `state="ongoing"`。
- **仪表盘选择集状态**使用 `DashboardStore`（`createSnapshotStore`）管理，与侧栏 `BatchState` 完全独立。过滤切换时 store 内部清空选择集。
