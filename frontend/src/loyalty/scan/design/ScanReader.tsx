import type { ReactNode } from 'react'
import { OverviewButton } from '../../overview/OverviewUI'
import { overviewAssets } from '../../overview/assets'
import type { ScanMode } from '../scanMath'
import { useScanWords } from './words'
import scanLarge from './assets/scan-large.svg'
import scanTitle from './assets/scan-title.svg'

export function ScanReader({ reader, active, busy, contextName, event, onStart, onOptions, onManual, onCamera, children }: { reader: ScanMode; active: boolean; busy: boolean; contextName: string; event: boolean; onStart: () => void; onOptions: () => void; onManual: () => void; onCamera: () => void; children?: ReactNode }) {
  const words = useScanWords()
  return <div className="l-sc-idle"><header className="l-sc-heading"><div><h1><img className="l-sc-mobile" src={scanTitle} alt="" />{words('title')}</h1><p className="l-sc-desktop">{words('subtitle')}</p></div></header><section className="l-sc-scanner">
    <div className="l-sc-reader-row"><div><strong>{words(reader)} · {contextName}</strong>{reader === 'camera' && !active && <small className="l-sc-desktop">{words('cameraOff')}</small>}</div><OverviewButton onClick={onOptions} disabled={busy}>{words('options')}</OverviewButton></div>
    {active ? children : <div className={`l-sc-viewport l-sc-${reader}`}><img src={reader === 'camera' ? scanLarge : overviewAssets.app} alt="" /><h2>{words(busy ? 'loading' : reader === 'nfc' ? 'readyTap' : reader === 'camera' ? 'start' : 'usb')}</h2><p>{words(reader === 'nfc' ? 'nfcLine' : reader === 'camera' ? 'cameraLine' : 'rawCode')}</p><OverviewButton primary onClick={onStart} disabled={busy}>{words(reader === 'nfc' ? 'enableNfc' : reader === 'camera' ? 'startCamera' : 'usb')}</OverviewButton></div>}
    <small className="l-sc-reader-hint">{words(event ? 'eventEffects' : reader === 'nfc' ? 'nfcHint' : 'cameraHint')}</small>{reader !== 'camera' && <OverviewButton onClick={onCamera} disabled={busy}>{words('useCamera')}</OverviewButton>}<div className="l-sc-manual"><OverviewButton onClick={onManual} disabled={busy}>{words('manual')}</OverviewButton></div>
  </section></div>
}
