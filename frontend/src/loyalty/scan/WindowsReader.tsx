import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Download, Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useScanWords } from './design/words'
import { forgetWindowsReader, newlyPresentedCard, usedWindowsReader, watchWindowsReader, type WindowsReaderStatus } from '../../lib/windowsNfcReader'

const statusWords = {
  idle: 'windowsSetup', connecting: 'windowsConnecting', offline: 'windowsOffline',
  waiting: 'windowsReady', card: 'windowsCard', no_reader: 'windowsNoReader',
  service: 'windowsService', busy: 'windowsBusy', unreadable: 'windowsUnreadable',
} as const

export function WindowsReader({ onUid, lastPresentation, showTitle = true }: {
  onUid: (uid: string) => void | false
  lastPresentation?: RefObject<string | null>
  showTitle?: boolean
}) {
  const words = useScanWords()
  const [status, setStatus] = useState<WindowsReaderStatus>(() => usedWindowsReader() ? 'connecting' : 'idle')
  const stop = useRef<(() => void) | undefined>(undefined)
  const localPresentation = useRef<string | null>(null)
  const seen = lastPresentation ?? localPresentation
  const callback = useRef(onUid)
  useEffect(() => { callback.current = onUid }, [onUid])

  const start = useCallback(() => {
    stop.current?.()
    stop.current = watchWindowsReader(snapshot => {
      setStatus(snapshot === 'offline' ? snapshot : snapshot.state)
      const card = snapshot === 'offline' ? null : newlyPresentedCard(snapshot, seen.current)
      if (card && callback.current(card.uid) !== false) seen.current = card.presentation
    })
  }, [seen])

  useEffect(() => {
    if (usedWindowsReader()) start()
    return () => stop.current?.()
  }, [start])

  const connect = () => {
    setStatus('connecting')
    start()
  }

  const disconnect = () => {
    stop.current?.()
    forgetWindowsReader()
    setStatus('idle')
  }
  const setup = status === 'idle' || status === 'offline'

  return (
    <section aria-label={words('windows')} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      {showTitle && <p className="flex items-center gap-2 text-sm font-semibold text-a-text"><Usb size={18} aria-hidden />{words('windows')}</p>}
      <p role="status" className="text-sm text-a-text-2">{words(statusWords[status])}</p>
      <div className="flex flex-wrap items-center gap-2">
        {setup
          ? <Button type="button" onClick={connect}>{words(status === 'idle' ? 'windowsConnect' : 'retry')}</Button>
          : <Button type="button" variant="secondary" size="sm" onClick={disconnect}>{words('windowsDisconnect')}</Button>}
        {setup && <a className="inline-flex min-h-11 items-center gap-1.5 text-sm text-a-primary underline"
          href="/downloads/hexatech-reader.exe" download><Download size={15} aria-hidden />{words('windowsDownload')}</a>}
      </div>
    </section>
  )
}
