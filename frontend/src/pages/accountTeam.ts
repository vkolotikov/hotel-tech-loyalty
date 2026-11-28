/** Team (/account/team, owner 2026-11-02): the decisions of the page, pure so they are tested without a browser. */

export interface TeamMember {
  id: number
  name: string | null
  email: string | null
  role: string
  loyalty_scan_only?: boolean
  is_active: boolean
  last_login_at: string | null
  invite_expires_at: string | null
  is_me: boolean
}

/** GET /v1/admin/team, the part this page reads. */
export interface TeamList {
  staff: TeamMember[]
  roles: string[]
}

/** The roles an invitation offers here: the server's, without Owner (owners are made by HexaTech). */
export function inviteRoles(roles: string[]): string[] {
  return roles.filter(r => r === 'manager' || r === 'staff')
}

/** How a member stands: switched off, invited and not yet signed in, or active. */
export function memberState(member: Pick<TeamMember, 'is_active' | 'last_login_at' | 'invite_expires_at'>): 'off' | 'invited' | 'active' {
  if (!member.is_active) return 'off'
  if (!member.last_login_at && member.invite_expires_at) return 'invited'
  return 'active'
}
