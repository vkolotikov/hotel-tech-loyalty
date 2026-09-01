import { describe, expect, it } from 'vitest'
import { downscaledName, downscaleTarget, MAX_EDGE, OUTPUT_QUALITY, OUTPUT_TYPE } from './imageDownscale'

describe('downscaleTarget', () => {
  it('returns null when the image already fits exactly at maxEdge (boundary is inclusive)', () => {
    expect(downscaleTarget(2560, 100)).toBeNull()
  })

  it('returns null when both dimensions are comfortably under maxEdge', () => {
    expect(downscaleTarget(800, 600)).toBeNull()
  })

  it('downscales a width-dominant (landscape) image proportionally', () => {
    expect(downscaleTarget(4000, 3000)).toEqual({ w: 2560, h: 1920 })
  })

  it('downscales a height-dominant (portrait) image proportionally', () => {
    expect(downscaleTarget(100, 4000)).toEqual({ w: 64, h: 2560 })
  })

  it('scales one pixel past the boundary, not just comfortably-over sizes', () => {
    const result = downscaleTarget(2561, 2561)
    expect(result).not.toBeNull()
    expect(result!.w).toBeLessThanOrEqual(MAX_EDGE)
    expect(result!.h).toBeLessThanOrEqual(MAX_EDGE)
  })

  it('scales a square image to maxEdge on both sides', () => {
    expect(downscaleTarget(5000, 5000)).toEqual({ w: 2560, h: 2560 })
  })

  it('honours a custom maxEdge over the module default', () => {
    expect(downscaleTarget(2000, 1000, 1000)).toEqual({ w: 1000, h: 500 })
  })

  it('a custom maxEdge that already fits still returns null', () => {
    expect(downscaleTarget(900, 500, 1000)).toBeNull()
  })

  it('preserves aspect ratio within rounding for a size that does not divide evenly', () => {
    const w = 4001
    const h = 777
    const result = downscaleTarget(w, h)!
    const sourceRatio = w / h
    const targetRatio = result.w / result.h
    // Each dimension is rounded independently, so the two ratios can only
    // drift by a fraction of a pixel's worth — not exactly equal, but close.
    expect(Math.abs(targetRatio - sourceRatio)).toBeLessThan(0.01)
    expect(Math.max(result.w, result.h)).toBe(MAX_EDGE)
  })

  it('defaults maxEdge to the module constant when not passed', () => {
    expect(downscaleTarget(9999, 1)).toEqual(downscaleTarget(9999, 1, MAX_EDGE))
  })

  // Fix round 1 (reviewer Minor): degenerate input pinned as-is — a
  // `0`/negative edge is never greater than `maxEdge`, so both fall
  // through to the same "already fits" `null` every other in-bounds size
  // takes. Not reachable from a real file (nothing decodes to 0×0 or
  // negative dimensions), but harmless, and now pinned rather than merely
  // assumed.
  it('returns null for a degenerate 0x0 size', () => {
    expect(downscaleTarget(0, 0)).toBeNull()
  })

  it('returns null for degenerate negative dimensions', () => {
    expect(downscaleTarget(-100, -50)).toBeNull()
  })
})

/**
 * TEMPLATE FIDELITY 4.8 — uploads stop being re-encoded to JPEG.
 *
 * On a design whose entire pitch is photography, a tenant's phone photo was
 * arriving heavier than the 21-151 KB WebP reference assets it replaced. The
 * server already accepted WebP (`mimes:jpeg,png,jpg,webp` on both image
 * endpoints), so this needed no backend change at all.
 */
describe('the upload format', () => {
  it('emits WebP, at a quality equivalent to the JPEG it replaces', () => {
    expect(OUTPUT_TYPE).toBe('image/webp')
    expect(OUTPUT_QUALITY).toBeGreaterThan(0.85)
    expect(OUTPUT_QUALITY).toBeLessThanOrEqual(1)
  })
})

/**
 * The bytes on the wire are WebP whatever the picked file was called, and
 * two different pieces of code downstream — Laravel's `mimes` rule, which
 * sniffs, and `storePublicly`, which names the stored file — would resolve
 * that disagreement differently.
 */
describe('downscaledName', () => {
  it('swaps the extension for the one the re-encode actually produced', () => {
    expect(downscaledName('holiday.JPG')).toBe('holiday.webp')
    expect(downscaledName('a.very.long.name.png')).toBe('a.very.long.name.webp')
    expect(downscaledName('photo.heic')).toBe('photo.webp')
  })

  it('appends one to a name that has none rather than inventing a stem', () => {
    expect(downscaledName('holiday')).toBe('holiday.webp')
  })

  /** A leading dot is a whole filename on every POSIX system, not an
   *  extension on an empty stem — losing the name would be worse than
   *  keeping a second dot. */
  it('leaves a dotfile-shaped name with its own name intact', () => {
    expect(downscaledName('.hidden')).toBe('.hidden.webp')
  })

  it('takes the extension it is given, so a fallback encode can name itself', () => {
    expect(downscaledName('holiday.jpg', 'png')).toBe('holiday.png')
  })
})
