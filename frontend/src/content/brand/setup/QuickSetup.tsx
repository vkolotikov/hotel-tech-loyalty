import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import { INTENSITIES, optionText } from '../../lib/options'
import type { Intensity, Platform } from '../../lib/types'
import { Dialog } from '../../ui/Dialog'
import { ChoiceChips, Segmented, SelectField, TextField } from '../inputs'
import { useBrand } from '../useBrand'

/**
 * Quick setup (spec §4.6): the essentials, then one AI call that sets the
 * brand up (it fills only what is empty); the AI's assumptions are shown to
 * check. It takes minutes: the dialog stays until it answers.
 */
export function QuickSetupDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  const queryClient = useQueryClient()
  const brandId = useBrandId()
  const w = (key: string, english: string) => t(`content.brand.setup.${key}`, english)
  const [name, setName] = useState(boot.brand?.name ?? boot.organization.name)
  const [language, setLanguage] = useState(() => ((LANGUAGES as readonly string[]).includes(locale) ? locale : 'en'))
  const [goal, setGoal] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [intensity, setIntensity] = useState<Intensity>('standard')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assumptions, setAssumptions] = useState<string[] | null>(null)
  const paused = boot.ai.status === 'over'

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const answer = await api.quickSetup({
        platforms: platforms as Platform[], intensity,
        ...(name.trim() ? { name: name.trim() } : {}), ...(language ? { default_language: language } : {}), ...(goal.trim() ? { primary_goal: goal.trim() } : {}),
      })
      adopt(answer)
      setAssumptions(answer.assumptions ?? [])
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
      // A setup that timed out at the gateway may have finished on the server: read the brand and the bootstrap again.
      void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'brand'] })
      void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={w('quick_title', 'Quick setup')} onClose={onClose} busy={busy}>
      {assumptions !== null ? (
        <div className="space-y-3">
          <Notice tone="success">{w('done', 'The brand is set up.')}</Notice>
          {assumptions.length > 0 && (
            <>
              <p className="text-sm text-a-text-2">{w('assumptions', 'What the AI assumed. Check these on the Brand page:')}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-a-text">{assumptions.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>{t('content.common.close', 'Close')}</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <TextField label={w('name', 'Brand name')} value={name} maxLength={255} onChange={setName} />
          <SelectField label={w('language', 'Language of the posts')} value={language} empty="—" options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={setLanguage} />
          <TextField label={w('goal', 'Main goal (optional)')} value={goal} rows={2} maxLength={500} onChange={setGoal} />
          <ChoiceChips label={w('platforms', 'Where the brand posts')} options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])} values={platforms} onChange={setPlatforms} />
          <Segmented label={w('intensity', 'How often to post')} options={Object.keys(INTENSITIES).map(v => [v, optionText(t, 'intensity', v)])}
            value={intensity} onChange={(value) => setIntensity((value || 'standard') as Intensity)} />
          {busy && <p role="status" className="flex items-center gap-2 text-sm text-a-text-2"><Loader2 size={14} aria-hidden className="animate-spin" />{w('working', 'The AI is setting up the brand. This takes a minute or two.')}</p>}
          {paused && <Notice tone="warning">{t('content.brand.error.ai_budget_used_up', "This month's AI budget is used up.")}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
            <Button onClick={() => { void start() }} loading={busy} disabled={platforms.length === 0 || paused}>{w('start', 'Set up with AI')}</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
