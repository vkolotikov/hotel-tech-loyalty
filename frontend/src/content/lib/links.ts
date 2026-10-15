/** The sign-in screen, set to bring the visitor back to the Content page they asked for. */
export { loginPath } from '../../workspace/lib/landing'

/** Where "Full admin" goes (spec §6.9): the Marketing hub for managers (it is manager-only there), the dashboard for staff. */
export function fullAdminPath(canManage: boolean): string {
  return canManage ? '/marketing' : '/'
}

/** Where a post's own link lands (spec §4.3): its week on the Plan, or, with no day, Posts among the others with no day. */
export function postHome(post: { scheduled_date: string | null }): string {
  return post.scheduled_date === null ? '/content/posts?unscheduled=1' : `/content?date=${post.scheduled_date}`
}
