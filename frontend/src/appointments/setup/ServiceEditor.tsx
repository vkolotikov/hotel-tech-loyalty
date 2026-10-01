import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { Impact, ServiceBody, SetupPayload, SetupService, SetupTeamMember } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { linkOf } from './links'

export interface ServiceDraft {
  name: string; category_id: number | null; duration: string; buffer: string; price: string
  short_description: string; is_active: boolean
  performers: Record<number, { on: boolean; duration: string; price: string }>
}

// eslint-disable-next-line react-refresh/only-export-components
export function draftOf(service: SetupService | null, team: SetupTeamMember[]): ServiceDraft {
  const performers: ServiceDraft['performers'] = {}
  for (const member of team) {
    const link = service?.performers.find(p => p.id === member.id)
    performers[member.id] = {
      on: link !== undefined,
      duration: link?.duration_minutes != null ? String(link.duration_minutes) : '',
      price: link?.price != null ? String(link.price) : '',
    }
  }
  return {
    name: service?.name ?? '', category_id: service?.category_id ?? null,
    duration: String(service?.duration_minutes ?? 60), buffer: String(service?.buffer_after_minutes ?? 0),
    price: service ? String(service.price) : '', short_description: service?.short_description ?? '',
    is_active: service?.is_active ?? true, performers,
  }
}

const numberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

// eslint-disable-next-line react-refresh/only-export-components
export function bodyOf(draft: ServiceDraft): ServiceBody {
  return {
    name: draft.name.trim(),
    category_id: draft.category_id,
    duration_minutes: Number(draft.duration),
    buffer_after_minutes: Number(draft.buffer || 0),
    price: Number(draft.price || 0),
    short_description: draft.short_description.trim() || null,
    is_active: draft.is_active,
    performers: Object.entries(draft.performers)
      .filter(([, p]) => p.on)
      .map(([id, p]) => ({ id: Number(id), duration_minutes: numberOrNull(p.duration), price: numberOrNull(p.price) })),
  }
}

/**
 * Save a service from the editor's draft; true when saved, false when the
 * person went back from the conflict dialog. A new category is created once
 * and its id handed back at once (onCategoryCreated), so going back, or a
 * save that fails, never creates the same category a second time.
 */
// eslint-disable-next-line react-refresh/only-export-components
export async function saveServiceDraft(
  service: SetupService | null,
  draft: ServiceDraft,
  newCategory: string | null,
  confirm: (impact: Impact) => Promise<boolean>,
  onCategoryCreated: (id: number) => void,
): Promise<boolean> {
  let categoryId = draft.category_id
  if (newCategory !== null && newCategory.trim() !== '') {
    categoryId = (await appointmentsApi.createCategory(newCategory.trim())).category.id
    onCategoryCreated(categoryId)
  }
  const body = { ...bodyOf(draft), category_id: categoryId }
  if (service === null) {
    await appointmentsApi.createService(body)
    return true
  }
  return (await previewThenSave(dryRun => appointmentsApi.updateService(service.id, body, dryRun), confirm)) !== null
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'

/** A service in the right-hand panel: the booking fields, who performs it, and a link to the full admin for the rest. */
export function ServiceEditor({ service, data, onClose, onSaved }: { service: SetupService | null; data: SetupPayload; onClose: () => void; onSaved: () => void }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const heading = useRef<HTMLHeadingElement>(null)
  const [draft, setDraft] = useState(() => draftOf(service, data.team))
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const { dialog, confirm } = useConflictConfirm(i18n.language || 'en')
  const readOnly = !data.can_manage
  const set = (patch: Partial<ServiceDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setPerformer = (id: number, patch: Partial<ServiceDraft['performers'][number]>) =>
    setDraft(d => ({ ...d, performers: { ...d.performers, [id]: { ...linkOf(d.performers, id), ...patch } } }))

  useEffect(() => { heading.current?.focus() }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFailure(null)
    try {
      const saved = await saveServiceDraft(service, draft, newCategory, confirm, (id) => {
        set({ category_id: id })
        setNewCategory(null)
      })
      if (saved) onSaved()
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="service-editor-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[440px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-5 py-4">
        <h2 id="service-editor-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text">
          {service ? t('appointments.setup.services.edit', 'Edit service') : t('appointments.setup.services.new', 'New service')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('appointments.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>
      <form onSubmit={save} className="space-y-4 px-5 py-4">
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label={t('appointments.setup.services.name', 'Name')}>
            <input required value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} />
          </Field>
          <Field label={t('appointments.setup.services.category', 'Category')}>
            <select value={newCategory !== null ? 'new' : draft.category_id ?? ''} className={input}
              onChange={(e) => {
                if (e.target.value === 'new') { setNewCategory('') } else { setNewCategory(null); set({ category_id: e.target.value ? Number(e.target.value) : null }) }
              }}>
              <option value="">{t('appointments.setup.services.no_category_option', 'No category')}</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">{t('appointments.setup.services.new_category', 'New category…')}</option>
            </select>
          </Field>
          {newCategory !== null && (
            <Field label={t('appointments.setup.services.category_name', 'New category name')}>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={input} />
            </Field>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('appointments.setup.services.duration', 'Duration (minutes)')}>
              <input type="number" min={5} max={1440} required value={draft.duration} onChange={(e) => set({ duration: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.services.buffer', 'Break after (minutes)')}>
              <input type="number" min={0} max={240} value={draft.buffer} onChange={(e) => set({ buffer: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.services.price', 'Price')}>
              <input type="number" min={0} step="0.01" required value={draft.price} onChange={(e) => set({ price: e.target.value })} className={input} />
            </Field>
          </div>
          <Field label={t('appointments.setup.services.short_description', 'Short description')}>
            <input value={draft.short_description} maxLength={500} onChange={(e) => set({ short_description: e.target.value })} className={input} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-a-text">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            {t('appointments.setup.active', 'Active')}
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.services.performers', 'Who performs it')}</legend>
            {data.team.map(member => {
              const p = linkOf(draft.performers, member.id)
              return (
                <div key={member.id} className="rounded-lg border border-a-border px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-a-text">
                    <input type="checkbox" checked={p.on} onChange={(e) => setPerformer(member.id, { on: e.target.checked })} />
                    {member.name}{!member.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                  </label>
                  {p.on && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label={t('appointments.setup.services.own_duration', 'Own minutes')}>
                        <input type="number" min={5} max={1440} value={p.duration} onChange={(e) => setPerformer(member.id, { duration: e.target.value })} className={input} />
                      </Field>
                      <Field label={t('appointments.setup.services.own_price', 'Own price')}>
                        <input type="number" min={0} step="0.01" value={p.price} onChange={(e) => setPerformer(member.id, { price: e.target.value })} className={input} />
                      </Field>
                    </div>
                  )}
                </div>
              )
            })}
            {data.team.length === 0 && <p className="text-sm text-a-text-2">{vocab('team_member')}: {t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
          </fieldset>
        </fieldset>

        <p className="text-xs text-a-text-2">
          {t('appointments.setup.services.full_admin', 'Photos, gallery and the long description are edited in the full admin.')}{' '}
          <Link to="/services" className="font-semibold text-a-accent-deep underline">{t('appointments.setup.services.full_admin_link', 'Open in the full admin')}</Link>
        </p>
        <FailureNotice failure={failure} />
        {!readOnly && (
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>{t('appointments.setup.save', 'Save')}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>{t('appointments.common.cancel', 'Cancel')}</Button>
          </div>
        )}
      </form>
      {dialog}
    </aside>
  )
}
