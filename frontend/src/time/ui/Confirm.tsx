import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'

/** Asked before something that cannot be undone (deleting a lead, a contact, an answer): what goes, and Cancel. */
export function Confirm({ title, children, confirm, danger = true, busy = false, onConfirm, onClose }: {
  title: string
  children?: ReactNode
  confirm: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <div className="space-y-4">
        {children && <div className="text-sm text-a-text-2">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t('time.common.cancel', 'Cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirm}</Button>
        </div>
      </div>
    </Dialog>
  )
}
