import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Copy, Crown, Eye, Mails, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { SearchInput } from '../ui/inputs'
import { ActionMenu } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { ReadOnlyNote } from '../settings/parts'
import { searchTemplates } from '../leads/listLogic'
import { PreviewDialog } from './PreviewDialog'
import { CATEGORY_ICON, TEMPLATES_KEY, templatesChanged } from './queries'
import { TemplateEditor } from './TemplateEditor'
import { categoryOf, copyPayload, memberTagsUsed, type Category, type EmailTemplate } from './templateLogic'

const PARAM = 'template'

/**
 * Settings → Templates (round 5, owner 2026-11-12): the organisation's email templates — the ones a lead's "Send an
 * email" offers — listed with what each is, previewed with the server's own rendering, and (a manager's,
 * `staff.can.manage_templates`) made, edited in place (`?template=<id>` or `new`), copied, switched off or deleted.
 * The server keeps no "duplicate": a copy is a new template with the same subject and body.
 */
export function TemplatesTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null)
  const [deleting, setDeleting] = useState<EmailTemplate | null>(null)
  const query = useQuery({ queryKey: TEMPLATES_KEY, queryFn: () => get<{ templates: EmailTemplate[] }>('email-templates').then(r => r.templates ?? []) })
  const open = params.get(PARAM)
  const setOpen = (value: string | null) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (value) out.set(PARAM, value)
    else out.delete(PARAM)
    return out
  })

  const copy = useMutation({
    mutationFn: (template: EmailTemplate) => send<{ template: EmailTemplate }>('post', 'email-templates',
      copyPayload(template, t('crm.templates.copy_name', 'Copy of {{name}}', { name: template.name }))),
    onSuccess: answer => {
      templatesChanged(qc)
      say(t('crm.templates.copied', 'Copied.'))
      if (answer?.template?.id) setOpen(String(answer.template.id))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const toggle = useMutation({
    mutationFn: (template: EmailTemplate) => send('put', `email-templates/${template.id}`, { is_active: !template.is_active }),
    onSuccess: () => { templatesChanged(qc); say(t('crm.common.saved', 'Saved')) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (template: EmailTemplate) => send('delete', `email-templates/${template.id}`),
    onSuccess: () => { templatesChanged(qc); setDeleting(null); say(t('crm.templates.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const list = query.data ?? []
  if (open && canManage) {
    const template = open === 'new' ? null : list.find(x => String(x.id) === open)
    if (open === 'new' || template) {
      return <TemplateEditor key={open} template={template ?? null} onClose={() => setOpen(null)} onSaved={id => setOpen(String(id))} />
    }
  }

  const shown = searchTemplates(list, search)
  const categoryNames: Record<Category, string> = {
    campaign: t('crm.templates.category.campaign', 'Campaign'),
    transactional: t('crm.templates.category.transactional', 'Transactional'),
    welcome: t('crm.templates.category.welcome', 'Welcome'),
  }
  const newButton = (variant: 'primary' | 'secondary') => (
    <Button variant={variant} size="sm" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />{t('crm.templates.new', 'New template')}</Button>
  )

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-4">
        {!canManage && <ReadOnlyNote />}
        <Card padded={false} title={t('crm.templates.title', 'Email templates')} icon={Mails} tone="ai"
          description={t('crm.templates.line', 'What your team sends from a lead with "Send an email". Tags like {{tag}} are filled in when it is sent.', { tag: '{{hotel_name}}' })}
          hint={list.length > 0 ? t('crm.templates.count', '{{count}} in all', { count: list.length }) : undefined}
          action={canManage && list.length > 0 ? newButton('primary') : undefined}>
          {list.length === 0 ? (
            <EmptyState icon={Mails} title={t('crm.templates.empty', 'No templates yet')}
              line={canManage ? t('crm.templates.empty_line', 'Start from a design or a blank page.') : undefined}
              action={canManage ? newButton('primary') : undefined} />
          ) : (
            <div>
              {list.length > 6 && (
                <div className="border-b border-a-border p-2">
                  <SearchInput label={t('crm.templates.search', 'Search templates')} value={search} onChange={setSearch} />
                </div>
              )}
              {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-a-text-2">{t('crm.templates.no_match', 'No template matches this search.')}</p>}
              <ul className="divide-y divide-a-border">
                {shown.map(template => {
                  const category = categoryOf(template.category)
                  const Icon = CATEGORY_ICON[category]
                  const members = memberTagsUsed(template).length > 0
                  return (
                    <li key={template.id} className="group flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-a-surface-2/60">
                      <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${template.is_active ? 'bg-a-accent/12 text-a-accent-text' : 'bg-a-surface-2 text-a-text-2'}`}><Icon size={16} /></span>
                      <button type="button" onClick={() => (canManage ? setOpen(String(template.id)) : setPreviewing(template))}
                        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-a-accent">
                        <span className="block truncate text-sm font-medium text-a-text">{template.name}</span>
                        <span className="block truncate text-xs text-a-text-2">{template.subject}</span>
                      </button>
                      <span className="hidden shrink-0 flex-wrap items-center justify-end gap-1 sm:flex">
                        <Pill>{categoryNames[category]}</Pill>
                        {members && <Pill tone="pending" title={t('crm.templates.members_tip', 'It uses a member\'s tags, so it goes only to contacts who are loyalty members.')}><Crown size={12} aria-hidden />{t('crm.templates.members', 'Members')}</Pill>}
                        {!template.is_active && <Pill tone="danger">{t('crm.templates.off', 'Off')}</Pill>}
                      </span>
                      <span className="flex shrink-0 items-center">
                        <IconButton icon={Eye} size="sm" label={t('crm.templates.preview_of', 'Preview {{name}}', { name: template.name })} onClick={() => setPreviewing(template)} />
                        {canManage && (
                          <>
                            <IconButton icon={Pencil} size="sm" className="hidden sm:inline-grid" label={t('crm.templates.edit_of', 'Edit {{name}}', { name: template.name })} onClick={() => setOpen(String(template.id))} />
                            <ActionMenu label={t('crm.templates.menu', 'More for {{name}}', { name: template.name })} items={[
                              { key: 'edit', label: t('crm.common.edit', 'Edit'), icon: Pencil, onSelect: () => setOpen(String(template.id)) },
                              { key: 'copy', label: t('crm.templates.duplicate', 'Duplicate'), icon: Copy, disabled: copy.isPending, onSelect: () => copy.mutate(template) },
                              { key: 'toggle', label: template.is_active ? t('crm.templates.switch_off', 'Switch off') : t('crm.templates.switch_on', 'Switch on'), icon: Power, onSelect: () => toggle.mutate(template) },
                              'divider',
                              { key: 'delete', label: t('crm.common.delete', 'Delete'), icon: Trash2, danger: true, onSelect: () => setDeleting(template) },
                            ]} />
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Card>
        {previewing && <PreviewDialog template={previewing} onClose={() => setPreviewing(null)} />}
        {deleting && (
          <Confirm title={t('crm.templates.delete_title', 'Delete {{name}}?', { name: deleting.name })} confirm={t('crm.common.delete', 'Delete')}
            busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
            {t('crm.templates.delete_line', 'Your team can no longer send it. Emails already sent are not affected.')}
          </Confirm>
        )}
      </div>
    </QueryState>
  )
}
