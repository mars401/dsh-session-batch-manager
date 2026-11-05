/**
 * 宿主半用到的 dsh 服务的结构化类型。
 *
 * 外部 bundle 不能在运行时 import dsh 包（发行版的 node_modules 布局不可达，且第二份
 * cordis 副本会破坏服务身份），所以这里只声明**本插件实际调用的成员**，在
 * `ctx.get(name)` 的边界处做一次结构化桥接。成员签名与 0.2.2-alpha.2 的对应服务一致：
 *
 * - `sessions` → `packages/core/session`（SessionStore：get/list）
 * - `sessionPersistence` → `packages/session/session-persistence-jsonl`（stat/config）
 * - `workspaceRegistry` → `packages/workspace/workspace`（归档/置顶集合、工作区实体）
 * - `webServer` → `packages/host/webserver`（register/host）
 *
 * @module host/types
 */

/** 一个会话 id（宿主侧一律按不透明字符串处理）。 */
export type SessionIdString = string

/** `webServer` 服务里本插件用到的成员。 */
export interface WebServerLike {
  /** 注册一条命名路由；返回值是注销函数。重复 (kind, path) 抛错。 */
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: HttpRequestLike, res: HttpResponseLike) => void | Promise<void>
  }): () => void
  /** 配置的绑定地址（一个具体本地接口）。 */
  readonly host: string
}

/** node:http IncomingMessage 里本插件读取的成员。 */
export interface HttpRequestLike {
  method?: string
  headers: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: Buffer | string) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
}

/** node:http ServerResponse 里本插件使用的成员。 */
export interface HttpResponseLike {
  writeHead(status: number, headers?: Record<string, string>): HttpResponseLike
  end(body?: string): void
}

/** `sessionPersistence`（JSONL 后端）里本插件用到的成员。 */
export interface SessionPersistenceLike {
  /** 读取一个会话的存储快照；无持久化产物时返回 undefined。 */
  stat(id: SessionIdString): Promise<SessionStatSnapshot | undefined>
  /**
   * 服务级持久化屏障：所有活动写句柄落盘，**延迟物化的 pending 会话被强制物化**
   * （JSONL 后端可以推迟物理写入；`location` 缺失的快照经此获得文件）。
   */
  flush(): Promise<void>
  /** 后端配置；JSONL 后端携带 `root`（所有会话文件的根目录）。 */
  readonly config?: { readonly root?: string }
}

/** `sessionPersistence.stat` 返回的快照中本插件读取的成员。 */
export interface SessionStatSnapshot {
  readonly header?: { readonly id?: string; readonly cwd?: string }
  readonly location?: { readonly kind: string; readonly path: string }
  /** 不透明修订号（stats 聚合器用于跳过未变更的会话）。 */
  readonly revision?: string
}

/** 一个工作区实体里本插件用到的成员。 */
export interface WorkspaceEntityLike {
  readonly id: string
  readonly sessionIds: readonly SessionIdString[]
  /** 把一个会话从本工作区的记录中摘除（不在记录中时为无操作）。 */
  detachSession(sessionId: SessionIdString): Promise<void>
}

/** `workspaceRegistry` 服务里本插件用到的成员。 */
export interface WorkspaceRegistryLike {
  /** 全部工作区实体。 */
  list(): WorkspaceEntityLike[]
  /** 注册表全局归档集。 */
  readonly archivedSessionIds: readonly SessionIdString[]
  /** 注册表全局置顶集。 */
  readonly pinnedSessionIds: readonly SessionIdString[]
  /**
   * 加入归档集（幂等；已在集内直接返回）。存在性守卫是「live 或持久化可见」——
   * 挂载中的 live 会话即使文件已删也可归档（删除流程的墓碑路径依赖这一点）；
   * 会话有运行中工作时抛 `WorkspaceActiveSessionError`（删除流程已先行拒绝 active）。
   */
  archiveSession(sessionId: SessionIdString): Promise<void>
  /** 移出归档集；对已不存在的会话同样成立。 */
  unarchiveSession(sessionId: SessionIdString): Promise<void>
  /** 移出置顶集；对已不存在的会话同样成立。 */
  unpinSession(sessionId: SessionIdString): Promise<void>
}

/** 宿主 `sessions`（SessionStore）里本插件用到的成员。 */
export interface SessionStoreLike {
  /** 内存中已挂载的会话；未挂载时为 undefined。 */
  get(id: SessionIdString): unknown
}

/** `workspace/session-activity` 瀑布报告的一条活动。 */
export interface SessionActivityLike {
  readonly kind: string
}

/** 宿主 ctx 上本插件使用的成员（结构化桥接，见模块文档）。 */
export interface HostContextLike {
  get(name: string): unknown
  emit(event: string, ...args: unknown[]): void
  /** 订阅一个事件；返回值是退订函数。 */
  on(event: string, listener: (...args: never[]) => void): () => void
  waterfall(
    event: string,
    payload: unknown,
    initial: () => Promise<readonly SessionActivityLike[]>,
  ): Promise<readonly SessionActivityLike[]>
  inject(deps: readonly string[], callback: (ctx: unknown) => void): unknown
  readonly logger?: {
    warn(message: string): void
    error(message: string): void
  }
}

/** 单个会话的删除结果（HTTP 响应行）。 */
export interface DeleteResult {
  readonly sessionId: string
  readonly ok: boolean
  /**
   * 失败分类：active / invalid-id / unsafe-path / unsupported-backend / internal /
   * no-persistence。（`live` 与 `not-found` 已废弃：live 空闲会话放行删除；
   * 无持久化产物的会话按幂等成功处理并广播掉行。）
   */
  readonly code?: string
  /** 面向用户的中文说明（成功时缺省；幂等成功可携带说明）。 */
  readonly message?: string
}

/** 单个会话的召回结果。 */
export interface RecallResult {
  readonly sessionId: string
  readonly ok: boolean
  /** 失败分类：见 attachSession 的抛出分支。 */
  readonly code?: string
  readonly message?: string
}

/** `workspaceRegistry` 中 recall 路由需要的成员。 */
export interface WorkspaceRegistryRecallLike {
  /** 按规范路径查找已有的工作区；不存在时返回 undefined。 */
  resolveByPath(path: string): Promise<WorkspaceEntityRecallLike | undefined>
  /**
   * 按规范路径创建工作区；路径对应的目录必须已存在。
   * @param path - 已做 realpath 规范化的目录路径。
   * @param title - 可选工作区显示标题。
   * @returns 工作区实体。
   */
  create(path: string, title?: string): Promise<WorkspaceEntityRecallLike>
}

/** 一个工作区实体里 recall 路由用到的成员。 */
export interface WorkspaceEntityRecallLike {
  readonly id: string
  readonly path: string
  readonly sessionIds: readonly string[]
  /** 把会话挂到本工作区（校验 cwd → 路径相等后记账）。 */
  attachSession(sessionId: string): Promise<void>
}

// === stats 聚合器类型（新增，不改变既有接口） ===

/** `sessionQuery` 服务里 stats 聚合器用到的成员。 */
export interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<readonly { readonly header: { readonly id: string }; readonly live: boolean }[]>
  observeSession(sessionId: SessionIdString): Promise<SessionObservationLike>
}

/** `SessionObservation` 里 stats 聚合器读取的成员。 */
export interface SessionObservationLike {
  readonly events: readonly Record<string, unknown>[]
  readonly projections?: {
    readonly values?: Partial<{
      readonly tokenUsage: TokenUsageProjectionLike
      readonly contextPressure: ContextPressureProjection
    }>
  }
  readonly dispose?: () => void
  readonly [Symbol.dispose]?: () => void
}

/** `tokenUsage` 投影的四桶累计。 */
export interface TokenUsageProjectionLike {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** `contextPressure` 投影（last-wins 参考值）。 */
export interface ContextPressureProjection {
  readonly pressureTokens?: number
  readonly projectedTokens?: number
  readonly contextWindow?: number
}

/** stats 路由的响应载荷。 */
export interface StatsResult {
  readonly complete: boolean
  readonly pending: number
  /** sessionQuery 服务不可用时为 true；前端应降级为纯列表模式。 */
  readonly degraded: boolean
  readonly sessions: readonly SessionStatRow[]
}

/** 单个会话的统计行（前端按 id join 客户端现有数据）。 */
export interface SessionStatRow {
  readonly id: SessionIdString
  readonly model: string | null
  readonly usage: TokenUsageProjectionLike | null
  readonly pressure: ContextPressureProjection | null
  readonly error: string | null
}

/** `sessionPersistence.stat` 的轻量接口（仅读 revision）。 */
export interface SessionPersistenceStatLike {
  stat(id: SessionIdString): Promise<{ readonly revision?: string; readonly location?: { readonly kind: string; readonly path: string } } | undefined>
}
