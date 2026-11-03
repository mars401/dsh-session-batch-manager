/**
 * 删除确认对话框——宿主原语 `Modal` 的一个薄封装。
 *
 * 展示待删会话标题（最多 8 条 + 计数溢出）、不可恢复警告；删除进行中禁止关闭，
 * 确认按钮走危险色。真正的删除请求在 ops 里（`runDelete`）。
 * @module client/DeleteDialog
 */

import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeleteDialogProps } from './types.ts'

/** 对话框里最多列出的会话条数。 */
const MAX_LISTED = 8

/**
 * 渲染删除确认对话框。
 * @param props - 目标 id、进行中状态、标题解析、取消/确认回调与翻译座。
 * @returns Modal 元素。
 */
export function DeleteDialog({ ids, busy, titleOf, onCancel, onConfirm, t }: DeleteDialogProps): ReactNode {
  const deleting = busy !== null
  const listed = ids.slice(0, MAX_LISTED)
  const overflow = ids.length - listed.length
  return (
    <Modal
      open
      onClose={() => { if (!deleting) onCancel() }}
      closeLabel={t('delete.cancel')}
      title={t('delete.title', { n: ids.length })}
      description={t('delete.desc')}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={onCancel}>
            {t('delete.cancel')}
          </Button>
          <Button
            variant="outline"
            className="dsh-batch-danger-btn"
            disabled={deleting}
            onClick={() => { onConfirm(ids) }}
          >
            {t('delete.confirm')}
          </Button>
        </>
      )}
    >
      <ul className="dsh-batch-delete-list">
        {listed.map(id => <li key={id}>{titleOf(id)}</li>)}
        {overflow > 0 && <li>{t('delete.more', { n: overflow })}</li>}
      </ul>
      {busy !== null && (
        <div className="dsh-batch-delete-status" role="status">
          {t('delete.pending')}
          {' '}
          {busy.done}
          /
          {busy.total}
        </div>
      )}
    </Modal>
  )
}
