/**
 * Client-side downscale for the editor's photo controls (Task 6).
 *
 * The server already backstops every upload — `MaxImageDimensions(4096)`
 * (Task 3) rejects anything over 4096px on its longest side with a friendly
 * 422, and `max:5120` caps the byte size. This module exists so an ordinary
 * phone photo (routinely 3000-4000px on its long edge) never has to round-trip
 * to the server, get rejected, and make the tenant go find a smaller file —
 * the SPA resizes it down to something reasonable BEFORE upload whenever it
 * is larger than that, and simply sends the original bytes untouched when it
 * already fits.
 *
 * Split from the file-input branch in `LandingEditor.tsx` for the same
 * reason `editorSections.ts` is its own module: this repo's vitest is
 * pure-function-only, node-env, no DOM (see `vitest.config.ts`'s own
 * docblock) — `downscaleTarget` below is a pure decision function and can be
 * exhaustively unit-tested; `drawToBlob` is the thin, deliberately-small
 * seam that actually touches `canvas`/`Image` and CANNOT run under that
 * config (no `HTMLCanvasElement`, no `createImageBitmap` in a bare Node
 * environment) — it is exercised by the manual walkthrough instead (see
 * Task 6's report), not by an automated test.
 */

/** The longest edge, in pixels, an uploaded photo is downscaled to before
 *  it is sent — comfortably under the server's own 4096px backstop, chosen
 *  so nothing this screen ever uploads is large enough to need the server
 *  to reject it on size grounds alone. */
export const MAX_EDGE = 2560

/** Re-encode quality for the downscaled JPEG `drawToBlob` produces. */
export const JPEG_QUALITY = 0.85

/**
 * Decide the target size for a `w`×`h` photo, or `null` when it already
 * fits within `maxEdge` on its longest side and nothing needs to change.
 * Aspect ratio is preserved (both dimensions scaled by the same factor,
 * rounded to the nearest whole pixel independently — the two roundings can
 * disagree by at most half a pixel each, which is why callers should treat
 * the result as "close to" rather than bit-exact to the source ratio).
 */
export function downscaleTarget(w: number, h: number, maxEdge: number = MAX_EDGE): { w: number; h: number } | null {
  const edge = Math.max(w, h)
  if (edge <= maxEdge) return null
  const scale = maxEdge / edge
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/**
 * Resize `file` onto a canvas sized `target` and re-encode it as a JPEG
 * blob. NOT unit-testable in this repo's node-env vitest — no
 * `HTMLCanvasElement`/`createImageBitmap` in that environment — so this is
 * deliberately kept under ten lines: `downscaleTarget` above carries every
 * actual decision (and is exhaustively tested); this is only the untested
 * seam that carries it out, verified instead by the Task 6 walkthrough.
 */
export async function drawToBlob(file: File, target: { w: number; h: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = target.w
  canvas.height = target.h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, target.w, target.h)
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', JPEG_QUALITY))
}
