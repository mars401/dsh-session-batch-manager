# dsh-session-batch-manager — DeepSeek Harness 会话批量管理与会话管理面板

[English](README.md) | 中文

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-宿主-1082ff)](https://github.com/deepseek-ai/deepseek-harness)
[![GitHub](https://img.shields.io/badge/GitHub-仓库-blue)](https://github.com/mars401/dsh-session-batch-manager)

## 0 简介

DeepSeek Harness（DSH）会话批量管理：侧栏多选会话，批量**归档 / 恢复 / 删除**；另有全屏**会话管理**面板，可视化每个本地会话的**模型、token 消耗、缓存读写与上下文占用**。

DSH GUI 原生只有单个会话的归档，没有任何删除入口。本插件补上：

- 侧栏行首选择框，**点击底部「批量管理」开关后出现**（退出模式选中保留，任一批量操作完成后自动清空）；
- 浮动工具条：全选 / 清空 / 归档 / 删除；归档遇到运行中会话给**「停止并归档」一键重试**；**物理删除**全链路（宿主路由 + 确认对话框 + 所有已连接 GUI 立即掉行）；
- **会话管理**面板：6 列表格（模型、token 四桶、缓存读写、上下文进度条）、4 个过滤视图、面板内批量操作、渐进加载与 5 秒轮询。

已在 DSH 0.2.2-alpha.2（Web UI，开发沙箱）完成实际测试，当前验证范围见「[6 兼容性](#6-兼容性)」。

## 1 演示

| 场景 | 视频 |
| :--- | :--- |
| 侧栏批量操作（选择 → 归档 → 恢复 → 删除） | [docs/demo-batch.mp4](docs/demo-batch.mp4) |
| 会话管理面板（表格、过滤、明细、批量操作） | [docs/demo-dashboard.mp4](docs/demo-dashboard.mp4) |

> 视频待录制，录制完成后提交入库，届时上方链接即可播放。逐秒分镜脚本见 [docs/demo-script.md](docs/demo-script.md)。

## 2 功能

### 2.1 侧栏批量管理

- **选择模式**：侧栏底部的**「批量管理」**开关。选择框默认不显示，进入选择模式后才出现。模式开启期间，**点击行任意处 = 切换选中**（打开会话、双击重命名、拖拽排序、Enter/Space 都被接管）。退出模式后选中保留——行高亮与工具条计数不丢；任一批量操作（归档 / 恢复 / 删除）完成后自动清空选中，手动**「清空」**亦可。
- **浮动工具条**（侧栏底部）：**有选中即显示**，不限于选择模式。包含选中计数、**全选**、**清空**、**归档**（全部选中项已归档时切换为**恢复**）、**删除**（先确认）与**退出**（仅选择模式）。
- **停止并归档重试**：批量归档遇到有运行中工作的会话时单独归类报告，结果通知提供**「停止并归档 N 个运行中的会话」**一键重试——与原生 DSH 归档对话框同一升级路径。
- **批量删除**：确认对话框列出目标会话 → 宿主路由物理删除其 JSONL 日志目录 → 广播 `api-session/removed`，所有已连接 GUI 立即掉行。已删行另由客户端墓碑兜底隐藏（见「[5 安全说明](#5-安全说明)」）。
- **右键菜单入口**（可选贡献）：带右键菜单系统的 DSH 版本自动出现**「批量选择会话」**；0.2.2-alpha.2 没有该服务，入口安静缺席，其余功能不受影响。

### 2.2 会话管理面板

侧栏底部的仪表盘图标按钮打开全屏、只读的**「会话管理」**面板，扫描全部本地会话：

- **6 列表格**：选择框 / 会话（标题 + 运行中 / 子代理 / 已归档 / 置顶徽标）/ 模型（`provider/model`）/ Token 消耗（四桶合计 + 分桶明细 tooltip）/ 缓存读 · 写 / 上下文百分比（进度条，≥ 90% 警告色）。
- **4 个过滤 chips**：**全部 / 主会话 / 子代理 / 已归档**，计数实时更新。切换过滤自动清空面板选择集（与侧栏选择集相互独立）。
- **面板内批量操作**：归档 / 恢复 / 删除复用侧栏同一核心管线，选择集独立。
- **渐进加载**：首扫 O(全量日志)——先骨架行，随后行自新→旧追加、pending 计数递减、顶部细进度条推进；此后仅 revision 变更过的会话才重放日志。stats 路由立即响应（扫描后台进行），不阻塞等待。
- **5 秒轮询**（面板打开期间；标签页隐藏时暂停，`statsPollIntervalMs` 可配置）；面板关闭后宿主零开销。
- **每会话错误隔离**：损坏的会话日志显示为带警告图标的行（数值列显示「—」），不炸整表。宿主 `sessionQuery` 服务不可用时降级为「仅列表 + 批量操作」。

## 3 UI入口

两个入口都是 DSH 侧栏底部的按钮：

- **批量管理**（清单图标）：切换侧栏会话列表的选择模式。
- **会话管理**（仪表盘图标）：打开 / 关闭全屏管理面板。

选择模式开启期间，只要有行被选中，浮动工具条即出现在侧栏底部。

## 4 安装

仓库随源码提交了构建产物 `lib/`（已入库），安装无需执行构建。

### 4.1 通过 CLI 从 GitHub 安装

```sh
dsh plugin --profile web add github:mars401/dsh-session-batch-manager
```

安装后重启 DSH Web。若浏览器仍加载旧的客户端代码，可使用 `Ctrl+Shift+R` 强制刷新。

验证安装：

```sh
curl -s http://127.0.0.1:<你的-dsh-web-端口>/dsh-session-batch-manager/v1/status
# {"ok":true,"service":"dsh-session-batch-manager","version":"0.1.0"}
```

> `desktop` profile 由官方 Desktop 客户端管理，普通 `dsh` CLI 不用于修改该 profile。Desktop 用户请通过客户端内的**插件**安装。

### 4.2 本地开发 / 测试

```sh
pnpm install
pnpm typecheck          # tsc --noEmit
pnpm build              # esbuild → lib/host/index.js + lib/client.js
node --test tests/stats.test.mjs
```

随后同样方式安装本地 checkout，用仓库路径代替 GitHub 规格：

```sh
dsh plugin --profile web add <本仓库路径>
```

对于 Client 端代码，在 HMR 正常工作的情况下，保存修改后可以自动重新加载；否则刷新页面或重启客户端。修改插件依赖、`package.json`、bundle 配置等安装或加载相关内容后，建议重新安装插件或重启对应客户端。

### 4.3 配置

可选覆盖（bundle 层 `cordis.patch.yml`）：

| 键 | 默认 | 说明 |
|---|---|---|
| `routeBase` | `/dsh-session-batch-manager/v1` | 宿主路由前缀；经 index-inject 注入页面全局 `window.__DSH_SESSION_BATCH_MANAGER__` |
| `maxBatchSize` | `200` | 单次删除请求的会话数上限 |
| `trustedHosts` | `[]` | Host 栅栏额外信任的权威；仅非回环部署需要 |
| `statsPollIntervalMs` | `5000` | 面板打开期间的 stats 轮询间隔（ms） |
| `statsSweepConcurrency` | `4` | 冷会话观察并发上限 |

## 5 安全说明

删除**逐会话独立判定**，单个失败不影响其余。按顺序：

1. **拒绝有运行中工作的会话**（`active`）：进行中的轮次、subagent、后台任务、定时器——先归档（可停止任务）再删。仅挂载于内存但空闲的 live 会话放行（与原生归档同语义，否则 GUI 打开过的会话重启前永远删不掉）。
2. **物理删除**：经持久化层定位 JSONL 日志目录（延迟落盘的 pending 会话先强制物化）；目录名必须等于会话 id 的编码形式且真包含于持久化根（双重校验防误删），然后递归删除。
3. **注册表记账**（尽力而为）：live 会话走归档集墓碑——活动视图立即隐藏，仍打开的旧标签页由原生「已归档」门拦截。冷会话移出归档集 / 置顶集并从工作区记录摘除。
4. **客户端墓碑**：删除成功的 id 持久化到浏览器 `localStorage`，跨刷新从**全部视图**（含归档视图）过滤，宿主重启前已删 live 会话的残行无法复活。
5. **广播与幂等**：广播 `api-session/removed` 让 GUI 立即掉行；此前已删 / 幽灵行目标同样按成功报告——目标状态已经达成。

**浏览器信任栅栏**（对齐 dsh `/api` 的信任模型）：删除路由仅接受携带插件专属 `x-dsh-session-batch-manager` 自定义头的 POST；Host 必须是回环拼写 / 绑定地址 / `trustedHosts` 之一；`Sec-Fetch-Site: cross-site` 一票否决；Origin 必须同权威；OPTIONS 一律 403、从不发 CORS 头——恶意网页无法跨源触发删除（自定义头触发 preflight 即被拦截）。stats 路由只读，`cache-control: no-store`、不发 CORS 头，载荷不含标题与密钥——只有 id、模型名和 token 数。

**已知边界**：

- 删除只清理会话日志目录与注册表记账；附属状态（KV 存储条目、计划任务注册、附件缓存等）不在 v0.1 范围内——目标会话已按第 1 步排除运行态，残留条目惰性且无害。
- subagent 会话不进侧栏**「全选」**（与原生列表行为对齐），但可单独点选删除。
- 搜索结果列表的行不渲染选择框（宿主没在该视图开放行操作槽）；批量操作面向主列表。
- 面板的上下文百分比为参考值（`contextPressure` 非原子观测），切换模型后可能短暂滞后，tooltip 已注明。
- 面板 tooltip 为纯文本（dsh Tooltip 原语仅支持字符串 label）；分桶明细以换行分隔的键值对呈现。

## 6 兼容性

| DeepSeek Harness (DSH) | dsh-session-batch-manager | 验证环境 |
| :--- | :--- | :--- |
| **v0.2.2-alpha.2** | `0.1.0` | Web UI（开发沙箱） |

以上组合已在官方 Web UI 完成测试。插件在 `engines` 中声明 `dsh: ">=0.2.2-alpha.2"`。桌面 App（0.2.1-rc.3）未验证；其他版本组合可能同样兼容，但未逐一验证。

无右键菜单服务的 DSH 版本（含 0.2.2-alpha.2）上右键菜单入口安静缺席，见「[2.1](#21-侧栏批量管理)」。

本插件是 Cordis 插件，运行时零依赖：宿主半为纯 ESM bundle，浏览器半经 DSH 模块加载器装载。

## 7 开发

- `lib/host/index.js` 是宿主侧 ESM 插件（删除路由、stats 路由、index-inject 配置发布）；`lib/client.js` 是客户端 UI bundle。两者均已入库，安装无需构建；改源码后用 `pnpm build` 重建。
- 提交修改前的质量门：`pnpm typecheck`、`pnpm build`、`node --test tests/stats.test.mjs`。
- 源码布局：`src/host/`（宿主半：路由、统计聚合器、信任栅栏、结构化类型）、`src/client/`（浏览器半：批量操作、状态存储、管理面板与组件）、`tests/`（宿主单元测试）、`docs/`（设计 / UI 规格 / 评审 / 测试文档）。
- **与宿主的耦合点**（升级 dsh 时复核）：行 DOM `div[data-row-key^="session:"]`；槽位 `sidebar.workspaces.session.row.action`、`sidebar.footer.action`、`shell.overlay`；客户端服务 `sessions` / `workspaces` / `locale` + 可选 `contextMenus`；宿主服务 `sessions` / `sessionPersistence` / `workspaceRegistry` / `webServer`；事件 `webserver/index-inject`、`workspace/session-activity`、`api-session/removed`；归档拒绝判别 `error.name === 'WorkspaceArchiveError'` 且 `rpcError.code === 'workspace/session-active'`。完整论证见 `docs/`。
- 发布记录见 [CHANGELOG.md](CHANGELOG.md)。

## 8 致谢

- 感谢 DeepSeek Harness 团队提供的平台与插件 API。
- README 结构参考了 [dsh-session-manager](https://github.com/hkkz9522/dsh-session-manager)。
- 感谢每一位安装和使用 dsh-session-batch-manager 的用户，也感谢提交 Issue 与 Pull Request 帮助改进本插件的朋友们。

## 9 开源许可

[MIT](LICENSE)
