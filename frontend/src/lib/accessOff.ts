/**
 * Two refusals the shared API client answers for every page (Part C):
 * - 403 `staff_inactive`: this sign-in's access to the organisation was
 *   switched off. It is signed out, and the sign-in screen says why.
 * - 403 `not_in_plan`: the organisation is on the Appointments plan, which
 *   has no full admin. A session that signed in before the plan changed is
 *   marked appointments-only and taken to the workspace.
 */
export const ACCESS_OFF_REASON = 'access_off'
export const ACCESS_OFF_LOGIN = `/login?reason=${ACCESS_OFF_REASON}`

type Refusal = { response?: { status?: number; data?: { error?: unknown } } }

export function refusalOf(error: unknown): 'staff_inactive' | 'not_in_plan' | null {
  const response = (error as Refusal | null)?.response
  if (response?.status !== 403) return null
  const code = response.data?.error
  return code === 'staff_inactive' || code === 'not_in_plan' ? code : null
}
