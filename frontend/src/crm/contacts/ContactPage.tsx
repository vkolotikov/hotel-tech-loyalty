import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { contactPath } from '../lib/links'
import { IconButton } from '../ui/IconButton'
import { ContactFrame } from './ContactRecord'
import { displayName } from './contactsLogic'
import { useContact } from './queries'
import { contactTab } from './recordLogic'

/**
 * A contact's own page (`/crm/contacts/:id`, round 5): the same frame as their panel, full width, with the same tabs,
 * the tab kept in the address (`?tab=`). A lead opened from it slides in over it.
 */
export function ContactPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: raw } = useParams()
  const [search, setSearch] = useSearchParams()
  const id = Number(raw)
  const valid = Number.isInteger(id) && id > 0
  const guest = useContact(id, valid)
  const tab = contactTab(search.get('tab'))
  const back = <IconButton icon={ArrowLeft} size="sm" label={t('crm.contacts.back', 'All contacts')} to="/crm/contacts" />

  if (!valid) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 lg:px-6 lg:py-5">
        {back}
        <Notice tone="danger">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</Notice>
      </div>
    )
  }
  const name = guest.data ? displayName(guest.data) ?? t('crm.common.no_name', 'No name') : t('crm.contacts.contact', 'Contact')
  return (
    <div className="mx-auto w-full max-w-none px-3 py-3 sm:px-4 lg:px-6 lg:py-5">
      <h1 className="sr-only">{name}</h1>
      <div className="rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
        <ContactFrame id={id} tab={tab} tools={back} idPrefix="crm-contact-page"
          onTab={next => setSearch(prev => {
            const out = new URLSearchParams(prev)
            if (next === 'overview') out.delete('tab')
            else out.set('tab', next)
            return out
          }, { replace: true })}
          onGone={() => navigate('/crm/contacts')}
          onOpenContact={other => navigate(contactPath(other))} />
      </div>
    </div>
  )
}
