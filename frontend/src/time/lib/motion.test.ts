import { describe, expect, it } from 'vitest'
import { barWidth, countAt, easeOut, revealChars, revealDuration, staggerDelay } from './motion'

describe('the planner\u2019s motion, in numbers', () => {
  it('counts from nothing to the figure itself, quick at first', () => {
    expect(countAt(146, 0)).toBe(0)
    expect(countAt(146, 1)).toBe(146)
    expect(countAt(146, 2)).toBe(146)
    expect(countAt(146, 0.5)).toBeGreaterThan(73)
    expect([easeOut(-1), easeOut(0), easeOut(1), easeOut(3)]).toEqual([0, 0, 1, 1])
  })

  it('writes a short answer in half a second and a long one in a little over two', () => {
    expect(revealDuration(10)).toBe(500)
    expect(revealDuration(100)).toBe(1400)
    expect(revealDuration(5000)).toBe(2200)
    expect(revealChars(200, 0, 1000)).toBe(0)
    expect(revealChars(200, 500, 1000)).toBe(100)
    expect(revealChars(200, 1000, 1000)).toBe(200)
    expect(revealChars(200, 5000, 1000)).toBe(200)
    expect(revealChars(200, 10, 0)).toBe(200)
  })

  it('keeps a bar inside its track and a list from waiting too long', () => {
    expect([barWidth(31.4), barWidth(140), barWidth(-5), barWidth(null), barWidth(Number.NaN)]).toEqual([31, 100, 0, 0, 0])
    expect([staggerDelay(0), staggerDelay(3), staggerDelay(40), staggerDelay(2, 70)]).toEqual([0, 135, 540, 140])
  })
})
