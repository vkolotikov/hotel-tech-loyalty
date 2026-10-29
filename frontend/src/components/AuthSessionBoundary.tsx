import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import { authSession } from '../lib/authSession'

/** Remount all local page state after a same-tab identity change; hide it while another tab changes identity. */
export function AuthSessionBoundary({ children }: { children: ReactNode }) {
  const version = useSyncExternalStore(authSession.subscribe, authSession.version, authSession.version)
  return authSession.blocked() ? null : <Fragment key={version}>{children}</Fragment>
}
