import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, Copy, ExternalLink, EyeOff, Globe, Lock } from 'lucide-react'
import { api } from '../../lib/api'
import { pageVisibilityState } from './publishAddress'

/**
 * The reduced screen `LandingPages.tsx` renders for a tenant whose plan no
 * longer includes `landing_pages` (or `chat`) but who has a PUBLISHED page —
 * Task 10b, closing the defect Task 10's own report found: `routes/api.php`
 * deliberately keeps `unpublish` (and, since this task, its read
 * counterpart `status`) reachable with no entitlement and no live
 * subscription, so a former customer can always take their own page off the
 * internet. Before this fix the SPA bounced them to "/" before they ever
 * saw this screen at all.
 *
 * Deliberately its OWN component, not `LandingEditor.tsx`'s
 * `WebAddressCard` reused with a flag: `WebAddressCard` carries the address
 * "Change" control and the Publish button, and threading a
 * teardown-only mode through that same component would mean every future
 * edit to it has to remember to keep both paths correct. A separate
 * component with genuinely no import of any edit/publish code is a
 * structural guarantee that this screen cannot widen into one — the same
 * reasoning `LandingEditor.tsx`'s own comment gives for never wiring
 * `useSubscription()`/`hasFeature()` anywhere near its Unpublish button.
 *
 * What this file does NOT contain, on purpose: the wizard, the editor, any
 * `PUT`/`POST` to build or change the page, and the live preview pane. That
 * absence — not a `disabled` prop on a shared control — is what mirrors
 * `routes/api.php`'s own boundary: teardown yes, publishing and editing no.
 */
export function LandingTeardown({ url }: { url: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const unpublishMut = useMutation({
    // Same call as LandingEditor.tsx's own Unpublish button — the
    // entitlement-free route (routes/api.php) is what makes this whole
    // screen possible, and there is exactly one way to call it.
    mutationFn: () => api.post('/v1/admin/landing-pages/unpublish'),
    onSuccess: () => {
      toast.success(t('landing_pages.editor.unpublished_toast', 'Your page is no longer public'))
      // Deliberately NO query invalidation here. LandingPages.tsx decides
      // 'teardown' vs 'redirect' off the SAME status query this screen
      // was shown from; invalidating it the instant this succeeds would
      // flip `published` to false and re-render the parent straight into
      // a redirect to "/" — yanking the tenant away from the very
      // confirmation they just earned by using the one button they came
      // here for. `unpublishMut.isSuccess` below is the whole of the
      // "you're done" state; nothing left on this screen needs a fresh
      // fetch to be trustworthy.
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error ?? err.response?.data?.message ?? t('common.error', 'Something went wrong'))
    },
  })

  const handleUnpublish = () => {
    const confirmed = window.confirm(
      t(
        'landing_pages.editor.unpublish_confirm',
        'Take your page offline? Nothing is deleted — you can publish it again any time.',
      ),
    )
    if (confirmed) unpublishMut.mutate()
  }

  // Task 10b round 1: same fix as LandingEditor.tsx's own copyAddress —
  // was un-awaited with no rejection handler (false "Copied" on a denied
  // permission), and a bare `navigator.clipboard.writeText` throws
  // synchronously on an insecure origin (`navigator.clipboard` is
  // `undefined` there) before any promise exists to reject. See that
  // file's comment for the full reasoning.
  const copyAddress = () => {
    try {
      navigator.clipboard.writeText(url).then(
        () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          toast.success(t('common.copied', 'Copied'))
        },
        () => toast.error(t('common.copy_failed', 'Could not copy')),
      )
    } catch {
      toast.error(t('common.copy_failed', 'Could not copy'))
    }
  }

  if (unpublishMut.isSuccess) {
    return (
      <div className={card + ' space-y-3'}>
        <div className="flex items-center gap-3">
          <span className="text-t-secondary"><EyeOff size={18} /></span>
          <p className="text-sm font-semibold text-white">
            {t('landing_pages.teardown.now_offline', 'Your page is now offline')}
          </p>
        </div>
        <p className="text-xs text-t-secondary leading-relaxed">
          {t(
            'landing_pages.teardown.now_offline_note',
            'Nobody can see it anymore. Upgrade any time to publish it again.',
          )}
        </p>
        <UpgradeLink />
      </div>
    )
  }

  // `LandingPages.tsx` only ever mounts this component once its own status
  // fetch has confirmed `published: true`, so this is always the live
  // banner — never the draft one. Reusing `pageVisibilityState` (Task 10)
  // rather than hand-writing the same copy a second time keeps this
  // screen's headline byte-for-byte identical to the editor's own, for a
  // tenant who may have seen both.
  const vis = pageVisibilityState('published', false)

  return (
    <div className="space-y-5">
      <div className={card + ' space-y-4'}>
        <div className="flex items-center gap-3">
          <span className="text-accent"><Globe size={18} /></span>
          <p className="text-sm font-semibold text-accent">{t(vis.headlineKey, vis.headlineFallback)}</p>
        </div>

        <div>
          <label className={label}>{t('landing_pages.web_address', 'Web address')}</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-white bg-dark-bg border border-dark-border rounded-lg px-3 py-2">
              {url}
            </code>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={btnSec}
              aria-label={t('landing_pages.editor.address_open', 'Open your live page')}
            >
              <ExternalLink size={13} />
            </a>
            <button type="button" className={btnSec} onClick={copyAddress}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {t('common.copy', 'Copy')}
            </button>
          </div>
        </div>

        <button
          type="button"
          className={btnSec}
          disabled={unpublishMut.isPending}
          onClick={handleUnpublish}
        >
          {unpublishMut.isPending
            ? t('landing_pages.editor.unpublishing', 'Working…')
            : t('landing_pages.editor.unpublish', 'Unpublish')}
        </button>
      </div>

      <div className={card + ' space-y-2'}>
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-t-secondary" />
          <p className="text-sm font-medium text-white">
            {t('landing_pages.teardown.locked_title', 'Editing this page needs your previous plan')}
          </p>
        </div>
        <p className="text-xs text-t-secondary leading-relaxed">
          {t(
            'landing_pages.teardown.locked_body',
            'Your plan no longer includes the page builder, so the wizard, editing and Publish are turned off here. Taking this page offline still always works — use the button above.',
          )}
        </p>
        <UpgradeLink />
      </div>
    </div>
  )
}

function UpgradeLink() {
  const { t } = useTranslation()
  return (
    <Link to="/billing" className="inline-block text-xs font-medium text-primary-500 hover:underline">
      {t('landing_pages.teardown.upgrade_cta', 'View plans')}
    </Link>
  )
}

// Same tokens as LandingEditor.tsx's own — bg-dark-surface, never
// bg-dark-card (Appendix A §7.4) — kept as this file's own local consts
// rather than imported from LandingEditor.tsx, so this screen shares no
// import with the edit surface it must never reach.
const card = 'bg-dark-surface border border-dark-border rounded-xl p-5'
const label = 'block text-xs text-t-secondary mb-1.5'
const btnSec = 'flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-dark-bg border border-dark-border text-t-secondary rounded-lg hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
