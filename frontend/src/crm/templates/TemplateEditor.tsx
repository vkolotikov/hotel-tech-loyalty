import { useMemo, useRef, useState, type FocusEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Code2, Crown, Eye, FilePlus2, LayoutTemplate, PencilLine, Save, Tags } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import type { EmailContent } from '../../lib/emailBuilder'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Confirm } from '../ui/Confirm'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { CONTROL, Select, TextArea, TextInput } from '../ui/inputs'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { PartCard, TipField, TipToggle } from '../settings/formKit'
import { Problem } from '../settings/parts'
import { BlockEditor, type ContentUpdate, type TagBinding } from './BlockEditor'
import { PreviewDialog } from './PreviewDialog'
import { MERGE_TAGS_KEY, TEMPLATES_KEY, templatesChanged } from './queries'
import {
  CATEGORIES, PRESETS, TEMPLATE_LIMITS, insertAt, needsStart, previewHtml, sameTemplate, startFrom, starterContent, switchMode, tagEntries,
  templateForm, templatePayload, templateProblems, type Category, type EmailTemplate, type StarterWords, type TemplateForm,
} from './templateLogic'

interface Target { el: HTMLInputElement | HTMLTextAreaElement; apply: (value: string) => void }

/**
 * The email-template editor (round 5; the full admin's EmailTemplates.tsx on the same endpoints and body): the name, the
 * category and the subject; the body in the designer's blocks (a blank page or one of the full admin's designs to start
 * from) or as HTML; the server's merge tags put where the cursor was in any text field; a live preview beside it (the
 * tags as written) and, once saved, the server's own preview with them filled. A manager's (`manage_templates`).
 */
export function TemplateEditor({ template, onClose, onSaved }: { template: EmailTemplate | null; onClose: () => void; onSaved: (id: number) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const isNew = template === null
  const saved = useMemo(() => templateForm(template), [template])
  const [form, setForm] = useState<TemplateForm>(saved)
  const [tried, setTried] = useState(false)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [leaving, setLeaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const target = useRef<Target | null>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const tags = useQuery({ queryKey: MERGE_TAGS_KEY, queryFn: () => get<{ tags: Record<string, string> }>('email-templates/merge-tags').then(r => tagEntries(r.tags)), staleTime: 600_000 })
  const dirty = isNew ? !needsStart(form) || form.name.trim() !== '' || form.subject.trim() !== '' : !sameTemplate(form, saved)
  const problems = templateProblems(form)
  const words: StarterWords = {
    heading: t('crm.templates.start.heading', 'Hello from {{hotel_name}}', { hotel_name: '{{hotel_name}}' }),
    text: t('crm.templates.start.text', 'Write your message here.'),
    button: t('crm.templates.start.button', 'Get in touch'),
    quote: t('crm.templates.start.quote', 'A line worth repeating.'),
    label: t('crm.templates.start.label', 'Caption'),
  }

  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const updateContent: ContentUpdate = fn => setForm(f => (f.content ? { ...f, content: fn(f.content) } : f))
  const bind: TagBinding = apply => ({ onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { target.current = { el: e.currentTarget, apply } } })
  const insertTag = (tag: string) => {
    const into = target.current?.el.isConnected ? target.current
      : subjectRef.current ? { el: subjectRef.current, apply: (v: string) => set('subject', v) } : null
    if (!into) return
    const { value, caret } = insertAt(into.el.value, into.el.selectionStart, into.el.selectionEnd, tag)
    into.apply(value)
    window.requestAnimationFrame(() => { into.el.focus(); into.el.setSelectionRange(caret, caret) })
  }

  const save = useMutation({
    mutationFn: () => isNew
      ? send<{ template: EmailTemplate }>('post', 'email-templates', templatePayload(form, true))
      : send<{ template: EmailTemplate }>('put', `email-templates/${template.id}`, templatePayload(form, false)),
    onSuccess: answer => {
      const fresh = answer?.template
      if (fresh) qc.setQueryData<EmailTemplate[]>(TEMPLATES_KEY, old => [fresh, ...(old ?? []).filter(x => x.id !== fresh.id)])
      templatesChanged(qc)
      say(isNew ? t('crm.templates.created', 'Template made.') : t('crm.common.saved', 'Saved'))
      if (isNew && fresh?.id) onSaved(fresh.id)
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const submit = () => { setTried(true); if (problems.length === 0) save.mutate() }
  const back = () => (dirty ? setLeaving(true) : onClose())
  const start = (content: EmailContent, preset?: (typeof PRESETS)[number]) => { setForm(f => startFrom(f, content, preset)); setRestarting(false) }
  const categoryNames: Record<Category, string> = {
    campaign: t('crm.templates.category.campaign', 'Campaign'),
    transactional: t('crm.templates.category.transactional', 'Transactional'),
    welcome: t('crm.templates.category.welcome', 'Welcome'),
  }
  const showStart = needsStart(form) || restarting

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={ArrowLeft} label={t('crm.templates.back', 'Back to the templates')} onClick={back} />
        <h2 className="min-w-0 flex-1 truncate font-a-display text-xl text-a-text">{isNew ? t('crm.templates.new', 'New template') : (form.name.trim() || template.name)}</h2>
        {!isNew && <Button variant="secondary" size="sm" onClick={() => setPreviewing(true)}><Eye size={14} aria-hidden />{t('crm.templates.preview', 'Preview')}</Button>}
        <Button size="sm" onClick={submit} loading={save.isPending} disabled={!dirty}><Save size={14} aria-hidden />{t('crm.common.save', 'Save')}</Button>
      </div>

      <PartCard>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <div>
            <TipField label={t('crm.templates.name', 'Name')} tip={t('crm.templates.name_tip', 'Only your team sees it, when choosing a template.')}>
              {id => <TextInput id={id} value={form.name} maxLength={TEMPLATE_LIMITS.name} placeholder={t('crm.templates.name_placeholder', 'e.g. Quote follow-up')} onChange={e => set('name', e.target.value)} />}
            </TipField>
            {tried && problems.includes('name') && <Problem>{t('crm.templates.name_required', 'Give the template a name.')}</Problem>}
          </div>
          <TipField label={t('crm.templates.category_label', 'Category')}>
            {id => (
              <Select id={id} value={form.category} onChange={e => set('category', e.target.value as Category)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{categoryNames[c]}</option>)}
              </Select>
            )}
          </TipField>
        </div>
        <div>
          <TipField label={t('crm.templates.subject', 'Subject')}>
            {id => <input id={id} ref={subjectRef} className={CONTROL} value={form.subject} maxLength={TEMPLATE_LIMITS.subject} placeholder={t('crm.templates.subject_placeholder', 'e.g. Your quote from {{hotel_name}}', { hotel_name: '{{hotel_name}}' })}
              {...bind(v => set('subject', v))} onChange={e => set('subject', e.target.value)} />}
          </TipField>
          {tried && problems.includes('subject') && <Problem>{t('crm.templates.subject_required', 'Write a subject.')}</Problem>}
        </div>
        {!isNew && (
          <TipToggle label={t('crm.templates.in_use', 'In use')} checked={form.is_active} onChange={on => set('is_active', on)}
            tip={t('crm.templates.in_use_tip', 'Switched off, nobody can send it.')} />
        )}
      </PartCard>

      {(tags.data ?? []).length > 0 && (
        <div className="z-10 rounded-2xl border border-a-border bg-a-surface/95 px-3 py-2 shadow-a-sm backdrop-blur lg:sticky lg:top-2">
          {/* One sideways strip on a phone; on a wide screen the tags wrap and stay in view while the body is written. */}
          <div role="group" aria-label={t('crm.templates.tags', 'Merge tags')} className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            <Tags size={15} aria-hidden className="shrink-0 text-a-text-2" />
            <InfoTip text={t('crm.templates.tags_tip', 'Click a tag to put it where your cursor is. It is filled in when the email is sent.')} />
            {(tags.data ?? []).map(entry => (
              <button key={entry.tag} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertTag(entry.tag)}
                title={entry.member ? `${entry.description} · ${t('crm.templates.members_tip', 'It uses a member\'s tags, so it goes only to contacts who are loyalty members.')}` : entry.description}
                aria-label={t('crm.templates.insert_tag', 'Insert {{tag}}', { tag: entry.tag })}
                className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 font-a-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${entry.member ? 'border-a-st-pending/40 text-a-st-pending hover:bg-a-st-pending/10' : 'border-a-accent/40 text-a-accent-text hover:bg-a-accent/10'}`}>
                {entry.member && <Crown size={11} aria-hidden />}{entry.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showStart ? (
        <StartPicker words={words} onPick={start} onCancel={restarting ? () => setRestarting(false) : undefined} />
      ) : (
        <>
          <div className="lg:hidden">
            <Tabs label={t('crm.templates.view', 'View')} value={view} onChange={setView}
              items={[{ key: 'edit', label: t('crm.templates.view_edit', 'Edit') }, { key: 'preview', label: t('crm.templates.live', 'Live preview') }]} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
            <div className={`min-w-0 space-y-3 ${view === 'preview' ? 'hidden lg:block' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                {form.content ? (
                  <Tabs label={t('crm.templates.body_mode', 'How the body is written')} value={form.mode} onChange={mode => setForm(f => switchMode(f, mode))}
                    items={[{ key: 'design', label: t('crm.templates.mode_design', 'Design') }, { key: 'html', label: t('crm.templates.mode_html', 'HTML') }]} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-a-text-2"><Code2 size={15} aria-hidden />{t('crm.templates.mode_html', 'HTML')}</span>
                )}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRestarting(true)}><LayoutTemplate size={14} aria-hidden />{t('crm.templates.restart', 'Start from a design')}</Button>
              </div>
              {form.mode === 'design' && form.content
                ? <BlockEditor content={form.content} update={updateContent} bind={bind} words={words} />
                : (
                  <div>
                    <label className="block">
                      <span className="sr-only">{t('crm.templates.html', 'The email as HTML')}</span>
                      <TextArea rows={20} spellCheck={false} value={form.html} className="font-a-mono text-xs leading-relaxed"
                        {...bind(v => set('html', v))} onChange={e => set('html', e.target.value)} />
                    </label>
                    {form.content && <p className="mt-1 text-xs text-a-st-pending">{t('crm.templates.html_warning', 'Saved from here, the design view is not kept.')}</p>}
                    {tried && problems.includes('body') && <Problem>{t('crm.templates.body_required', 'Write the email.')}</Problem>}
                  </div>
                )}
            </div>
            <div className={`min-w-0 space-y-2 lg:sticky lg:top-20 ${view === 'edit' ? 'hidden lg:block' : ''}`}>
              <div className="flex items-center gap-1.5 px-1">
                <Eye size={15} aria-hidden className="text-a-text-2" />
                <p className="text-sm font-semibold text-a-text">{t('crm.templates.live', 'Live preview')}</p>
                <InfoTip text={t('crm.templates.live_tip', 'Tags show as written. Preview, once saved, fills them in.')} align="right" />
              </div>
              <iframe title={t('crm.templates.live', 'Live preview')} srcDoc={previewHtml(form)} sandbox=""
                className="h-[70vh] w-full rounded-2xl border border-a-border bg-a-surface-2" />
            </div>
          </div>
        </>
      )}

      {previewing && template && <PreviewDialog template={template} changed={dirty} onClose={() => setPreviewing(false)} />}
      {leaving && (
        <Confirm title={t('crm.templates.leave_title', 'Leave without saving?')} confirm={t('crm.templates.leave', 'Leave')}
          onConfirm={() => { setLeaving(false); onClose() }} onClose={() => setLeaving(false)}>
          {t('crm.templates.leave_line', 'Your changes to this template are lost.')}
        </Confirm>
      )}
    </div>
  )
}

/** Where a new body starts: a blank page of our own, or one of the full admin's designs (their colours drawn as they are). */
function StartPicker({ words, onPick, onCancel }: { words: StarterWords; onPick: (content: EmailContent, preset?: (typeof PRESETS)[number]) => void; onCancel?: () => void }) {
  const { t } = useTranslation()
  const blank = () => onPick(starterContent({ ...words, footer: t('crm.templates.start.footer', '© {{current_year}} {{hotel_name}}', { current_year: '{{current_year}}', hotel_name: '{{hotel_name}}' }) }))
  return (
    <PartCard>
      <div className="flex flex-wrap items-center gap-2">
        <PencilLine size={15} aria-hidden className="text-a-text-2" />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-a-text">{t('crm.templates.start_title', 'Start from')}</h3>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>{t('crm.common.cancel', 'Cancel')}</Button>}
      </div>
      {onCancel && <p className="text-xs text-a-st-pending">{t('crm.templates.restart_warning', 'Picking one replaces the body you have now.')}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <button type="button" onClick={blank}
          className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-a-border bg-a-surface p-3 text-sm font-medium text-a-text transition-colors hover:border-a-accent/60 focus-visible:outline-2 focus-visible:outline-a-accent">
          <FilePlus2 size={20} aria-hidden className="text-a-accent-text" />{t('crm.templates.blank', 'Blank page')}
        </button>
        {PRESETS.map(preset => {
          const p = preset.content.palette
          return (
            <button key={preset.id} type="button" onClick={() => onPick(preset.content, preset)}
              className="overflow-hidden rounded-xl border border-a-border bg-a-surface text-left transition-colors hover:border-a-accent/60 focus-visible:outline-2 focus-visible:outline-a-accent">
              <span aria-hidden className="block p-2" style={{ background: p.page }}>
                <span className="block overflow-hidden rounded-md" style={{ background: p.surface }}>
                  <span className="block h-4" style={{ background: p.headerBg }} />
                  <span className="mx-2 mt-2 block h-1.5 w-3/4 rounded-full" style={{ background: p.text, opacity: 0.6 }} />
                  <span className="mx-2 mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: p.muted, opacity: 0.6 }} />
                  <span className="mx-auto my-2 block h-3 w-1/3 rounded" style={{ background: p.accent }} />
                </span>
              </span>
              <span className="block truncate px-2.5 py-2 text-sm font-medium text-a-text">{preset.name}</span>
            </button>
          )
        })}
      </div>
    </PartCard>
  )
}
