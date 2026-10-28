import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Square } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { cameraFailure, type CameraFailure } from './scanMath'
import { useScanWords } from './design/words'
import { OverviewButton } from '../overview/OverviewUI'
import scanCamera from './design/assets/scan-camera.svg'

/** The rear camera where there is one (a phone's or tablet's); any camera otherwise (a laptop's). */
const CONSTRAINTS: MediaStreamConstraints = { video: { facingMode: { ideal: 'environment' } }, audio: false }

/**
 * "Scan with camera" (release 5, spec 2026-10-23 §3): the QR decoder (@zxing/browser) is loaded only now, as its own
 * chunk; the first code read is handed up as it was decoded and the camera stops. The camera also stops on Stop, when
 * the page is left (unmount) and when the tab is hidden. Mounted only while the camera is wanted.
 *
 * Release 8 (spec 2026-10-25 §2): `continuous` keeps scanning — every code read is handed up, member after member (door
 * mode ignores the same code held in view, verdict.ts `isDuplicate`); `fill` lets the picture fill its box.
 */
export function CameraScanner({ onCode, onStop, continuous = false, fill = false, design = false }: {
  onCode: (text: string) => void
  onStop: () => void
  continuous?: boolean
  fill?: boolean
  design?: boolean
}) {
  const { t } = useTranslation()
  const words = useScanWords()
  const [attempt, setAttempt] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'running' | CameraFailure>('starting')
  const handlers = useRef({ onCode, onStop })
  useEffect(() => { handlers.current = { onCode, onStop } })
  const keepScanning = useRef(continuous)

  useEffect(() => {
    let stopped = false
    let controls: { stop: () => void } | null = null
    const stopCamera = () => {
      if (controls) { controls.stop(); controls = null }
    }

    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (stopped || !video.current) return
        const reader = new BrowserQRCodeReader()
        const started = await reader.decodeFromConstraints(CONSTRAINTS, video.current, (result, _error, running) => {
          if (!result || stopped) return
          if (keepScanning.current) { handlers.current.onCode(result.getText()); return }
          stopped = true
          running.stop()
          controls = null
          handlers.current.onCode(result.getText())
        })
        if (stopped) { started.stop(); return }
        controls = started
        setState('running')
      } catch (error) {
        if (!stopped) setState(cameraFailure(error))
      }
    })()

    const onHidden = () => { if (document.visibilityState === 'hidden') handlers.current.onStop() }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      stopped = true
      stopCamera()
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [attempt])

  const failed = state !== 'starting' && state !== 'running'
  const status = state === 'running'
    ? t('loyalty.scan.camera_aim', 'Hold the member’s QR code inside the square.')
    : t('loyalty.scan.camera_starting', 'Starting the camera…')

  if (design) return <div className="l-sc-camera-live">{failed ? <div className="l-sc-viewport l-sc-camera-error"><h2>{words(state === 'denied' ? 'cameraBlocked' : 'cameraUnavailable')}</h2><p role="alert"><CameraTrouble failure={state} /></p><OverviewButton primary onClick={() => { setState('starting'); setAttempt(n => n + 1) }}>{words('retry')}</OverviewButton></div> : <div className="l-sc-video"><video ref={video} muted playsInline /><img src={scanCamera} alt="" /><p role="status">{status}</p></div>}<OverviewButton onClick={onStop}>{words('stopCamera')}</OverviewButton></div>

  if (fill) {
    return failed ? (
      <div className="space-y-3">
        <Notice tone="warning"><CameraTrouble failure={state} /></Notice>
        <Button variant="secondary" full className="py-3 text-base" onClick={onStop}><Square size={16} aria-hidden />{t('loyalty.scan.close', 'Close')}</Button>
      </div>
    ) : (
      <div className="relative h-full min-h-[12rem] overflow-hidden rounded-2xl border border-a-border bg-a-surface-2">
        <video ref={video} muted playsInline className="absolute inset-0 block h-full w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="aspect-square w-3/5 max-w-sm rounded-3xl border-4 border-a-accent-text/80" />
        </div>
        <p role="status" className="absolute inset-x-0 bottom-0 bg-a-surface/85 px-4 py-2.5 text-center text-base text-a-text">{status}</p>
        <Button size="sm" variant="secondary" className="absolute right-3 top-3" onClick={onStop}>
          <Square size={14} aria-hidden />{t('loyalty.scan.camera_stop', 'Stop camera')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {failed ? <Notice tone="warning"><CameraTrouble failure={state} /></Notice> : (
        <div className="relative overflow-hidden rounded-2xl border border-a-border bg-a-surface-2">
          <video ref={video} muted playsInline className="block aspect-[3/4] w-full object-cover sm:aspect-video" />
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="aspect-square w-3/5 max-w-xs rounded-2xl border-2 border-a-accent-text/80" />
          </div>
          <p role="status" className="absolute inset-x-0 bottom-0 bg-a-surface/85 px-4 py-2 text-center text-sm text-a-text">{status}</p>
        </div>
      )}
      <Button variant="secondary" full className="py-3 text-base" onClick={onStop}>
        <Square size={16} aria-hidden />{failed ? t('loyalty.scan.close', 'Close') : t('loyalty.scan.camera_stop', 'Stop camera')}
      </Button>
    </div>
  )
}

/** The page's sentence for a camera that did not start. */
function CameraTrouble({ failure }: { failure: CameraFailure }) {
  const { t } = useTranslation()
  switch (failure) {
    case 'denied': return t('loyalty.scan.camera_denied', 'The camera is blocked for this site. Allow it in the browser’s site settings, then try again.')
    case 'absent': return t('loyalty.scan.camera_absent', 'This device has no camera the browser can use. Type the number or use a reader.')
    case 'busy': return t('loyalty.scan.camera_busy', 'Another app is using the camera. Close it, then try again.')
    case 'insecure': return t('loyalty.scan.camera_insecure', 'The camera works only over a secure (https) connection.')
    default: return t('loyalty.scan.camera_failed', 'The camera could not start. Try again, or type the number.')
  }
}
