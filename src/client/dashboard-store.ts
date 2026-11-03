/**
 * 仪表盘面板状态存储——独立于侧栏 BatchState。
 *
 * 仪表盘有自己的选择集、过滤条件、busy 态与删除确认；
 * 不与侧栏模式（select/off）耦合，也不进入 `body.dsh-session-batch-mode`。
 *
 * @module client/dashboard-store
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  BatchNotice, DashboardFilter, DashboardState, ObservableLike, SessionIdString,
} from './types.ts'

/** 初始状态。 */
const INITIAL: DashboardState = {
  open: false,
  filter: 'main',
  selected: [],
  busy: null,
  confirmDelete: null,
  notice: null,
}

let noticeSeq = 0

/** 仪表盘面板存储句柄。 */
export interface DashboardStore {
  /** 注入 hooks 舱的只读源。 */
  readonly source: ObservableLike<DashboardState>
  /** 读当前快照（事件处理器用）。 */
  get(): DashboardState
  open(): void
  close(): void
  setFilter(filter: DashboardFilter): void
  toggleSelect(id: SessionIdString): void
  selectAll(ids: readonly SessionIdString[]): void
  clearSelection(): void
  setBusy(labelKey: string, done: number, total: number): void
  advanceBusy(): void
  clearBusy(): void
  requestDeleteConfirm(): void
  closeConfirm(): void
  showNotice(notice: Omit<BatchNotice, 'seq'>): void
  dismissNotice(): void
}

/**
 * 创建仪表盘面板状态存储。
 * @returns 存储句柄。
 */
export function createDashboardStore(): DashboardStore {
  const store = createSnapshotStore<DashboardState>(INITIAL)

  const update = (patch: Partial<DashboardState>): void => {
    store.set({ ...store.getSnapshot(), ...patch })
  }

  return {
    source: store,
    get: () => store.getSnapshot(),
    open() {
      update({ open: true })
    },
    close() {
      const current = store.getSnapshot()
      if (current.busy !== null) return // busy 时禁止关闭
      update({ open: false, selected: [] })
    },
    setFilter(filter) {
      // 过滤切换清空选择集（防误操作已隐藏行）。
      update({ filter, selected: [] })
    },
    toggleSelect(id) {
      const current = store.getSnapshot().selected
      update({
        selected: current.includes(id)
          ? current.filter(i => i !== id)
          : [...current, id],
      })
    },
    selectAll(ids) {
      update({ selected: [...new Set(ids)] })
    },
    clearSelection() {
      update({ selected: [] })
    },
    setBusy(labelKey, done, total) {
      update({ busy: { labelKey, done, total } })
    },
    advanceBusy() {
      const busy = store.getSnapshot().busy
      if (busy === null) return
      update({ busy: { ...busy, done: busy.done + 1 } })
    },
    clearBusy() {
      update({ busy: null })
    },
    requestDeleteConfirm() {
      update({ confirmDelete: store.getSnapshot().selected })
    },
    closeConfirm() {
      update({ confirmDelete: null })
    },
    showNotice(notice) {
      noticeSeq += 1
      update({ notice: { ...notice, seq: noticeSeq } })
    },
    dismissNotice() {
      update({ notice: null })
    },
  }
}