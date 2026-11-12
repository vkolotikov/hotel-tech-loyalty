import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Contact, GitMerge, Plus, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useRecords } from '../lib/useRecords'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { CompaniesTab } from './CompaniesTab'
import { arg } from './contactsLogic'
import { contactsTab, type ContactsTab } from './tabs'
import { DuplicatesTab } from './DuplicatesTab'
import { PeopleTab } from './PeopleTab'
import { useDuplicates } from './queries'

const PANEL = 'crm-contacts-panel'
const PREFIX = 'crm-contacts-section'

/**
 * Contacts (2026-11-07; round 5, "minimize copy … opening tabs, slides or popups"): the people the venue deals with
 * (`guests`), the companies they work for (corporate accounts), and the people who look like duplicates — three tabs,
 * the one chosen kept in the address (`?tab=`). A person or a company opens in its panel over the list; Add opens the
 * one "new" panel (`?create=contact|company`, the header's New does the same). Nothing about loyalty membership shows.
 */
export function ContactsPage() {
  const { t } = useTranslation()
  const records = useRecords()
  const [search, setSearch] = useSearchParams()
  const tab = contactsTab(arg(search, 'tab'))
  const duplicates = useDuplicates()
  const pairs = duplicates.data?.pairs.length ?? 0

  // Changing tab keeps an open record (its panel stays) but drops the other tab's filters.
  const choose = (next: ContactsTab) => setSearch(prev => {
    const out = new URLSearchParams()
    if (next !== 'people') out.set('tab', next)
    for (const key of ['contact', 'company', 'lead', 'rtab']) { const v = prev.get(key); if (v) out.set(key, v) }
    return out
  }, { replace: true })

  const sections: Section<ContactsTab>[] = [
    { key: 'people', icon: Users, tone: 'accent', title: t('crm.contacts.tabs.people', 'People'), caption: t('crm.contacts.people_caption', 'Everyone you deal with, with filters and saved views') },
    { key: 'companies', icon: Building2, tone: 'progress', title: t('crm.contacts.tabs.companies', 'Companies'), caption: t('crm.contacts.companies_caption', 'The businesses they work for, their terms and leads') },
    { key: 'duplicates', icon: GitMerge, tone: pairs > 0 ? 'pending' : 'neutral', title: t('crm.contacts.tabs.duplicates', 'Duplicates'), caption: t('crm.contacts.duplicates_caption', 'Contacts that look like one person, to merge'), badge: pairs || undefined },
  ]

  return (
    <Page icon={Contact} title={t('crm.nav.contacts', 'Contacts')} line={t('crm.contacts.line', 'The people and companies you deal with, and everything you know about them.')}
      actions={tab !== 'duplicates' && (
        <Button onClick={() => records.create(tab === 'companies' ? 'company' : 'contact')}>
          <Plus size={15} aria-hidden />{t('crm.common.add', 'Add')}
          <span className="sr-only">{' '}{tab === 'companies' ? t('crm.create.company', 'Company') : t('crm.create.contact', 'Contact')}</span>
        </Button>
      )}>
      <SectionNav label={t('crm.contacts.sections', 'Contacts sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab} onChange={choose} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="animate-a-fade" key={tab}>
        {tab === 'people' && <PeopleTab />}
        {tab === 'companies' && <CompaniesTab />}
        {tab === 'duplicates' && <DuplicatesTab />}
      </div>
    </Page>
  )
}
