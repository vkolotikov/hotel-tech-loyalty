/**
 * The live preview's decision-making, as pure functions.
 *
 * `LandingPreview.tsx` now shows the tenant's UNSAVED edits: on every
 * change it posts the in-flight state to
 * `POST /v1/admin/landing-pages/preview-draft`, which parks it server-side
 * and hands back a signed URL that renders the REAL Blade template from it
 * (`App\Landing\PreviewDraft`). Nothing about the page is re-implemented in
 * the browser — that would be a second copy of the design, drifting from the
 * one that actually ships.
 *
 * What IS decided in the browser is when to ask, which answer to trust, when
 * to swap the frame, and what the caption may honestly claim. All four are
 * here rather than in the component, for this folder's standing reason: this
 * repo's vitest is node-env with no jsdom and no React Testing Library (see
 * `vitest.config.ts`), so an `<iframe>`, a `setTimeout` inside a React
 * effect and an `AbortController` cannot be exercised by an automated test at
 * all. A reducer and a handful of predicates can.
 *
 * WHAT STILL NEEDS A BROWSER, and is therefore covered by neither this
 * module's tests nor any other: that the debounce timer actually fires, that
 * `AbortController` actually cancels an axios request, that the hidden
 * `<iframe>`'s `load` event fires before the swap, and that swapping which
 * of the two frames is visible does not repaint. Those are wiring, and the
 * reducer below is what makes the wiring's job small enough to read.
 */

/** One section row, exactly as `PUT /sections` and the draft endpoint take it. */
export type DraftSectionRow = {
  key: string
  enabled: boolean
  sort: number
  tone: string | null
}

/**
 * The wire body of a draft render.
 *
 * Deliberately the SAME three things the save path sends (`theme`,
 * `content`, the section rows) and built by the SAME helpers
 * (`themePayload`, `stripImageLeaves`, `buildSectionsPayload`) — a
 * preview assembled from a second, nearly-identical payload builder would be
 * a preview of something the save would not produce.
 *
 * `image_url` is absent by construction: it has one writer (the image
 * endpoints) and the server refuses it here exactly as it refuses it on a
 * save. The photo still shows, because the server takes it from the STORED
 * row.
 */
export type DraftPayload = {
  theme: Record<string, unknown>
  content: Record<string, unknown>
  sections: DraftSectionRow[]
}

/**
 * How long to wait after the tenant stops changing something before asking
 * the server to render it.
 *
 * SIX HUNDRED MILLISECONDS. Below roughly 400ms a touch-typist generates a
 * request between words rather than between thoughts, and every one of them
 * is a full server-side render of the page; above roughly a second the pane
 * stops feeling connected to the typing and the tenant starts wondering
 * whether it is working at all. 600ms sits in the gap: longer than the pause
 * inside a sentence, shorter than the pause after one. It is also what makes
 * the endpoint's 60/min throttle comfortable rather than tight — a burst
 * that did cross it degrades to "showing the last version" rather than to
 * anything broken.
 *
 * The debounce is only half of the protection. {@see livePreviewReducer}'s
 * sequence guard is the other half: a slow render of an old payload must
 * never land on top of a fast render of a newer one.
 */
export const LIVE_PREVIEW_DEBOUNCE_MS = 600

/**
 * How long a stashed draft stays renderable server-side —
 * `App\Landing\PreviewDraft::TTL_SECONDS`.
 *
 * A FALLBACK, not the authority: the endpoint returns `expires_in` on every
 * response and the component passes that through, for the same reason every
 * other cap and allowlist on this screen is served rather than mirrored. A
 * hardcoded number here is a number the server might later disagree with.
 * This value only decides the caption for a frame minted before the first
 * response ever arrived, which cannot happen in practice.
 */
export const DRAFT_STASH_TTL_MS = 90_000

/** One loaded (or loading) frame in the pane. */
export type PreviewFrame = {
  url: string
  /** Whether this URL carries a draft stash key, or is the plain saved-draft preview. */
  draft: boolean
  /** When the draft behind it was minted (epoch ms). Zero for a saved-draft frame. */
  at: number
}

/**
 * Which of the two frames is in front.
 *
 * TWO PERMANENT SLOTS, and this is the whole no-flicker mechanism. Pointing
 * one `<iframe>` at a new URL blanks it while the new page loads, so a pane
 * with a single frame flashes white on every render — several times a
 * minute, right next to the words the tenant is typing. Instead the pane
 * holds two frames forever: the visible one keeps its pixels while the
 * hidden one loads the next URL, and "swapping" is nothing but flipping
 * which is visible. Neither element is ever unmounted, so neither ever
 * reloads because React re-keyed it.
 */
export type FrameSlot = 'a' | 'b'

export type LivePreviewState = {
  /** The sequence number of the most recently ISSUED draft request. */
  issued: number
  /** Which slot is visible. */
  front: FrameSlot
  a: PreviewFrame | null
  b: PreviewFrame | null
  /**
   * The last draft request we care about failed, and nothing has succeeded
   * since. The frame keeps showing the last good render; only the caption
   * changes.
   */
  failed: boolean
}

export const initialLivePreviewState: LivePreviewState = {
  issued: 0,
  front: 'a',
  a: null,
  b: null,
  failed: false,
}

export type LivePreviewEvent =
  /** The plain signed preview URL arrived (or was refetched) from `preview-url`. */
  | { type: 'saved_url'; url: string }
  /** A draft request is going out now, carrying this sequence number. */
  | { type: 'requested'; seq: number }
  /** That request came back with a URL to render. */
  | { type: 'rendered'; seq: number; url: string; at: number }
  /** That request failed (network, 422, 429 — anything that is not a cancellation). */
  | { type: 'failed'; seq: number }
  /**
   * A frame finished loading this URL — at `at`, with `ttlMs` the stash
   * lifetime the server last published. The last two are what let the
   * reducer notice the ONE case where a frame silently stops showing a
   * draft: see its `loaded` arm.
   */
  | { type: 'loaded'; url: string; at: number; ttlMs: number }

const back = (front: FrameSlot): FrameSlot => (front === 'a' ? 'b' : 'a')

/**
 * Written out rather than `{ ...state, [slot]: frame }`: a computed key of a
 * union type widens the result to an index signature, which stops
 * TypeScript checking that what comes back is still a LivePreviewState.
 */
function withSlot(state: LivePreviewState, slot: FrameSlot, frame: PreviewFrame | null): LivePreviewState {
  return slot === 'a' ? { ...state, a: frame } : { ...state, b: frame }
}

/**
 * Put a frame where it belongs: straight into the visible slot when the pane
 * is still empty (there are no pixels to protect), otherwise into the hidden
 * one, to be promoted by {@see livePreviewReducer}'s `loaded` case once the
 * browser says it has actually painted it.
 */
function place(state: LivePreviewState, frame: PreviewFrame): LivePreviewState {
  const visible = state[state.front]

  if (visible === null) {
    return withSlot(state, state.front, frame)
  }

  if (visible.url === frame.url) {
    return state
  }

  return withSlot(state, back(state.front), frame)
}

/**
 * THE ORDERING GUARANTEE, and the swap.
 *
 * Two rules, and the pane's honesty rests on both:
 *
 *   - A response is only accepted while it is still the NEWEST request we
 *     issued (`seq === state.issued`). A fast typist can have a render of
 *     "The Ar" still in flight when "The Art of Wellness" comes back, and
 *     without this the older answer would land last and the pane would show
 *     copy the tenant deleted two seconds ago. Requests are also aborted at
 *     the network level, but an abort is a request to stop, not a promise
 *     that nothing already in flight will arrive — so the guard is what
 *     actually holds, and the abort is what saves the work.
 *
 *   - The frame only swaps on `loaded`, never on `rendered`. A URL that has
 *     been minted is not a page that has been painted; promoting on the
 *     response would show a blank frame for as long as the render takes.
 */
export function livePreviewReducer(state: LivePreviewState, event: LivePreviewEvent): LivePreviewState {
  switch (event.type) {
    case 'saved_url': {
      // Never REPLACES a draft with the saved page: the draft is the newer,
      // truer picture, and dropping back to the saved render because a
      // routine URL refresh happened to land would be a visible lie.
      if (state[state.front]?.draft) {
        return state
      }

      return place(state, { url: event.url, draft: false, at: 0 })
    }

    case 'requested':
      return { ...state, issued: event.seq }

    case 'rendered':
      if (event.seq !== state.issued) {
        return state
      }

      return place({ ...state, failed: false }, { url: event.url, draft: true, at: event.at })

    case 'failed':
      // A stale failure says nothing about the request that overtook it.
      if (event.seq !== state.issued) {
        return state
      }

      return { ...state, failed: true }

    case 'loaded': {
      const hidden = state[back(state.front)]

      // Only the hidden frame's own load promotes it. The visible frame
      // fires `load` too — on its very first navigation — and treating that
      // as a promotion would flip to whatever the other slot still held.
      if (hidden !== null && hidden.url === event.url) {
        return { ...state, front: back(state.front) }
      }

      const visible = state[state.front]

      // THE ONE WAY A FRAME STOPS BEING LIVE WITHOUT US ASKING IT TO. The
      // visible frame firing `load` a SECOND time means the browser
      // re-fetched that URL by itself — a restored tab, a bfcache miss —
      // and if the ninety-second stash behind it has since expired, what
      // came back is not the draft any more: `PreviewDraft::hydrate()`
      // answers null past its TTL and the route falls back to the SAVED
      // row rather than erroring. The pixels changed under us. The frame is
      // therefore demoted to a saved-page frame, which is the whole reason
      // the caption can stop claiming "live" honestly instead of ageing out
      // on a timer — a pane nobody has touched for ten minutes is still
      // showing exactly the tenant's unsaved work, and saying otherwise
      // would be its own small lie.
      if (visible !== null
        && visible.url === event.url
        && visible.draft
        && isDraftStashExpired(visible.at, event.at, event.ttlMs)) {
        return withSlot(state, state.front, { ...visible, draft: false, at: 0 })
      }

      return state
    }

    default:
      return state
  }
}

/** The frame the tenant is actually looking at. */
export function shownFrame(state: LivePreviewState): PreviewFrame | null {
  return state[state.front]
}

/** The frame loading behind it, if any — rendered hidden, never focusable. */
export function loadingFrame(state: LivePreviewState): PreviewFrame | null {
  return state[back(state.front)]
}

/**
 * True once the stash behind a draft URL has certainly expired server-side.
 *
 * Asked in exactly ONE place — the reducer's `loaded` arm, about a frame the
 * browser has just re-fetched of its own accord. It is deliberately NOT a
 * timer on the caption: a pane nobody has touched for ten minutes is still
 * showing precisely the tenant's unsaved work, and the stash aging out
 * changes what that URL would render NEXT, not what is on the screen now.
 */
export function isDraftStashExpired(mintedAt: number, now: number, ttlMs: number = DRAFT_STASH_TTL_MS): boolean {
  return now - mintedAt >= ttlMs
}

/**
 * What the caption is allowed to say.
 *
 * The old caption said one thing forever — "Shows your saved draft. Save to
 * see the latest changes." — and it was true. Replacing it with "live"
 * forever would just be a different sentence that is sometimes false, which
 * is the same defect the other way round. So it is computed from what the
 * pane is actually showing:
 *
 *   - `stale`  — the last request failed. The frame still shows the last
 *                good render, and the caption says so quietly rather than
 *                pretending it is current or blanking the pane.
 *   - `live`   — the frame is showing a draft render, i.e. the tenant's own
 *                unsaved edits.
 *   - `saved`  — the frame is showing the saved page: nothing has been
 *                edited yet, or the browser re-fetched a frame whose stash
 *                had expired and the server answered with the saved row
 *                (see the reducer's `loaded` arm, which is what notices).
 */
export type PreviewCaptionState = 'live' | 'saved' | 'stale'

export function previewCaptionState(state: LivePreviewState): PreviewCaptionState {
  if (state.failed) {
    return 'stale'
  }

  return shownFrame(state)?.draft ? 'live' : 'saved'
}

/**
 * Whether the live pipeline should be running at all.
 *
 * A tenant who opens the editor and reads it has nothing unsaved, so the
 * saved-draft frame the pane already loaded IS the current state of their
 * page, and asking the server to render an identical copy of it would be one
 * more page render per editor open for no change on screen. The pipeline
 * starts at the first thing that could make the two differ: an unsaved edit
 * (`dirty`), or any of the writes that happen at once and bump the nonce —
 * a photo upload, a section added or removed, a save.
 */
export function livePreviewIsActive(input: { dirty: boolean; nonce: number }): boolean {
  return input.dirty || input.nonce > 0
}

/**
 * A stable identity for one draft payload.
 *
 * React hands the component a NEW payload object on every keystroke, most of
 * which are identical to the last one (a re-render caused by some unrelated
 * state). Debouncing on object identity would therefore re-arm the timer
 * forever without anything changing; debouncing on this does not.
 *
 * Object keys are sorted so that two payloads differing only in key order —
 * which `{...spread}` and `Object.entries` both produce freely — fingerprint
 * the same. Arrays keep their order, because for `sections` the order IS the
 * content.
 *
 * The nonce rides along because it stands for changes the payload cannot
 * see: an uploaded photo and an added or removed band are written straight
 * to the server, and `content`/`sections` may be byte-identical either side
 * of one.
 */
export function draftFingerprint(payload: DraftPayload, nonce: number): string {
  return `${nonce}|${stableStringify(payload)}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)

  return `{${entries.join(',')}}`
}
