import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { api } from '../../lib/api'
import { useBrandStore } from '../../stores/brandStore'
import { isPreviewUrlExpired, previewRefetchIntervalMs } from './previewFreshness'
import {
  DRAFT_STASH_TTL_MS, LIVE_PREVIEW_DEBOUNCE_MS, draftFingerprint, initialLivePreviewState,
  livePreviewIsActive, livePreviewReducer, previewCaptionState,
  type DraftPayload, type FrameSlot,
} from './livePreview'
import { focusMessage, isFromPreview, previewOrigin, selectedKey } from './previewBridge'

type Device = 'desktop' | 'mobile'

const card = 'bg-dark-surface border border-dark-border rounded-xl overflow-hidden'
const toggleBtn = (active: boolean) =>
  `p-1.5 rounded-md transition-colors ${active ? 'bg-dark-bg text-white' : 'text-t-secondary hover:text-white'}`

/**
 * Right-hand pane of the editor: a real `<iframe>` of the tenant's own page,
 * through the signed preview route Task 3 made framable from the admin
 * origin — and ONLY from the admin origin. A PUBLISHED page still refuses to
 * be framed at all (`frame-ancestors 'none'`, `LandingPageSecurity.php`,
 * deliberately untouched here). If this iframe ever shows a blocked-frame
 * error or the console logs a CSP violation, that is a Task 3 regression —
 * the fix belongs in `LandingPageSecurity.php`/`LandingPageController
 * ::preview()`, not in a policy loosened from this file.
 *
 * ─── LIVE (landing phase 3c) ────────────────────────────────────────────
 *
 * This pane used to render the SAVED draft and say so ("Save to see the
 * latest changes"). The tenant asked for it to follow their edits, so it
 * now does — WITHOUT re-rendering the page in the browser.
 *
 * That distinction is the whole design. The page is Blade: a layout, eight
 * partials, `PageContent`'s queries, `Accent`'s contrast floor, `Palette`'s
 * tokens, `SectionType::bandClass()`'s authored fallbacks. A JavaScript
 * reimplementation of it would be a second copy of the design that drifts
 * from the shipped one, and a preview that drifts is worse than a preview
 * that is merely behind. So the unsaved state takes a round trip instead:
 * `POST /v1/admin/landing-pages/preview-draft` parks it server-side and
 * hands back a signed URL that renders the REAL template from it
 * (`App\Landing\PreviewDraft`). Nothing is written; the stash expires in
 * ninety seconds.
 *
 * `SurveyDesignPanel.tsx:246`'s precedent — a device-framed iframe — still
 * holds for the shape of the pane, and the sticky positioning is still
 * applied by the CALLER (`LandingEditor.tsx`'s right column). What this
 * does NOT copy from it is `postMessage`-ing edits into the frame: the
 * frame is a different ORIGIN (the landing host) rendering server-side, and
 * pushing state into it would be the browser-side re-render this design
 * refuses.
 *
 * THE PANE NEVER GOES BLANK. Two iframes live in the box for the lifetime
 * of the component; the visible one keeps its pixels while the hidden one
 * loads the next render, and a "swap" is only a flip of which is visible
 * (see `livePreview.ts`, which owns that decision and is where its tests
 * are). A failed request changes the caption and nothing else.
 */
export function LandingPreview({ nonce, draft, dirty, focusKey, onSelect }: {
  nonce: number
  /**
   * The editor's CURRENT state, saved or not — built by the same helpers
   * the save path uses (`themePayload`, `stripImageLeaves`,
   * `buildSectionsPayload`), so what is previewed is what a save would
   * produce.
   */
  draft: DraftPayload
  /** Whether anything is queued but unsaved — half of `livePreviewIsActive`. */
  dirty: boolean
  /**
   * TEMPLATE FIDELITY 2.5 — the section key of the card the tenant has
   * open, or null when none is. Sent into the frame so the two halves of
   * this screen share a subject; see `previewBridge.ts`, which owns the
   * message grammar and the origin rule, and says plainly which half of
   * the bridge has not shipped yet.
   */
  focusKey?: string | null
  /** The return leg: a band clicked in the preview names its own key here.
   *  Origin-checked before it is believed. */
  onSelect?: (key: string) => void
}) {
  const { t } = useTranslation()
  // Belt-and-braces with the host's `key={currentBrandId ?? 'org'}` on
  // `LandingEditor` (which remounts this component too, being inside it) —
  // parameterising this query's own key the same way every other query on
  // this screen is, per the standing instruction on this bug class.
  const { currentBrandId } = useBrandStore()
  const [device, setDevice] = useState<Device>('desktop')

  // `Date.now()` may not be called during render (it's impure), so "now"
  // lives in state, updated only from the interval callback below (never
  // synchronously in the effect body itself, which the same lint rule
  // also forbids — cascading renders). Starts at 0 ("not yet known")
  // rather than `Date.now()` so the very first render stays pure;
  // `expired` below requires `now > 0` and so stays false until the first
  // tick. A URL minted this instant cannot be expired 60 seconds later
  // regardless, so that one-tick lag costs nothing real. The recurring
  // tick is what lets a long-open tab whose proactive refetch has been
  // failing (offline, an expired admin session, ...) eventually show the
  // honest "expired" fallback below, instead of an iframe silently
  // pointed at a dead signature.
  //
  // Deliberately NOT what drives the live/saved caption. A pane nobody has
  // touched for an hour is still showing exactly the tenant's unsaved work;
  // the ninety-second stash aging out changes what its URL would render if
  // it were fetched AGAIN, not what is on the screen. The one case where
  // that actually happens — the browser re-fetching a frame by itself — is
  // observable, and the reducer handles it in `loaded`.
  const [now, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const {
    data: url, isLoading, isError, isFetching, dataUpdatedAt, refetch,
  } = useQuery<string>({
    queryKey: ['landing-preview-url', currentBrandId],
    queryFn: () => api.post('/v1/admin/landing-pages/preview-url').then(r => r.data.url as string),
    // See previewFreshness.ts: the signed URL is valid 2 hours
    // (LandingPageController::previewUrl), and this refetches well before
    // that so a long editor session gets a new URL with no visible
    // interruption instead of eventually hitting an expired preview. The
    // DRAFT URLs minted below carry the same two-hour signature, so this
    // one refresh cycle still governs both.
    refetchInterval: previewRefetchIntervalMs(),
  })

  const expired = dataUpdatedAt > 0 && now > 0 && isPreviewUrlExpired(dataUpdatedAt, now)

  // ─── The live pipeline ────────────────────────────────────────────────

  const [state, dispatch] = useReducer(livePreviewReducer, initialLivePreviewState)

  // Served, not assumed: `PreviewDraft::TTL_SECONDS` comes back on every
  // response, so the one decision that depends on it — whether a frame the
  // browser re-fetched by itself has fallen back to the saved page — is made
  // against the server's own number rather than a copy kept here.
  // `DRAFT_STASH_TTL_MS` is only what stands in before any response has
  // arrived, which is before there is any draft frame to judge.
  const [stashTtlMs, setStashTtlMs] = useState(DRAFT_STASH_TTL_MS)

  // A draft request is in flight — the reload button's spinner tells the
  // truth about the live render as well as about the URL refetch.
  const [busy, setBusy] = useState(false)

  // Bumped by the reload button so a tenant who asks for a refresh gets a
  // genuinely new render even when nothing about the payload changed.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (url) dispatch({ type: 'saved_url', url })
  }, [url])

  const active = livePreviewIsActive({ dirty, nonce })

  // The payload identity, not the payload object: React hands this
  // component a fresh `draft` object on every keystroke and on every
  // unrelated re-render, and debouncing on object identity would re-arm the
  // timer forever without anything having changed.
  const fingerprint = useMemo(
    () => `${reloadKey}|${draftFingerprint(draft, nonce)}`,
    [draft, nonce, reloadKey],
  )

  // The payload itself reaches the request through a ref, so the effect
  // below can depend on the FINGERPRINT alone. Declared before that effect
  // so it has already run by the time the debounce is (re-)armed.
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft })

  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!active) return

    const timer = setTimeout(() => {
      // CANCEL THE ONE IN FLIGHT. A fast typist can outrun the server, and
      // an abandoned render is both wasted work and — without the sequence
      // guard in the reducer — a chance for an old answer to land last.
      abortRef.current?.abort()

      const controller = new AbortController()
      abortRef.current = controller

      const seq = seqRef.current + 1
      seqRef.current = seq
      dispatch({ type: 'requested', seq })
      setBusy(true)

      api.post('/v1/admin/landing-pages/preview-draft', draftRef.current, { signal: controller.signal })
        .then(r => {
          const data = r.data as { url: string; expires_in?: number }

          if (typeof data.expires_in === 'number' && data.expires_in > 0) {
            const ms = data.expires_in * 1000
            setStashTtlMs(prev => (prev === ms ? prev : ms))
          }

          dispatch({ type: 'rendered', seq, url: data.url, at: Date.now() })
        })
        .catch(() => {
          // An abort is not a failure — it is this component cancelling its
          // own work. Anything else (offline, 422, 429, a dead session)
          // leaves the last good render on screen and only moves the
          // caption; see `previewCaptionState`.
          if (controller.signal.aborted) return
          dispatch({ type: 'failed', seq })
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false)
        })
    }, LIVE_PREVIEW_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [fingerprint, active])

  // Nothing in flight should outlive the pane.
  useEffect(() => () => abortRef.current?.abort(), [])

  const caption = previewCaptionState(state)
  const live = caption === 'live'

  // ─── TEMPLATE FIDELITY 2.5 — one subject between the two halves ───────
  //
  // Held per SLOT because there are two frames in the box for the lifetime
  // of this component (the swap is what keeps the pane from going blank),
  // and only the one in front is a window anything may be said to.
  const frameRefs = useRef<Record<FrameSlot, HTMLIFrameElement | null>>({ a: null, b: null })
  const frontUrl = state[state.front]?.url ?? null

  // The callback through a ref, so the listener below depends on the URL
  // alone: the parent hands a fresh arrow on every keystroke, and
  // re-subscribing a window listener that often is churn for nothing.
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect })

  useEffect(() => {
    if (focusKey == null || focusKey === '') return

    // EXPLICIT TARGET ORIGIN, from the URL the SERVER minted for this
    // frame. `'*'` would broadcast the tenant's section keys to whatever
    // the frame had navigated to, and the landing host is a different
    // origin from this document by design.
    const target = previewOrigin(frontUrl)
    const frame = frameRefs.current[state.front]

    if (target === null || frame?.contentWindow == null) return

    frame.contentWindow.postMessage(focusMessage(focusKey), target)
  }, [focusKey, frontUrl, state.front])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Origin FIRST, payload second: a message from any other frame in
      // this document, from an opener or from an extension is dropped
      // before its contents are read at all.
      if (!isFromPreview(event.origin, frontUrl)) return

      const key = selectedKey(event.data)
      if (key !== null) onSelectRef.current?.(key)
    }

    window.addEventListener('message', handler)

    return () => window.removeEventListener('message', handler)
  }, [frontUrl])

  const reload = () => {
    // Both halves: a fresh signed URL (which is also what keeps
    // `previewFreshness`'s clock honest) and a fresh render of whatever is
    // in the editor right now.
    void refetch()
    setReloadKey(k => k + 1)
  }

  const slots: FrameSlot[] = ['a', 'b']
  const hasFrame = state.a !== null || state.b !== null

  return (
    <div className={card}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-t-secondary">
          {/* "Live preview" is now the honest name for what this is — it
              renders the tenant's unsaved edits — but only while it
              actually is one. Before the first edit, and whenever the pane
              has fallen back to the saved page, it goes back to plain
              "Preview" rather than making a claim the caption below is
              simultaneously withdrawing. */}
          {live
            ? t('landing_pages.editor.preview_title_live', 'Live preview')
            : t('landing_pages.editor.preview_title', 'Preview')}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex bg-dark-bg border border-dark-border rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              aria-label={t('landing_pages.editor.preview_desktop', 'Desktop')}
              aria-pressed={device === 'desktop'}
              className={toggleBtn(device === 'desktop')}
            >
              <Monitor size={13} />
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              aria-label={t('landing_pages.editor.preview_mobile', 'Mobile')}
              aria-pressed={device === 'mobile'}
              className={toggleBtn(device === 'mobile')}
            >
              <Smartphone size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={isFetching || busy}
            aria-label={t('landing_pages.editor.preview_reload', 'Reload preview')}
            className="p-1.5 rounded-md text-t-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} className={isFetching || busy ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-t-secondary">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t('landing_pages.editor.preview_loading', 'Loading preview…')}
          </div>
        ) : (isError && !hasFrame) || (!url && !hasFrame) ? (
          <div className="text-center py-16 text-sm text-t-secondary">
            <p>{t('landing_pages.editor.preview_error', 'Could not load the preview.')}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300 font-semibold"
            >
              {t('common.retry', 'Try again')}
            </button>
          </div>
        ) : expired ? (
          <div className="text-center py-16 text-sm text-t-secondary">
            <p>{t('landing_pages.editor.preview_expired', 'This preview link has expired.')}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300 font-semibold"
            >
              {t('landing_pages.editor.preview_reload', 'Reload preview')}
            </button>
          </div>
        ) : (
          /* ONE box, two frames. The device toggle changes this element's
             own dimensions and nothing else, so switching between desktop
             and mobile no longer unmounts the iframes and reloads the page
             inside them — and the two frames themselves are never unmounted
             at all, which is what makes a swap free of a repaint. */
          <div
            className={device === 'mobile'
              ? 'relative mx-auto rounded-[28px] border-4 border-[#222] bg-black overflow-hidden'
              : 'relative border border-dark-border rounded-lg overflow-hidden bg-black'}
            style={device === 'mobile'
              ? { aspectRatio: '9/16', maxWidth: 280 }
              : { height: 640 }}
          >
            {slots.map(slot => {
              const frame = state[slot]
              if (frame === null) return null

              const visible = state.front === slot

              return (
                <iframe
                  key={slot}
                  ref={el => { frameRefs.current[slot] = el }}
                  src={frame.url}
                  title={t('landing_pages.editor.preview_iframe_title', 'Your page preview')}
                  // `at`/`ttlMs` ride along because a SECOND load of the
                  // frame already in front means the browser re-fetched it
                  // itself, and past the stash's life that URL now renders
                  // the saved page instead — the one case where the pane
                  // stops being live without this component asking it to.
                  onLoad={() => dispatch({
                    type: 'loaded', url: frame.url, at: Date.now(), ttlMs: stashTtlMs,
                  })}
                  // The hidden frame is a rendering buffer, not content: it
                  // must be out of the accessibility tree and out of the tab
                  // order, or a keyboard or screen-reader user meets the
                  // page twice.
                  aria-hidden={visible ? undefined : true}
                  tabIndex={visible ? undefined : -1}
                  className="absolute inset-0 w-full h-full border-0"
                  style={{
                    opacity: visible ? 1 : 0,
                    pointerEvents: visible ? 'auto' : 'none',
                    zIndex: visible ? 1 : 0,
                  }}
                />
              )
            })}
          </div>
        )}

        {/* The caption stopped being a constant. It said "Shows your saved
            draft. Save to see the latest changes." forever, which was true
            then and would be a lie now; replacing it with a permanent
            "live" would be the same mistake pointed the other way. So it
            says what is actually on screen — see `previewCaptionState`. */}
        <p className="text-[11px] text-t-secondary mt-2">
          {caption === 'live'
            ? t('landing_pages.preview_caption_live', 'Live — including the changes you have not saved yet.')
            : caption === 'stale'
              ? t('landing_pages.preview_caption_stale', 'Could not refresh just now — showing the last version we could load.')
              : t('landing_pages.preview_caption_saved', 'Shows your saved page. Edit anything and it updates here as you go.')}
        </p>
      </div>
    </div>
  )
}
