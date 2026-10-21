/** The area an address shows, for the breadcrumb: Members for /loyalty and a member's page. */
export function areaOf(pathname: string): string {
  const part = pathname.replace(/^\/loyalty\/?/, '').split('/')[0]
  return ['requests', 'program', 'rewards', 'scan'].includes(part) ? part : 'members'
}
