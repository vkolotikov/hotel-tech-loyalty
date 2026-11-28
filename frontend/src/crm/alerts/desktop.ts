import { useSyncExternalStore } from 'react'
import type { Permission } from './alertsLogic'

/**
 * Desktop notifications on this device (round 5): what the browser allows, and whether the person switched them on in
 * the inbox's Alerts switch (browser storage, a convenience only, inside try/catch). The browser is asked only from that
 * switch, never on its own.
 */
const KEY = 'crm:alerts-desktop'
const listeners = new Set<() => void>()

export function permission(): Permission {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    const p = window.Notification.permission
    return p === 'granted' || p === 'denied' ? p : 'default'
  } catch {
    return 'unsupported'
  }
}

export function wantsDesktop(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setWantsDesktop(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* this visit only */ }
  listeners.forEach(listener => listener())
}

/** Asks the browser (the switch's press); switched on when it says yes. */
export async function askPermission(): Promise<Permission> {
  try {
    const answer = await window.Notification.requestPermission()
    if (answer === 'granted') setWantsDesktop(true)
    else listeners.forEach(listener => listener())
    return answer === 'granted' || answer === 'denied' ? answer : 'default'
  } catch {
    return permission()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const snapshot = (): string => `${permission()}|${wantsDesktop() ? 1 : 0}`

/** The switch's state, kept current when it changes (here or in the hook). */
export function useDesktop(): { permission: Permission; wanted: boolean } {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'unsupported|0')
  const [p, w] = state.split('|')
  return { permission: p as Permission, wanted: w === '1' }
}

/** Shows one notification; a press brings the window forward and runs `onOpen`. Never throws. */
export function showNotification(title: string, body: string, onOpen: () => void): void {
  try {
    const n = new window.Notification(title, { body, tag: 'hexatech-crm-alert' })
    n.onclick = () => {
      try { window.focus() } catch { /* nothing */ }
      onOpen()
      n.close()
    }
    window.setTimeout(() => { try { n.close() } catch { /* gone */ } }, 8_000)
  } catch {
    // Some browsers allow notifications only from a service worker; the toast has said it already.
  }
}
