import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { api } from '../../lib/api'
import { useBrandStore } from '../../stores/brandStore'
import { isPreviewUrlExpired, previewRefetchIntervalMs } from './previewFreshness'

type Device = 'desktop' | 'mobile'

const card = 'bg-dark-surface border border-dark-border rounded-xl overflow-hidden'
const toggleBtn = (active: boolean) =>
  `p-1.5 rounded-md transition-colors ${active ? 'bg-dark-bg text-white' : 'text-t-secondary hover:text-white'}`

/**
 * Right-hand pane of the editor (Task 9): a real `<iframe>` of the
 * tenant's own page, through the signed preview route Task 3 made
 * framable from the admin origin — and ONLY from the admin origin. A
 * PUBLISHED page still refuses to be framed at all (`frame-ancestors
 * 'none'`, `LandingPageSecurity.php`, deliberately untouched here). If
 * this iframe ever shows a blocked-frame error or the console logs a CSP
 * violation, that is a Task 3 regression — the fix belongs in
 * `LandingPageSecurity.php`/`LandingPageController::preview()`, not in a
 * policy loosened from this file.
 *
 * Follows `SurveyDesignPanel.tsx:246`'s precedent: a device-framed iframe
 * remounted on a nonce owned by the caller. The sticky positioning itself
 * (`SurveyDesignPanel`'s `lg:sticky lg:top-6 self-start`) is applied by
 * the CALLER (`LandingEditor.tsx`'s right column), as `xl:sticky xl:top-4`
 * — matching the `xl:col-span-7`/`xl:col-span-5` two-pane grid Task 8
 * already built there (itself following `ChatbotWidget.tsx`'s layout, the
 * other named precedent), rather than mixing `lg:` breakpoints into a
 * screen that otherwise only uses `xl:` ones.
 *
 * Unlike `SurveyDesignPanel`, this component does NOT push live edits into
 * the iframe with `postMessage` — the preview renders SERVER-SIDE from the
 * saved draft (`Cache-Control: no-store` on `preview()`, per Task 3), so
 * it structurally cannot reflect an unsaved edit. Step 2 of this task's
 * brief is explicit that the caption must say so rather than implying
 * otherwise; a non-technical tenant who believed the opposite and saw
 * their edit "missing" would reasonably conclude the product is broken.
 */
export function LandingPreview({ nonce }: { nonce: number }) {
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
    // interruption instead of eventually hitting an expired preview.
    refetchInterval: previewRefetchIntervalMs(),
  })

  const expired = dataUpdatedAt > 0 && now > 0 && isPreviewUrlExpired(dataUpdatedAt, now)

  return (
    <div className={card}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-t-secondary">
          {/* Not "Live preview" — round-1 review flagged that "live" is
              the one word that makes a non-technical tenant expect their
              unsaved typing to show up here, which the caption below
              (and this component's own doc comment) exists to say is NOT
              how this works: the iframe renders the saved draft only. */}
          {t('landing_pages.editor.preview_title', 'Preview')}
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
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t('landing_pages.editor.preview_reload', 'Reload preview')}
            className="p-1.5 rounded-md text-t-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-t-secondary">
            <Loader2 size={16} className="animate-spin mr-2" />
            {t('landing_pages.editor.preview_loading', 'Loading preview…')}
          </div>
        ) : isError || !url ? (
          <div className="text-center py-16 text-sm text-t-secondary">
            <p>{t('landing_pages.editor.preview_error', 'Could not load the preview.')}</p>
            <button
              type="button"
              onClick={() => refetch()}
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
              onClick={() => refetch()}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300 font-semibold"
            >
              {t('landing_pages.editor.preview_reload', 'Reload preview')}
            </button>
          </div>
        ) : device === 'mobile' ? (
          <div
            className="mx-auto rounded-[28px] border-4 border-[#222] bg-black overflow-hidden"
            style={{ aspectRatio: '9/16', maxWidth: 280 }}
          >
            <iframe
              key={nonce}
              src={url}
              title={t('landing_pages.editor.preview_iframe_title', 'Your page preview')}
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div
            className="border border-dark-border rounded-lg overflow-hidden bg-black"
            style={{ height: 640 }}
          >
            <iframe
              key={nonce}
              src={url}
              title={t('landing_pages.editor.preview_iframe_title', 'Your page preview')}
              className="w-full h-full border-0"
            />
          </div>
        )}

        <p className="text-[11px] text-t-secondary mt-2">
          {t('landing_pages.preview_caption', 'Shows your saved draft. Save to see the latest changes.')}
        </p>
      </div>
    </div>
  )
}
