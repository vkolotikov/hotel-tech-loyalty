import { failureOf } from '../../lib/api'

/** Denials must replace cached content, including a revoked plan or tenant switch. */
export function deniedRead(error: unknown) { return [401, 402, 403, 404].includes(failureOf(error).status) }
