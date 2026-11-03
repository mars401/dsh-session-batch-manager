/**
 * 批量选择的状态存储。
 *
 * 一个 `createSnapshotStore`（平台模块，已 seed）承载全部批量状态；渲染侧经 inject 的
 * `hooks.batch` 舱绑定成 `useBatch(selector)` 订阅，事件处理器经 `peekState()` 读实时
 * 快照（存储纪律：订阅只发生在渲染里）。
 * @module client/store
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { BatchNotice, BatchState, ObservableLike, SessionIdString } from './types.ts'

/** 墓碑的 localStorage 键。 */
const TOMBSTONE_STORAGE_KEY = 'dsh-session-batch-manager.tombstones'
/** 墓碑上限：超出丢最旧（id 不复用，残留规则只是匹配不到行）。 */
const TOMBSTONE_CAP = 200

/**
 * 从 localStorage 水合墓碑（不可用/损坏时安静返回空）。
 * @returns 墓碑 id 列表。
 */
function loadTombstones(): readonly SessionIdString[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((id): id is SessionIdString => typeof id === 'string' && id !== '')
      .slice(-TOMBSTONE_CAP)
  } catch {
    return []
  }
}

/**
 * 持久化墓碑（不可用时只在本页会话内生效）。
 * @param ids - 墓碑 id 列表。
 */
function saveTombstones(ids: readonly SessionIdString[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // 隐私模式/配额满：降级为内存墓碑。
  }
}

/** 初始状态：模式关闭、无选择、无进行中操作、无对话框、无通知；墓碑从 localStorage 水合。 */
export const INITIAL_STATE: BatchState = {
  mode: 'off',
  selected: [],
  busy: null,
  confirmDelete: null,
  notice: null,
  tombstones: loadTombstones(),
}

/** 存储句柄：只读源 + 动作面。 */
export interface BatchStore {
  /** 注入 hooks 舱的只读源。 */
  readonly source: ObservableLike<BatchState>
  /** 读当前快照（事件处理器用）。 */
  get(): BatchState
  setMode(mode: BatchState['mode'], seed?: readonly SessionIdString[]): void
  toggle(sessionId: SessionIdString): void
  setSelected(ids: readonly SessionIdString[]): void
  /** 并入若干 id（去重）。 */
  addSelected(ids: readonly SessionIdString[]): void
  clearSelection(): void
  setBusy(labelKey: string, done: number, total: number): void
  advanceBusy(): void
  clearBusy(): void
  requestDeleteConfirm(): void
  closeConfirm(): void
  showNotice(notice: Omit<BatchNotice, 'seq'>): void
  dismissNotice(): void
  /** 并入删除成功的墓碑 id（去重、封顶、持久化）。 */
  addTombstones(ids: readonly SessionIdString[]): void
}

/**
 * 创建批量状态存储。
 * @returns 存储句柄。
 */
export function createBatchStore(): BatchStore {
  const store = createSnapshotStore<BatchState>(INITIAL_STATE)
  let noticeSeq = 0
  const update = (patch: Partial<BatchState>): void => {
    store.set({ ...store.getSnapshot(), ...patch })
  }
  return {
    source: store,
    get: () => store.getSnapshot(),
    setMode(mode, seed) {
      if (mode === 'off') {
        // 退出选择模式**保留**已选集合：选中状态一直保持，直到「清空」或批量删除完成。
        update({ mode, confirmDelete: null })
        return
      }
      const current = store.getSnapshot().selected
      update(seed === undefined
        ? { mode }
        : { mode, selected: [...new Set([...current, ...seed])] })
    },
    toggle(sessionId) {
      const current = store.getSnapshot().selected
      update({
        selected: current.includes(sessionId)
          ? current.filter(id => id !== sessionId)
          : [...current, sessionId],
      })
    },
    setSelected(ids) {
      update({ selected: [...new Set(ids)] })
    },
    addSelected(ids) {
      update({ selected: [...new Set([...store.getSnapshot().selected, ...ids])] })
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
    addTombstones(ids) {
      if (ids.length === 0) return
      const current = store.getSnapshot().tombstones
      const merged = [...new Set([...current, ...ids])]
      const capped = merged.length > TOMBSTONE_CAP ? merged.slice(merged.length - TOMBSTONE_CAP) : merged
      saveTombstones(capped)
      update({ tombstones: capped })
    },
  }
}

/**
 * 从上游只读源派生一个引用稳定的新源（上游不变时输出引用不变，
 * 满足 uSES 对稳定快照的要求）。
 * @param source - 上游源。
 * @param derive - 派生函数（必须对同一输入返回同一引用或不可变值）。
 * @returns 派生源。
 */
export function deriveSource<T, R>(
  source: ObservableLike<T>,
  derive: (value: T) => R,
): ObservableLike<R> {
  let lastInput: T | undefined
  let lastOutput: R | undefined
  let initialized = false
  return {
    getSnapshot(): R {
      const input = source.getSnapshot()
      if (!initialized || input !== lastInput) {
        lastInput = input
        lastOutput = derive(input)
        initialized = true
      }
      return lastOutput as R
    },
    subscribe: listener => source.subscribe(listener),
  }
}
