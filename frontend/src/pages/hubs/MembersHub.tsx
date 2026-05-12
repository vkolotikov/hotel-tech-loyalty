import { lazy, Suspense } from 'react'
import { Users, ArrowLeftRight, ListChecks } from 'lucide-react'
import { HubTabs } from '../../components/HubTabs'

const Members         = lazy(() => import('../Members').then(m => ({ default: m.Members })))
const MemberDuplicates = lazy(() => import('../MemberDuplicates').then(m => ({ default: m.MemberDuplicates })))
const Segments        = lazy(() => import('../Segments').then(m => ({ default: m.Segments })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

export function MembersHub() {
  return (
    <HubTabs
      title="Members"
      subtitle="People in your loyalty program, plus the tools to clean and group them."
      tabs={[
        {
          key: 'list',
          label: 'Members',
          icon: <Users size={15} />,
          description: 'Browse, search, edit and message your loyalty members.',
          render: () => <Suspense fallback={fallback}><Members /></Suspense>,
        },
        {
          key: 'duplicates',
          label: 'Duplicates',
          icon: <ArrowLeftRight size={15} />,
          description: 'Review and merge potential duplicate member records.',
          render: () => <Suspense fallback={fallback}><MemberDuplicates /></Suspense>,
        },
        {
          key: 'segments',
          label: 'Segments',
          icon: <ListChecks size={15} />,
          description: 'Reusable target lists for push + email campaigns.',
          render: () => <Suspense fallback={fallback}><Segments /></Suspense>,
        },
      ]}
    />
  )
}
