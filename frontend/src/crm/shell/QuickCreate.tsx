import { useTranslation } from 'react-i18next'
import { BriefcaseBusiness, Building2, CheckSquare, Plus, Sparkles, Target, UserPlus } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { useRecords } from '../lib/useRecords'
import { ActionMenu, type MenuItem } from '../ui/Menu'

/**
 * Round 5 (owner 2026-11-12, "easy to use … nice flow"): the header's New, on every page — a lead, a deal, a contact, a
 * company or a task in a panel over the page (`CreateHost`), and a lead from a message read by the AI when the server
 * offers it (`features.ai_capture`). Shortcut: N.
 */
export function QuickCreate() {
  const { t } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const items: (MenuItem | 'divider')[] = [
    { key: 'lead', label: t('crm.create.lead', 'Lead'), icon: Target, onSelect: () => records.create('lead') },
    { key: 'deal', label: t('crm.create.deal', 'Deal'), icon: BriefcaseBusiness, onSelect: () => records.create('deal') },
    { key: 'task', label: t('crm.create.task', 'Task'), icon: CheckSquare, onSelect: () => records.create('task') },
    'divider',
    { key: 'contact', label: t('crm.create.contact', 'Contact'), icon: UserPlus, onSelect: () => records.create('contact') },
    { key: 'company', label: t('crm.create.company', 'Company'), icon: Building2, onSelect: () => records.create('company') },
  ]
  if (boot.features.ai_capture) {
    items.push('divider', { key: 'capture', label: t('crm.create.capture', 'Lead from a message'), icon: Sparkles, onSelect: () => records.create('capture') })
  }
  const label = t('crm.create.label', 'New')
  return (
    <ActionMenu label={label} items={items} align="right"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-a-accent px-3 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep focus-visible:outline-2 focus-visible:outline-a-accent"
      button={<><Plus size={16} aria-hidden /><span className="hidden sm:inline">{label}</span></>} />
  )
}
