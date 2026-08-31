import { describe, expect, it } from 'vitest'
import {
  DRAFT_STASH_TTL_MS,
  LIVE_PREVIEW_DEBOUNCE_MS,
  draftFingerprint,
  initialLivePreviewState,
  isDraftStashExpired,
  livePreviewIsActive,
  livePreviewReducer,
  loadingFrame,
  previewCaptionState,
  shownFrame,
  type DraftPayload,
  type LivePreviewEvent,
  type LivePreviewState,
} from './livePreview'

/** Fold a whole sequence of events, the way the component's dispatches do. */
const run = (events: LivePreviewEvent[], from: LivePreviewState = initialLivePreviewState): LivePreviewState =>
  events.reduce(livePreviewReducer, from)

/** The pane after one draft render has been issued, answered and painted. */
const painted = (url = '/preview?draft=one', at = 1_000, seq = 1): LivePreviewState =>
  run([
    { type: 'saved_url', url: '/preview?saved' },
    { type: 'requested', seq },
    { type: 'rendered', seq, url, at },
    { type: 'loaded', url, at, ttlMs: DRAFT_STASH_TTL_MS },
  ])

describe('LIVE_PREVIEW_DEBOUNCE_MS', () => {
  it('waits long enough to be a pause in typing, not a pause between keystrokes', () => {
    expect(LIVE_PREVIEW_DEBOUNCE_MS).toBe(600)
  })

  it('stays under one second, so the pane still reads as connected to the typing', () => {
    expect(LIVE_PREVIEW_DEBOUNCE_MS).toBeLessThan(1_000)
  })
})

describe('DRAFT_STASH_TTL_MS', () => {
  it("mirrors App\\Landing\\PreviewDraft::TTL_SECONDS' ninety seconds", () => {
    expect(DRAFT_STASH_TTL_MS).toBe(90_000)
  })
})

describe('livePreviewIsActive', () => {
  it('stays off for a tenant who has only opened the editor and looked at it', () => {
    // The saved-draft frame the pane already loaded IS the current state of
    // the page, so rendering an identical copy of it buys nothing.
    expect(livePreviewIsActive({ dirty: false, nonce: 0 })).toBe(false)
  })

  it('starts at the first unsaved edit', () => {
    expect(livePreviewIsActive({ dirty: true, nonce: 0 })).toBe(true)
  })

  it('starts on a write that happened server-side without touching the form', () => {
    // A photo upload, an added or removed band, a save: none of them make
    // `form` dirty, and every one of them changes what the page renders.
    expect(livePreviewIsActive({ dirty: false, nonce: 1 })).toBe(true)
  })
})

describe('livePreviewReducer — the first frame', () => {
  it('shows the saved preview straight away rather than double-buffering into an empty pane', () => {
    const state = run([{ type: 'saved_url', url: '/preview?saved' }])

    expect(shownFrame(state)).toEqual({ url: '/preview?saved', draft: false, at: 0 })
    expect(loadingFrame(state)).toBeNull()
  })

  it('ignores a repeat of the URL it is already showing', () => {
    const first = run([{ type: 'saved_url', url: '/preview?saved' }])
    const again = livePreviewReducer(first, { type: 'saved_url', url: '/preview?saved' })

    expect(again).toBe(first)
  })

  it('loads a refreshed saved URL behind the current one rather than blanking the pane', () => {
    const state = run([
      { type: 'saved_url', url: '/preview?saved=1' },
      { type: 'saved_url', url: '/preview?saved=2' },
    ])

    expect(shownFrame(state)?.url).toBe('/preview?saved=1')
    expect(loadingFrame(state)?.url).toBe('/preview?saved=2')
  })
})

describe('livePreviewReducer — no flicker', () => {
  it('does not swap the frame when the render URL arrives, only when it has loaded', () => {
    const pending = run([
      { type: 'saved_url', url: '/preview?saved' },
      { type: 'requested', seq: 1 },
      { type: 'rendered', seq: 1, url: '/preview?draft=one', at: 1_000 },
    ])

    // The tenant is still looking at the last good page while the new one
    // loads out of sight.
    expect(shownFrame(pending)?.url).toBe('/preview?saved')
    expect(loadingFrame(pending)?.url).toBe('/preview?draft=one')

    const swapped = livePreviewReducer(pending,
      { type: 'loaded', url: '/preview?draft=one', at: 1_100, ttlMs: DRAFT_STASH_TTL_MS })

    expect(shownFrame(swapped)?.url).toBe('/preview?draft=one')
    expect(loadingFrame(swapped)?.url).toBe('/preview?saved')
  })

  it('keeps the two slots forever, so neither iframe is ever unmounted and reloaded', () => {
    const state = painted()

    // Both slots still hold a frame: the visible one and the previous one it
    // was promoted over.
    expect(state.a).not.toBeNull()
    expect(state.b).not.toBeNull()
  })

  it('ignores the visible frame reporting its own load', () => {
    const state = run([{ type: 'saved_url', url: '/preview?saved' }])
    const after = livePreviewReducer(state,
      { type: 'loaded', url: '/preview?saved', at: 1_000, ttlMs: DRAFT_STASH_TTL_MS })

    // The front frame fires `load` on its own first navigation; treating
    // that as a promotion would flip to whatever the other slot held.
    expect(after).toBe(state)
    expect(shownFrame(after)?.url).toBe('/preview?saved')
  })

  it('demotes a draft frame the browser re-fetched after its stash expired', () => {
    // A restored tab re-requests the same URL; past ninety seconds the
    // server answers it with the SAVED row (PreviewDraft::hydrate() returns
    // null rather than erroring), so what is on screen is no longer a draft.
    const state = livePreviewReducer(painted('/preview?draft=one', 1_000), {
      type: 'loaded',
      url: '/preview?draft=one',
      at: 1_000 + DRAFT_STASH_TTL_MS,
      ttlMs: DRAFT_STASH_TTL_MS,
    })

    expect(shownFrame(state)?.draft).toBe(false)
    // Still the same frame and the same URL — nothing reloaded, nothing
    // swapped; only the claim the caption may make about it changed.
    expect(shownFrame(state)?.url).toBe('/preview?draft=one')
  })

  it('leaves a re-fetched frame alone while its stash is still alive', () => {
    const before = painted('/preview?draft=one', 1_000)
    const after = livePreviewReducer(before, {
      type: 'loaded',
      url: '/preview?draft=one',
      at: 1_000 + DRAFT_STASH_TTL_MS - 1,
      ttlMs: DRAFT_STASH_TTL_MS,
    })

    expect(after).toBe(before)
  })

  it('never drops back to the saved page once a draft is showing', () => {
    const state = painted()
    const after = livePreviewReducer(state, { type: 'saved_url', url: '/preview?saved=refreshed' })

    expect(after).toBe(state)
    expect(shownFrame(after)?.url).toBe('/preview?draft=one')
  })
})

describe('livePreviewReducer — ordering', () => {
  it('ignores a slow render of an older payload that lands after a newer request went out', () => {
    // A fast typist: request 1 ("The Ar") is still in flight when request 2
    // ("The Art of Wellness") is issued and answered.
    const state = run([
      { type: 'saved_url', url: '/preview?saved' },
      { type: 'requested', seq: 1 },
      { type: 'requested', seq: 2 },
      { type: 'rendered', seq: 2, url: '/preview?draft=new', at: 2_000 },
      { type: 'loaded', url: '/preview?draft=new', at: 2_100, ttlMs: DRAFT_STASH_TTL_MS },
      // ...and only now does the first request come back.
      { type: 'rendered', seq: 1, url: '/preview?draft=old', at: 1_000 },
    ])

    expect(shownFrame(state)?.url).toBe('/preview?draft=new')
    expect(loadingFrame(state)?.url).not.toBe('/preview?draft=old')
  })

  it('ignores a stale failure, which says nothing about the request that overtook it', () => {
    const state = run([
      { type: 'saved_url', url: '/preview?saved' },
      { type: 'requested', seq: 1 },
      { type: 'requested', seq: 2 },
      { type: 'rendered', seq: 2, url: '/preview?draft=new', at: 2_000 },
      { type: 'loaded', url: '/preview?draft=new', at: 2_100, ttlMs: DRAFT_STASH_TTL_MS },
      { type: 'failed', seq: 1 },
    ])

    expect(state.failed).toBe(false)
    expect(previewCaptionState(state)).toBe('live')
  })

  it('records a failure of the request that is still the newest', () => {
    const state = run([
      { type: 'saved_url', url: '/preview?saved' },
      { type: 'requested', seq: 1 },
      { type: 'failed', seq: 1 },
    ])

    expect(state.failed).toBe(true)
    // The last good render is still on screen — a failure must never blank
    // the pane.
    expect(shownFrame(state)?.url).toBe('/preview?saved')
  })

  it('clears a failure as soon as a later render succeeds', () => {
    const state = run([
      { type: 'saved_url', url: '/preview?saved' },
      { type: 'requested', seq: 1 },
      { type: 'failed', seq: 1 },
      { type: 'requested', seq: 2 },
      { type: 'rendered', seq: 2, url: '/preview?draft=two', at: 2_000 },
    ])

    expect(state.failed).toBe(false)
  })
})

describe('isDraftStashExpired', () => {
  it('is false for a frame minted this instant', () => {
    expect(isDraftStashExpired(1_000, 1_000)).toBe(false)
  })

  it('is false one millisecond before the stash TTL', () => {
    expect(isDraftStashExpired(1_000, 1_000 + DRAFT_STASH_TTL_MS - 1)).toBe(false)
  })

  it('is true at the TTL exactly, because the server has already let it go', () => {
    expect(isDraftStashExpired(1_000, 1_000 + DRAFT_STASH_TTL_MS)).toBe(true)
  })

  it('takes the TTL as an argument, so the served value governs and not the constant', () => {
    expect(isDraftStashExpired(0, 5_000, 10_000)).toBe(false)
    expect(isDraftStashExpired(0, 5_000, 4_000)).toBe(true)
  })

  it('is false before the clock has ticked at all', () => {
    // The component keeps "now" in state so render stays pure, and it starts
    // at zero. A negative age is not an expiry.
    expect(isDraftStashExpired(1_000, 0)).toBe(false)
  })
})

describe('previewCaptionState', () => {
  it('says saved before anything has been edited', () => {
    const state = run([{ type: 'saved_url', url: '/preview?saved' }])

    expect(previewCaptionState(state)).toBe('saved')
  })

  it('says live once a draft render is on screen', () => {
    expect(previewCaptionState(painted('/preview?draft=one', 1_000))).toBe('live')
  })

  it('keeps saying live for a pane nobody has touched, however long the stash has been dead', () => {
    // The pixels are still exactly the tenant's unsaved work. The stash
    // expiring changes what that URL would render if it were fetched AGAIN,
    // which is a different claim — and one the reducer only makes when the
    // browser has actually re-fetched (see the `loaded` tests below).
    const state = painted('/preview?draft=one', 1_000)

    expect(previewCaptionState(state)).toBe('live')
  })

  it('says stale — never live, never saved — while the last request is failing', () => {
    const state = livePreviewReducer(
      { ...painted('/preview?draft=one', 1_000), issued: 2 },
      { type: 'failed', seq: 2 },
    )

    expect(previewCaptionState(state)).toBe('stale')
  })

  it('says saved once a re-fetched frame has fallen back to the stored page', () => {
    const state = livePreviewReducer(painted('/preview?draft=one', 1_000), {
      type: 'loaded',
      url: '/preview?draft=one',
      at: 1_000 + DRAFT_STASH_TTL_MS,
      ttlMs: DRAFT_STASH_TTL_MS,
    })

    expect(previewCaptionState(state)).toBe('saved')
  })
})

describe('draftFingerprint', () => {
  const payload = (over: Partial<DraftPayload> = {}): DraftPayload => ({
    theme: { palette: 'porcelain', brand_color: '#123456' },
    content: { hero: { headline: 'Hello' } },
    sections: [{ key: 'hero', enabled: true, sort: 0, tone: null }],
    ...over,
  })

  it('is stable across two structurally identical payloads', () => {
    expect(draftFingerprint(payload(), 0)).toBe(draftFingerprint(payload(), 0))
  })

  it('ignores key order, which spreads and Object.entries reshuffle freely', () => {
    const a = draftFingerprint({ ...payload(), theme: { palette: 'porcelain', brand_color: '#123456' } }, 0)
    const b = draftFingerprint({ ...payload(), theme: { brand_color: '#123456', palette: 'porcelain' } }, 0)

    expect(a).toBe(b)
  })

  it('changes when a single copy leaf changes', () => {
    const before = draftFingerprint(payload(), 0)
    const after = draftFingerprint(payload({ content: { hero: { headline: 'Hello!' } } }), 0)

    expect(after).not.toBe(before)
  })

  it('changes when sections are reordered, because for sections the order IS the content', () => {
    const before = draftFingerprint(payload({
      sections: [
        { key: 'hero', enabled: true, sort: 0, tone: null },
        { key: 'about', enabled: true, sort: 1, tone: null },
      ],
    }), 0)
    const after = draftFingerprint(payload({
      sections: [
        { key: 'about', enabled: true, sort: 0, tone: null },
        { key: 'hero', enabled: true, sort: 1, tone: null },
      ],
    }), 0)

    expect(after).not.toBe(before)
  })

  it('changes on a nonce bump alone, for the writes the payload cannot see', () => {
    // A photo upload and an added or removed band are written straight to
    // the server, so `content`/`sections` can be byte-identical either side
    // of one.
    expect(draftFingerprint(payload(), 1)).not.toBe(draftFingerprint(payload(), 0))
  })

  it('treats a tone cleared to null as a change', () => {
    const before = draftFingerprint(payload({
      sections: [{ key: 'hero', enabled: true, sort: 0, tone: 'accent' }],
    }), 0)
    const after = draftFingerprint(payload({
      sections: [{ key: 'hero', enabled: true, sort: 0, tone: null }],
    }), 0)

    expect(after).not.toBe(before)
  })

  it('survives the non-object leaves a schemaless JSON column can hold', () => {
    // theme/content are raw `array` casts server-side: a number, a boolean
    // or a null is a legal leaf, and fingerprinting must not throw on one.
    expect(() => draftFingerprint(payload({
      content: { hero: { headline: 1, subtext: true, kicker: null } },
    }), 0)).not.toThrow()
  })
})
