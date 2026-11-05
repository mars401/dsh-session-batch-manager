# 会话可视化仪表盘（Session Dashboard）· UI/交互规格

> 插件：`@local/dsh-session-batch`（`plugins/dsh-session-batch`）
> 配套文档：[design-session-dashboard.md](./design-session-dashboard.md)（技术设计，数据流/契约/文件清单以其为准；v0.2 树形增量见其 §11，**v0.3 修订（两档压平、行集口径、fork 终裁、会话召回）见其 §13——现行最高优先**；对应 UI 规格见本文 §15/§16）
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

> v0.2：新增「项目」列（七列），列宽/断点增量以 §15.1 为准（本表为 v0.1 原文）。

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
- v0.2 树形增量：会话列树形化（展开按钮/缩进/连接线/子数徽标）、子代理行视觉降层、子代理档「所属主会话」小字、已归档档行级恢复按钮——见 §15.2 / §15.5 / §15.6。

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
- **仪表盘选择集状态**使用 `DashboardStore`（`createSnapshotStore`）管理，与侧栏 `BatchState` 完全独立。过滤切换时 store 内部清空选择集。（v0.2 起改为**档位切换保留选择集**，见 §15 与 design §11.6/§11.9——本条为 v0.1 历史注记。）

## 15. 树形结构与项目列 · UI 增量（v0.2，2026-11-03 定稿）

> 对应 [design-session-dashboard.md](./design-session-dashboard.md) §11（语义以其为准，本节只管像素/交互/文案）。新增类名沿用 `dsh-dash-*` 前缀与 §1 复用纪律（控件优先原语、字重 ≤500、颜色走令牌带回退、双主题人工核验、`prefers-reduced-motion` 降级）。
> ⚠️ **2026-11-04 用户验收修订**：本节部分规格已被 design §13 修订/废弃（四档→两档、多层树→两层压平、三态勾选取消、§15.5 档位废弃但小字保留在树形子行——见该节修订注记等），逐条处置见 design §13.7；召回 UI 像素级规格见 **§16**（已定稿，2026-11-05 复验对账更新）。

### 15.1 列结构与宽度（对 §4.4 列宽表的增量）

七列 `colgroup`（新增**项目**列，紧随会话列）：

| 列 | ≥1080px | 760–1079px | <760px |
|---|---|---|---|
| ☑ 选择 | 40px | 40px | 44px（sticky left 0） |
| 会话 | auto（min 200px） | auto（min 180px） | auto（min 160px，sticky left 40/44px） |
| **项目** | **160px** | **120px**（截断） | **隐藏**，并入会话格第二行（见下） |
| 模型 | 180px | 140px | 隐藏（§10 既有规则，并入会话格第二行） |
| Token 消耗 | 100px，右对齐 | 100px | 92px |
| 缓存读/写 | 120px，右对齐 | 110px | 100px |
| 上下文 | 240px | 168px | 150px |

- <760px 会话格第二行同时承载项目与模型：`{项目 basename} · {模型名}`（11px `--dsw-alias-label-tertiary`，整行截断）；Tooltip（portal，`openOnClick=true`）两行内容 = 项目全路径 / 模型全名，缺一项只显示另一项；
- 表格 min-width 由 560px 提升至 **640px**（<760px 容器横滚，§10 既有机制）；
- 其余（表头样式、行高、hover/选中态、行点击=选中、tabular-nums）沿用 §4.4 不变。

### 15.2 会话列树形结构

- **缩进**：`depth × 16px`，以会话格 `padding-left` 实现（不动表格结构）；子行缩进起点绘制「└」连接线（1px `--dsw-alias-border-l2`，纯 CSS，`aria-hidden`）；多级嵌套递归适用，不设深度上限（真实语料 1–2 级）；
- **展开按钮**（仅 `hasChildren` 行）：位于标题前（缩进之后），视觉 20×20、`(pointer: coarse)` 命中区 ≥24×24；字符 ▸（收起）/ ▾（展开），10px `--dsw-alias-label-secondary`；`aria-expanded` + `aria-label`（`dash.tree.expand` / `dash.tree.collapse`）；`:focus-visible` 焦点环；点击 `stopPropagation`——**行 body 点击仍是切换勾选，两命中区严格分离**（§4.4 例外放行清单加此项）；
- **子数徽标（仅树形「全部」档渲染，平面档无**——design §11.5 平面档规范化）：`Tag` 原语 `tone="quiet"`，内容 = **直接子数** N；置于标题之后、徽标 Tag 组之前；`runningDescendants > 0` 且折叠时，徽标内嵌 `StateDot state="ongoing"` 12px（`role="img"` + `aria-label={t('dash.tree.childrenRunning')}`，外包 Tooltip 同文案——「运行中的工作不许被折叠藏掉」）；
- **会话格内元素顺序**：[展开按钮] [StateDot 自身运行] [标题] [子数徽标] [Tag 派生（fork 根行，P1）] [Tag 子代理] [Tag 已归档] [Tag 置顶] [error 图标]。子代理行也可以有自己的子树（嵌套委派），子数徽标与子代理徽标可同现；
- **子代理行视觉降层**：标题色 `--dsw-alias-label-secondary`（主会话行保持 primary），字号不变 13px；**不显示置顶徽标、置顶不可操作**（子代理无置顶语义）；运行中/子代理/已归档徽标保留；数据四列照常；
- **fork 根行「派生」Tag（P1，不阻塞验收——产品经理 2026-11-04 终裁第 5 条委托规格，产品设计决定做）**：`Tag` 原语 `tone="quiet"`（与模型 Tag 同款），文案 `dash.fork.tag`「派生」，置于 Tag 组**首位**（身份标记优先于属性标记）；fork 判定 = 有 `parentId` 且 `origin !== 'subagent'`（结构判定，与 design §13.5 终裁同源；禁用 `delegationDepth`——客户端投影没有该字段）；Tooltip **恒可用**（非 `onlyWhenClipped`——此 Tag 的存在理由就是回答「从哪来」，补回不挂树损失的出生关系信息）：`dash.fork.origin`「派生自会话 {title}」，`{title}` = 起源会话标题走 design §12 全局不变量（`title || id`；`byId[parentId]` 缺席——起源会话已删除——回落完整 parentId）；纯信息：不参与过滤/排序/级联/计数，不改变 Δ=0 与任何验收判据。动机：fork 与起源会话标题常相近，两个相像的根行易被误读为重复数据（本项目用户对「数差」类问题极敏感——问题 1/3 教训）；
- 展开/收起**无动画**（表格行插拔，避免动效债）。

### 15.3 三态勾选

- 原生 `input[type=checkbox]` 的 `indeterminate` DOM 属性（浏览器默认横杠视觉，不自绘）；
- 语义：checked = 自身在选中集；indeterminate = 自身未选但任一后代已选；**点击只增/删自身，永不触碰后代**（勾选不级联）；
- aria 不变（`dash.row.select.aria`）；读屏对 indeterminate 原生播报 mixed 态。

### 15.4 项目列单元格

- 13px `--dsw-alias-label-secondary`，`text-overflow: ellipsis` 截断；
- Tooltip（portal）**恒可用**（非 `onlyWhenClipped`——全路径消歧是本列设计目的）：label = `projectKey` 规范化全路径；触屏 `openOnClick=true`（数值明细类待遇，§10 纪律），触发区 `stopPropagation` 不触发行选中；
- 空值（孤儿根无 cwd）→「—」（§5.6 占位规则：`aria-hidden` 视觉 + sr-only `dash.noData`），**不得冒充其他项目**。

### 15.5 子代理档「所属主会话」小字

> ⚠️ **2026-11-05 修订**：本节随「子代理档」删除而废弃，但「↳ 父标题」小字**保留在树形档子代理行**上——两层压平后点名真实父会话，补回丢失的中间层级信息（如孙代 B1a 压平重挂 P2 后，小字告知它真正属于 B1）；`dash.parent.label` 键随之**移出废弃清单**（复验实测仍在消费，项目经理 2026-11-05 拍板）。下述短 id 规则、§12 取值规则、Tooltip 两分支、`role="note"`、触屏不显示纪律**照常适用于树形子行**。

- 仅**平面子代理档**显示（树形「全部」档结构已表达归属，不加）：会话格标题 flex 行尾追加 `↳ {父标题}`（11px `--dsw-alias-label-tertiary`，`max-width: 12em` 截断）；父标题取值走 design §12 **全局不变量**（`title || id`，禁止 `displayTitle`——D7 教训）；孤儿判定 = **行集成员判定**（`byId[parentId] === undefined`），不得用标题/id 字符串相等；
- 父不在行集（已删除）→ 显示父短 id：**保留 `session-` 前缀（若有），取前缀之后 8 位**，尾加省略号——如 `session-93ac64a6…`；裸 UUID 父（嵌套委派场景）取 uuid 前 8 位，如 `4ee4b5eb…`。**不可取裸 id 前 8 位**：真实语料子代理的 `parentSession` 一律 `session-<uuid>` 形态（桌面 41 条实测 + 本轮孤儿夹具），裸取前 8 位恒为 `session-`，所有孤儿行同显、无法区分（测试工程师干跑证据，2026-11-04 修正）；
- 显示短 id 时 Tooltip **恒可用**给父完整 id（缩写有损，需可对照语料；非 `onlyWhenClipped`）；
- Tooltip `onlyWhenClipped` 完整父标题（`aria-label` 用 `dash.parent.label`）；小字 span 带 **`role="note"`**——裸 span 属 generic 元素，`aria-label` 不保证被读屏播报（测试工程师 P2 观察采纳，2026-11-04；同文件运行点 `role="img"` + aria-label 是有效先例）；触屏不显示（辅助信息，§7.1 纪律）。

### 15.6 行级恢复按钮（仅「已归档」档）

- 会话格标题行尾追加 mini 文字按钮 `.dsh-dash-btn-mini`（12px，主色文字按钮形态，文案 `dash.restore.row`「恢复」+ aria-label 带标题），点击 `stopPropagation`；
- 可点条件：**显式归档且无已归档祖先**（即树根）；恢复 = `unarchive(rootId)` 一次，整树回原档（血统归档派生标记自动消失）；
- 两类行**置灰 disabled**，Tooltip 指明**真正能解锁该行的动作**（不做成点了没反应）：
  - ① 血统归档子行（不在显式集合，宿主 unarchive 守卫下本就是 no-op）→ Tooltip `dash.restore.withParent`「随祖先会话 {title} 恢复」，`{title}` = **最近的显式归档祖先**的标题（无标题按 §15.5 短 id 规则回落；取值同走 design §12 全局不变量）。孙代场景不能写死「随父会话恢复」：恢复 P 后 G1 因 C1 仍留档，而用户刚点的是 P——文案会指错层（测试工程师三步干跑抓出的对不上点，2026-11-04 修正）；
  - ② 显式归档但存在已归档祖先的子行（单独恢复仍被血统覆盖、点了无效——「子先于父归档 → 父恢复后子仍留档」边界的交互表达）→ Tooltip `dash.restore.ancestorFirst`「需先恢复祖先会话 {title}」；该祖先恢复后本行按钮转为可点；
- **fork 行（产品经理 2026-11-04 终裁第 3 条，产品设计落规格）**：fork 只经**自身显式归档**进本档（祖先归档不级联到它——血统/级联链在非 subagent 行截断，design §13.5），进档后为**独立根行**：不缩进、不进起源会话子树，即使起源会话同时在档——两者各自为根行、无父子视觉关系（`parentId` 是出生记录非包含关系）；其行级恢复按钮 = 本节可点形态（显式归档且无已归档祖先），恢复只作用自身及名下子代理；
- 操作条批量恢复按钮保留（现语义：选中全为显式归档时可用）。

### 15.7 级联文案与原子性反馈

- **删除确认**（`DeleteDialog` 文案扩展）：单一父节点级联 → `dash.delete.cascade`「将删除 {title} 及其 {n} 个子代理会话（不可恢复）」；混合勾选（多根 + 散子，去重后）→ `dash.delete.cascade.summary`「将删除 {total} 个会话（含 {n} 个子代理，不可恢复）」+ 明细区逐根列「{title}：及其 {k} 个子代理」；
- **归档确认**从简（可逆操作，P1）：结果 notice 用 `dash.archive.cascade`「已归档 {title} 及其 {n} 个子代理」；
- **级联原子性拒绝**：复用现有 notice 失败明细形态（`.dsh-batch-notice`，15s 带明细）：标题 `dash.cascade.blocked`「存在运行中的会话，已拒绝该节点的级联操作」，明细逐条点名运行中会话标题；归档被拒沿用「停止并归档」重试入口（既有机制）。

### 15.8 文案键增量（键名 + zh 占位；en 进 `locales.ts`，sentence case）

| 键 | zh 占位 | 用途 |
|---|---|---|
| `dash.col.project` | 项目 | 项目列表头 |
| `dash.tree.expand` | 展开 {title} 的 {n} 个子代理 | 展开按钮 aria-label（收起态） |
| `dash.tree.collapse` | 收起 {title} 的子代理 | 展开按钮 aria-label（展开态） |
| `dash.tree.childrenRunning` | 含运行中的子代理 | 子数徽标运行点 aria/Tooltip |
| `dash.parent.label` | 所属主会话：{title} | 树形子代理行「↳ 父标题」小字 aria-label（§15.5 修订注记；2026-11-05 移出废弃清单） |
| `dash.restore.row` | 恢复 | 行级恢复按钮文案 |
| `dash.restore.row.aria` | 恢复 {title} 及其子树 | 行级恢复 aria-label |
| `dash.restore.withParent` | 随祖先会话 {title} 恢复 | 血统归档行置灰 Tooltip（{title} = 最近显式归档祖先） |
| `dash.restore.ancestorFirst` | 需先恢复祖先会话 {title} | 有已归档祖先的显式归档行置灰 Tooltip |
| `dash.delete.cascade` | 将删除 {title} 及其 {n} 个子代理会话（不可恢复） | 单根级联删除确认 |
| `dash.delete.cascade.summary` | 将删除 {total} 个会话（含 {n} 个子代理，不可恢复） | 混合勾选删除确认 |
| `dash.archive.cascade` | 已归档 {title} 及其 {n} 个子代理 | 归档结果 notice |
| `dash.cascade.blocked` | 存在运行中的会话，已拒绝该节点的级联操作 | 原子性拒绝 notice 标题 |
| `dash.fork.tag` | 派生 | fork 根行身份 Tag（P1，§15.2；纯信息不参与语义） |
| `dash.fork.origin` | 派生自会话 {title} | 「派生」Tag Tooltip（{title} = 起源会话标题，§12 不变量，缺席回落完整 parentId） |

### 15.9 键盘/无障碍与验收清单增量

- 键盘：展开按钮、行级恢复按钮 Tab 可达，`Space`/`Enter` 触发；**不引入 `role="tree"`**——保持原生 table 语义，层次由缩进 + `aria-expanded` 表达（读屏行列导航不变，§4.4 选型理由仍成立）；
- 状态不靠颜色单传：运行点有 aria-label + Tooltip；子数徽标数字本身可读；
- 双主题人工核验新增项：连接线、quiet 子数徽标、置灰按钮、`↳` 小字在浅/深色下的可读性；
- GUI 验收清单（沙箱实测，配合产品经理的产品验收点）：默认全折叠；「▸ N」= 直接子数；展开态跨 5s 轮询保持；折叠父行运行指示两条路径（自身 StateDot / 后代徽标点）；孤儿子代理为顶层行且项目列「—」；子行项目 = 树根项目（即使自身另有 cwd）；chips 计数含折叠子行且与展开状态无关；全选 = 当前档可见行；级联删除两种文案形态 + 去重计数；原子性拒绝明细点名；恢复置灰两种情形（血统子 / 有已归档祖先的显式子）；「先归档子→归档父→恢复父」三步边界；档位切换选择集保留；<760px 项目并入第二行 + 表格横滚；触屏 Tooltip（项目列 openOnClick、小字不显示）。

## 16. 会话召回 · UI 规格（v0.3，2026-11-04 拍板定稿）

> 对应 design §13.6（语义以其为准）；项目经理已拍板三处取舍——含「召回只操作主会话 membership、**数量口径 = 主会话数**、子代理不回填」。复用基线同 §1：令牌 + 原语 + `.dsh-batch-*` 按钮族 + notice 形态 + 信任栅栏先例。

### 16.1 召回横幅

- 位置/形态：表格区顶部通知条，复用 §6.5 降级通知条的视觉骨架（全宽、13px、面板底色 + 底边 `--dsw-alias-border-l2`），行尾带操作按钮——与降级条的「常驻不可关」区分：召回横幅**可忽略**；
- 内容：`dash.recall.banner`「发现工作区 {name} 可召回 {n} 个会话（含 {m} 个子代理）」（**{name} 必须在横幅内**——多工作区排队时靠它辨识当前条；2026-11-05 复验发现现实现文案丢了 {name}，随 D15 批次补回）+ ［查看］`dash.recall.view`（`.dsh-batch-btn` 主操作形态）+ ［忽略］`dash.recall.dismiss`（`.dsh-batch-btn` 次级形态）；`{name}` = `WorkspaceView.title`（无标题回落 path basename）；`{n}` = 裸 cwd 匹配命中的**未分组主会话**数（口径见 §16.4）；`{m}` = 命中主会话名下子代理总数（**parentId 亲缘链派生，遍历在非 subagent 子行截断**——fork 不计入起源会话的 {m}，其自身作为独立候选带自己的子代理数，fork 终裁第 2 点同旨、对应复验发现 F1；纯信息展示——子代理可见性来自 parentId 不来自账本，主会话召回后树自动完整归位；**不按 cwd 字符串聚拢计数**——D14 教训：按 cwd 聚拢会漏掉与父 cwd 不同的子代理、多算同目录别人家的子代理）；
- `role="status"`（aria-live polite）；按钮 `(pointer: coarse)` 命中区 ≥40px、保持文字不 icon-only（§10 纪律）；
- **触发基线与忽略记忆（2026-11-05 项目经理拍板 (b)）**：diff 基线 = **`dashStore`（订阅级）订阅建立后首个 `phase === 'ready'` 的 workspace 快照**（`WorkspaceSnapshot.phase`，架构师 2026-11-05 核定：pending 不抓、防「挂载早于首拍→空 baseline 把存量全误标为新」；**ready 且 items 为空照抓**——零工作区是可达态，baseline=空集时随后添加的第一个工作区照常弹），存 store 而非组件 effect——面板开关不影响，覆盖「先在侧栏加工作区、之后才打开批量面板」的现实顺序（mount 级 baseline 会让面板关闭期间添加的工作区横幅永不出现、该批未分组会话失去召回入口）；「忽略」记忆为**本次应用会话内**（store 级，面板开关不清除；不持久化——宿主重启/插件重载后 baseline 重置、旧成员 diff 为空，不再弹）；**待处理队列同为 store 级**：召回完成后的快照刷新只更新数据、不清空队列；常驻入口（「查找可召回会话」按钮）不做，列 design §10 演进——**插件未运行期间（含 CLI 途径）添加的工作区在下次启动首拍里已是旧成员、diff 恒空、无召回入口，属设计内已知边界不是缺陷**（一切 diff 方案的共同残余）；
- **多工作区命中**：一次只展示一条（按快照 `items` 序首个）；忽略或召回完成后仍有剩余命中 → 重新评估展示下一条；
- busy 期间（批量操作/召回执行中）横幅隐藏，完成后重新评估。

### 16.2 召回清单（召回模式）

- 点［查看］→ 面板进入「召回模式」：表格区**整体替换**为清单（不做 overlay 抽屉，避免新增 z-index/焦点层）；表格区顶部加返回按钮「‹ 看板」（文字按钮，`aria-label` = `dash.recall.back`）；召回模式标题 `dash.recall.title`「召回未分组会话 · {name}」，兼作表格 `<caption>`（实现增补，2026-11-05 核准——caption 对读屏播报表格用途有效）；
- 清单用原生 `<table>`（同 §4.4 选型），**四列**（原第五列「状态」随置灰态一并砍除——无置灰态定案 (a)，见 §16.4）：

| 列 | ≥760px | <760px |
|---|---|---|
| ☑（表头全选，aria = **`dash.recall.selectAll`**「全选 {n} 个可召回会话」——新键带 {n}，对读屏比复用通用键 `dash.selectAll.aria` 更有信息量，2026-11-05 项目经理裁决保留新键、改文档） | 40px | 44px |
| 标题（§12 不变量取值；截断 Tooltip `onlyWhenClipped`；行尾附子代理计数 **`+N`**——N = 该主会话名下 **parentId 亲缘链**子代理数，**N=0 不渲染**，与横幅 {m} 同源取值、不按 cwd 聚拢，D14 判据：R1 显示 `+1`、R2 不显示；**计数遍历在非 subagent 子行截断**——fork（有 parentId 且 origin≠subagent）不计入起源会话的 +N、其子树不递归，fork 自身作为独立候选把名下子代理计入自己的 +N（fork 终裁第 2 点同旨；2026-11-05 产品设计补充，对应复验发现 F1）） | auto（min 200px） | auto |
| 更新时间（格式定案 `YYYY-MM-DD`——「宿主无现成格式化」回落条款成立：插件侧拿不到宿主侧栏格式化器，2026-11-05 产品设计核准；列宽随格式回落实现现值） | 120px | **隐藏** |
| cwd（截断 + Tooltip 全路径，同项目列纪律） | auto（min 120px） | **隐藏**，并入标题格第二行（11px `--dsw-alias-label-tertiary`，同 §15.1 先例） |

- 行样式复用 `.dsh-dash-row` 全套（40/44px、hover、选中背景 multi-select 令牌）；默认**全部行选中**；
- **无置灰态**（产品设计 2026-11-04 定案，采架构师结论 (a)；`dash.recall.unavailable` 键废弃）：客户端判不出目录存在性（浏览器无 fs），且结构上清单行几乎必然 attach 成功——workspace 注册制（添加时目录必已存在）、符号链接/子目录形态在预览阶段就不进候选、唯一失败窗是「添加后目录被删」的竞态（结构性理由详见 design §13.6）；**全部行可选**，失败收敛到 §16.3 执行明细逐条点名（宿主 attach 原生错误文案），不要求预览全知；
- 排序：全部行按 updatedAt 降序（无可召回/不可召回之分——无置灰态）；
- 底部操作条（替换现操作条位置）：［召回 {k} 条会话］（`dash.recall.execute`，k=0 时 disabled；现实现文案「召回选中会话」无 {k}，D15 批次补）+ ［取消］（`dash.recall.cancel`，返回看板并**丢弃**勾选态，重进恢复默认全选；**`back` 与 `cancel` 是两个控件**——顶部「‹ 看板」与底部「取消」，不得一键兼职，D15）+ 已选计数（`.dsh-batch-count` 复用）；
- 键盘/焦点：召回模式下 **Esc = 返回看板**（不关面板；busy 时忽略，与既有 Esc 分层一致）；进入时焦点移到返回按钮，返回时还给横幅［查看］（横幅已消失则面板关闭按钮）。

### 16.3 执行与反馈

- 点［召回］→ busy：操作条切 `.dsh-batch-busy` 形态，文案 `dash.recall.busy`「正在召回…」（不定量进度——POST 一次性、逐条结果在响应里，无流式）；busy 期间按钮禁用、Esc 忽略（§6.5 纪律）；
- 结果 notice（`.dsh-batch-notice` 全套形态）：全部成功 → `dash.recall.success`「已召回 {n} 个会话到 {name}」（6s 自动收起）；有失败（含部分成功）→ `dash.recall.failure`「召回完成：{ok} 成功，{fail} 失败」（15s）+ 明细逐条 = **行标题（§12 不变量，禁裸 id——D18）+ 失败 code 的 `notice.code.*` 本地化标签（补 5 键，D19）+ 宿主 message 原文（不翻译，技术错误原文对排查有用——项目经理 D19 拍板）**；
- **HTTP 非 2xx 必须落 failure notice**（D12 教训：未查 `res.ok` → 整批 400 的合法 JSON body 不进 catch、被渲染成绿色「已召回 0 个会话」）：`if (!res.ok)` 独立分支 → failure notice，`{fail}` = 提交 id 数、明细逐条 `titleOf(id)` + 宿主 message；D13 后「目录已删」一族已由宿主转成 200 + per-row `cwd-unresolvable`（客户端单一失败处理形态），非 2xx 检查是兜真 4xx/5xx 的护栏；
- 完成后：退出召回模式回看板；立即刷新 workspace 快照（`items` 更新 → 未分组口径收敛；**刷新只更新数据、不清空 store 级待处理队列**——§16.1，测试工程师发现三防断链）+ 手动拉一次 sessions/stats（§5.2 批量操作后刷新同款先例）；横幅命中已消除则不再展示。

### 16.4 安全与数据口径

- 召回走新宿主 POST 路由，**过 `isTrustedBatchRequest` 信任栅栏**（写操作，同 delete 路由先例；客户端 fetch 加同款自定义头）；无头/恶意 Origin → 403；
- 数量口径 = **主会话数**：候选集 = 未分组 ∩ cwd 命中 ∩ `origin !== 'subagent'` ∩ **非零轮次**（看板会话口径 = 至少一轮对话；**键控 = `session.blank === true` 单键已定案**，同 design §13.5——缓存缺失 fallback 行按可见处理、与看板/侧栏同口径；零轮次空壳挂回工作区无意义——产品经理 2026-11-04 裁决）；子代理 membership 不回填（项目经理拍板③：侧栏不显示子代理，attach 与否零可见差异；看板树形挂主会话下不受 membership 影响）；
- 预览匹配 = 客户端裸 cwd 相等，**两侧去尾斜杠后比较**（架构师加固：realpath 吃掉尾斜杠，CLI 创建的带尾斜杠 cwd 会话宿主 attach 必然成功，唯一风险是预览漏配、静默不进清单）；权威校验 = 宿主 `attachSession`（realpath 规范化逐字等于 workspace 路径、子目录不算），单条失败不阻塞其余，逐条回报；attach 幂等，失败重试安全。

### 16.5 文案键全量（2026-11-05 复验后对账定稿；en 进 `locales.ts`，sentence case）

| 键 | zh 占位 | 用途 |
|---|---|---|
| `dash.recall.banner` | 发现工作区 {name} 可召回 {n} 个会话（含 {m} 个子代理） | 横幅（{name} 必须在文案内，§16.1） |
| `dash.recall.view` | 查看 | 横幅［查看］ |
| `dash.recall.dismiss` | 忽略 | 横幅［忽略］ |
| `dash.recall.back` | 返回看板 | 表格区顶部「‹ 看板」 |
| `dash.recall.title` | 召回未分组会话 · {name} | 召回模式标题 + 表格 `<caption>`（实现增补，核准） |
| `dash.recall.selectAll` | 全选 {n} 个可召回会话 | 表头全选 aria（替代复用 `dash.selectAll.aria`，2026-11-05 裁决） |
| `dash.recall.execute` | 召回 {k} 条会话 | 底部提交（k=0 disabled；现实现无 {k}，D15 补） |
| `dash.recall.cancel` | 取消 | 底部取消（与 back 两个控件，D15 补） |
| `dash.recall.busy` | 正在召回… | 执行 busy 文案 |
| `dash.recall.success` | 已召回 {n} 个会话到 {name} | 全成功 notice |
| `dash.recall.failure` | 召回完成：{ok} 成功，{fail} 失败 | 有失败/部分成功 notice |
| `notice.code.cwd-mismatch` | 会话工作目录与目标工作区不一致 | 失败明细标签（D19） |
| `notice.code.no-cwd` | 会话无工作目录记录 | 失败明细标签（D19） |
| `notice.code.attach-failed` | 会话不存在或已被删除 | 失败明细标签（D19） |
| `notice.code.cwd-unresolvable` | 工作区目录不存在或无法解析 | 失败明细标签（D13 转 per-row 后整批同码） |
| `notice.code.cwd-not-directory` | 工作区路径不是目录 | 失败明细标签（D19） |

**键名改名定案**（测试工程师赞成、项目经理 2026-11-05 定，跨模块动词一致）：review→`view`、ignore→`dismiss`、submit→`execute`、done→`success`、failed→`failure`。**`dash.recall.unavailable` 废弃**（无置灰态定案 (a)，实现已零命中 ✓）；**`dash.recall.failureDetail` 死键删除**（D20：零消费，明细两段式布局归 notice 渲染器）。召回键全量 = `dash.recall.*` **11 键** + `notice.code.*` **5 键**；另 §15.8 fork Tag 两键（P1）不计入召回。

### 16.6 窄窗 / 触屏 / 双主题

- <760px：时间与 cwd 列隐藏（cwd 并入标题格第二行），清单不横滚（四列收窄后自适应）；
- 触屏：按钮命中区 ≥40px；横幅与操作条按钮 flex-wrap 换行不 icon-only（§10 纪律）；
- 双主题人工核验新增项：横幅底色/边框、busy 文案可读性（置灰行、warning Tag 随无置灰态定案废弃）。

### 16.7 验收清单（召回部分，供测试工程师并入 acceptance v4）

- 触发（**(b) 基线口径**）：**关着面板**先添加同路径 workspace → 再打开面板，与**开着面板**添加，两种顺序横幅都必须出现，{n}/{m}/{name} 正确（{m}=亲缘计数，含子代理树完整归位预期）；无命中不出现；宿主重启后旧成员不再弹（baseline 重置，残余边界见 design §10 演进——**设计内已知边界，不算缺陷**）；S4（零工作区起步添加第一个工作区 → 横幅弹）需要「删光工作区」前置、沙箱账本已被真实 GUI 操作冻结——**建议单测覆盖**（首拍 ready 且空 → 抓空 baseline → follow upsert → diff 命中），GUI 不强求；
- 忽略：**本次应用会话内**不再出现该横幅（store 级记忆，面板重开**不再现**——原「重开重新出现」口径随 (b) 废弃）；多工作区命中逐条展示，召回完成后的快照刷新不清空待处理队列；
- 清单：默认全部行选中（无置灰态，定案 (a)）；排序 = updatedAt 降序；全选/反选计数联动；行级 `+N` 仅真有亲缘子代理的行显示（判据：R1 显示 `+1`、R2 不显示——D14）；
- 部分召回：反选后执行 k 条；数量口径 = 主会话数（子代理不计、不回填）；
- 执行：busy 态 + Esc 忽略；成功后未分组消失、侧栏分组出现、看板「项目」列不变（cwd 未变）；
- 失败明细（**换锚：原「清单置灰」随定案 (a) 废弃**）：语料造「cwd 已物理删除」的会话（RECALL_B 剧本——注册工作区后删目录）→ 该行**照常进清单且可选** → 执行 → 宿主把 realpath ENOENT 转成 **200 + 每条 `cwd-unresolvable`**（D13）→ failure notice 逐条点名（行标题 + 本地化标签 + 宿主 message 原文）；**任何 HTTP 非 2xx 同样必须落 failure notice、绝不显示绿色成功**（D12 判据）；「部分失败、其余成功」一次 GUI 提交做不出（同工作区候选共享同一 cwd 字符串、宿主判定必然同结论）——逐条点名覆盖走逐行差异配方（清单打开后、提交前 curl 删一条）或单测（宿主路由 + stub 抛错）；
- 栅栏：无头 POST 召回路由 → 403；恶意 Origin → 403；
- 窄窗 <760px：cwd 并入第二行；触屏命中区；
- 幂等：同一批重复召回（重试路径）不产生重复账目、结果仍全成功。
