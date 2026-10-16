import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, Template, TemplateSuggestion } from '../../lib/types'
import { useActiveStrategy } from '../../lib/useActiveStrategy'
import { INPUT, TextField } from '../inputs'
import { MAX_TEMPLATES, removeTemplate, saveTemplate, TEMPLATE_MAX, templateForm, templateProblem, templatesOf, type TemplateForm } from '../templateActions'
import { useBrand } from '../useBrand'

/**
 * One template being written (spec 2026-10-16 §5.1): its name, an optional platform and pillar (kept by name), and the
 * post's words with [blanks]. Save checks the name and the hashtags first. Also "Save as template" in the post panel.
 */
export function TemplateEditor({ template, initial, onDone }: { template: Template | null; initial?: TemplateForm; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { setTemplates } = useBrand()
  const { strategy } = useActiveStrategy()
  const pillars = (strategy?.pillars ?? []).filter(p => p.active).map(p => p.name)
  const [form, setForm] = useState<TemplateForm>(() => initial ?? templateForm(template))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.templates.${key}`, english)
  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm({ ...form, [key]: value })
  const fail = (code: string) => {
    const [key, text] = errorKey('template', code)
    setError(t(key, text))
  }

  const save = async () => {
    const problem = templateProblem(form)
    if (problem) {
      fail(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveTemplate({ api, setTemplates }, template, form)
      onDone()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-a-border p-3">
      <TextField label={w('name', 'Name')} value={form.name} maxLength={TEMPLATE_MAX.name} required onChange={(name) => set('name', name)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('platform', 'Platform')}</span>
          <select value={form.platform} onChange={(e) => set('platform', e.target.value as TemplateForm['platform'])} className={`${INPUT} border-a-border`}>
            <option value="">{w('any_platform', 'Any platform')}</option>
            {boot.platforms.map(p => <option key={p} value={p}>{t(`content.platform.${p}`, p)}</option>)}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('pillar', 'Pillar')}</span>
          <select value={form.pillar_name} onChange={(e) => set('pillar_name', e.target.value)} className={`${INPUT} border-a-border`}>
            <option value="">{t('content.panel.fields.none', 'None')}</option>
            {pillars.map(name => <option key={name} value={name}>{name}</option>)}
            {form.pillar_name !== '' && !pillars.includes(form.pillar_name) && <option value={form.pillar_name}>{form.pillar_name}</option>}
          </select>
        </label>
      </div>
      <TextField label={t('content.panel.fields.topic', 'Topic')} value={form.topic} maxLength={TEMPLATE_MAX.topic} onChange={(v) => set('topic', v)} />
      <TextField label={t('content.panel.fields.hook', 'Hook')} value={form.hook} maxLength={TEMPLATE_MAX.hook} rows={2} onChange={(v) => set('hook', v)} />
      <TextField label={t('content.panel.fields.main_copy', 'Text')} value={form.main_copy} maxLength={TEMPLATE_MAX.main_copy} rows={4} onChange={(v) => set('main_copy', v)} />
      <TextField label={t('content.panel.fields.cta', 'Call to action')} value={form.cta} maxLength={TEMPLATE_MAX.cta} onChange={(v) => set('cta', v)} />
      <TextField label={t('content.panel.fields.hashtags', 'Hashtags')} value={form.hashtags} maxLength={3000} rows={2}
        hint={t('content.panel.fields.hashtags_hint', 'Separate them with spaces or commas.')} onChange={(v) => set('hashtags', v)} />
      <p className="text-xs text-a-text-2">{w('blanks_hint', 'Words in [square brackets] are blanks to fill, such as [treatment] or [date].')}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onDone}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}

/** The AI's templates for this brand (one call, nothing saved until Add), each with blanks (spec §5.2). */
function TemplateSuggestions({ full }: { full: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { setTemplates } = useBrand()
  const [items, setItems] = useState<TemplateSuggestion[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const w = (key: string, english: string) => t(`content.brand.templates.${key}`, english)
  const fail = (e: unknown) => {
    const [key, text] = errorKey('template', failureOf(e).code)
    setError(t(key, text))
  }

  const ask = async () => {
    setBusy('ask')
    setError(null)
    try {
      setItems((await api.suggestTemplates()).suggestions)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  const add = async (item: TemplateSuggestion, key: string) => {
    setBusy(key)
    setError(null)
    try {
      await saveTemplate({ api, setTemplates }, null, templateForm(item))
      setItems(list => (list ?? []).filter(s => s !== item))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-a-border p-3">
      <Button size="sm" variant="secondary" loading={busy === 'ask'} disabled={paused || busy !== null} onClick={() => { void ask() }}>
        <Sparkles size={14} aria-hidden />{w('suggest', 'Suggest templates with AI')}
      </Button>
      {paused && <p className="text-xs text-a-text-2">{t('content.template.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {items !== null && items.length === 0 && <p className="text-sm text-a-text-2">{w('no_suggestions', 'No more suggestions. Ask again for new ones.')}</p>}
      {items?.map((item, i) => {
        const key = `${i}:${item.name}`
        return (
          <div key={key} className="flex flex-wrap items-start gap-3 rounded-lg bg-a-surface-2 p-2.5">
            <div className="min-w-0 grow basis-48">
              <p className="text-sm font-semibold text-a-text">{item.name}</p>
              <p className="break-words text-xs text-a-text-2">{item.hook ?? item.topic ?? item.main_copy ?? ''}</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy === key} disabled={full || (busy !== null && busy !== key)} onClick={() => { void add(item, key) }}>
              {w('add_suggestion', 'Add')}
            </Button>
          </div>
        )
      })}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/**
 * Templates (spec 2026-10-16 §5.2): posts the team writes again and again, with [blanks]. Everyone reads the list (name,
 * platform, pillar); managers add, edit and remove them, and ask the AI for some.
 */
export function TemplatesSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const { setTemplates } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = templatesOf(brand)
  const full = list.length >= MAX_TEMPLATES
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.brand.templates.${key}`, english, vars)
  const sub = (tpl: Template) =>
    [tpl.platform ? t(`content.platform.${tpl.platform}`, tpl.platform) : w('any_platform', 'Any platform'), tpl.pillar_name].filter(Boolean).join(' · ')

  const remove = async (tpl: Template) => {
    if (!window.confirm(w('remove_confirm', 'Remove “{{name}}”?', { name: tpl.name }))) return
    setError(null)
    try {
      await removeTemplate({ api, setTemplates }, tpl.id)
    } catch (e) {
      const [key, text] = errorKey('template', failureOf(e).code)
      setError(t(key, text))
    }
  }

  return (
    <section aria-labelledby="content-templates" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 grow basis-48 space-y-0.5">
          <h2 id="content-templates" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Templates')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Posts your team writes again and again, with [blanks] to fill. Use one from a day’s + menu or from the post panel.')}</p>
        </div>
        {canEdit && open !== 'new' && (
          <Button size="sm" variant="secondary" disabled={full} onClick={() => setOpen('new')}>
            <Plus size={14} aria-hidden />{w('add', 'Add a template')}
          </Button>
        )}
      </div>
      {canEdit && full && <p className="text-xs text-a-text-2">{t('content.template.error.too_many_templates', 'A brand keeps at most 100 templates. Remove one first.')}</p>}
      {open === 'new' && <TemplateEditor template={null} onDone={() => setOpen(null)} />}
      {list.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No templates yet.')}</p>}
      <ul className="space-y-2">
        {list.map(tpl => (
          <li key={tpl.id}>
            {open === tpl.id
              ? <TemplateEditor template={tpl} onDone={() => setOpen(null)} />
              : (
                <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border p-3">
                  <div className="min-w-0 grow basis-48">
                    <p className="truncate text-sm font-semibold text-a-text">{tpl.name}</p>
                    <p className="truncate text-xs text-a-text-2">{sub(tpl)}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(tpl.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { void remove(tpl) }}>{w('remove', 'Remove')}</Button>
                    </div>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {canEdit && <TemplateSuggestions full={full} />}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
