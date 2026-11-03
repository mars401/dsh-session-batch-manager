/**
 * 侧栏底部开关——`sidebar.footer.action` 槽的占位组件。
 *
 * 一个进入/退出批量选择模式的开关按钮，带选中计数徽标；渲染在设置按钮旁。
 * `data-dsh-batch-ui` 标记让选择模式的点击拦截器放行本按钮。
 * @module client/FooterToggle
 */

import type { ReactNode } from 'react'
import { IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FooterToggleProps } from './types.ts'

/**
 * 渲染批量模式开关。
 * @param props - 布局宽度、状态 hook、操作回调与翻译座。
 * @returns 开关按钮。
 */
export function FooterToggle({ wide, useBatch, enterSelect, exitSelect, t }: FooterToggleProps): ReactNode {
  const mode = useBatch(state => state.mode)
  const count = useBatch(state => state.selected.length)
  const active = mode === 'select'
  return (
    <button
      type="button"
      data-dsh-batch-ui=""
      className={active ? 'dsh-batch-footer dsh-batch-footer-on' : 'dsh-batch-footer'}
      aria-pressed={active}
      title={t('footer.toggle')}
      aria-label={t('footer.toggle')}
      onClick={() => {
        if (active) exitSelect()
        else enterSelect()
      }}
    >
      <IconChecklistOutlineRegular size={16} />
      {wide && <span>{t('footer.label')}</span>}
      {active && count > 0 && <span className="dsh-batch-badge">{count}</span>}
    </button>
  )
}
