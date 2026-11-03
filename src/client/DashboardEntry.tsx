/**
 * 仪表盘入口按钮——`sidebar.footer.action` 槽的第二占位（order 60）。
 *
 * 形态与 FooterToggle 同款；图标用 `IconGaugeOutlineRegular`。
 * 点击切换面板开/关，面板打开时高亮 + `aria-expanded="true"`。
 *
 * @module client/DashboardEntry
 */

import type { ReactNode } from 'react'
import { IconGaugeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** DashboardEntry 的 props：布局宽度、面板开关回调与翻译座。 */
export interface DashboardEntryProps {
  readonly wide: boolean
  readonly open: boolean
  readonly onToggle: () => void
  readonly t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * 渲染仪表盘入口按钮。
 * @param props - 布局宽度、面板状态、开关回调与翻译座。
 * @returns 入口按钮。
 */
export function DashboardEntry({ wide, open, onToggle, t }: DashboardEntryProps): ReactNode {
  return (
    <button
      type="button"
      data-dsh-batch-ui=""
      className={open ? 'dsh-batch-footer dsh-batch-footer-on' : 'dsh-batch-footer'}
      aria-expanded={open}
      title={t('dash.entry')}
      aria-label={t('dash.entry')}
      onClick={onToggle}
    >
      <IconGaugeOutlineRegular size={16} />
      {wide && <span>{t('dash.entry')}</span>}
    </button>
  )
}