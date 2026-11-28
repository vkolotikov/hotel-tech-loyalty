/**
 * Confetti for a celebration (2026-11-28): the same pieces every time, so a render never rolls dice. Each piece has
 * its place across the screen, how long it waits and falls, how far it drifts and turns, its size and one of five
 * colours (theme/time.css paints `data-tone`).
 */
export interface Piece { left: number; delay: number; time: number; drift: number; turn: number; width: number; height: number; tone: 0 | 1 | 2 | 3 | 4 }

export const CONFETTI_TONES = 5

export function confettiPieces(count = 44, seed = 7): Piece[] {
  // Park–Miller: small enough to stay exact in a double, the same numbers on every device.
  let state = Math.max(1, Math.floor(seed)) % 2147483647
  const next = () => { state = (state * 48271) % 2147483647; return state / 2147483647 }
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    left: Math.round(next() * 1000) / 10,
    delay: Math.round(next() * 700),
    time: 2200 + Math.round(next() * 1400),
    drift: Math.round((next() - 0.5) * 240),
    turn: (360 + Math.round(next() * 720)) * (next() < 0.5 ? -1 : 1),
    width: 6 + Math.round(next() * 4),
    height: 10 + Math.round(next() * 8),
    tone: (i % CONFETTI_TONES) as Piece['tone'],
  }))
}

/** How long the whole shower lasts, in milliseconds (the slowest piece's wait and fall). */
export function confettiLength(pieces: readonly Piece[]): number {
  return pieces.reduce((longest, p) => Math.max(longest, p.delay + p.time), 0)
}
