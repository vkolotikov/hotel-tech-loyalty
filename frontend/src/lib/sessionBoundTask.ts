import { authSession } from './authSession'

/** Raw handoffs must obey the same account fence as Axios, including body parsing and unmount. */
export function sessionBoundTask<T>(
  work: (signal: AbortSignal) => Promise<T>,
  success: (value: T) => void,
  failure: (error: unknown) => void,
  fence: Pick<typeof authSession, 'check' | 'version'> = authSession,
) {
  const controller = new AbortController()
  const version = fence.version()
  const current = () => !controller.signal.aborted && fence.check(version)
  if (current()) {
    void work(controller.signal).then(value => {
      if (current()) success(value)
    }, error => {
      if (current()) failure(error)
    })
  }
  return () => controller.abort()
}
