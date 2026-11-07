import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, UserPlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { contactPath } from '../lib/links'
import { Page } from '../ui/Page'
import { Tabs } from '../ui/Tabs'
import { CompaniesTab } from './CompaniesTab'
import { CompanyFormPanel } from './CompanyForm'
import { contactsTab, CONTACTS_TABS, type ContactsTab } from './tabs'
import { DuplicatesTab } from './DuplicatesTab'
import { NewContactPanel } from './NewContactPanel'
import { PeopleTab } from './PeopleTab'
import { useDuplicates } from './queries'

const TAB_FALLBACK: Record<ContactsTab, string> = { people: 'People', companies: 'Companies', duplicates: 'Duplicates' }

/**
 * Contacts (2026-11-07): the people the venue deals with (`guests`) and the companies they work for (corporate
 * accounts), and the people who look like duplicates. Rebuilt from the full admin's Customers, Guests, Customer
 * duplicates and Corporate pages on the same endpoints; nothing about loyalty membership shows here.
 */
export function ContactsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const tab = contactsTab(search.get('tab'))
  const [adding, setAdding] = useState<null | 'contact' | 'company'>(null)
  const duplicates = useDuplicates()
  const pairs = duplicates.data?.pairs.length ?? 0

  const choose = (next: ContactsTab) => setSearch(() => {
    const out = new URLSearchParams()
    if (next !== 'people') out.set('tab', next)
    return out
  }, { replace: true })

  return (
    <Page title={t('crm.nav.contacts', 'Contacts')} line={t('crm.contacts.line', 'The people and companies you deal with, and everything you know about them.')}
      actions={tab === 'companies'
        ? <Button onClick={() => setAdding('company')}><Building2 size={15} aria-hidden />{t('crm.contacts.company_add', 'Add company')}</Button>
        : <Button onClick={() => setAdding('contact')}><UserPlus size={15} aria-hidden />{t('crm.contacts.add', 'Add contact')}</Button>}>
      <Tabs label={t('crm.contacts.sections', 'Contacts sections')} value={tab} onChange={choose}
        items={CONTACTS_TABS.map(key => ({ key, label: t(`crm.contacts.tabs.${key}`, TAB_FALLBACK[key]), count: key === 'duplicates' ? pairs : undefined }))} />

      {tab === 'people' && <PeopleTab onAdd={() => setAdding('contact')} />}
      {tab === 'companies' && <CompaniesTab onAdd={() => setAdding('company')} />}
      {tab === 'duplicates' && <DuplicatesTab />}

      {adding === 'contact' && (
        <NewContactPanel onClose={() => setAdding(null)} onCreated={guest => { setAdding(null); navigate(contactPath(guest.id)) }} />
      )}
      {adding === 'company' && <CompanyFormPanel onClose={() => setAdding(null)} onSaved={() => setAdding(null)} />}
    </Page>
  )
}
