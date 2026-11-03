/**
 * 会话行选择框——`sidebar.workspaces.session.row.action` 槽的占位组件。
 *
 * 该槽只能渲染进行尾的悬停操作条，而产品要求选择框**在批量管理模式下显示于行首**，
 * React 节点又不能安全搬移（removeChild 冲突），所以这里用「锚点 + 自建 DOM」方案：
 *
 * - 槽内渲染一个 `display:none` 的锚点 span（本组件唯一的 React 输出）；
 * - 副作用从锚点找到所在行，`insertBefore` 一个**手动创建**的选择框按钮到行的
 *   最前面，并给行加 `.dsh-batch-row` 标记；
 * - 选中态与可见性经 `watchBatch` 订阅同步到按钮（勾选样式、aria、display）；
 *   仅批量管理模式（`mode === 'select'`）显示选择框，退出模式后隐藏但选中、
 *   行高亮、工具条计数照旧保留——**再次进入模式勾选状态恢复显示**；
 * - 组件卸载（行移除/插件停用）时按钮、标记与订阅一并回收。
 *
 * 点击语义：任何模式下点击选择框都只切换选中（stopPropagation，不打开会话）。
 * @module client/RowCheckbox
 */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { RowCheckboxProps } from './types.ts'
import { BATCH_ROW_CLASS, ROW_SELECTED_CLASS } from './styles.ts'

/** 勾选图标（内联 SVG，脱离 React 渲染，颜色由按钮的 color 驱动）。 */
const CHECK_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 8.5l3.4 3.3 7-7.8"/></svg>'

/**
 * 渲染隐藏锚点，并把常驻选择框插入所在行的行首。
 * @param props - 行身份、状态订阅与操作回调、翻译座。
 * @returns 隐藏锚点（无可见输出）。
 */
export function RowCheckbox({ sessionId, watchBatch, peekState, toggleSession, t }: RowCheckboxProps): ReactNode {
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (anchor === null) return undefined
    const row = anchor.closest('[data-row-key^="session:"]')
    if (row === null) return undefined

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dsh-batch-check'
    button.setAttribute('role', 'checkbox')
    button.setAttribute('data-dsh-batch-ui', '')
    button.innerHTML = CHECK_SVG

    const sync = (): void => {
      const state = peekState()
      const selected = state.selected.includes(sessionId)
      button.classList.toggle('dsh-batch-check-on', selected)
      button.setAttribute('aria-checked', String(selected))
      button.setAttribute('aria-label', selected ? t('row.unselect') : t('row.select'))
      button.style.display = state.mode === 'select' ? '' : 'none'
      row.classList.toggle(ROW_SELECTED_CLASS, selected)
    }
    const onClick = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      toggleSession(sessionId)
    }
    const onMouseDown = (event: MouseEvent): void => {
      // 不触发行的框选/拖拽预备逻辑；焦点仍留给按钮自身。
      event.stopPropagation()
    }
    const onDragStart = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    button.addEventListener('click', onClick)
    button.addEventListener('mousedown', onMouseDown)
    button.addEventListener('dragstart', onDragStart)

    row.classList.add(BATCH_ROW_CLASS)
    row.insertBefore(button, row.firstChild)
    sync()
    const unsubscribe = watchBatch(sync)

    return () => {
      unsubscribe()
      button.removeEventListener('click', onClick)
      button.removeEventListener('mousedown', onMouseDown)
      button.removeEventListener('dragstart', onDragStart)
      button.remove()
      row.classList.remove(BATCH_ROW_CLASS)
      row.classList.remove(ROW_SELECTED_CLASS)
    }
  }, [sessionId, watchBatch, peekState, toggleSession, t])

  return <span ref={anchorRef} style={{ display: 'none' }} aria-hidden={true} />
}
