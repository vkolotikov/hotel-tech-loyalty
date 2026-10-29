import { useTranslation } from 'react-i18next'
import { Loader2, Usb } from 'lucide-react'
import { useNfcReader } from '../../hooks/useNfcReader'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'

/**
 * A USB NFC reader at the desk (Chrome or Edge, WebHID), through the full admin's own reader hook
 * (src/hooks/useNfcReader.ts: compatible HID reports only, not native PC/SC). A reader paired before reconnects by itself;
 * a new one is chosen from the browser's list after a press. Each card read is handed up as the hex the reader gave.
 * The hook's own English messages are not shown: the workspace says each state in its own words. Mounted only while
 * the USB reader is wanted, so the page does not take the reader otherwise; leaving closes it.
 */
export function UsbReader({ onUid }: { onUid: (uid: string) => void }) {
  const { t } = useTranslation()
  const reader = useNfcReader(onUid)

  if (!reader.supported) {
    return <Notice tone="info">{t('loyalty.scan.usb_unsupported', 'A USB reader works in Chrome or Edge on a desk computer. A reader that types into the field works in any browser.')}</Notice>
  }

  return (
    <div className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <p className="text-sm text-a-text-2">{t('loyalty.scan.usb_compatibility', 'Compatible HID readers only. ACR122U needs a desktop connector; direct browser connection is not supported.')}</p>
      {reader.status === 'disconnected' && (
        <Button full className="py-3 text-base" onClick={() => { void reader.connect() }}>
          <Usb size={18} aria-hidden />{t('loyalty.scan.usb_connect', 'Connect USB reader')}
        </Button>
      )}
      {reader.status === 'connecting' && (
        <p role="status" className="flex items-center gap-2 text-sm text-a-text-2"><Loader2 size={16} className="animate-spin" aria-hidden />{t('loyalty.scan.usb_connecting', 'Connecting to the reader…')}</p>
      )}
      {(reader.status === 'waiting' || reader.status === 'reading') && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="min-w-0 flex-1 text-sm text-a-text">
            <span className="block font-semibold">{reader.status === 'reading' ? t('loyalty.scan.usb_reading', 'Reading the card…') : t('loyalty.scan.usb_waiting', 'Reader ready: put a card on it.')}</span>
            {reader.deviceName && <span className="block text-xs text-a-text-2">{reader.deviceName}</span>}
          </p>
          <Button size="sm" variant="secondary" onClick={() => { void reader.disconnect() }}>{t('loyalty.scan.usb_disconnect', 'Disconnect')}</Button>
        </div>
      )}
      {reader.status === 'error' && (
        <div className="space-y-2">
          <Notice tone="warning">{t('loyalty.scan.usb_failed', 'The reader could not be opened. Unplug it, plug it in again, then connect again.')}</Notice>
          <Button variant="secondary" onClick={() => { void reader.connect() }}><Usb size={16} aria-hidden />{t('loyalty.scan.usb_connect', 'Connect USB reader')}</Button>
        </div>
      )}
    </div>
  )
}
