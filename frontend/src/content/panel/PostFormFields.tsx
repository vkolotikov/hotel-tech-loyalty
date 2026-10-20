import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutTemplate } from 'lucide-react'
import { suggestedTimes } from '../lib/bestTimes'
import { LANGUAGES, languageName } from '../lib/languages'
import { Notice } from '../../workspace/ui/Notice'
import type { AudienceRef, Person, PillarRef, Platform, PostStatus, ShortLinkFacts, Snippet, Template } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
import { PosterSelect } from '../ui/PosterSelect'
import { InsertMenu } from './InsertMenu'
import { applyTemplate, blanksIn, replacesText } from './templateApply'
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'
import type { PostForm } from './panelState'
import { ShortLink } from './ShortLink'

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
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [], team = [], link = null }: {
  form: PostForm
  onChange: (form: PostForm) => void
  platforms: Platform[]
  statuses: PostStatus[]
  pillars: PillarRef[]
  audiences: AudienceRef[]
  published: boolean
  invalid: (keyof PostForm)[]
  locale: string
  /** The organisation's industry: the time field's suggested times follow it (spec 2026-10-15 §5). */
  industry: string | null
  /** The brand's hashtag groups and snippets (spec 2026-10-15 §6). */
  snippets: Snippet[]
  /** The brand's templates: the Template menu beside Topic (spec 2026-10-16 §5.3). */
  templates?: Template[]
  /** Who can post it (spec 2026-10-19 §4.1): the brand's team, the post's own poster kept (posterChoices). */
  team?: Person[]
  /** The saved post's short link (spec 2026-10-19 §5.5), shown under the Link field; null for a new post or one without. */
  link?: ShortLinkFacts | null
}) {
  const { t } = useTranslation()
  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => onChange({ ...form, [key]: value })
  const box = (key: keyof PostForm) => `${BOX} ${invalid.includes(key) ? 'border-a-danger' : 'border-a-border'}`
  const bad = (key: keyof PostForm) => invalid.includes(key) || undefined
  const languages: string[] = [...LANGUAGES]
  if (form.language !== '' && !languages.includes(form.language)) languages.push(form.language)
  const pillarKnown = form.pillar_id === '' || pillars.some(p => String(p.id) === form.pillar_id)
  const audienceKnown = form.audience_id === '' || audiences.some(a => String(a.id) === form.audience_id)
  const suggested = suggestedTimes(form.platform, industry)
  const groups = snippets.filter(s => s.kind === 'hashtags')
  const texts = snippets.filter(s => s.kind === 'text')
  const textRef = useRef<HTMLTextAreaElement>(null)
  const ctaRef = useRef<HTMLInputElement>(null)
  // Whether the person has put the cursor in the field: a snippet goes there, else at the end (read in the handler only).
  const placed = useRef({ main_copy: false, cta: false })
  const insertInto = (key: 'main_copy' | 'cta', el: HTMLTextAreaElement | HTMLInputElement | null, text: string) => {
    const cursor = el && placed.current[key] && el.selectionStart !== null && el.selectionEnd !== null ? { start: el.selectionStart, end: el.selectionEnd } : null
    const next = insertAt(form[key], text, cursor, key === 'main_copy')
    const max = key === 'main_copy' ? 20000 : 255
    set(key, next.value.slice(0, max))
    if (el) window.requestAnimationFrame(() => { el.focus(); el.setSelectionRange(Math.min(next.caret, max), Math.min(next.caret, max)) })
  }
  const tooMany = tooManyTags(form.platform, form.hashtags)
  // Spec 2026-10-16 §5.3: the blanks still to fill (a quiet line; it never stops a save).
  const blanks = blanksIn(form)
  const pickTemplate = (id: string) => {
    const template = templates.find(tpl => String(tpl.id) === id)
    if (!template) return
    if (replacesText(form, template) && !window.confirm(t('content.panel.template_replace', 'Replace the words already written with this template?'))) return
    onChange(applyTemplate(form, template, pillars))
  }

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
        <div className="min-w-0">
          <FieldBox label={t('content.panel.fields.time', 'Time')} invalid={invalid.includes('scheduled_time')}>
            <input type="time" value={form.scheduled_time} onChange={(e) => set('scheduled_time', e.target.value)} aria-invalid={bad('scheduled_time')} className={box('scheduled_time')} />
          </FieldBox>
          {suggested.length > 0 && (
            <div role="group" aria-label={t('content.panel.fields.time_suggested', 'Suggested times')} className="mt-1.5 flex flex-wrap gap-1">
              {suggested.map(time => (
                <button key={time} type="button" aria-pressed={form.scheduled_time === time} onClick={() => set('scheduled_time', time)}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${form.scheduled_time === time ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>{time}</button>
              ))}
            </div>
          )}
        </div>
        {/* After Date and Time, which sit side by side (5A-2 review). */}
        <FieldBox label={t('content.panel.fields.poster', 'Who posts it')} invalid={invalid.includes('poster_id')}>
          <PosterSelect value={form.poster_id} onChange={(value) => set('poster_id', value)} choices={team} invalid={bad('poster_id')} className={box('poster_id')} />
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
      <div className="relative">
        <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
          <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <PopMenu label={t('content.panel.template', 'Template')} onPick={pickTemplate}
            items={templates.map(tpl => ({ id: String(tpl.id), label: tpl.name, sub: [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : '', tpl.pillar_name ?? ''].filter(Boolean).join(' · ') || undefined }))}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
            <LayoutTemplate size={12} aria-hidden />{t('content.panel.template', 'Template')}
          </PopMenu>
        </div>
      </div>
      <FieldBox label={t('content.panel.fields.hook', 'Hook')} invalid={invalid.includes('hook')}>
        <textarea value={form.hook} rows={2} maxLength={500} onChange={(e) => set('hook', e.target.value)} aria-invalid={bad('hook')} className={box('hook')} />
      </FieldBox>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.main_copy', 'Text')} invalid={invalid.includes('main_copy')}>
          <textarea ref={textRef} value={form.main_copy} rows={8} maxLength={20000} onFocus={() => { placed.current.main_copy = true }}
            onChange={(e) => set('main_copy', e.target.value)} aria-invalid={bad('main_copy')} className={box('main_copy')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert_snippet', 'Insert snippet')} items={texts} onPick={(s) => insertInto('main_copy', textRef.current, s.body)} />
        </div>
      </div>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.cta', 'Call to action')} invalid={invalid.includes('cta')}>
          <input ref={ctaRef} value={form.cta} maxLength={255} onFocus={() => { placed.current.cta = true }}
            onChange={(e) => set('cta', e.target.value)} aria-invalid={bad('cta')} className={box('cta')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert_snippet', 'Insert snippet')} items={texts} onPick={(s) => insertInto('cta', ctaRef.current, s.body)} />
        </div>
      </div>
      <div className="space-y-2">
        <FieldBox label={t('content.panel.fields.link', 'Link')} invalid={invalid.includes('link')}
          hint={t('content.panel.fields.link_hint', 'Where readers should go. HexaTech makes a short link that counts clicks.')}>
          <input type="url" inputMode="url" value={form.link} maxLength={2000} placeholder="https://" onChange={(e) => set('link', e.target.value)}
            aria-invalid={bad('link')} className={box('link')} />
        </FieldBox>
        <ShortLink typed={form.link} link={link} />
      </div>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
          hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')}>
          <input value={form.hashtags} onChange={(e) => set('hashtags', e.target.value)} aria-invalid={bad('hashtags')} className={box('hashtags')} />
        </FieldBox>
        <div className="absolute right-0 top-0">
          <InsertMenu label={t('content.panel.insert', 'Insert')} items={groups} onPick={(s) => set('hashtags', insertHashtags(form.hashtags, s.body).value)} />
        </div>
      </div>
      {blanks.length > 0 && (
        <p data-blanks="" className="text-xs text-a-text-2">
          {t('content.panel.blanks', 'Blanks to fill: {{count}} — {{list}}', { count: blanks.length, list: blanks.join(', ') })}
        </p>
      )}
      {tooMany && (
        <Notice tone="warning">
          {t('content.panel.too_many_tags', '{{platform}} takes at most {{limit}} hashtags; this post has {{count}}.', { platform: t(`content.platform.${form.platform}`, form.platform), limit: tooMany.limit, count: tooMany.count })}
        </Notice>
      )}
    </div>
  )
}
