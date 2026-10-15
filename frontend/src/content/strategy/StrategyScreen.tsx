import { useBoot } from '../ContentProvider'
import { StrategyActions } from './StrategyActions'
import { StrategyPage } from './StrategyPage'

/** /content/strategy: everyone reads; managers also get the actions (spec §5.1: staff never see a button the server would refuse). */
export function StrategyScreen() {
  const boot = useBoot()
  if (!boot.staff.can_manage) return <StrategyPage />
  return <StrategyPage actions={(shown, strategies, generation) => <StrategyActions shown={shown} strategies={strategies} generation={generation} />} />
}
