import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, languageName } from '../lib/languages'
import type { AudienceRef, PillarRef, Platform, PostStatus } from '../lib/types'
import type { PostForm } from './panelState'

const BOX = 'w-full rounded-lg border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2 disabled:text-a-text-2'

/** A labelled field; a field a refused save named says so under it. */
function FieldBox({ label, hint, invalid, children }: { label: string; hint?: string; invalid: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      {children}
      {invalid
        ? <span className="mt-1 block text-xs text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</span>
        : hint ? <span className="mt-1 block text-xs text-a-text-2">{hint}</span> : null}
    </label>
  )
}

/**
 * The post's fields (spec §4.3): platform, day and time, status, pillar,
 * audience, language, topic, hook, text, call to action and hashtags. A
 * published post keeps its day: the day is the record of when it went out.
 */
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale }: {
  form: PostForm
  onChange: (form: PostForm) => void
  platforms: Platform[]
  statuses: PostStatus[]
  pillars: PillarRef[]
  audiences: AudienceRef[]
  published: boolean
  invalid: (keyof PostForm)[]
  locale: string
}) {
  const { t } = useTranslation()
  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => onChange({ ...form, [key]: value })
  const box = (key: keyof PostForm) => `${BOX} ${invalid.includes(key) ? 'border-a-danger' : 'border-a-border'}`
  const bad = (key: keyof PostForm) => invalid.includes(key) || undefined
  const languages: string[] = [...LANGUAGES]
  if (form.language !== '' && !languages.includes(form.language)) languages.push(form.language)
  const pillarKnown = form.pillar_id === '' || pillars.some(p => String(p.id) === form.pillar_id)
  const audienceKnown = form.audience_id === '' || audiences.some(a => String(a.id) === form.audience_id)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldBox label={t('content.panel.fields.platform', 'Platform')} invalid={invalid.includes('platform')}>
          <select value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)} aria-invalid={bad('platform')} className={box('platform')}>
            {platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.status', 'Status')} invalid={invalid.includes('status')}>
          <select value={form.status} onChange={(e) => set('status', e.target.value as PostStatus)} aria-invalid={bad('status')} className={box('status')}>
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.date', 'Date')} invalid={invalid.includes('scheduled_date')}
          hint={published ? t('content.panel.fields.published_date', 'A published post keeps the date it went out.') : undefined}>
          <input type="date" value={form.scheduled_date} disabled={published} onChange={(e) => set('scheduled_date', e.target.value)}
            aria-invalid={bad('scheduled_date')} className={box('scheduled_date')} />
        </FieldBox>
        <FieldBox label={t('content.panel.fields.time', 'Time')} invalid={invalid.includes('scheduled_time')}>
          <input type="time" value={form.scheduled_time} onChange={(e) => set('scheduled_time', e.target.value)} aria-invalid={bad('scheduled_time')} className={box('scheduled_time')} />
        </FieldBox>
        <FieldBox label={t('content.panel.fields.pillar', 'Pillar')} invalid={invalid.includes('pillar_id')}>
          <select value={form.pillar_id} onChange={(e) => set('pillar_id', e.target.value)} aria-invalid={bad('pillar_id')} className={box('pillar_id')}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {pillars.filter(p => p.active || String(p.id) === form.pillar_id).map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            {!pillarKnown && <option value={form.pillar_id}>{t('content.panel.fields.other_pillar', 'Another pillar')}</option>}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.audience', 'Audience')} invalid={invalid.includes('audience_id')}>
          <select value={form.audience_id} onChange={(e) => set('audience_id', e.target.value)} aria-invalid={bad('audience_id')} className={box('audience_id')}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {audiences.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            {!audienceKnown && <option value={form.audience_id}>{t('content.panel.fields.other_audience', 'Another audience')}</option>}
          </select>
        </FieldBox>
      </div>
      <FieldBox label={t('content.panel.fields.language', 'Language')} invalid={invalid.includes('language')}>
        <select value={form.language} onChange={(e) => set('language', e.target.value)} aria-invalid={bad('language')} className={box('language')}>
          <option value="">{t('content.panel.fields.brand_language', "The brand's language")}</option>
          {languages.map(code => <option key={code} value={code}>{languageName(code, locale)}</option>)}
        </select>
      </FieldBox>
      <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
        <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.hook', 'Hook')} invalid={invalid.includes('hook')}>
        <textarea value={form.hook} rows={2} maxLength={500} onChange={(e) => set('hook', e.target.value)} aria-invalid={bad('hook')} className={box('hook')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.main_copy', 'Text')} invalid={invalid.includes('main_copy')}>
        <textarea value={form.main_copy} rows={8} maxLength={20000} onChange={(e) => set('main_copy', e.target.value)} aria-invalid={bad('main_copy')} className={box('main_copy')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.cta', 'Call to action')} invalid={invalid.includes('cta')}>
        <input value={form.cta} maxLength={255} onChange={(e) => set('cta', e.target.value)} aria-invalid={bad('cta')} className={box('cta')} />
      </FieldBox>
      <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
        hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')}>
        <input value={form.hashtags} onChange={(e) => set('hashtags', e.target.value)} aria-invalid={bad('hashtags')} className={box('hashtags')} />
      </FieldBox>
    </div>
  )
}
