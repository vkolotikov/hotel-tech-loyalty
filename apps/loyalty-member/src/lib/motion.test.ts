import { describe, expect, it } from 'vitest'
import { popupPlacement, rememberOrigin, takeOrigin } from './motion'

describe('contextual popup placement', () => {
  it('opens below the pressed balance while preserving screen edges', () => {
    expect(popupPlacement({ width: 393, height: 852 }, { top: 62, bottom: 34 }, 442, 'popup', { x: 45, y: 263, width: 303, height: 44 }))
      .toMatchObject({ x: 24, y: 319, width: 345, height: 442 })
  })
  it('keeps a low trigger, narrow screen and keyboard visible area in bounds', () => {
    const p = popupPlacement({ width: 320, height: 380 }, { top: 30, bottom: 16 }, 600, 'popup', { x: 290, y: 700, width: 50, height: 44 })
    expect(p.width).toBe(272)
    expect(p.x).toBeGreaterThanOrEqual(16)
    expect(p.y).toBeGreaterThanOrEqual(42)
    expect(p.y + p.height).toBeLessThanOrEqual(368)
  })
  it('centres popups on tablets and keeps long sheets at the bottom', () => {
    const p = popupPlacement({ width: 1024, height: 1366 }, { top: 24, bottom: 20 }, 300, 'popup')
    expect(p.width).toBe(480)
    expect(p.x).toBe(272)
    const s = popupPlacement({ width: 1024, height: 1366 }, { top: 24, bottom: 20 }, 700, 'sheet')
    expect(s.width).toBe(640)
    expect(s.y + s.height).toBe(1346)
  })
  it('does not reuse a trigger for the next unrelated popup', () => {
    const box = { x: 24, y: 200, width: 345, height: 52 }
    rememberOrigin(box, 100)
    expect(takeOrigin(200)).toEqual(box)
    expect(takeOrigin(201)).toBeUndefined()
    rememberOrigin(box, 100)
    expect(takeOrigin(2000)).toBeUndefined()
  })
})
