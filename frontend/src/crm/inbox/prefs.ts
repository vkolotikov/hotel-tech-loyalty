/**
 * This device's conveniences in the inbox (browser storage, read and written inside try/catch so a private window or
 * blocked storage only forgets them): one row per visitor, and whether the details column is folded away (round 5).
 */
const GROUP_KEY = 'crm:inbox-group'
const DETAILS_KEY = 'crm:inbox-details'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* not remembered */ }
}

export const loadGroup = (): boolean => read(GROUP_KEY) !== '0'
export const rememberGroup = (on: boolean): void => write(GROUP_KEY, on ? '1' : '0')

/** The details column shows unless this device folded it away. */
export const loadDetailsOpen = (): boolean => read(DETAILS_KEY) !== '0'
export const rememberDetailsOpen = (open: boolean): void => write(DETAILS_KEY, open ? '1' : '0')
