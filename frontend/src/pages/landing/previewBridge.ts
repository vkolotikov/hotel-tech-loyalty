/**
 * COUPLING THE CARD TO THE PREVIEW — template fidelity 2.5, the parent
 * half.
 *
 * Opening a card and finding the band it edits are one action as far as the
 * tenant is concerned, and the two halves of this screen currently have no
 * way to agree on a subject: the list scrolls in the admin document and the
 * page scrolls inside a cross-origin iframe (`config/landing.php` puts the
 * landing host on a different origin by design, and `LandingPageSecurity`
 * is what makes the preview framable from the admin origin AT ALL). So the
 * two talk by `postMessage`, with an EXPLICIT target origin in both
 * directions — never `'*'`, which would broadcast the tenant's section keys
 * to whatever the frame happened to have navigated to.
 *
 * All three kits already carry `data-block="…"` on every one of their
 * fifteen blocks, which is what the receiving half scrolls to.
 *
 * ─── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────
 *
 * The RECEIVER. `public/landing/preview-bridge.js` — loaded only under the
 * preview signature, scrolling `[data-block]` into view and posting a
 * selection back — is a change to the landing template tree (a new public
 * script plus a conditional `<script>` in each layout under the existing
 * nonce), and this phase is scoped to the admin SPA. Until it ships, the
 * outbound message is inert: it costs one `postMessage` per card opened,
 * addressed to an origin that ignores it, and nothing on this screen
 * pretends otherwise (no control claims to scroll the preview). The inbound
 * direction is already live for whatever ships it, because the validation
 * has to exist before the sender does, not after.
 *
 * Pure, no DOM, no React — `previewBridge.test.ts` is where the origin
 * check and the message grammar are actually proven, which is only possible
 * because neither of them lives inside a component.
 */

/** The `type` both ends agree on. Namespaced because the admin document
 *  hosts other frames (the booking widget, the chat frame) and a bare
 *  `'focus'` would be a message any of them could plausibly send. */
export const FOCUS_MESSAGE = 'landing:focus'
export const SELECT_MESSAGE = 'landing:select'

/** Who sent it. Checked as well as `type`, so a page that happens to use
 *  the same verb cannot drive this screen's accordion. */
const PARENT_SOURCE = 'landing-builder'
const FRAME_SOURCE = 'landing-preview'

export type FocusMessage = {
  source: typeof PARENT_SOURCE
  type: typeof FOCUS_MESSAGE
  key: string
}

/**
 * The origin a preview URL belongs to — the only value that may be used as
 * a `postMessage` target.
 *
 * Derived from the URL the SERVER minted for this frame, never from a
 * config copy on this side: `config/landing.php`'s host is the server's
 * fact, and a second copy here is a second answer to "where is the preview"
 * that could quietly become wrong on one deployment.
 *
 * Null for anything unparseable (no URL yet, a relative path, a data: URL),
 * and a null target means nothing is posted at all — an unaddressable
 * message is not sent to `'*'` instead.
 */
export function previewOrigin(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url === '') return null

  try {
    const origin = new URL(url).origin

    // `new URL('data:…').origin` is the string "null" in every browser, and
    // it is not an origin anything may be posted to.
    return origin === 'null' || origin === '' ? null : origin
  } catch {
    return null
  }
}

/** What the parent sends when a card opens. */
export function focusMessage(key: string): FocusMessage {
  return { source: PARENT_SOURCE, type: FOCUS_MESSAGE, key }
}

/**
 * The key an inbound "the visitor clicked this band" message names, or null
 * if this is not one.
 *
 * TWO GATES, both required, in the caller's own order: the event's ORIGIN
 * must be the preview's (checked by `isFromPreview` below, because only the
 * caller holds the event), and the payload must be this exact shape. A
 * message that clears both still only ever selects a card — it can neither
 * write nor save anything — which is the reason this direction is safe to
 * accept before its sender exists.
 */
export function selectedKey(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null

  const message = data as Record<string, unknown>

  if (message.source !== FRAME_SOURCE || message.type !== SELECT_MESSAGE) return null
  if (typeof message.key !== 'string' || message.key === '') return null

  return message.key
}

/**
 * Whether an inbound message came from the frame this pane is showing.
 *
 * Compared against the origin of the URL the frame was actually given, so a
 * message from any other frame in the document — or from an opener, or from
 * an extension — is dropped before its payload is even read.
 */
export function isFromPreview(eventOrigin: string, previewUrl: string | null | undefined): boolean {
  const origin = previewOrigin(previewUrl)

  return origin !== null && eventOrigin === origin
}
