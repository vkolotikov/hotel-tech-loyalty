import { useTranslation } from 'react-i18next'
import { Dialog } from '../ui/Dialog'
import { QuickCapture } from './QuickCapture'

/** The capture box behind I and Find's "Add an idea" (spec 2026-10-16 §4.3), anywhere in Content; Escape closes it. */
export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog title={t('content.ideas.capture_title', 'Add an idea')} onClose={onClose}>
      <div className="space-y-2">
        <QuickCapture autoFocus />
        <p className="text-xs text-a-text-2">{t('content.ideas.capture_hint', 'Press Enter to add it to the Ideas page. Add as many as you like.')}</p>
      </div>
    </Dialog>
  )
}
