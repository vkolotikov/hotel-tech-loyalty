/**
 * The inbox's chime when a visitor writes (the full admin's two tones). Whether it plays is this device's choice
 * (browser storage, a convenience only); a browser that blocks sound before a click simply stays quiet.
 */
const KEY = 'crm:inbox-sound'

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

export function rememberSound(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private window: not remembered */ }
}

/** Unread visitor messages went up since the last look (not on the first look). */
export function shouldChime(previous: number | null, now: number): boolean {
  return previous !== null && now > previous
}

export function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ac = new Ctx()
    const tone = (freq: number, start: number, length: number) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      osc.connect(gain)
      gain.connect(ac.destination)
      gain.gain.setValueAtTime(0.0001, ac.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + length)
      osc.start(ac.currentTime + start)
      osc.stop(ac.currentTime + start + length + 0.02)
    }
    tone(880, 0, 0.12)
    tone(1175, 0.13, 0.16)
    window.setTimeout(() => { void ac.close() }, 600)
  } catch {
    // No sound on this device.
  }
}
