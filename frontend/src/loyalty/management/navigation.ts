export const LEVELS = '/loyalty/program?tab=tiers'
export const QUALIFICATION = LEVELS + '&settings=qualification'
export const READINESS = LEVELS + '&checks=1'
export const SETUP = '/loyalty/program/setup'
export const EARNING = '/loyalty/options?tab=earn'
export const BONUSES = '/loyalty/options?tab=bonus'
export const POINTS_SETTINGS = EARNING + '&settings=points'

/** A legacy address's new home; retain record/filter context, never redirect a canonical address twice. */
export function legacyDestination(path: string, search = '', hash = ''): string | null {
  const clean = path.replace(/\/$/, ''), p = new URLSearchParams(search)
  const url = (base: string) => base + (p.size ? '?' + p.toString() : '')
  const tab = p.get('tab'), focus = p.get('way') ?? p.get('selected')
  if (clean === '/loyalty/options/setup') return url(SETUP)
  if (clean === '/loyalty/program') {
    if (tab === 'benefits') return url('/loyalty/rewards')
    if (tab === 'boosts' || (!tab && hash === '#boosts')) {
      const selected = p.get('selected')
      p.set('tab', 'bonus'); p.delete('selected')
      if (selected && !p.has('boost')) p.set('boost', selected)
      return url('/loyalty/options')
    }
    if (!tab && hash === '#places') { p.set('tab', 'places'); return url(clean) }
  }
  if (clean !== '/loyalty/options') return null
  if (focus === 'points_expiry' || focus === 'tier_progress') {
    p.set('tab', focus === 'points_expiry' ? 'earn' : 'tiers')
    p.delete('way'); p.delete('selected'); p.set('settings', focus === 'points_expiry' ? 'points' : 'qualification')
    return url(focus === 'points_expiry' ? clean : '/loyalty/program')
  }
  if (tab === 'rule' || tab === 'rules') {
    p.set('tab', 'tiers'); p.set('settings', 'qualification'); return url('/loyalty/program')
  }
  if (tab === 'overview') { p.set('tab', 'tiers'); p.set('checks', '1'); return url('/loyalty/program') }
  return null
}
