import { readDealView, writeDealView } from '../deals/dealLogic'

/**
 * Where round 1's Pipeline address goes now (round 2): the board lives in Leads (`/crm/leads?view=board`, keeping the
 * chosen pipeline `?p=`), and its "Won deals" tab is Deals (`/crm/deals`, keeping its filter, sort and page).
 */
export function pipelineTarget(search: string): string {
  const sp = new URLSearchParams(search)
  if (sp.get('tab') === 'won') {
    const q = writeDealView(readDealView(sp)).toString()
    return q ? `/crm/deals?${q}` : '/crm/deals'
  }
  const next = new URLSearchParams({ view: 'board' })
  const p = Number(sp.get('p'))
  if (Number.isInteger(p) && p > 0) next.set('p', String(p))
  return `/crm/leads?${next.toString()}`
}
