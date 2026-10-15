import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES } from '../../lib/languages'
import type { BrandPayload } from '../../lib/types'
import { AudiencesSection } from '../sections/Audiences'
import { BrandDnaSection } from '../sections/BrandDna'
import { ChannelsSection } from '../sections/Channels'
import { PositioningSection } from '../sections/Positioning'
import { RhythmSection } from '../sections/Rhythm'
import { VoiceSection } from '../sections/Voice'
import { clearSetupStep, loadSetupStep, saveSetupStep } from '../setupDraft'
import { useBrand } from '../useBrand'

const STEPS = ['dna', 'audiences', 'voice', 'positioning', 'channels', 'rhythm', 'finish'] as const
const STEP_TEXT: Record<(typeof STEPS)[number], [string, string]> = {
  dna: ['content.brand.dna.title', 'Brand DNA'], audiences: ['content.brand.audiences.title', 'Audiences'], voice: ['content.brand.voice.title', 'Voice'],
  positioning: ['content.brand.positioning.title', 'Positioning'], channels: ['content.brand.channels.title', 'Channels'],
  rhythm: ['content.brand.rhythm.title', 'Rhythm and goals'], finish: ['content.brand.setup.finish_title', 'Finish'],
}

/**
 * Guided setup (spec §4.6): the section editors one after another. Each step
 * is saved on the server as it is done (Brand DNA, first, creates the
 * profile, so it cannot be skipped before one exists); the device keeps
 * where the manager is (setupDraft.ts). Finish marks the brand set up.
 */
export function GuidedSetup({ brand, onExit }: { brand: BrandPayload; onExit: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const { adopt } = useBrand()
  const [step, setStep] = useState(() => Math.min(loadSetupStep(brandId) ?? 0, STEPS.length - 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  const go = (next: number) => {
    const to = Math.max(0, Math.min(next, STEPS.length - 1))
    setStep(to)
    saveSetupStep(brandId, to)
  }
  const current = STEPS[step]
  const next = () => go(step + 1)
  const defaults = { name: boot.brand?.name ?? boot.organization.name, default_language: (LANGUAGES as readonly string[]).includes(locale) ? locale : 'en' }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      adopt(await api.finishSetup())
      clearSetupStep(brandId)
      onExit()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{t('content.brand.setup.step', 'Step {{step}} of {{total}}', { step: step + 1, total: STEPS.length })}</p>
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? 'step' : undefined}
              className={`rounded-full px-2 py-0.5 text-xs ${i === step ? 'bg-a-accent/10 font-semibold text-a-text' : i < step ? 'text-a-text' : 'text-a-text-2'}`}>
              {t(STEP_TEXT[name][0], STEP_TEXT[name][1])}
            </li>
          ))}
        </ol>
        <Button size="sm" variant="ghost" onClick={onExit}>{w('leave', 'Leave setup')}</Button>
      </div>

      {current === 'dna' && <BrandDnaSection key="dna" brand={brand} canEdit startOpen defaults={defaults} onSaved={next} />}
      {current === 'audiences' && <AudiencesSection key="audiences" brand={brand} canEdit startOpen onSaved={() => {}} />}
      {current === 'voice' && <VoiceSection key="voice" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'positioning' && <PositioningSection key="positioning" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'channels' && <ChannelsSection key="channels" brand={brand} canEdit startOpen onSaved={() => {}} />}
      {current === 'rhythm' && <RhythmSection key="rhythm" brand={brand} canEdit startOpen onSaved={next} />}
      {current === 'finish' && (
        <section className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
          <h2 className="font-a-display text-lg font-normal text-a-text">{w('finish_title', 'Finish')}</h2>
          <p className="text-sm text-a-text-2">{w('finish_text', 'That is everything. Finish the setup and the AI starts writing from this brand.')}</p>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button onClick={() => { void finish() }} loading={busy}>{w('finish', 'Finish setup')}</Button>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 && <Button size="sm" variant="secondary" onClick={() => go(step - 1)}>{w('back', 'Back')}</Button>}
        {(current === 'audiences' || current === 'channels') && <Button size="sm" onClick={next}>{w('next', 'Next')}</Button>}
        {current !== 'finish' && current !== 'audiences' && current !== 'channels' && (current !== 'dna' || brand.profile !== null) && (
          <Button size="sm" variant="ghost" onClick={next}>{w('skip', 'Skip this step')}</Button>
        )}
      </div>
    </div>
  )
}
