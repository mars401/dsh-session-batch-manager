/**
 * `@local/dsh-session-batch` 浏览器半入口。
 * @module client/index
 */

import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { createBatchStore } from './store.ts'
import { createDashboardStore } from './dashboard-store.ts'
import { createBatchOps } from './ops.ts'
import { NS, en, zh } from './locales.ts'
import { RowCheckbox } from './RowCheckbox.tsx'
import { FooterToggle } from './FooterToggle.tsx'
import { BatchOverlay } from './BatchOverlay.tsx'
import { DashboardEntry } from './DashboardEntry.tsx'
import { DashboardPanel } from './DashboardPanel.tsx'
import type {
  ClientSessionsLike, ClientWorkspacesLike, ContextMenusLike, LocaleLike, SlotsLike,
  TranslateFn,
} from './types.ts'

export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/** 仪表盘面板开关共享状态（模块级，一个插件实例一份）。 */
interface DashToggle {
  readonly open: boolean
}
let dashStore = createSnapshotStore<DashToggle>({ open: false })

export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as SlotsLike
  const sessions = ctx.get('sessions') as ClientSessionsLike
  const workspaces = ctx.get('workspaces') as ClientWorkspacesLike
  const locale = ctx.get('locale') as LocaleLike

  ctx.effect(() => locale.register(NS, { zh, en }), 'session-batch: dictionaries')
  const t = locale.bind(NS)

  const store = createBatchStore()
  const ops = createBatchOps(sessions, workspaces, store)

  // 重置面板开关（插件重载时关闭面板）。
  dashStore = createSnapshotStore<DashToggle>({ open: false })

  // 仪表盘面板状态存储（选择集/过滤/busy/notice）
  const dashboardStore = createDashboardStore()

  const face = (): Record<string, unknown> => {
    const { archivedIdsSource, routeBase: _routeBase, ...callbacks } = ops
    return {
      hooks: { batch: store.source, archivedIds: archivedIdsSource },
      ...callbacks,
    }
  }

  // 每行选择框
  slots.inject('sidebar.workspaces.session.row.action', () => slots.register({
    name: 'sidebar.workspaces.session.row.action',
    id: 'batch-select', order: 50, locale: NS, inject: face,
  }, RowCheckbox))

  // 批量选择开关（order 50）
  slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action',
    id: 'batch-toggle', order: 50, locale: NS, inject: face,
  }, FooterToggle))

  // 仪表盘入口（order 60）
  const dashEntryFace = (): Record<string, unknown> => ({
    dashOpen: dashStore,
  })
  slots.inject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action',
    id: 'batch-dashboard', order: 60, locale: NS, inject: dashEntryFace,
  }, DashboardEntrySlot))

  // 总控浮层
  slots.inject('shell.overlay', () => slots.register({
    name: 'shell.overlay',
    id: 'session-batch', locale: NS, inject: face,
  }, BatchOverlay))

  // 仪表盘面板（shell.overlay 第二占位）
  const dashPanelFace = (): Record<string, unknown> => ({
    sessions, workspaces, t,
    tombstoneSource: store.source,
    addTombstones: (ids: readonly string[]) => { store.addTombstones(ids) },
    refreshSessions: () => sessions.refresh(),
    dashOpen: dashStore,
    dashboardStore,
  })
  slots.inject('shell.overlay', () => slots.register({
    name: 'shell.overlay',
    id: 'session-batch.dashboard', locale: NS, inject: dashPanelFace,
  }, DashboardPanelSlot))
}

// === 薄适配器 ===

function DashboardEntrySlot(props: Record<string, unknown>): ReactNode {
  const { wide, t, dashOpen } = props as {
    wide: boolean; t: TranslateFn
    dashOpen: { getSnapshot: () => DashToggle; subscribe: (l: () => void) => () => void; set: (s: DashToggle) => void }
  }
  const open = useSyncExternalStore(dashOpen.subscribe, () => dashOpen.getSnapshot().open)
  const toggle = () => { dashOpen.set({ open: !dashOpen.getSnapshot().open }) }
  return <DashboardEntry wide={wide} open={open} onToggle={toggle} t={t} />
}

function DashboardPanelSlot(props: Record<string, unknown>): ReactNode {
  const { sessions, workspaces, t, tombstoneSource, addTombstones, refreshSessions, dashOpen, dashboardStore } = props as {
    sessions: ClientSessionsLike
    workspaces: ClientWorkspacesLike
    t: TranslateFn
    tombstoneSource: { getSnapshot: () => { tombstones: readonly string[] }; subscribe: (l: () => void) => () => void }
    addTombstones: (ids: readonly string[]) => void
    refreshSessions: () => Promise<void>
    dashOpen: { getSnapshot: () => DashToggle; subscribe: (l: () => void) => () => void; set: (s: DashToggle) => void }
    dashboardStore: import('./dashboard-store.ts').DashboardStore
  }
  const open = useSyncExternalStore(dashOpen.subscribe, () => dashOpen.getSnapshot().open)
  const toggle = () => { dashOpen.set({ open: !dashOpen.getSnapshot().open }) }
  // 实时订阅墓碑集——删除后行立即消失
  const tombstones = useSyncExternalStore(
    tombstoneSource.subscribe,
    () => tombstoneSource.getSnapshot().tombstones,
  )
  return (
    <DashboardPanel
      open={open}
      onToggle={toggle}
      sessions={sessions}
      workspaces={workspaces}
      t={t}
      sidebarOps={{ tombstones, addTombstones, refreshSessions }}
      dashStore={dashboardStore}
    />
  )
}