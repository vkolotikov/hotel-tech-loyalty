/** The area an address shows, for the breadcrumb: Members for /loyalty, a member's page and the members' own pages. */
export function areaOf(pathname: string): string {
  const part = pathname.replace(/^\/loyalty\/?/, '').split('/')[0]
  return ['overview', 'requests', 'program', 'options', 'rewards', 'events', 'campaigns', 'insights', 'scan', 'app', 'guide', 'start'].includes(part) ? part : 'members'
}
