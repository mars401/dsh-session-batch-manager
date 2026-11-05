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
  BatchNotice, DashboardFilter, DashboardState, ObservableLike, RecallMode, SessionIdString,
} from './types.ts'

/** 初始状态。 */
const INITIAL: DashboardState = {
  open: false,
  filter: 'main',
  selected: [],
  expanded: new Set(),
  busy: null,
  confirmDelete: null,
  notice: null,
  recallMode: null,
  recallDismissed: new Set(),
  recallBaseline: null,
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
  /** 切换树节点展开/折叠。 */
  toggleExpanded(id: SessionIdString): void
  /** 全部折叠（关面板时调用）。 */
  collapseAll(): void
  /** 进入召回模式。 */
  enterRecallMode(mode: RecallMode): void
  /** 退出召回模式。 */
  exitRecallMode(): void
  /** 在召回清单里切换一个候选行的选中态。 */
  toggleRecallCandidate(id: SessionIdString): void
  /** 设置召回清单的全选/清空。 */
  setRecallSelected(ids: readonly SessionIdString[]): void
  /** 忽略一个工作区的召回横幅（本次应用会话内有效）。 */
  dismissRecallBanner(workspaceId: string): void
  /**
   * 初始化召回横幅 diff 基线——存储首拍 workspace items 的 id 集合。
   * 应在首个 `phase === 'ready'` 快照时调用；幂等（已有基线时无操作）。
   * 零工作区（ready 且 items 为空）照常抓取：baseline=∅，后续添加的第一个工作区正常弹横幅。
   */
  initRecallBaseline(ids: readonly string[]): void
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
    toggleExpanded(id) {
      const current = store.getSnapshot().expanded
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      update({ expanded: next })
    },
    collapseAll() {
      update({ expanded: new Set() })
    },
    /** 进入召回模式。 */
    enterRecallMode(mode: NonNullable<DashboardState['recallMode']>): void {
      update({ recallMode: mode })
    },
    /** 退出召回模式。 */
    exitRecallMode(): void {
      update({ recallMode: null })
    },
    /** 在召回清单里切换一个候选行的选中态。 */
    toggleRecallCandidate(id: SessionIdString): void {
      const mode = store.getSnapshot().recallMode
      if (mode === null) return
      const selected = mode.selected.includes(id)
        ? mode.selected.filter(s => s !== id)
        : [...mode.selected, id]
      update({ recallMode: { ...mode, selected } })
    },
    /** 设置召回清单的全选/清空。 */
    setRecallSelected(ids: readonly SessionIdString[]): void {
      const mode = store.getSnapshot().recallMode
      if (mode === null) return
      update({ recallMode: { ...mode, selected: [...ids] } })
    },
    /** 忽略一个工作区的召回横幅（本次应用会话内有效）。 */
    dismissRecallBanner(workspaceId: string): void {
      const next = new Set(store.getSnapshot().recallDismissed)
      next.add(workspaceId)
      update({ recallDismissed: next })
    },
    initRecallBaseline(ids: readonly string[]): void {
      if (store.getSnapshot().recallBaseline !== null) return
      update({ recallBaseline: new Set(ids) })
    },
  }
}