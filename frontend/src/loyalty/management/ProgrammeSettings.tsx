import { useQuery } from '@tanstack/react-query'
import { optionsApi, OPTIONS_KEY } from '../options/optionsApi'
import { SharedRules } from '../earn/SharedRules'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import { useEarnWords } from '../earn/words'
import { useRedesignWords } from '../redesign/words'
import { DesignDialog } from '../redesign/DesignUI'
import { LoadFailed, Loading } from '../options/parts'
import { OverviewButton } from '../overview/OverviewUI'

export function ProgrammeSettings({ kind }: { kind: 'points' | 'qualification' }) {
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const earn = useEarnWords(), rd = useRedesignWords()
  const guard = useLeaveGuard()
  return <>
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
    {!query.data && query.isLoading && <Loading />}
    {query.data && <SharedRules answer={query.data} guard={guard} kind={kind} full />}
    {guard.destination && <DesignDialog title={earn('discardTitle')} busy={guard.busy} onClose={guard.keep}><p>{earn('discardLine')}</p><div className="l-rd-actions"><OverviewButton onClick={guard.keep}>{rd('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{rd('discard')}</OverviewButton></div></DesignDialog>}
  </>
}
