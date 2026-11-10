import { useQuery } from '@tanstack/react-query'
import { optionsApi, OPTIONS_KEY } from '../options/optionsApi'
import { SharedRules } from '../earn/SharedRules'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import { useEarnWords } from '../earn/words'
import { useRedesignWords } from '../redesign/words'
import { ConfirmDialog } from '../ui/formParts'
import { LoadFailed, Loading } from '../options/parts'
import { OverviewButton } from '../overview/OverviewUI'
import { useAdminWords } from './words'
import { LEVELS, EARNING } from './navigation'

export function ProgrammeSettings({ kind }: { kind: 'points' | 'qualification' }) {
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const say = useAdminWords(), earn = useEarnWords(), rd = useRedesignWords()
  const guard = useLeaveGuard()
  return <div className="l-ad-page"><header className="l-ad-heading"><h1>{say(kind === 'points' ? 'pointsSettings' : 'qualification')}</h1>
    <OverviewButton disabled={guard.busy} onClick={() => guard.go(kind === 'points' ? EARNING : LEVELS)}>{kind === 'points' ? earn('allBack') : rd('allLevelsBack')}</OverviewButton></header>
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
    {!query.data && query.isLoading && <Loading />}
    {query.data && <SharedRules answer={query.data} guard={guard} kind={kind} full />}
    {guard.destination && <ConfirmDialog title={earn('discardTitle')} confirm={rd('discard')} keep={rd('keepEditing')} busy={guard.busy} failure={null} onClose={guard.keep} onConfirm={guard.discard}><p>{earn('discardLine')}</p></ConfirmDialog>}
  </div>
}
