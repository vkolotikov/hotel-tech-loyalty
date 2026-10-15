import { useTranslation } from 'react-i18next'
import { ListChecks, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'

/** A brand with no profile, or one not set up yet: the two ways in (spec §4.6), for managers. */
export function SetupChoice({ started, onQuick, onGuided }: { started: boolean; onQuick: () => void; onGuided: () => void }) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  return (
    <section aria-labelledby="content-setup" className="space-y-4 rounded-xl border border-a-accent-text bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-setup" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Set up this brand')}</h2>
        <p className="text-sm text-a-text-2">{started ? w('not_finished', 'Setup has started but is not finished.') : w('intro', 'The AI needs to know the brand before it writes for it. Choose how to start.')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-a-border p-3">
          <p className="text-sm text-a-text-2">{w('quick_text', 'One AI call writes a first version from what HexaTech already knows about you. It takes a minute or two; you can change everything afterwards.')}</p>
          <Button size="sm" onClick={onQuick}><Sparkles size={14} aria-hidden />{w('quick', 'Quick setup')}</Button>
        </div>
        <div className="space-y-2 rounded-lg border border-a-border p-3">
          <p className="text-sm text-a-text-2">{w('guided_text', 'The sections one after another, at your own pace. Your place is kept on this device.')}</p>
          <Button size="sm" variant="secondary" onClick={onGuided}><ListChecks size={14} aria-hidden />{started ? w('continue', 'Continue setup') : w('guided', 'Guided setup')}</Button>
        </div>
      </div>
    </section>
  )
}
