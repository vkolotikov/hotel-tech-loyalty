import { useEffect, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
  Building2, BriefcaseBusiness, CheckSquare, Contact, MessagesSquare, Moon, PanelLeft, Plus, Search, Sun, Target, UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspaceNavItem } from '../../workspace/WorkspaceShell'
import { FindFrame, type FindGroup } from '../../workspace/find/FindFrame'
import { fold, type FindItem, type FindTarget } from '../../workspace/find/findCore'
import { get, params } from '../lib/api'
import { hrefOf, withCreate, withRecord, type CreateKind, type RecordKind } from '../lib/records'

interface Hit extends FindItem { icon?: LucideIcon }
interface GuestRow { id: number; full_name?: string | null; email?: string | null; phone?: string | null; company?: string | null }
interface LeadRow { id: number; status?: string | null; guest?: { full_name?: string | null; email?: string | null } | null }
interface CompanyRow { id: number; company_name?: string | null; contact_person?: string | null; industry?: string | null }
interface ChatRow { id: number; visitor_name?: string | null; visitor_email?: string | null; last_message?: string | null; status?: string | null }

/**
 * HexaTech CRM's Find on the shared frame: contacts, leads, companies and website chats by name, email or phone (up to 5
 * each, searched on the server from two letters), the areas and the actions. Round 5: a contact, a lead or a company
 * opens in its panel over the page Find was opened on; "new" actions open their panel there too. Nothing is drawn, and
 * nothing fetched, while it is closed.
 */
export function CrmFind(props: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  nav: WorkspaceNavItem[]
  dark: boolean
  slim: boolean
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!props.open) return null
  return <FindPanel {...props} />
}

function FindPanel({ onClose, onRun, nav, dark, slim, fallbackFocus }: Parameters<typeof CrmFind>[0]) {
  const { t } = useTranslation()
  const location = useLocation()
  const here = new URLSearchParams(location.search)
  const record = (kind: RecordKind, id: number) => hrefOf(location.pathname, withRecord(here, kind, id))
  const make = (kind: CreateKind) => hrefOf(location.pathname, withCreate(here, kind))
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const search = useQuery({
    queryKey: ['crm', 'find', asked],
    queryFn: async () => {
      const [guests, leads, companies, chats] = await Promise.all([
        get<{ data: GuestRow[] }>(`guests${params({ search: asked, per_page: 5 })}`).catch(() => ({ data: [] as GuestRow[] })),
        get<{ data: LeadRow[] }>(`inquiries${params({ search: asked, per_page: 5 })}`).catch(() => ({ data: [] as LeadRow[] })),
        get<{ data: CompanyRow[] }>(`corporate-accounts${params({ search: asked, per_page: 5 })}`).catch(() => ({ data: [] as CompanyRow[] })),
        // The inbox's list is 50 to a page and has no per_page: the first five are shown.
        get<{ data: ChatRow[] }>(`chat-inbox${params({ search: asked })}`).catch(() => ({ data: [] as ChatRow[] })),
      ])
      return { guests: guests.data ?? [], leads: leads.data ?? [], companies: (companies.data ?? []).slice(0, 5), chats: (chats.data ?? []).slice(0, 5) }
    },
    enabled: asked.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  const typed = query.trim()
  const matches = (label: string) => typed === '' || fold(label).includes(fold(typed))
  const actions: Hit[] = [
    { id: 'new-lead', kind: 'action', label: t('crm.find.new_lead', 'Add a lead'), go: { to: make('lead') }, icon: Plus },
    { id: 'new-deal', kind: 'action', label: t('crm.find.new_deal', 'Add a deal'), go: { to: make('deal') }, icon: BriefcaseBusiness },
    { id: 'new-task', kind: 'action', label: t('crm.find.new_task', 'Add a task'), go: { to: make('task') }, icon: CheckSquare },
    { id: 'new-contact', kind: 'action', label: t('crm.find.new_contact', 'Add a contact'), go: { to: make('contact') }, icon: UserPlus },
    { id: 'new-company', kind: 'action', label: t('crm.find.new_company', 'Add a company'), go: { to: make('company') }, icon: Building2 },
    ...nav.map(item => ({ id: `go-${item.to}`, kind: 'action', label: item.label, sub: t('crm.find.go_to', 'Go to'), go: { to: item.to }, icon: item.icon })),
    { id: 'theme', kind: 'action', label: dark ? t('crm.find.theme_light', 'Switch to light') : t('crm.find.theme_dark', 'Switch to dark'), go: { run: 'theme' }, icon: dark ? Sun : Moon },
    { id: 'rail', kind: 'action', label: slim ? t('workspace.shell.expand', 'Expand menu') : t('workspace.shell.collapse', 'Collapse menu'), go: { run: 'rail' }, icon: PanelLeft },
  ].filter(item => matches(item.label))

  const settled = asked === typed && typed.length >= 2 ? search.data : undefined
  const contacts: Hit[] = (settled?.guests ?? []).map(g => ({
    id: `guest-${g.id}`, kind: 'contact', label: g.full_name || g.email || `#${g.id}`, sub: [g.company, g.email, g.phone].filter(Boolean).join(' · '),
    go: { to: record('contact', g.id) }, icon: Contact,
  }))
  const leads: Hit[] = (settled?.leads ?? []).map(l => ({
    id: `lead-${l.id}`, kind: 'lead', label: l.guest?.full_name || l.guest?.email || `#${l.id}`, sub: l.status ?? '',
    go: { to: record('lead', l.id) }, icon: Target,
  }))
  const companies: Hit[] = (settled?.companies ?? []).map(c => ({
    id: `company-${c.id}`, kind: 'company', label: c.company_name || `#${c.id}`, sub: [c.contact_person, c.industry].filter(Boolean).join(' · '),
    go: { to: record('company', c.id) }, icon: Building2,
  }))
  const chats: Hit[] = (settled?.chats ?? []).map(c => ({
    id: `chat-${c.id}`, kind: 'chat', label: c.visitor_name || c.visitor_email || `#${c.id}`, sub: c.last_message ?? '',
    go: { to: `/crm/inbox?c=${c.id}` }, icon: MessagesSquare,
  }))
  const groups: FindGroup<Hit>[] = [
    { title: t('crm.find.contacts', 'Contacts'), items: contacts },
    { title: t('crm.find.leads', 'Leads'), items: leads },
    { title: t('crm.find.companies', 'Companies'), items: companies },
    { title: t('crm.find.chats', 'Website chats'), items: chats },
    { title: t('crm.find.actions', 'Actions'), items: actions.slice(0, typed ? 8 : 14) },
  ].filter(group => group.items.length > 0)
  const waiting = typed.length >= 2 && (asked !== typed || search.isFetching)

  return (
    <FindFrame prompt={t('crm.shell.find', 'Find a contact, lead or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={item => item.icon ?? Search}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('crm.find.searching', 'Searching…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
