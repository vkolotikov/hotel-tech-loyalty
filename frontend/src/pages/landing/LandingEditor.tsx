import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, EyeOff, Globe, Loader2, Save } from 'lucide-react'
import { api, resolveImage } from '../../lib/api'
import { QueryError } from '../../components/QueryError'
import { useBrandStore } from '../../stores/brandStore'
import { isDataBackedSection, isOfferable, unavailableReason, type SectionKey } from './sections'
import {
  buildSectionRows, buildSectionsPayload, moveSection, safeImageUrl, stripImageUrlLeaves, toggleSection,
  SECTION_CONTENT_FIELDS, type EditorSectionRow, type PageSection, type SectionAvailability,
} from './editorSections'
import { downscaleTarget, drawToBlob } from './imageDownscale'
import { addressHost, buildAddressUrl, pageVisibilityState, previewSlug } from './publishAddress'
import { LandingPreview } from './LandingPreview'
import { DesignPanel } from './DesignPanel'
import { themePayload } from './designChoices'
// Task 6 (landing phase 3c, D4 — distinct from the phase 3b "Task 6" this
// file's photo controls below still refer to by that same number): the
// self-hosted @font-face sheet DesignPanel's cards render against, see
// that file's own header comment. Imported here (and by LandingWizard.tsx,
// the only other screen that renders DesignPanel) so it is bundled into
// the `LandingPages` route chunk both screens already live in (App.tsx's
// `lazy(() => import('./pages/LandingPages'))`), never into the app
// shell's own initial load.
import '../../styles/landing-preview-fonts.css'

/**
 * The row shape `GET /v1/admin/landing-pages` (`show`) returns for the
 * page itself. `theme`/`content`/`seo` are the raw JSON columns
 * (`App\Models\LandingPage`'s `array` casts) — `content` keyed by SECTION,
 * each value a flat map of the fields that section's Blade partial reads
 * (see `SECTION_CONTENT_FIELDS`). Any of the three can genuinely be `null`
 * on a page nothing has ever written to (a plain `store()`-created page
 * never sets them), which is why every read below falls through `?? {}`
 * rather than assuming an object.
 */
type LandingPageDTO = {
  id: number
  slug: string
  /**
   * The full public address ("Web address" — spec §9 says "slug" must
   * never appear in the UI), Task 10's own addition to the API:
   * `App\Models\LandingPage::getUrlAttribute()`, an appended accessor
   * built off the same `landing.show` named route the public renderer
   * itself answers to. Nothing about `config('landing.host')` is
   * otherwise visible from the admin SPA's own origin, and a
   * frontend-held copy of the host would be a second place that fact
   * could drift from the real one — see `publishAddress.ts`'s docblock.
   */
  url: string
  status: 'draft' | 'published'
  theme: Record<string, unknown> | null
  content: Record<string, Record<string, string>> | null
  seo: Record<string, unknown> | null
  sections: PageSection[]
}

type LandingEditorProps = {
  /**
   * `onboarding.sections` — `LandingOnboardingService::sections()`'s
   * `{key, label, source_label, available, count}` rows, fetched once by
   * the HOST page (`LandingPages.tsx`) and handed down whole, exactly the
   * way `LandingWizard.tsx` receives its `prefill` prop. Neither `show`
   * nor the sections endpoint carries a label, a source or an availability
   * count for any section — only the onboarding response does, and it is
   * the SAME resolution (`PageContent`) the wizard's own step 4 reads, so
   * reusing it here (rather than a second, editor-only computation) is
   * what keeps RULING 4's promise that the wizard and the editor cannot
   * disagree about which sections are real.
   */
  sections: SectionAvailability[]
}

// bg-dark-surface, never bg-dark-card — the two are different shades, and
// dark-surface is the house default (Appendix A §7.4); LandingWizard.tsx
// carries the identical note at its own `card` const.
const card = 'bg-dark-surface border border-dark-border rounded-xl p-5'
const label = 'block text-xs text-t-secondary mb-1.5'
const input = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:border-primary-500 outline-none'
const btnPrimary = 'flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-500 text-black rounded-lg hover:bg-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
// The house "secondary action" button (ChatbotWidget.tsx:166) — reused here
// for Copy, Change and Unpublish, none of which are the screen's primary
// action. Unpublish deliberately gets THIS, never a red/danger treatment:
// per the brief, styling a reversible action like a delete would frighten
// tenants out of using the one button that always works, even after a
// downgrade or cancellation.
const btnSec = 'flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-dark-bg border border-dark-border text-t-secondary rounded-lg hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors'

/** `t()` fallback text per content-field name — the same words across every
 *  section that has that field, so a label means the same thing on the
 *  Services row as it does on the Booking row.
 *
 *  Task 11: `kicker` used to read "Eyebrow". That is the trade's word for
 *  the small line above a heading and it is meaningless to the salon owner
 *  this product is for — worst of all on the Reviews row, whose ONLY
 *  editable field is this one, so the whole card said "Eyebrow" and
 *  nothing else. The field name stays `kicker` (it is the key the Blade
 *  partials read off `$page->content`); only what the tenant is shown
 *  changes, and it now describes the thing rather than naming it. */
const FIELD_FALLBACK: Record<string, string> = {
  headline: 'Headline',
  subtext: 'Subtext',
  kicker: 'Small line above the heading',
  heading: 'Heading',
  lead: 'Opening line',
  body: 'Body text',
  terms: 'Terms',
  // Task 2: App\Landing\ContactDetails's three overridable fields, bound
  // through the same content-field mechanism as every fallback above (see
  // `SECTION_CONTENT_FIELDS.contact` in `editorSections.ts`).
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  // Task 6: label above the photo control (hero/about only).
  image_url: 'Photo',
}

/**
 * Task 6: the one shared shape both photo mutations' `onError` reads —
 * whichever field the server's `validate()` call actually rejected
 * (`errors.image[0]` for a bad file, `errors.slot[0]` for either endpoint's
 * other branch) carries the friendly, actionable message; the generic
 * `error`/`message` envelope is the fallback for anything neither endpoint
 * has a per-field rule for (a 404, a network failure). Same preference
 * `saveMut`'s own `onError` above already established for `errors.slug[0]`,
 * and for the same reason: "Validation failed" tells a tenant nothing they
 * can act on.
 */
function imageErrorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: {
    errors?: Record<string, string[]>; error?: string; message?: string
  } } }
  return (
    err.response?.data?.errors?.image?.[0]
    ?? err.response?.data?.errors?.slot?.[0]
    ?? err.response?.data?.error
    ?? err.response?.data?.message
    ?? fallback
  )
}

/**
 * The landing page editor: one row per section (enable toggle, up/down
 * reorder, plain-English label with its source, inline copy fields), plus
 * an explicit Save. Per the spec, **no canvas and no drag-and-drop** —
 * both are what inexperienced users struggle with most — so reordering is
 * two buttons, not a drag handle.
 *
 * Task 9 adds the right-hand live preview (`LandingPreview.tsx`); Task 10
 * adds the web-address/publish/unpublish block to the left column. Both
 * extend this file rather than restructure it.
 */
export function LandingEditor({ sections: availability }: LandingEditorProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  // A landing page is strictly per-brand (Task 4's whole backend fix
  // history is this exact confusion), and unlike the wizard this screen
  // has no draft to restore across a switch — there is nothing to lose
  // that the tenant asked to keep. `LandingPages.tsx` mounts this
  // component with `key={currentBrandId ?? 'org'}`, so a brand switch
  // fully remounts it: `form` cannot survive into the new brand's screen
  // because the component holding it no longer exists. The query key is
  // ALSO parameterised here, belt-and-braces with the remount, so even a
  // query that outlives one render (TanStack Query's cache is keyed
  // globally, not per component instance) cannot hand this mount a
  // sibling brand's cached page for the instant before its own fetch
  // resolves.
  const { currentBrandId, currentBrand } = useBrandStore()

  const { data: page, isLoading, error, refetch } = useQuery<LandingPageDTO>({
    queryKey: ['landing-page', currentBrandId],
    queryFn: () => api.get('/v1/admin/landing-pages').then(r => r.data.page),
  })

  // Verbatim Save UX, Appendix A §7.6 / this task's brief Step 2.
  const [form, setForm] = useState<Partial<LandingPageDTO> | null>(null)

  // Bumped in saveMut's onSuccess (Task 9 Step 2) so LandingPreview's
  // iframe remounts the moment there is something new on the server to
  // show. The preview renders server-side from the saved row, so nothing
  // short of a real save should ever refresh it — an autosave-triggered
  // bump would be a lie about what the tenant is looking at.
  const [previewNonce, setPreviewNonce] = useState(0)
  const f = form ?? page ?? {}
  const update = <K extends keyof LandingPageDTO>(k: K, v: LandingPageDTO[K]) =>
    setForm(p => ({ ...(p ?? page ?? {}), [k]: v }))
  const dirty = form !== null

  const updateContent = (sectionKey: string, field: string, value: string) => {
    const sectionCopy = { ...(f.content?.[sectionKey] ?? {}), [field]: value }
    update('content', { ...(f.content ?? {}), [sectionKey]: sectionCopy })
  }

  // Task 6 (landing phase 3c, D4): the three theme keys the Design panel
  // owns, narrowed from `f.theme` (an untyped `Record<string, unknown> |
  // null` — the raw JSON column, Task 1 interfaces) the same way `imageUrl`
  // narrows its own raw leaf a few lines below with `safeImageUrl` — a
  // legal non-string leaf must fall through to "unset" here rather than
  // reach `DesignPanel`'s string-typed props.
  const themeFields = {
    palette: typeof f.theme?.palette === 'string' ? f.theme.palette : undefined,
    font_pairing: typeof f.theme?.font_pairing === 'string' ? f.theme.font_pairing : undefined,
    brand_color: typeof f.theme?.brand_color === 'string' ? f.theme.brand_color : undefined,
  }

  // Merges one theme field into whatever the OTHER two currently hold —
  // never a bare `{ [key]: value }`, which would silently drop a sibling
  // field the tenant set in an earlier, still-unsaved edit this same
  // session (`f.theme` already carries every prior queued change via
  // `update`'s own `{...(p ?? page ?? {})}` merge). `themePayload` is the
  // same allowlist-narrowing function `designChoices.test.ts` pins — used
  // here, not only at `saveMut`'s wire boundary, so a stray key can never
  // enter `form.theme` in the first place. Setting `form` (via `update`)
  // is what flips `dirty` true, exactly like every other field on this
  // screen — Save still has to be pressed; nothing here is a Task 4-style
  // straight-to-server write.
  const updateTheme = (patch: Partial<typeof themeFields>) =>
    update('theme', themePayload({ ...themeFields, ...patch }))

  // The best business name this screen can honestly show in a card — the
  // page itself carries no such field (theme/content have no "name"),
  // so the brand's own name (BrandSwitcher's own data, already loaded) is
  // the equivalent of the wizard's `prefill.business_name`. Falls back to
  // the same generic word the wizard uses for the same reason (an org with
  // no BrandSummary yet, or "All brands" mode).
  const businessName = currentBrand()?.name || t('landing_pages.wizard.your_business', 'your business')

  const rows: EditorSectionRow[] = buildSectionRows(f.sections ?? [], availability)

  const moveRow = (key: SectionKey, direction: 'up' | 'down') =>
    update('sections', moveSection(f.sections ?? [], key, direction))

  const toggleRow = (key: SectionKey) =>
    update('sections', toggleSection(f.sections ?? [], key))

  // Task 6: the photo endpoints (Task 4) save straight to the row and are
  // this field's ONLY writer (D4) — nothing here ever routes an upload/
  // remove through `form`/`saveMut`. `invalidateQueries` re-fetches the
  // real saved state and `previewNonce` bumps so the right-hand preview
  // (which renders server-side, Task 9) picks up the new photo — the exact
  // same pairing `saveMut.onSuccess` already does for a text save.
  const onImageChanged = () => {
    qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
    setPreviewNonce(n => n + 1)
  }

  const saveMut = useMutation({
    mutationFn: async (body: Partial<LandingPageDTO>) => {
      const calls: Promise<unknown>[] = [
        // Copy/theme/seo — the existing `update` (§ Task 1 interfaces).
        // Always sent as real objects, never `null`: the endpoint's
        // `'theme' => ['sometimes', 'array', …]` rule only SKIPS
        // validation when the key is entirely absent from the request —
        // present-but-null still has to satisfy `array` and would 422 on
        // a page nothing has written theme/content/seo to yet.
        // `slug` is always included once dirty (same "send the whole
        // object" pattern as theme/content/seo above), not only when the
        // Web address block was the thing touched: `f` is always a full
        // clone of `page` with one key overridden once `form` exists, so
        // `body.slug` already equals the unchanged saved slug in every
        // other case — proven safe by the backend's own
        // `test_saving_an_unchanged_slug_is_neither_a_collision_nor_a_redirect`.
        // A dedicated "did the address change" branch here would be a
        // second place that question could give a different answer.
        api.put('/v1/admin/landing-pages', {
          theme: body.theme ?? {},
          // Fix round 1 (ruling 3b-4): `body.content` can carry an
          // `image_url` leaf dragged in by reference the instant a
          // SIBLING field on that same section is edited (`updateContent`'s
          // spread copies the whole stored section) — the server's D4
          // refusal is unconditional, so an unstripped leaf 422s the very
          // next save after any photo upload. Stripping here is always
          // safe: the server re-hydrates each section's stored
          // `image_url` back in when the request omits it.
          content: stripImageUrlLeaves(body.content),
          seo: body.seo ?? {},
          slug: body.slug ?? page?.slug,
        }),
      ]

      // Section enable/reorder — the Task 1 endpoint, a separate resource
      // with a different body shape. Re-derives the merged rows (rather
      // than trusting `body.sections` as-is) so `isOfferable`'s
      // forced-off gate applies to what actually reaches the server, not
      // only to what the toggle displays.
      const toSave = buildSectionRows(body.sections ?? [], availability)
      if (toSave.length > 0) {
        calls.push(api.put('/v1/admin/landing-pages/sections', { sections: buildSectionsPayload(toSave) }))
      }

      await Promise.all(calls)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      setForm(null)
      setPreviewNonce(n => n + 1)
      toast.success(t('landing_pages.editor.saved_toast', 'Your page was saved'))
    },
    onError: (e: unknown) => {
      // `errors.slug[0]` first: a rejected address (taken, reserved, too
      // short) is a `ValidationException`, and bootstrap/app.php's own
      // renderer puts the actually useful per-field message under
      // `errors`, not `message` (which Laravel hard-codes to the generic
      // "The given data was invalid." even for `withMessages()`) or
      // `error` (this app's own handler sets that to the generic string
      // "Validation failed"). Without this, a tenant renaming their
      // address to one that is already taken would see "Validation
      // failed" — true, but not something they can act on — which is
      // exactly the kind of unhelpful surface this task's own "highest
      // bar" instruction argues against for the address specifically.
      const err = e as { response?: { data?: {
        error?: string; message?: string; errors?: Record<string, string[]>
      } } }
      const fieldError = err.response?.data?.errors?.slug?.[0]
      toast.error(
        fieldError
        ?? err.response?.data?.error
        ?? err.response?.data?.message
        ?? t('common.error', 'Something went wrong'),
      )
    },
  })

  // ─── Publish / unpublish (Task 10) ────────────────────────────────────
  //
  // Two SEPARATE mutations, not one toggle, because they are not
  // symmetric: `publish` sits behind `feature:landing_pages` (routes/
  // api.php) and this screen's own `disabled={dirty}` guard below, while
  // `unpublish` deliberately sits outside BOTH the feature gate and
  // `check.subscription` — so a tenant who has downgraded or cancelled
  // can still take their own page off the internet. Neither mutation
  // reads `useSubscription()`/`hasFeature()` at all: per the brief, the
  // unpublish button must never be gated on entitlement in the UI, and
  // the surest way to guarantee that is to never wire that hook in here
  // in the first place, rather than trust a conditional to stay correct.
  const publishMut = useMutation({
    mutationFn: () => api.post('/v1/admin/landing-pages/publish'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      toast.success(t('landing_pages.editor.published_toast', 'Your page is now live'))
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error ?? err.response?.data?.message ?? t('common.error', 'Something went wrong'))
    },
  })

  const unpublishMut = useMutation({
    mutationFn: () => api.post('/v1/admin/landing-pages/unpublish'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      toast.success(t('landing_pages.editor.unpublished_toast', 'Your page is no longer public'))
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error ?? err.response?.data?.message ?? t('common.error', 'Something went wrong'))
    },
  })

  const handlePublish = () => {
    if (!page) return
    const confirmed = window.confirm(
      t('landing_pages.editor.publish_confirm', {
        url: page.url,
        defaultValue: 'Publish your page? Anyone with the link will be able to see it at {{url}}.',
      }),
    )
    if (confirmed) publishMut.mutate()
  }

  const handleUnpublish = () => {
    const confirmed = window.confirm(
      t(
        'landing_pages.editor.unpublish_confirm',
        'Take your page offline? Nothing is deleted — you can publish it again any time.',
      ),
    )
    if (confirmed) unpublishMut.mutate()
  }

  // ─── Web address editing (Task 10) ────────────────────────────────────
  //
  // A separate local draft rather than binding straight to `f.slug`/
  // `update('slug', …)` on every keystroke: the read-only display (and
  // its Copy button) must always show the address that is ACTUALLY live
  // or saved, never a stray in-progress keystroke, so nothing is queued
  // into `form` until the tenant explicitly confirms it via
  // `applyAddressEdit`.
  const [addressEditing, setAddressEditing] = useState(false)
  const [addressDraft, setAddressDraft] = useState('')
  const [addressCopied, setAddressCopied] = useState(false)

  // A rename already applied (via `update('slug', …)`) but not yet saved
  // — shown as a "this will be your new address once you save" line
  // beside the still-live one, so a tenant who queued a rename and got
  // distracted before hitting Save is never left assuming the change
  // already took effect.
  const pendingSlug = page && f.slug !== undefined && f.slug !== page.slug ? f.slug : null

  // Task 10b round 1: was un-awaited with no rejection handler, so a
  // denied clipboard permission still showed "Copied" (a false success),
  // and on an insecure origin `navigator.clipboard` is `undefined` —
  // reading `.writeText` off it throws SYNCHRONOUSLY, before any promise
  // ever exists to reject. The try/catch below is what catches that;
  // `.then(onSuccess, onError)` (LeadForms.tsx's own established pattern)
  // is what catches an actual rejected write.
  const copyAddress = () => {
    if (!page) return
    try {
      navigator.clipboard.writeText(page.url).then(
        () => {
          setAddressCopied(true)
          setTimeout(() => setAddressCopied(false), 2000)
          toast.success(t('common.copied', 'Copied'))
        },
        () => toast.error(t('common.copy_failed', 'Could not copy')),
      )
    } catch {
      toast.error(t('common.copy_failed', 'Could not copy'))
    }
  }

  const startEditingAddress = () => {
    if (!page) return
    setAddressDraft(pendingSlug ?? page.slug)
    setAddressEditing(true)
  }

  const applyAddressEdit = () => {
    const trimmed = addressDraft.trim()
    if (trimmed === '') return
    // Task 10b round 1: skip queuing an update when the trimmed draft
    // matches `f.slug` — the CURRENT effective address, whether that is
    // the saved `page.slug` or an already-pending unsaved rename.
    // Previously this called update('slug', trimmed) unconditionally, so
    // Change -> "Use this address" with no actual edit still flipped
    // `dirty` to true, disabling Publish ("Save your changes first.") for
    // a save that would have written back the exact same value.
    if (trimmed !== f.slug) {
      update('slug', trimmed)
    }
    setAddressEditing(false)
  }

  const cancelAddressEdit = () => setAddressEditing(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('landing_pages.editor.loading', 'Loading your page…')}
      </div>
    )
  }

  if (error || !page) {
    return (
      <QueryError
        onRetry={() => refetch()}
        message={t('landing_pages.editor.load_error', 'Could not load your landing page.')}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/*
        Task 10, placed above BOTH columns rather than inside the left
        one: the brief's own stated bar for this block is higher than for
        any control in it — "a tenant must never be unsure whether the
        public can see their page" — so it has to be visible the instant
        the editor mounts, not after scrolling past however many section
        cards this page happens to have.
      */}
      <WebAddressCard
        page={page}
        dirty={dirty}
        pendingSlug={pendingSlug}
        editing={addressEditing}
        draft={addressDraft}
        copied={addressCopied}
        onCopy={copyAddress}
        onStartEdit={startEditingAddress}
        onDraftChange={setAddressDraft}
        onApply={applyAddressEdit}
        onCancel={cancelAddressEdit}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        publishing={publishMut.isPending}
        unpublishing={unpublishMut.isPending}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 space-y-5 min-w-0">
          {/*
            Task 6 (landing phase 3c, D4): the Design panel, above the
            section list per the spec — palette + type-pairing cards and
            the brand-colour input, all saved through the SAME text-save
            path every other field on this screen already uses (`update` +
            the sticky Save button below); `image_url` handling is
            untouched (D4's one-writer rule stays with the photo controls).
          */}
          <div className={card + ' space-y-5'}>
            <h2 className="text-sm font-semibold text-white">{t('landing_pages.design.title', 'Design')}</h2>
            <DesignPanel
              businessName={businessName}
              palette={themeFields.palette}
              fontPairing={themeFields.font_pairing}
              brandColor={themeFields.brand_color}
              onPaletteChange={id => updateTheme({ palette: id })}
              onFontPairingChange={id => updateTheme({ font_pairing: id })}
              onBrandColorChange={hex => updateTheme({ brand_color: hex })}
            />
          </div>

          <div className="space-y-3">
            {rows.map((row, i) => (
              <SectionRow
                key={row.key}
                row={row}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
                content={f.content?.[row.key] ?? {}}
                // Task 6: sourced from the QUERY's raw `page`, never from
                // `f`/`form` — see the comment beside this row's own
                // `type === 'image'` branch in `SectionRow` for why. Minor
                // m4: that raw query leaf is also unvalidated raw-DB data —
                // `safeImageUrl` is the allowlist gate that keeps a legal
                // non-string leaf from reaching `resolveImage()`'s
                // unconditional `url.match(...)` and taking this whole
                // route down.
                imageUrl={safeImageUrl(page.content?.[row.key]?.image_url)}
                onToggle={() => toggleRow(row.key)}
                onMove={dir => moveRow(row.key, dir)}
                onFieldChange={(field, value) => updateContent(row.key, field, value)}
                onImageChanged={onImageChanged}
              />
            ))}
          </div>

          <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-dark-bg/95 backdrop-blur border-t border-dark-border flex items-center justify-between">
            <span className="text-xs text-t-secondary">
              {dirty ? t('landing_pages.unsaved', 'Unsaved changes') : t('landing_pages.saved', 'All changes saved')}
            </span>
            <button
              type="button"
              disabled={!dirty || saveMut.isPending}
              onClick={() => saveMut.mutate(f)}
              className={btnPrimary}
            >
              <Save size={14} /> {saveMut.isPending ? t('common.saving', 'Saving…') : t('landing_pages.save', 'Save changes')}
            </button>
          </div>
        </div>

        <div className="xl:col-span-5">
          <div className="xl:sticky xl:top-4">
            <LandingPreview nonce={previewNonce} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Task 10's own block: live/draft state (unmistakable — see the render
 * call site's comment), the web address with Copy, an editable-address
 * sub-panel with the 90-day warning, and the Publish/Unpublish action.
 *
 * Follows `SectionRow`'s existing precedent in this same file: its own
 * `useTranslation()` rather than a `t` prop, and a flat, typed prop list
 * rather than a context.
 */
function WebAddressCard({
  page, dirty, pendingSlug, editing, draft, copied,
  onCopy, onStartEdit, onDraftChange, onApply, onCancel,
  onPublish, onUnpublish, publishing, unpublishing,
}: {
  page: LandingPageDTO
  dirty: boolean
  pendingSlug: string | null
  editing: boolean
  draft: string
  copied: boolean
  onCopy: () => void
  onStartEdit: () => void
  onDraftChange: (v: string) => void
  onApply: () => void
  onCancel: () => void
  onPublish: () => void
  onUnpublish: () => void
  publishing: boolean
  unpublishing: boolean
}) {
  const { t } = useTranslation()
  const vis = pageVisibilityState(page.status, dirty)

  return (
    <div className={card + ' space-y-4'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span className={'mt-0.5 shrink-0 ' + (vis.tone === 'live' ? 'text-accent' : 'text-t-secondary')}>
            {vis.tone === 'live' ? <Globe size={18} /> : <EyeOff size={18} />}
          </span>
          <div className="min-w-0">
            <p className={'text-sm font-semibold ' + (vis.tone === 'live' ? 'text-accent' : 'text-white')}>
              {t(vis.headlineKey, vis.headlineFallback)}
            </p>
            {vis.noteKey && (
              <p className="text-xs text-t-secondary mt-0.5">{t(vis.noteKey, vis.noteFallback ?? '')}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {page.status === 'draft' ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={dirty || publishing}
              onClick={onPublish}
            >
              <Globe size={14} />
              {publishing ? t('landing_pages.editor.publishing', 'Publishing…') : t('landing_pages.editor.publish', 'Publish')}
            </button>
          ) : (
            <button
              type="button"
              className={btnSec}
              disabled={unpublishing}
              onClick={onUnpublish}
            >
              {unpublishing ? t('landing_pages.editor.unpublishing', 'Working…') : t('landing_pages.editor.unpublish', 'Unpublish')}
            </button>
          )}
          {page.status === 'draft' && dirty && (
            <p className="text-[11px] text-t-secondary mt-1">
              {t('landing_pages.editor.publish_needs_save', 'Save your changes first.')}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-dark-border pt-4">
        <label className={label}>{t('landing_pages.web_address', 'Web address')}</label>

        {editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 focus-within:border-primary-500">
              <span className="text-xs text-t-secondary whitespace-nowrap shrink-0">{addressHost(page.url)}/</span>
              <input
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-xs text-white outline-none"
                value={draft}
                onChange={e => onDraftChange(e.target.value)}
                aria-label={t('landing_pages.web_address', 'Web address')}
                // Task 10b round 1: matches the backend's own
                // `'slug' => '...|max:63'` rule (LandingPageController.php)
                // exactly, so a too-long address is stopped here rather
                // than round-tripping to the server for a 422. The
                // server-side message was also hardened (never says the
                // word "slug") for the residual case — paste, IME input,
                // or any other way this limit gets bypassed client-side.
                maxLength={63}
              />
            </div>

            <p className="text-xs text-t-secondary">
              {t('landing_pages.editor.address_preview', {
                url: buildAddressUrl(page.url, draft),
                defaultValue: 'This will be: {{url}}',
              })}
            </p>

            {/* Plain English, never "redirect" — Task 10's own instruction:
                describe what the tenant experiences, not the mechanism. */}
            <p className="text-xs text-warning/90">
              {t(
                'landing_pages.editor.address_change_warning',
                'Your old address will keep working for 90 days after you change this, so anyone who already has it — a card, a QR code, a bookmark — will not hit a broken link.',
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={previewSlug(draft) === ''}
                onClick={onApply}
              >
                {t('landing_pages.editor.address_apply', 'Use this address')}
              </button>
              <button type="button" className={btnSec} onClick={onCancel}>
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs text-white bg-dark-bg border border-dark-border rounded-lg px-3 py-2">
                {page.url}
              </code>
              {/* Only when actually live: opening a draft's address would
                  land on a real 404, which is the opposite of reassuring.
                  A tenant clicking through and seeing their OWN real page
                  is the strongest possible confirmation that it is public
                  — stronger than any badge this component could draw. */}
              {vis.tone === 'live' && (
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btnSec}
                  aria-label={t('landing_pages.editor.address_open', 'Open your live page')}
                >
                  <ExternalLink size={13} />
                </a>
              )}
              <button type="button" className={btnSec} onClick={onCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {t('common.copy', 'Copy')}
              </button>
              <button type="button" className={btnSec} onClick={onStartEdit}>
                {t('landing_pages.editor.address_change', 'Change')}
              </button>
            </div>

            {pendingSlug && (
              <p className="text-xs text-t-secondary mt-1.5">
                {t('landing_pages.editor.address_pending', {
                  url: buildAddressUrl(page.url, pendingSlug),
                  defaultValue: 'New address after you save: {{url}}',
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SectionRow({ row, isFirst, isLast, content, imageUrl, onToggle, onMove, onFieldChange, onImageChanged }: {
  row: EditorSectionRow
  isFirst: boolean
  isLast: boolean
  content: Record<string, string>
  /** Task 6: `page.content?.[row.key]?.image_url`, straight off the QUERY
   *  — see the field-loop's own comment below for why this can never be
   *  `content` (which is `f.content`, form-merged) instead. */
  imageUrl: string | null
  onToggle: () => void
  onMove: (direction: 'up' | 'down') => void
  onFieldChange: (field: string, value: string) => void
  onImageChanged: () => void
}) {
  const { t } = useTranslation()
  // RULING 4, from ./sections — the one predicate the wizard's step 4 and
  // this row both call, so the two screens cannot disagree about which
  // sections are real.
  const offerable = isOfferable(row)
  const checked = offerable && row.enabled
  const fields = SECTION_CONTENT_FIELDS[row.key]

  return (
    <div className={card + ' space-y-4'}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col shrink-0 -mt-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onMove('up')}
              aria-label={t('landing_pages.editor.move_up', 'Move up')}
              className="text-t-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUp size={15} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onMove('down')}
              aria-label={t('landing_pages.editor.move_down', 'Move down')}
              className="text-t-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown size={15} />
            </button>
          </div>

          <div className="min-w-0">
            <span className="block text-sm font-medium text-white">{row.label}</span>
            {offerable ? (
              <span className="block text-xs text-t-secondary mt-0.5">
                {/* Task 11 — same rule as LandingWizard's step 4, and for
                    the same reason: a count is only meaningful for a
                    section backed by rows elsewhere in the product. See
                    that file's comment at the identical call site. */}
                {isDataBackedSection(row.key)
                  ? t('landing_pages.section_source', {
                    count: row.count,
                    source: row.sourceLabel,
                    defaultValue: '{{count}} from {{source}}',
                  })
                  : row.sourceLabel}
              </span>
            ) : (
              <span className="block text-xs text-warning/90 mt-0.5">
                {/* Fix 2 (phase 3a correctness review) — same preference as
                    the wizard's identical step 4 branch: the backend's own
                    authored reason, when it sent one, beats the generic
                    instruction. */}
                {unavailableReason(row, t('landing_pages.editor.section_unavailable', {
                  source: row.sourceLabel,
                  defaultValue: 'Nothing to show yet. Add some from {{source}}.',
                }))}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={row.label}
          disabled={!offerable}
          onClick={onToggle}
          className={'relative shrink-0 w-9 h-5 rounded-full transition-colors outline-none '
            + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 '
            + (checked ? 'bg-primary-500' : 'bg-dark-border')}
        >
          <span
            aria-hidden
            className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform '
              + (checked ? 'translate-x-4' : 'translate-x-0.5')}
          />
        </button>
      </div>

      {offerable && (
        <div className="space-y-3 pl-7">
          {/* Task 2: the contact fields below are the ONLY per-page override
              in this whole section list — every other field here IS the
              page's content, but phone/email/address fall back to the
              tenant's Properties screen the moment a field is left blank
              (App\Landing\ContactDetails::resolve()). That is a meaningfully
              different mental model from "type your headline here", so it
              gets an explicit caption rather than leaving the tenant to
              infer it from a label alone. */}
          {row.key === 'contact' && (
            <p className="text-xs text-t-secondary -mt-1 mb-1">
              {t(
                'landing_pages.editor.contact_caption',
                'Filled from your Properties screen — edit here to override for this page.',
              )}
            </p>
          )}
          {fields.map(field => (
            <div key={field.name}>
              <label className={label} htmlFor={field.type === 'image' ? undefined : `lp-${row.key}-${field.name}`}>
                {t(`landing_pages.editor.field_${field.name}`, FIELD_FALLBACK[field.name] ?? field.name)}
              </label>
              {field.type === 'image' ? (
                /*
                 * D4 (frontend half), Task 6: `image_url` is never part of
                 * `form`/dirty state — Task 4's upload/remove endpoints are
                 * its one writer and they save straight to the server, so
                 * this control reads the `imageUrl` PROP (sourced from the
                 * QUERY's raw `page.content` at the call site above), never
                 * `content` (which is `f.content` — form-merged, and would
                 * go stale here the instant a SIBLING field on this same
                 * row were mid-edit: `form.content` is a clone frozen at
                 * that edit's start, from before this upload ever happened,
                 * and uploading writes nothing back into `form` to refresh
                 * it). It also never writes through `onFieldChange` —
                 * there is no keystroke to queue, only an immediate,
                 * already-saved server round-trip.
                 */
                <ImageField sectionKey={row.key} imageUrl={imageUrl} onChanged={onImageChanged} />
              ) : field.multiline ? (
                <textarea
                  id={`lp-${row.key}-${field.name}`}
                  className={input + ' resize-y'}
                  rows={4}
                  value={content[field.name] ?? ''}
                  onChange={e => onFieldChange(field.name, e.target.value)}
                />
              ) : (
                <input
                  id={`lp-${row.key}-${field.name}`}
                  // Fix 1 (phase 3a correctness review): mirrors the
                  // backend's own `content.contact.email`/`.phone`/
                  // `.address` rules client-side, same reasoning as the web
                  // address input's `maxLength` a few components over —
                  // catch the obviously-wrong value here rather than
                  // round-trip it to the server for a 422. `field.type`/
                  // `field.maxLength` are undefined for every field but
                  // contact's three, so every other input is unaffected.
                  type={field.type ?? 'text'}
                  maxLength={field.maxLength}
                  className={input}
                  value={content[field.name] ?? ''}
                  onChange={e => onFieldChange(field.name, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Task 6: the hero/about photo control. Per the spec, **no drag-and-drop
 * and no canvas UI** — a single native `<input type="file">`, no custom
 * drop-zone, no in-browser cropper. Its own `useMutation`s (rather than
 * lifting them into `LandingEditor`) because an upload/remove is a fully
 * self-contained round-trip with nothing for the parent to own beyond the
 * `onChanged` callback — it is never queued into `saveMut`/`form` (D4; see
 * the field-loop's own comment at this component's one call site).
 */
function ImageField({ sectionKey, imageUrl, onChanged }: {
  sectionKey: SectionKey
  imageUrl: string | null
  onChanged: () => void
}) {
  const { t } = useTranslation()

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      // Downscale only when the photo is actually larger than this screen
      // ever needs — a photo that already fits is sent byte-for-byte, so a
      // tenant who already cropped/optimised their own file never loses
      // anything to a needless re-encode.
      const bitmap = await createImageBitmap(file)
      const target = downscaleTarget(bitmap.width, bitmap.height)
      const image = target ? await drawToBlob(file, target) : file

      const body = new FormData()
      body.append('slot', sectionKey)
      body.append('image', image, file.name)
      // The shared `api` client strips Content-Type for a FormData body
      // (api.ts:28-37) so this plain multipart POST needs no extra config.
      return api.post('/v1/admin/landing-pages/image', body)
    },
    onSuccess: onChanged,
    onError: (e: unknown) => toast.error(imageErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const removeMut = useMutation({
    mutationFn: () => api.delete('/v1/admin/landing-pages/image', { data: { slot: sectionKey } }),
    onSuccess: onChanged,
    onError: (e: unknown) => toast.error(imageErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset immediately so picking the SAME file again (e.g. after fixing
    // it and re-selecting) still fires a change event next time.
    e.target.value = ''
    if (file) uploadMut.mutate(file)
  }

  const busy = uploadMut.isPending || removeMut.isPending

  return (
    <div className="space-y-2">
      {imageUrl ? (
        <img
          src={resolveImage(imageUrl) ?? undefined}
          alt=""
          className="max-h-24 rounded-lg border border-dark-border object-cover"
        />
      ) : (
        <p className="text-xs text-t-secondary">{t('landing_pages.editor.no_photo', 'No photo yet')}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={onPick}
          aria-label={t('landing_pages.editor.upload_photo', 'Upload photo')}
          className="block w-full max-w-xs text-xs text-t-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-dark-border file:bg-dark-bg file:text-t-secondary file:text-xs hover:file:text-white disabled:opacity-50"
        />
        {uploadMut.isPending && (
          <span className="text-xs text-t-secondary">{t('landing_pages.editor.photo_uploading', 'Uploading…')}</span>
        )}
        {imageUrl && (
          <button
            type="button"
            className={btnSec}
            disabled={busy}
            onClick={() => removeMut.mutate()}
          >
            {t('landing_pages.editor.remove_photo', 'Remove photo')}
          </button>
        )}
      </div>
    </div>
  )
}
