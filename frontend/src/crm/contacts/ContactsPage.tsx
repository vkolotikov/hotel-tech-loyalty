import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, GitMerge, UserPlus, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { contactPath } from '../lib/links'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { CompaniesTab } from './CompaniesTab'
import { CompanyFormPanel } from './CompanyForm'
import { arg } from './contactsLogic'
import { contactsTab, type ContactsTab } from './tabs'
import { DuplicatesTab } from './DuplicatesTab'
import { NewContactPanel } from './NewContactPanel'
import { PeopleTab } from './PeopleTab'
import { useDuplicates } from './queries'

const PANEL = 'crm-contacts-panel'
const PREFIX = 'crm-contacts-section'

/**
 * Contacts (2026-11-07; round 2, "structured sections"): the people the venue deals with (`guests`), the companies they
 * work for (corporate accounts), and the people who look like duplicates — three sections, the one chosen kept in the
 * address (`?tab=`). Rebuilt from the full admin's Customers, Guests, Customer duplicates and Corporate pages on the
 * same endpoints; nothing about loyalty membership shows here.
 */
export function ContactsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const tab = contactsTab(arg(search, 'tab'))
  const [adding, setAdding] = useState<null | 'contact' | 'company'>(null)
  const duplicates = useDuplicates()
  const pairs = duplicates.data?.pairs.length ?? 0

  const choose = (next: ContactsTab) => setSearch(() => {
    const out = new URLSearchParams()
    if (next !== 'people') out.set('tab', next)
    return out
  }, { replace: true })

  const sections: Section<ContactsTab>[] = [
    { key: 'people', icon: Users, tone: 'accent', title: t('crm.contacts.tabs.people', 'People'), caption: t('crm.contacts.people_caption', 'Everyone you deal with, with filters and saved views') },
    { key: 'companies', icon: Building2, tone: 'progress', title: t('crm.contacts.tabs.companies', 'Companies'), caption: t('crm.contacts.companies_caption', 'The businesses they work for, their terms and leads') },
    { key: 'duplicates', icon: GitMerge, tone: pairs > 0 ? 'pending' : 'neutral', title: t('crm.contacts.tabs.duplicates', 'Duplicates'), caption: t('crm.contacts.duplicates_caption', 'Contacts that look like one person, to merge'), badge: pairs || undefined },
  ]

  return (
    <Page title={t('crm.nav.contacts', 'Contacts')} line={t('crm.contacts.line', 'The people and companies you deal with, and everything you know about them.')}
      actions={tab === 'companies'
        ? <Button onClick={() => setAdding('company')}><Building2 size={15} aria-hidden />{t('crm.contacts.company_add', 'Add company')}</Button>
        : <Button onClick={() => setAdding('contact')}><UserPlus size={15} aria-hidden />{t('crm.contacts.add', 'Add contact')}</Button>}>
      <SectionNav label={t('crm.contacts.sections', 'Contacts sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab} onChange={choose} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="space-y-4 animate-a-fade" key={tab}>
        {tab === 'people' && <PeopleTab onAdd={() => setAdding('contact')} />}
        {tab === 'companies' && <CompaniesTab onAdd={() => setAdding('company')} />}
        {tab === 'duplicates' && <DuplicatesTab />}
      </div>

      {adding === 'contact' && (
        <NewContactPanel onClose={() => setAdding(null)} onCreated={guest => { setAdding(null); navigate(contactPath(guest.id)) }} />
      )}
      {adding === 'company' && <CompanyFormPanel onClose={() => setAdding(null)} onSaved={() => setAdding(null)} />}
    </Page>
  )
}
