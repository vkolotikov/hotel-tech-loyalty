import { lazy, Suspense } from 'react'
import { FileText, Package, FilePlus2, TrendingUp } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

/**
 * "Pipeline" hub — the "what's happening" half of the CRM. Consolidates
 * the sales-flow surfaces (Leads & Inquiries, Deals, Lead forms,
 * Insights) into one tabbed page so staff stay in the sales context as
 * they move between intake, deal management, form configuration, and
 * the at-a-glance dashboard.
 *
 * Identity data (Customers / Companies / Duplicates) lives in the
 * sibling Contacts hub.
 */

const Inquiries       = lazy(() => import('../Inquiries').then(m => ({ default: m.Inquiries })))
const Deals           = lazy(() => import('../Deals').then(m => ({ default: m.Deals })))
const LeadForms       = lazy(() => import('../LeadForms').then(m => ({ default: m.LeadForms })))
const InquiryInsights = lazy(() => import('../InquiryInsights').then(m => ({ default: m.InquiryInsights })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function PipelineHub() {
  return (
    <HubTabs
      title="Pipeline"
      subtitle="Where leads enter, how they progress, and how they close."
      tabs={[
        {
          key: 'inquiries',
          label: 'Leads & Inquiries',
          icon: <FileText size={15} />,
          description: 'Open leads and inquiries in your sales pipeline.',
          render: () => <Suspense fallback={fallback}><Inquiries /></Suspense>,
        },
        {
          key: 'deals',
          label: 'Deals',
          icon: <Package size={15} />,
          description: 'Won deals working through fulfillment + invoicing.',
          render: () => <Suspense fallback={fallback}><Deals /></Suspense>,
        },
        {
          key: 'insights',
          label: 'Insights',
          icon: <TrendingUp size={15} />,
          description: "Today's snapshot, what's going cold, what's stuck, and where the value is.",
          render: () => <Suspense fallback={fallback}><InquiryInsights /></Suspense>,
        },
        {
          key: 'lead-forms',
          label: 'Lead forms',
          icon: <FilePlus2 size={15} />,
          description: 'Embeddable forms — the front door for new leads.',
          render: () => <Suspense fallback={fallback}><LeadForms /></Suspense>,
        },
      ]}
    />
  )
}
