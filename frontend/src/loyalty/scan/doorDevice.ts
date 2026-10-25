import { useEffect } from 'react'
import { SOUND_KEY, soundOn } from './verdict'

/**
 * What door mode asks of the device (spec 2026-10-25 §2), each a best effort that never breaks the page: the two-tone
 * sound (WebAudio, off unless this device switched it on), keeping the screen awake while the door is scanned (Screen
 * Wake Lock, where the browser has it), and the browser's full screen. Nothing here runs without a window.
 */

type AudioCtor = new () => AudioContext

let audio: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  if (!audio) {
    try { audio = new Ctor() } catch { return null }
  }
  return audio
}

/** Browsers start sound only after a press: each press on door mode lets it play (a no-op once it can). */
export function unlockSound(): void {
  const ctx = audioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

/** Two short tones, one after the other (verdict.ts `soundOf`): rising for a welcome, falling for a refusal. */
export function playTones(tones: readonly [number, number]): void {
  const ctx = audioContext()
  if (!ctx) return
  try {
    const start = ctx.currentTime + 0.02
    tones.forEach((hz, i) => {
      const at = start + i * 0.17
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(hz, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.17)
    })
  } catch {
    // No sound on this device: the screen says it all.
  }
}

/** The sound setting this device remembers (off by default, and where storage is blocked). */
export function loadSound(): boolean {
  try {
    return typeof window !== 'undefined' && soundOn(window.localStorage.getItem(SOUND_KEY))
  } catch {
    return false
  }
}

export function saveSound(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // Blocked storage: the setting lasts as long as the page.
  }
}

interface WakeLockLike { release: () => Promise<void> }
interface WakeLockNavigator { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } }

/**
 * Keeps the screen awake while `active` (a tablet at a door must not go dark between members). The browser drops the
 * lock when the page is hidden; it is asked again when the page shows.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return
    const wake = (navigator as unknown as WakeLockNavigator).wakeLock
    if (!wake) return
    let lock: WakeLockLike | null = null
    let gone = false
    const ask = () => {
      wake.request('screen').then((l) => { if (gone) void l.release().catch(() => {}); else lock = l }, () => {})
    }
    const onShow = () => { if (document.visibilityState === 'visible') ask() }
    ask()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onShow)
      if (lock) void lock.release().catch(() => {})
    }
  }, [active])
}

/** Whether this browser lets the page take the whole screen (not on a phone's Safari, for one). */
export function canFullScreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true
}

export function toggleFullScreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  } catch {
    // Refused: the page is already as full as door mode needs.
  }
}
