/**
 * 批量模式的总控占位——`shell.overlay` 槽，常驻挂载。
 *
 * 承担四件事：
 * 1. **样式与模式标记**：注入样式表；选择模式给 body 加标记类（配合 CSS 让行操作条常显）。
 * 2. **行点击拦截**：选择模式下用文档级捕获监听把「点击会话行」改判为「切换选中」，
 *    并拦截双击重命名、行拖拽与 Enter/Space 打开；Esc 退出选择模式。自有 UI
 *    （`data-dsh-batch-ui`）与草稿行（没有选择框的行）放行原生行为。
 * 3. **底部工具条**：计数、全选/清空、归档或恢复（全部选中项都已归档时显示「恢复」）、
 *    删除（先确认）、退出；操作进行中显示进度并禁用按钮。
 * 4. **结果通知与删除确认对话框**：通知带失败明细与可选后续动作
 *    （如「停止并归档」）；确认对话框见 DeleteDialog。
 *
 * 工具条与通知经 `createPortal` 挂到 body：overlay 槽的容器若有 transform 等
 * 会改变 fixed 定位的包含块，portal 保证「底部居中」永远相对视口。
 * @module client/BatchOverlay
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  IconArchiveOutlineRegular, IconCloseOutlineRegular, IconTrashOutlineRegular,
  IconUnarchiveOutlineRegular, IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { BatchNotice, BatchOverlayProps, TranslateFn } from './types.ts'
import { BATCH_ROW_CLASS, BODY_MODE_CLASS, OWN_UI_SELECTOR, injectStyles, removeTombstoneStyles, syncTombstoneStyles } from './styles.ts'
import { DeleteDialog } from './DeleteDialog.tsx'

/** 会话行 key 前缀（Rows.tsx 契约）。 */
const ROW_KEY_PREFIX = 'session:'

/** 无失败明细时通知的自动收起时长。 */
const NOTICE_HOLD_MS = 6000

/** 带失败明细时通知的自动收起时长（留阅读时间）。 */
const NOTICE_HOLD_FAILURES_MS = 15000

/**
 * 渲染批量模式的全部浮层。
 * @param props - 状态 hook、操作回调与翻译座。
 * @returns 工具条 / 通知 / 确认对话框（各自按状态出现）。
 */
export function BatchOverlay(props: BatchOverlayProps): ReactNode {
  const {
    useBatch, useArchivedIds, t, peekState, exitSelect, toggleSession,
    selectAllVisible, clearSelection, runArchive, runUnarchive,
    requestDeleteConfirm, closeConfirm, runDelete, dismissNotice, titleOf,
  } = props
  const mode = useBatch(state => state.mode)
  const selected = useBatch(state => state.selected)
  const busy = useBatch(state => state.busy)
  const confirmDelete = useBatch(state => state.confirmDelete)
  const notice = useBatch(state => state.notice)
  const tombstones = useBatch(state => state.tombstones)
  const archivedIds = useArchivedIds(set => set)

  // 样式表：幂等注入，卸载时移除。
  useEffect(() => injectStyles(), [])

  // 墓碑行隐藏：删除成功的 id 注入 display:none 行规则（与模式无关，常驻生效；
  // 覆盖宿主 live 记录复活出来的行——活动视图与归档视图都隐藏）。
  useEffect(() => {
    syncTombstoneStyles(tombstones)
  }, [tombstones])
  useEffect(() => removeTombstoneStyles, [])

  // 选择模式：body 标记类。
  useEffect(() => {
    if (mode !== 'select') return undefined
    document.body.classList.add(BODY_MODE_CLASS)
    return () => {
      document.body.classList.remove(BODY_MODE_CLASS)
    }
  }, [mode])

  // 选择模式：把行上的原生手势改判为选择操作（文档级捕获，先于 React 根监听）。
  useEffect(() => {
    if (mode !== 'select') return undefined
    const inOwnUi = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest(OWN_UI_SELECTOR) !== null
    const rowOf = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      const row = target.closest(`[data-row-key^="${ROW_KEY_PREFIX}"]`)
      // 只接管带选择框的行；草稿行（无操作条）保持原生「点击打开」。
      if (row === null || !row.classList.contains(BATCH_ROW_CLASS)) return null
      return row as HTMLElement
    }
    const idOf = (row: HTMLElement): string =>
      (row.getAttribute('data-row-key') ?? '').slice(ROW_KEY_PREFIX.length)
    const onClick = (event: MouseEvent): void => {
      if (inOwnUi(event.target)) return
      const row = rowOf(event.target)
      if (row === null) return
      event.preventDefault()
      event.stopPropagation()
      const id = idOf(row)
      if (id !== '') toggleSession(id)
    }
    const onDblClick = (event: MouseEvent): void => {
      if (inOwnUi(event.target) || rowOf(event.target) === null) return
      event.preventDefault()
      event.stopPropagation()
    }
    const onDragStart = (event: Event): void => {
      if (rowOf(event.target) === null) return
      event.preventDefault()
      event.stopPropagation()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // 确认对话框开着时 Esc 归 Modal 自己处理。
        if (peekState().confirmDelete === null) {
          event.preventDefault()
          event.stopPropagation()
          exitSelect()
        }
        return
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (inOwnUi(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const row = rowOf(event.target)
      if (row === null) return
      event.preventDefault()
      event.stopPropagation()
      const id = idOf(row)
      if (id !== '') toggleSession(id)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('dblclick', onDblClick, true)
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('dblclick', onDblClick, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [mode, toggleSession, exitSelect, peekState])

  // 通知自动收起（新通知替换旧通知时计时器随 effect 重启）。
  useEffect(() => {
    if (notice === null) return undefined
    const hold = notice.failures === undefined ? NOTICE_HOLD_MS : NOTICE_HOLD_FAILURES_MS
    const timer = setTimeout(dismissNotice, hold)
    return () => {
      clearTimeout(timer)
    }
  }, [notice, dismissNotice])

  const allArchived = selected.length > 0 && selected.every(id => archivedIds.has(id))
  const noneSelected = selected.length === 0
  const working = busy !== null
  // 工具条常驻：有选中就显示（选择状态持久），选择模式额外提供「退出」。
  const showBar = mode === 'select' || selected.length > 0

  return (
    <>
      {showBar && createPortal(
        <div className="dsh-batch-bar" data-dsh-batch-ui="" role="toolbar" aria-label={t('bar.aria')}>
          <span className="dsh-batch-count">{t('bar.selected', { n: selected.length })}</span>
          <button type="button" className="dsh-batch-btn" disabled={working} onClick={selectAllVisible}>
            {t('bar.selectAll')}
          </button>
          <button type="button" className="dsh-batch-btn" disabled={working || noneSelected} onClick={clearSelection}>
            {t('bar.clear')}
          </button>
          <span className="dsh-batch-sep" aria-hidden={true} />
          <button
            type="button"
            className="dsh-batch-btn"
            disabled={working || noneSelected}
            onClick={() => {
              if (allArchived) runUnarchive(selected)
              else runArchive(selected)
            }}
          >
            {allArchived ? <IconUnarchiveOutlineRegular size={14} /> : <IconArchiveOutlineRegular size={14} />}
            {allArchived ? t('bar.unarchive') : t('bar.archive')}
          </button>
          <button
            type="button"
            className="dsh-batch-btn dsh-batch-btn-danger"
            disabled={working || noneSelected}
            onClick={requestDeleteConfirm}
          >
            <IconTrashOutlineRegular size={14} />
            {t('bar.delete')}
          </button>
          {mode === 'select' && (
            <>
              <span className="dsh-batch-sep" aria-hidden={true} />
              <button type="button" className="dsh-batch-btn" disabled={working} onClick={exitSelect}>
                {t('bar.exit')}
              </button>
            </>
          )}
          {busy !== null && (
            <span className="dsh-batch-busy" role="status">
              {t(busy.labelKey)}
              {' '}
              {busy.done}
              /
              {busy.total}
            </span>
          )}
        </div>,
        document.body,
      )}
      {notice !== null && createPortal(
        <NoticePanel notice={notice} t={t} onDismiss={dismissNotice} />,
        document.body,
      )}
      {confirmDelete !== null && (
        <DeleteDialog
          ids={confirmDelete}
          busy={busy}
          titleOf={titleOf}
          onCancel={closeConfirm}
          onConfirm={runDelete}
          t={t}
        />
      )}
    </>
  )
}

/**
 * 结果通知面板：主文案 + 失败明细 + 可选后续动作 + 关闭。
 * @param props - 通知内容、翻译座与关闭回调。
 * @returns 通知面板元素。
 */
function NoticePanel({ notice, t, onDismiss }: {
  notice: BatchNotice
  t: TranslateFn
  onDismiss: () => void
}): ReactNode {
  const reasonOf = (code: string, message: string | undefined): string => {
    const key = `notice.code.${code}`
    const translated = t(key)
    // 字典缺键时 t 原样返回键名：回落宿主给的 message，再回落 code。
    if (translated !== key) return translated
    return message ?? code
  }
  return (
    <div className="dsh-batch-notice" data-dsh-batch-ui="" role="status">
      <div className="dsh-batch-notice-head">
        {notice.kind === 'error' && <IconWarningOutlineRegular size={14} />}
        <span className="dsh-batch-notice-text">{t(notice.textKey, notice.params)}</span>
        <button type="button" className="dsh-batch-notice-close" aria-label={t('notice.close')} onClick={onDismiss}>
          <IconCloseOutlineRegular size={12} />
        </button>
      </div>
      {notice.failures !== undefined && notice.failures.length > 0 && (
        <ul className="dsh-batch-failures">
          {notice.failures.map((failure, index) => (
            <li key={failure.id !== '' ? failure.id : `idx-${String(index)}`}>
              {failure.title !== '' && <span className="dsh-batch-fail-title">{failure.title}</span>}
              <span className="dsh-batch-fail-reason">{reasonOf(failure.code, failure.message)}</span>
            </li>
          ))}
        </ul>
      )}
      {notice.action !== undefined && (
        <button type="button" className="dsh-batch-notice-action" onClick={notice.action.run}>
          {t(notice.action.labelKey, notice.action.params)}
        </button>
      )}
    </div>
  )
}
