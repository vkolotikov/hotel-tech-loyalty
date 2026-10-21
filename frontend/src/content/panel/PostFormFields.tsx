import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Hash, Layers, LayoutTemplate, Link2, Target } from 'lucide-react'
import { suggestedTimes } from '../lib/bestTimes'
import { LANGUAGES, languageName } from '../lib/languages'
import { Notice } from '../../workspace/ui/Notice'
import type { AudienceRef, Person, PillarRef, Platform, PostStatus, ShortLinkFacts, Snippet, Template } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
import { PosterSelect } from '../ui/PosterSelect'
import { InsertMenu } from './InsertMenu'
import { applyTemplate, blanksIn, replacesText } from './templateApply'
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'
import { FoldSection } from './FoldSection'
import { hookRows } from './panelMath'
import type { PostForm } from './panelState'
import { ShortLink } from './ShortLink'
import { TextToolbar } from './TextToolbar'
import { spacedWord, type InsertMode } from './toolbarMath'

const BOX = 'w-full rounded-lg border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2 disabled:text-a-text-2'
/** The fields under "Targeting & language": a refused save naming one opens the section. */
const TARGETING: (keyof PostForm)[] = ['platform', 'pillar_id', 'audience_id', 'language', 'topic']

/** A labelled field; a field a refused save named says so under it. */
function FieldBox({ label, hint, invalid, caps = false, children }: { label: string; hint?: string; invalid: boolean; caps?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <label className="block min-w-0">
      <span className={`mb-1 block text-xs font-medium text-a-text-2 ${caps ? 'font-a-mono uppercase tracking-[0.12em]' : ''}`}>{label}</span>
      {children}
      {invalid
        ? <span className="mt-1 block text-xs text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</span>
        : hint ? <span className="mt-1 block text-xs text-a-text-2">{hint}</span> : null}
    </label>
  )
}

/**
 * The post's fields, in the Content tab's order (spec 2026-10-21 §7.4): the hook as the large line, the day and time, the
 * status and who posts it, the text, the call to action with its destination, then the folding sections. A published
 * post keeps its day: the day is the record of when it went out.
 */
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [], team = [], link = null, afterStatus = null, versions = null }: {
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
  /** The progress actions, right under Status · Who posts it (spec 2026-10-21 §7.4 item 8). */
  afterStatus?: ReactNode
  /** The saved post's Versions and Repeat sections, in their folding section; null for a new post. */
  versions?: ReactNode
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
  const linkRef = useRef<HTMLInputElement>(null)
  // "Add destination URL" opens the Link field in place; a post with a link (or a refused one) shows it at once.
  const [linkOpen, setLinkOpen] = useState(false)
  const showLink = linkOpen || form.link !== '' || invalid.includes('link')
  const textId = useId()
  // The toolbar's hashtag group fills the Hashtags field, in its folding section: each one opens the section to show it.
  const [tagsAdded, setTagsAdded] = useState(0)
  const addTags = (group: string) => {
    set('hashtags', insertHashtags(form.hashtags, group).value)
    setTagsAdded(n => n + 1)
  }
  const openLink = () => {
    setLinkOpen(true)
    window.requestAnimationFrame(() => linkRef.current?.focus())
  }
  // Whether the person has put the cursor in the field: a snippet goes there, else at the end (read in the handler only).
  const placed = useRef({ main_copy: false, cta: false })
  // A snippet without a cursor goes on a line of its own at the end of the text; an emoji or a link after a space. A link at
  // the cursor gets a space on each side where the text has none.
  const insertInto = (key: 'main_copy' | 'cta', el: HTMLTextAreaElement | HTMLInputElement | null, text: string, mode: InsertMode = 'block') => {
    const cursor = el && placed.current[key] && el.selectionStart !== null && el.selectionEnd !== null ? { start: el.selectionStart, end: el.selectionEnd } : null
    const put = cursor && mode === 'word' ? spacedWord(form[key], cursor.start, cursor.end, text) : text
    const next = insertAt(form[key], put, cursor, key === 'main_copy' && mode === 'block')
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
    <div className="space-y-4">
      <FieldBox label={t('content.panel.hook_label', 'Post hook')} caps invalid={invalid.includes('hook')}>
        <textarea value={form.hook} rows={hookRows(form.hook)} maxLength={500} onChange={(e) => set('hook', e.target.value)} aria-invalid={bad('hook')}
          placeholder={t('content.panel.hook_placeholder', 'Write the first line people see')}
          className={`block w-full resize-none rounded-lg border bg-transparent py-1 c-hook font-a-display text-[26px] leading-tight text-a-text [field-sizing:content] placeholder:text-a-text-2 ${invalid.includes('hook') ? 'border-a-danger px-2' : 'border-transparent px-0 focus:px-2'}`} />
      </FieldBox>
      <div className="grid grid-cols-2 gap-3">
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
        <FieldBox label={t('content.panel.fields.status', 'Status')} invalid={invalid.includes('status')}>
          <select value={form.status} onChange={(e) => set('status', e.target.value as PostStatus)} aria-invalid={bad('status')} className={box('status')}>
            {statuses.map(s => <option key={s} value={s}>{t(`content.status.${s}`, s)}</option>)}
          </select>
        </FieldBox>
        <FieldBox label={t('content.panel.fields.poster', 'Who posts it')} invalid={invalid.includes('poster_id')}>
          <PosterSelect value={form.poster_id} onChange={(value) => set('poster_id', value)} choices={team} invalid={bad('poster_id')} className={box('poster_id')} />
        </FieldBox>
      </div>
      {afterStatus}
      <div className="min-w-0">
        <label htmlFor={textId} className="mb-1 block text-xs font-medium text-a-text-2">{t('content.panel.post_text', 'Post text')}</label>
        <TextToolbar onInsert={(text, mode) => insertInto('main_copy', textRef.current, text, mode)}
          shortUrl={link && link.on ? link.short_url : null} typedLink={form.link} snippets={texts} groups={groups} onHashtags={addTags} />
        <textarea id={textId} ref={textRef} value={form.main_copy} rows={8} maxLength={20000} onFocus={() => { placed.current.main_copy = true }}
          onChange={(e) => set('main_copy', e.target.value)} aria-invalid={bad('main_copy')} className={`${box('main_copy')} block rounded-t-none`} />
        {invalid.includes('main_copy') && <span className="mt-1 block text-xs text-a-danger">{t('content.panel.field_invalid', 'Check this field.')}</span>}
      </div>
      {blanks.length > 0 && (
        <p data-blanks="" className="text-xs text-a-text-2">
          {t('content.panel.blanks', 'Blanks to fill: {{count}} — {{list}}', { count: blanks.length, list: blanks.join(', ') })}
        </p>
      )}
      <div className="space-y-2">
        <div className="relative">
          <FieldBox label={t('content.panel.fields.cta', 'Call to action')} invalid={invalid.includes('cta')}>
            <input ref={ctaRef} value={form.cta} maxLength={255} onFocus={() => { placed.current.cta = true }}
              onChange={(e) => set('cta', e.target.value)} aria-invalid={bad('cta')} className={box('cta')} />
          </FieldBox>
          <div className="absolute right-0 top-0">
            <InsertMenu label={t('content.panel.insert_snippet', 'Insert snippet')} items={texts} onPick={(s) => insertInto('cta', ctaRef.current, s.body)} />
          </div>
        </div>
        {showLink ? (
          <div className="space-y-2">
            <FieldBox label={t('content.panel.fields.link', 'Link')} invalid={invalid.includes('link')}
              hint={t('content.panel.fields.link_hint', 'Where readers should go. HexaTech makes a short link that counts clicks.')}>
              <input ref={linkRef} type="url" inputMode="url" value={form.link} maxLength={2000} placeholder="https://" onFocus={() => setLinkOpen(true)} onChange={(e) => { setLinkOpen(true); set('link', e.target.value) }}
                aria-invalid={bad('link')} className={box('link')} />
            </FieldBox>
            <ShortLink typed={form.link} link={link} />
          </div>
        ) : (
          <button type="button" data-add-link="" onClick={openLink}
            className="inline-flex items-center gap-1.5 rounded-md py-0.5 text-sm font-medium text-a-accent-text hover:underline">
            <Link2 size={14} aria-hidden />{t('content.panel.add_link', 'Add destination URL')}
          </button>
        )}
      </div>
      <div>
        <FoldSection id="targeting" icon={Target} title={t('content.panel.fold_targeting', 'Targeting & language')}
          alert={TARGETING.some(k => invalid.includes(k))}>
          <div className="grid grid-cols-2 gap-3">
            <FieldBox label={t('content.panel.fields.platform', 'Platform')} invalid={invalid.includes('platform')}>
              <select value={form.platform} onChange={(e) => set('platform', e.target.value as Platform)} aria-invalid={bad('platform')} className={box('platform')}>
                {platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
              </select>
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
            <FieldBox label={t('content.panel.fields.language', 'Language')} invalid={invalid.includes('language')}>
              <select value={form.language} onChange={(e) => set('language', e.target.value)} aria-invalid={bad('language')} className={box('language')}>
                <option value="">{t('content.panel.fields.brand_language', "The brand's language")}</option>
                {languages.map(code => <option key={code} value={code}>{languageName(code, locale)}</option>)}
              </select>
            </FieldBox>
          </div>
          <div className="relative">
            <FieldBox label={t('content.panel.fields.topic', 'Topic')} invalid={invalid.includes('topic')}>
              <input value={form.topic} maxLength={255} onChange={(e) => set('topic', e.target.value)} aria-invalid={bad('topic')} className={box('topic')} />
            </FieldBox>
            <div className="absolute right-0 top-0">
              <PopMenu label={t('content.panel.template', 'Template')} onPick={pickTemplate}
                items={templates.map(tpl => ({ id: String(tpl.id), label: tpl.name, sub: [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : '', tpl.pillar_name ?? ''].filter(Boolean).join(' · ') || undefined }))}
                className="inline-flex min-h-6 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
                <LayoutTemplate size={12} aria-hidden />{t('content.panel.template', 'Template')}
              </PopMenu>
            </div>
          </div>
        </FoldSection>
        <FoldSection id="links" icon={Hash} title={t('content.panel.fold_links', 'Link & hashtags')} alert={invalid.includes('hashtags') || tooMany !== null} reveal={tagsAdded}>
          <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
            hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')}>
            <input value={form.hashtags} onChange={(e) => set('hashtags', e.target.value)} aria-invalid={bad('hashtags')} className={box('hashtags')} />
          </FieldBox>
          {tooMany && (
            <Notice tone="warning">
              {t('content.panel.too_many_tags', '{{platform}} takes at most {{limit}} hashtags; this post has {{count}}.', { platform: t(`content.platform.${form.platform}`, form.platform), limit: tooMany.limit, count: tooMany.count })}
            </Notice>
          )}
        </FoldSection>
        <FoldSection id="versions" icon={Layers} title={t('content.panel.fold_versions', 'Versions & repeat')}>
          {versions ?? <p className="text-xs text-a-text-2">{t('content.panel.create_first', 'Create the post first to use this.')}</p>}
        </FoldSection>
      </div>
    </div>
  )
}
