/** What the server says about this app's versions (`GET /v1/apps/staff/version`). */
export interface AppVersions {
  app: string
  min_version: string
  latest_version: string
  update_url: { ios: string | null; android: string | null }
}

/** Where this installed app stands: fine, a newer one is offered, or too old to be served. */
export type VersionState = 'current' | 'update_available' | 'update_required'

/** "1.2.3" as numbers; missing or odd parts count as 0, so a malformed version never blocks anyone. */
function parts(version: string): [number, number, number] {
  const [a, b, c] = version.trim().split('.').map(part => Number.parseInt(part, 10))
  return [a, b, c].map(n => (Number.isFinite(n) && n >= 0 ? n : 0)) as [number, number, number]
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return 0
}

export function versionState(installed: string, versions: Pick<AppVersions, 'min_version' | 'latest_version'>): VersionState {
  if (compareVersions(installed, versions.min_version) < 0) return 'update_required'
  if (compareVersions(installed, versions.latest_version) < 0) return 'update_available'
  return 'current'
}

/** The store page for this phone, or null when none is set yet. */
export function updateUrl(versions: AppVersions | null, platform: string): string | null {
  if (!versions) return null
  return platform === 'ios' ? versions.update_url.ios : platform === 'android' ? versions.update_url.android : null
}
