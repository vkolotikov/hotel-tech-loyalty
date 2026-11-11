/**
 * What went wrong with a call, read the same way as the web workspace's `failureOf` (frontend/src/loyalty/lib/api.ts):
 * the server's code (`not_enough_points`), `invalid` for a form's field errors, `not_found`, `unauthenticated`,
 * `network` when no answer came, or `unknown`. `message` keeps the server's own sentence (a field's first error, else its
 * `message`/`error` text) for the places the portal shows it too: a closed sign-up link, a refused registration field.
 */
export interface Failure {
  status: number
  code: string
  fields?: Record<string, string[]>
  message?: string
  extra: Record<string, unknown>
  /** The server's own snake_case code (`slot_taken`), or null when it sent none (no answer, a bare 404, a field error).
   *  The booking flows read this, as the portal's `apiErrorCode` does, never the app's own `network`/`unknown`. */
  serverCode?: string | null
}

export class ApiError extends Error {
  readonly failure: Failure

  constructor(failure: Failure) {
    super(failure.code)
    this.failure = failure
  }
}

const SNAKE = /^[a-z_]+$/

/** The failure of an answer with this status and body (already parsed, or null when it was not JSON). */
export function failureFrom(status: number, body: unknown): Failure {
  if (status === 0) return { status: 0, code: 'network', extra: {}, serverCode: null }
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const fields = data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined
  const named = typeof data.code === 'string' && SNAKE.test(data.code) ? data.code
    : typeof data.error === 'string' && SNAKE.test(data.error) ? data.error
      : null
  const code = named ?? (fields ? 'invalid' : status === 401 ? 'unauthenticated' : status === 404 ? 'not_found' : 'unknown')
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !['error', 'message', 'errors', 'code'].includes(key)))

  const firstField = fields ? Object.values(fields)[0]?.[0] : undefined
  const sentence = firstField ?? (typeof data.message === 'string' ? data.message : typeof data.error === 'string' && !SNAKE.test(data.error) ? data.error : undefined)

  return { status, code, ...(fields ? { fields } : {}), ...(sentence ? { message: sentence } : {}), extra, serverCode: named }
}

/** The failure an error carries, whatever threw it. */
export function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) return error.failure
  return { status: 0, code: 'network', extra: {}, serverCode: null }
}

/** The server's own code off any failed call, or null when there is none (the portal's `apiErrorCode`). */
export function serverCodeOf(error: unknown): string | null {
  return failureOf(error).serverCode ?? null
}

/**
 * A failure in the shape the portal's shared booking rules read loosely (`error.response.data`), so `payAtVenueGrantOf`
 * and the like see the server's code and its other fields (`reason`, `pay_at_venue_grant`) exactly as the portal does.
 */
export function asPortalError(error: unknown): { response: { data: Record<string, unknown> } } {
  const failure = failureOf(error)
  return { response: { data: { ...failure.extra, ...(failure.serverCode ? { error: failure.serverCode } : {}) } } }
}
