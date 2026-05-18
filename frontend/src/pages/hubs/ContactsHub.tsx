import { lazy, Suspense } from 'react'
import { Users, Briefcase, ArrowLeftRight } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

/**
 * "Contacts" hub — the "who is this" half of the CRM. Consolidates
 * what used to be three separate sidebar entries (Customers, Companies,
 * Duplicates) into one tabbed page so staff don't have to bounce
 * between three nav items that all answer "who".
 *
 * Sales-flow data (Inquiries / Deals / Lead forms) lives in the
 * sibling Pipeline hub.
 */

const Customers          = lazy(() => import('../Customers').then(m => ({ default: m.Customers })))
const Corporate          = lazy(() => import('../Corporate').then(m => ({ default: m.Corporate })))
const CustomerDuplicates = lazy(() => import('../CustomerDuplicates').then(m => ({ default: m.CustomerDuplicates })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function ContactsHub() {
  return (
    <HubTabs
      title="Contacts"
      subtitle="Every person and company your CRM tracks — in one place."
      tabs={[
        {
          key: 'customers',
          label: 'Customers',
          icon: <Users size={15} />,
          description: 'People — guests, leads, and individuals.',
          render: () => <Suspense fallback={fallback}><Customers /></Suspense>,
        },
        {
          key: 'companies',
          label: 'Companies',
          icon: <Briefcase size={15} />,
          description: 'B2B accounts — corporate clients, agencies, partners.',
          render: () => <Suspense fallback={fallback}><Corporate /></Suspense>,
        },
        {
          key: 'duplicates',
          label: 'Duplicates',
          icon: <ArrowLeftRight size={15} />,
          description: 'Suspected duplicate customers — review and merge.',
          render: () => <Suspense fallback={fallback}><CustomerDuplicates /></Suspense>,
        },
      ]}
    />
  )
}
