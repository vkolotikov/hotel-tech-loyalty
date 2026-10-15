import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import type { Audience, BrandPayload } from '../../lib/types'
import { asList } from '../brandForms'
import { ChoiceChips, ReadTags, SelectField, TagInput, TextField } from '../inputs'
import { audienceForm, removeAudience, saveAudience, type AudienceForm } from '../listActions'
import { useBrand } from '../useBrand'

function AudienceEditor({ audience, onDone, onCancel }: { audience: Audience | null; onDone: () => void; onCancel: (() => void) | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  // The form as it was opened: Save sends only what changed since (not what someone else changed meanwhile).
  const [base] = useState<AudienceForm>(() => audienceForm(audience))
  const [form, setForm] = useState<AudienceForm>(base)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.audiences.${key}`, english)
  const set = (part: Partial<AudienceForm>) => setForm({ ...form, ...part })

  const save = async () => {
    if (form.name.trim() === '') {
      setError(w('name_required', 'Give the audience a name.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveAudience({ api, adopt }, audience, form, base)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-a-border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label={w('name', 'Name')} value={form.name} maxLength={255} required onChange={(name) => set({ name })} />
        <TextField label={w('job_role', 'Job or role')} value={form.job_role} onChange={(job_role) => set({ job_role })} />
        <TextField label={w('industry', 'Industry')} value={form.industry} onChange={(industry) => set({ industry })} />
        <TextField label={w('country', 'Country')} value={form.country} onChange={(country) => set({ country })} />
        <TextField label={w('size', 'Business size')} value={form.business_size} onChange={(business_size) => set({ business_size })} />
        <SelectField label={w('language', 'Language')} value={form.language} empty={w('language_brand', 'The brand language')}
          options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={(language) => set({ language })} />
        <TagInput label={w('pains', 'Pain points')} values={form.pain_points} onChange={(pain_points) => set({ pain_points })} />
        <TagInput label={w('goals', 'Goals')} values={form.goals} onChange={(goals) => set({ goals })} />
        <div className="md:col-span-2">
          <ChoiceChips label={w('platforms', 'Where they are')} options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])}
            values={form.preferred_platforms} onChange={(preferred_platforms) => set({ preferred_platforms })} />
        </div>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm font-medium text-a-accent-text">{w('more', 'More about this audience')}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TagInput label={w('fears', 'Fears')} values={form.fears} onChange={(fears) => set({ fears })} />
          <TagInput label={w('objections', 'Objections')} values={form.objections} onChange={(objections) => set({ objections })} />
          <TagInput label={w('buying', 'What makes them buy')} values={form.buying_triggers} onChange={(buying_triggers) => set({ buying_triggers })} />
          <TagInput label={w('emotional', 'Emotional triggers')} values={form.emotional_triggers} onChange={(emotional_triggers) => set({ emotional_triggers })} />
          <TagInput label={w('rational', 'Rational triggers')} values={form.rational_triggers} onChange={(rational_triggers) => set({ rational_triggers })} />
          <TagInput label={w('questions', 'Their questions')} values={form.questions} onChange={(questions) => set({ questions })} />
          <TextField label={w('trust', 'Content they trust')} value={form.content_they_trust} rows={2} onChange={(content_they_trust) => set({ content_they_trust })} />
          <TextField label={w('transformation', 'What they want to change')} value={form.desired_transformation} rows={2} onChange={(desired_transformation) => set({ desired_transformation })} />
          <div className="md:col-span-2"><TextField label={w('description', 'Description')} value={form.description} rows={3} onChange={(description) => set({ description })} /></div>
        </div>
      </details>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>}
      </div>
    </div>
  )
}

/**
 * Audiences (spec §4.6): who the posts speak to. Each keeps its id when
 * edited; removing one that posts use first says how many and asks (§7 F1).
 */
export function AudiencesSection({ brand, canEdit, startOpen = false, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(() => (startOpen && canEdit && brand.audiences.length === 0 ? 'new' : null))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const w = (key: string, english: string) => t(`content.brand.audiences.${key}`, english)

  const remove = async (audience: Audience) => {
    if (!window.confirm(w('remove_confirm', 'Remove this audience?'))) return
    setNote(null)
    try {
      const answer = await removeAudience(api, audience.id, (posts) =>
        window.confirm(t('content.brand.audiences.remove_in_use', '{{count}} posts use this audience. Remove it anyway? Those posts keep everything else.', { count: posts })))
      if (answer) {
        adopt(answer)
        void queryClient.invalidateQueries({ queryKey: ['content', brandId, 'post'] }) // open posts lose the audience
        setNote({ tone: 'success', text: w('removed', 'Audience removed.') })
      }
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    }
  }
  const done = () => { setOpen(null); onSaved?.() }

  return (
    <section aria-labelledby="content-audiences" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-audiences" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Audiences')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Who the posts speak to.')}</p>
        </div>
        {canEdit && open === null && <Button size="sm" variant="secondary" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />{w('add', 'Add audience')}</Button>}
      </div>
      {brand.audiences.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No audience yet.')}</p>}
      <ul className="space-y-3">
        {brand.audiences.map(audience => (
          <li key={audience.id}>
            {open === audience.id
              ? <AudienceEditor audience={audience} onDone={done} onCancel={() => setOpen(null)} />
              : (
                <div className="space-y-2 rounded-lg border border-a-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-a-text">{audience.name}</p>
                    {audience.is_ai_assumed && <span className="rounded-full border border-a-border px-2 py-0.5 text-xs text-a-text-2">{w('assumed', 'Assumed by the AI')}</span>}
                    <span className="text-xs text-a-text-2">{t('content.brand.audiences.used', 'Posts using it: {{count}}', { count: audience.posts_count })}</span>
                    {canEdit && open === null && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(audience.id)}>{t('content.brand.edit', 'Edit')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { void remove(audience) }}>{w('remove', 'Remove')}</Button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-a-text-2">{[audience.job_role, audience.industry, audience.country].filter(Boolean).join(' · ')}</p>
                  <dl className="grid gap-2 md:grid-cols-2">
                    <ReadTags label={w('pains', 'Pain points')} values={asList(audience.pain_points)} />
                    <ReadTags label={w('goals', 'Goals')} values={asList(audience.goals)} />
                  </dl>
                </div>
              )}
          </li>
        ))}
      </ul>
      {open === 'new' && <AudienceEditor audience={null} onDone={done} onCancel={onSaved ? null : () => setOpen(null)} />}
      {note && <p role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
    </section>
  )
}
