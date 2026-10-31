import type { Failure } from './failure'
import type { Key } from './i18n/en'

/** The app's own sentence for a failed call: no connection, too many tries, not found, else the general one. */
export function errorKey(failure: Pick<Failure, 'code' | 'status'>): Key {
  if (failure.code === 'network') return 'error.network'
  if (failure.status === 429) return 'error.too_many'
  if (failure.code === 'not_found') return 'error.not_found'
  return 'error.unknown'
}

/** Sign-in's sentence: a refused email or password is `invalid` (422 or 401), anything else as `errorKey`. */
export function signInErrorKey(failure: Pick<Failure, 'code' | 'status'>): Key {
  if (failure.status === 422 || failure.status === 401 || failure.code === 'invalid') return 'error.invalid'
  return errorKey(failure)
}
