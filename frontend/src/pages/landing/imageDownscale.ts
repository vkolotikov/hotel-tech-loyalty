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

/**
 * The format a downscaled photo is re-encoded to, and its quality
 * (template fidelity 4.8).
 *
 * WEBP, NOT JPEG. These designs are photography-led and the author's own
 * reference assets are 21-151 KB WebP files; re-encoding a tenant's phone
 * photo to JPEG made their picture heavier than the one it was replacing,
 * on the one page whose entire pitch is how it looks. WebP at 0.9 is
 * visually equivalent to JPEG at 0.85 and lands roughly a third smaller.
 *
 * The server already accepts it — `mimes:jpeg,png,jpg,webp` on both image
 * endpoints — so this needed no backend change.
 *
 * A browser that cannot ENCODE WebP (Safari before 14) ignores the type and
 * `canvas.toBlob` falls back to PNG, which those endpoints also accept. That
 * is heavier than either, and it is the correct degradation: a photograph
 * that uploads is worth more than one that does not.
 */
export const OUTPUT_TYPE = 'image/webp'
export const OUTPUT_QUALITY = 0.9

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
 * Resize `file` onto a canvas sized `target` and re-encode it as a WebP
 * blob. NOT unit-testable in this repo's node-env vitest — no
 * `HTMLCanvasElement`/`createImageBitmap` in that environment — so this is
 * deliberately kept under ten lines: `downscaleTarget` and `downscaledName`
 * carry every actual decision (and are exhaustively tested); this is only
 * the untested seam that carries them out.
 */
export async function drawToBlob(file: File, target: { w: number; h: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = target.w
  canvas.height = target.h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, target.w, target.h)
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), OUTPUT_TYPE, OUTPUT_QUALITY))
}

/**
 * What a re-encoded upload should be CALLED — the original name with its
 * extension swapped for the one `drawToBlob` actually produced.
 *
 * The bytes on the wire are WebP whatever the picked file was called, and
 * `holiday.HEIC` arriving at the server as WebP-bytes-named-HEIC is a
 * disagreement two different pieces of code (Laravel's `mimes` rule, which
 * sniffs, and `storePublicly`, which names the stored file) would resolve
 * differently. Renaming here is the one place that has to know.
 *
 * A name with no extension gets one appended rather than losing its last
 * dot-separated word, and a name that is nothing but an extension is left
 * alone — both are real things a file picker can hand back.
 */
export function downscaledName(name: string, extension = 'webp'): string {
  const dot = name.lastIndexOf('.')

  return dot > 0 ? `${name.slice(0, dot)}.${extension}` : `${name}.${extension}`
}
