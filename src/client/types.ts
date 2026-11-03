/**
 * 浏览器半用到的服务与 props 的结构化类型。
 *
 * 浏览器 bundle 只能 import 平台模块表里已 seed 的说明符（react、dsh-client-store、
 * dsh-client-ui-primitives 等）；dsh 其余包（session-controller、workspace-controller、
 * ui-slots…）一律只以结构类型出现在这里，运行时经 `ctx.get(name)` 桥接。成员签名与
 * 0.2.2-alpha.2 一致。
 * @module client/types
 */

import type { ReactNode } from 'react'

/** 一个会话 id（浏览器侧按不透明字符串处理）。 */
export type SessionIdString = string

/** 可订阅的只读快照源（框架 hook 的输入形态）。 */
export interface ObservableLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** `sessions` 客户端服务里本插件用到的成员。 */
export interface ClientSessionsLike {
  /** 会话目录快照：ids + byId 行（含 blank/origin/displayTitle 等列表元数据）。 */
  readonly list: ObservableLike<{
    ids: readonly SessionIdString[]
    byId: Record<SessionIdString, SessionRowSummary>
  }>
  /** 重新拉取宿主会话列表（删除后用于对账索引）。 */
  refresh(): Promise<void>
}

/** 客户端会话列表里一行摘要中本插件读取的成员（防御式全部可选）。 */
export interface SessionRowSummary {
  readonly blank?: boolean
  readonly origin?: string
  readonly displayTitle?: string
  /** 持久化标题投影；空值时标题回落 id（按设计文档 §5.3，不经 displayTitle 的目录回落链）。 */
  readonly title?: string
  readonly running?: boolean
  readonly cwd?: string
  readonly updatedAt?: number
}

/** `workspaces` 客户端服务里本插件用到的成员。 */
export interface ClientWorkspacesLike {
  /** 工作区快照：分组条目与注册表全局的归档/置顶集合。 */
  readonly list: ObservableLike<{
    archivedSessionIds: readonly SessionIdString[]
    pinnedSessionIds: readonly SessionIdString[]
  }>
  /** 归档一个会话；`stopActivity: true` 时先停止其运行中的工作。 */
  archiveSession(sessionId: SessionIdString, options?: { stopActivity?: boolean }): Promise<void>
  /** 恢复一个已归档会话。 */
  unarchiveSession(sessionId: SessionIdString): Promise<void>
}

/** `slots` 服务里本插件用到的成员（注册与等待声明）。 */
export interface SlotsLike {
  /** 等待一个 slot 声明出现后执行工厂；贡献随声明塌缩与插件卸载回滚。 */
  inject(name: string, factory: () => unknown): unknown
  /** 注册一个 slot 占位；返回值是注销函数。 */
  register(definition: Record<string, unknown>, component?: unknown): () => void
}

/** `locale` 服务里本插件用到的成员。 */
export interface LocaleLike {
  /** 注册一个命名空间的字典表；返回值是注销函数。 */
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  /** 绑定一个命名空间的翻译函数。 */
  bind(namespace: string): TranslateFn
}

/** 翻译函数：扁平点键 + `{param}` 插值。 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

/** `contextMenus` 服务里本插件用到的成员。 */
export interface ContextMenusLike {
  /** 注册一个目标族的菜单贡献；返回值是注销函数。 */
  register(contribution: {
    id: string
    target: string
    order: number
    resolve: (target: { sessionId: SessionIdString; displayTitle?: string }, signal: AbortSignal) => readonly ContextMenuActionLike[]
  }): () => void
}

/** 一条菜单动作。 */
export interface ContextMenuActionLike {
  readonly id: string
  readonly label: string
  readonly run?: () => void | Promise<void>
}

/** 选择框 hook：`use<Name>` 由渲染器从 inject 的 hooks 舱绑定。 */
export type SelectorHook<T> = <R>(selector: (snapshot: T) => R) => R

/** 批量状态（见 store.ts）。 */
export interface BatchState {
  readonly mode: 'off' | 'select'
  readonly selected: readonly SessionIdString[]
  readonly busy: { readonly labelKey: string; readonly done: number; readonly total: number } | null
  readonly confirmDelete: readonly SessionIdString[] | null
  readonly notice: BatchNotice | null
  /**
   * 删除成功的墓碑 id（localStorage 持久化，跨刷新存活）。
   * 0.2.2-alpha.2 无法在线卸载 GUI 挂载中的会话：文件虽删，宿主的 live 记录
   * 仍会让行出现在活动/归档视图。客户端对这些行注入 display:none 隐藏；
   * 宿主重启后 live 记录消失，残留规则匹配不到任何行（无害）。
   */
  readonly tombstones: readonly SessionIdString[]
}

/** 一条结果通知。 */
export interface BatchNotice {
  /** 单调序号：重复通知靠它重启展示。 */
  readonly seq: number
  readonly kind: 'success' | 'error' | 'info'
  readonly textKey: string
  readonly params?: Record<string, string | number>
  readonly failures?: readonly BatchFailure[]
  readonly action?: { readonly labelKey: string; readonly params?: Record<string, string | number>; readonly run: () => void }
}

/** 一个会话的失败明细。 */
export interface BatchFailure {
  readonly id: string
  readonly title: string
  readonly code: string
  readonly message?: string
}

/** 注入到各占位组件的操作面（纯数据与回调）。 */
export interface BatchOpsFace {
  /** 读取当前状态快照（事件处理器用；渲染订阅一律走 useBatch）。 */
  peekState(): BatchState
  /** 订阅状态变化（命令式 DOM 同步用，如行首选择框）；返回退订函数。 */
  watchBatch(listener: () => void): () => void
  /** 进入选择模式，可同时并入预选若干会话。 */
  enterSelect(seed?: readonly SessionIdString[]): void
  /** 退出选择模式（保留已选集合）。 */
  exitSelect(): void
  /** 切换一个会话的选中态（未进入模式时自动进入）。 */
  toggleSession(sessionId: SessionIdString): void
  /** 选中当前列表里全部可见会话（并入现有选择）。 */
  selectAllVisible(): void
  /** 清空选择。 */
  clearSelection(): void
  /** 批量归档；对运行中的会话给出「停止并归档」后续动作。 */
  runArchive(ids: readonly SessionIdString[]): void
  /** 批量恢复（取消归档）。 */
  runUnarchive(ids: readonly SessionIdString[]): void
  /** 打开删除确认对话框。 */
  requestDeleteConfirm(): void
  /** 关闭删除确认对话框。 */
  closeConfirm(): void
  /** 执行批量删除（宿主路由）。 */
  runDelete(ids: readonly SessionIdString[]): void
  /** 关闭结果通知。 */
  dismissNotice(): void
  /** 会话标题（列表摘要缺席时回落为 id）。 */
  titleOf(sessionId: SessionIdString): string
}

/** 行选择框占位的 props：行身份 + 状态 hook + 操作 + 本地化。 */
export interface RowCheckboxProps extends BatchOpsFace {
  readonly sessionId: SessionIdString
  readonly useBatch: SelectorHook<BatchState>
  readonly useArchivedIds: SelectorHook<ReadonlySet<SessionIdString>>
  readonly t: TranslateFn
}

/** 侧栏底部开关占位的 props。 */
export interface FooterToggleProps extends BatchOpsFace {
  readonly wide: boolean
  readonly useBatch: SelectorHook<BatchState>
  readonly useArchivedIds: SelectorHook<ReadonlySet<SessionIdString>>
  readonly t: TranslateFn
}

/** shell.overlay 占位（工具条 + 拦截 + 通知 + 对话框）的 props。 */
export interface BatchOverlayProps extends BatchOpsFace {
  readonly useBatch: SelectorHook<BatchState>
  readonly useArchivedIds: SelectorHook<ReadonlySet<SessionIdString>>
  readonly t: TranslateFn
}

/** 删除确认对话框的 props。 */
export interface DeleteDialogProps {
  readonly ids: readonly SessionIdString[]
  readonly busy: BatchState['busy']
  readonly titleOf: (sessionId: SessionIdString) => string
  readonly onCancel: () => void
  readonly onConfirm: (ids: readonly SessionIdString[]) => void
  readonly t: TranslateFn
}

/** 一个 React 组件（结构化，避免依赖 dsh 的 props 组合类型）。 */
export type ComponentLike<P> = (props: P) => ReactNode

// === 仪表盘类型（新增） ===

/** 当仪表盘打开时，stats 路由返回的载荷。 */
export interface StatsResponse {
  readonly ok: boolean
  readonly complete: boolean
  readonly pending: number
  /** sessionQuery 不可用时为 true；面板应显示降级提示。 */
  readonly degraded: boolean
  readonly generatedAt: number
  readonly sessions: readonly StatsSessionRow[]
  readonly code?: string
}

/** stats 路由返回的单行（线上契约 v1）。 */
export interface StatsSessionRow {
  readonly id: SessionIdString
  readonly model: string | null
  readonly usage: StatsTokenUsage | null
  readonly pressure: StatsPressure | null
  readonly error: string | null
}

/** 线上 tokenUsage 四桶。 */
export interface StatsTokenUsage {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** 线上 contextPressure。 */
export interface StatsPressure {
  readonly pressureTokens?: number
  readonly projectedTokens?: number
  readonly contextWindow?: number
}

/** 客户端 join 后的仪表盘行（stats × sessions.list × workspaces.list − tombstones）。 */
export interface DashboardRow {
  readonly id: SessionIdString
  readonly title: string
  readonly origin: string | undefined
  readonly running: boolean
  readonly archived: boolean
  readonly pinned: boolean
  readonly updatedAt: number | undefined
  readonly stats: StatsSessionRow
}

/** 仪表盘过滤条件。 */
export type DashboardFilter = 'all' | 'main' | 'subagent' | 'archived'

/** 仪表盘面板状态（独立于 BatchState）。 */
export interface DashboardState {
  readonly open: boolean
  readonly filter: DashboardFilter
  readonly selected: readonly SessionIdString[]
  readonly busy: { readonly labelKey: string; readonly done: number; readonly total: number } | null
  readonly confirmDelete: readonly SessionIdString[] | null
  readonly notice: BatchNotice | null
}
