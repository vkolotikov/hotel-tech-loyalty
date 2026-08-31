import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Check, ChevronDown, ChevronUp, Copy, ExternalLink, EyeOff, Globe, GripVertical, Loader2, Plus, Save, Trash2,
} from 'lucide-react'
import { api, resolveImage } from '../../lib/api'
import { QueryError } from '../../components/QueryError'
import { useBrandStore } from '../../stores/brandStore'
import { isDataBackedSection, isOfferable, unavailableReason } from './sections'
import {
  addableTypes, appendSection, buildSectionRows, buildSectionsPayload, instanceRowLabel, moveSection,
  moveSectionToKey, removeSection, removeSectionContent, safeImageUrl, sectionIndex, stripImageUrlLeaves,
  toggleSection,
  type AddableType, type EditorSectionRow, type PageSection, type SectionAvailability, type SectionTypeOption,
} from './editorSections'
import { downscaleTarget, drawToBlob } from './imageDownscale'
import { addressHost, buildAddressUrl, pageVisibilityState, previewSlug } from './publishAddress'
import { LandingPreview } from './LandingPreview'
import { DesignPanel } from './DesignPanel'
import { themePayload } from './designChoices'
import type { IndustryOption } from './industryChoices'
import { catalogPayload, resolveTemplateKey, type TemplateOption } from './editorCatalog'
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
  /**
   * Landing phase 3c, Plan A. Both were choose-once-at-creation until the
   * Design panel gained a picker for each.
   *
   * `industry` is a SNAPSHOT of `organizations.industry`, not a field this
   * screen writes: `PUT /v1/admin/landing-pages` moves the ORGANISATION
   * (through `LandingOnboardingService::syncOrganizationIndustry()`, the
   * one writer the wizard's own POST also goes through) and
   * `Organization::updated` resyncs this column across every page under
   * that org. So the value here is always what the last save produced,
   * read back — never something the editor set locally and hoped for.
   */
  industry: string
  template_key: string
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
  /**
   * Landing phase 3c, Plan A: the other two catalogues on that SAME
   * onboarding response — `LandingOnboardingService::industries()` and its
   * `TEMPLATES` — handed down whole for the identical reason `sections` is.
   * Nothing else serves either list, and a second, editor-only copy of
   * "which industries are there" is exactly the drift the wizard's own
   * `industryChoices.ts` refuses to introduce.
   *
   * Both default to `[]` at the host's call site, so a frontend deployed
   * ahead of its backend simply renders neither picker.
   */
  industries: IndustryOption[]
  templates: TemplateOption[]
  /**
   * Builder round: `onboarding.section_types` — `App\Landing\SectionType`'s
   * own catalogue — handed down for the identical reason the three lists
   * above are. It is what says which types may be ADDED, how many of one
   * kind a page may hold, which fields each one edits and which take a
   * photo. Nothing on this side of the wire holds a second copy of any of
   * that; see `editorSections.ts`'s `SectionTypeOption`.
   */
  sectionTypes: SectionTypeOption[]
  /**
   * `onboarding.max_sections` — `SectionType::MAX_SECTIONS_PER_PAGE`, the
   * total-row cap `LandingPageSectionController::store()` enforces inside
   * its own transaction.
   *
   * Served rather than mirrored for the same reason everything else here is,
   * and `null` (an older backend that does not publish it) is handled
   * honestly: `addableTypes()` simply drops the page-cap gate, the add goes
   * to the server, and the server refuses it with its own already-friendly
   * sentence. A hardcoded 16 would be a number this screen believes and the
   * server might not.
   */
  maxSections: number | null
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
 * The builder round's equivalent of `imageErrorMessage`, and the same
 * preference for the same reason: `LandingPageSectionController`'s add and
 * remove verbs name every one of their messages by hand — "You can add up to
 * six sections like this one", "Sections that come with the page can be
 * switched off, but not removed" — and every one of them lands under
 * `errors.type[0]` or `errors.key[0]`. The generic envelope
 * (`error`/`message`) for those two routes is the string "Validation
 * failed", which is true and useless.
 */
function sectionErrorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: {
    errors?: Record<string, string[]>; error?: string; message?: string
  } } }
  return (
    err.response?.data?.errors?.type?.[0]
    ?? err.response?.data?.errors?.key?.[0]
    ?? err.response?.data?.errors?.sections?.[0]
    ?? err.response?.data?.error
    ?? err.response?.data?.message
    ?? fallback
  )
}

/**
 * The landing page editor: one row per section (enable toggle, reorder
 * handle, plain-English label with its source, inline copy fields), plus an
 * explicit Save. Task 9 adds the right-hand live preview
 * (`LandingPreview.tsx`); Task 10 the web-address/publish/unpublish block.
 *
 * THE BUILDER ROUND CHANGED ONE OF ITS FOUNDING RULES, deliberately. The
 * original spec said no drag-and-drop — reasoning that it is what
 * inexperienced users struggle with most — so reordering was two chevrons.
 * The tenant this product is for then asked for exactly that, by name
 * ("some drag and drop… close to a builder, simplified"). Both are right
 * about different people, so this screen now carries both paths onto the
 * same operation rather than choosing between them:
 *
 *   - a grip handle each row can be DRAGGED by (HTML5 drag events, no
 *     library — see `SectionRow`);
 *   - the same two chevrons, kept exactly where they were. They are the
 *     keyboard path, they are the touch path (HTML5 drag events do not fire
 *     for touch), and they are the discoverable path for anyone who would
 *     never think to try dragging;
 *   - and the handle itself takes arrow keys, so a keyboard user who lands
 *     on the drag affordance can use it rather than having to find another
 *     control.
 *
 * Every one of those routes through `moveSection`/`moveSectionTo` and ends
 * up in the same `PUT /sections` save, and every one announces itself
 * through the same polite live region, so there is one reorder feature with
 * three ways in rather than three features.
 *
 * ADD AND REMOVE ARE NOT PART OF THAT SAVE. `POST`/`DELETE /sections` write
 * immediately, the way the photo endpoints already do — a section row is a
 * database row, not a field, and queueing "this page has a new band" behind
 * a Save button would mean the key the tenant is now typing into does not
 * exist yet server-side (the image endpoint would refuse its slot, and the
 * next `PUT /sections` would 422 on a key the page does not own). So both
 * follow the photo controls' established pairing exactly: write, invalidate
 * the query, bump `previewNonce`.
 */
export function LandingEditor({
  sections: availability, industries, templates, sectionTypes, maxSections,
}: LandingEditorProps) {
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

  // Landing phase 3c, Plan A: the two catalogue fields, queued into the
  // SAME `form` state and flipping the SAME `dirty` flag as every other
  // control on this screen — never a straight-to-server write. Both are
  // top-level columns on the DTO rather than leaves of `theme`, so they use
  // `update` directly and need no `themePayload`-style merge: there is no
  // sibling key inside them to preserve.
  //
  // `templateKey` is narrowed through `resolveTemplateKey` against the
  // SERVED list on the way in (a stored key a later backend release removed
  // must not be drawn as a selected card), which is also what stops it
  // being sent back out — see `catalogPayload`, which re-checks membership
  // at the wire.
  const templateKey = resolveTemplateKey(templates, f.template_key, page?.template_key)

  // The best business name this screen can honestly show in a card — the
  // page itself carries no such field (theme/content have no "name"),
  // so the brand's own name (BrandSwitcher's own data, already loaded) is
  // the equivalent of the wizard's `prefill.business_name`. Falls back to
  // the same generic word the wizard uses for the same reason (an org with
  // no BrandSummary yet, or "All brands" mode).
  const businessName = currentBrand()?.name || t('landing_pages.wizard.your_business', 'your business')

  // `page.content` (the SAVED row), never `f.content`, for the same reason
  // the photo thumbnails read the raw query: it answers "has this band been
  // written into" for the tenant-added rows, and the truthful answer is
  // about what the server would render right now, not about a keystroke
  // queued half a second ago. A tenant typing into a brand-new text block
  // watches the hint clear on Save, which is exactly when the band actually
  // appears on the page.
  const rows: EditorSectionRow[] = buildSectionRows(f.sections ?? [], availability, sectionTypes, page?.content)

  // Counted over the RAW rows, never `rows` — see `addableTypes`. A row this
  // build failed to recognise still takes up a place on the page as far as
  // `store()`'s cap is concerned.
  const addable: AddableType[] = addableTypes(sectionTypes, f.sections ?? [], maxSections)

  // The one polite announcement channel every reorder path writes to —
  // drag, chevrons, and arrow keys on the handle alike. A screen reader
  // otherwise gets nothing at all from a drop: the list silently reorders
  // and the row the user was on is somewhere else.
  const [announcement, setAnnouncement] = useState('')

  const announceMove = (next: PageSection[], key: string, label: string) => {
    const at = sectionIndex(next, key)
    if (at === -1) return
    setAnnouncement(t('landing_pages.editor.reorder_announced', {
      label,
      position: at + 1,
      total: next.length,
      defaultValue: '{{label}} moved to position {{position}} of {{total}}.',
    }))
  }

  const moveRow = (key: string, direction: 'up' | 'down', label: string) => {
    const next = moveSection(f.sections ?? [], key, direction)
    update('sections', next)
    announceMove(next, key, label)
  }

  /**
   * The drag half, and the Home/End half: put `key` where `targetKey`
   * currently is. Named by TARGET rather than by position because the
   * rendered list can be shorter than the page — see `moveSectionToKey`,
   * which owns why, and `moveSectionTo` behind it for what "where that one
   * is" means in each direction.
   */
  const dropRow = (key: string, targetKey: string, label: string) => {
    const next = moveSectionToKey(f.sections ?? [], key, targetKey)
    update('sections', next)
    announceMove(next, key, label)
  }

  const toggleRow = (key: string) =>
    update('sections', toggleSection(f.sections ?? [], key))

  // Which row is currently being dragged, and which one the pointer is
  // over. Held HERE rather than per row because both questions are about
  // the list, not about any one card: a row has to know whether it is the
  // one being carried, and every other row has to know whether it is the
  // one about to receive it.
  //
  // The dragged row's LABEL rides along with its key because the drop is
  // handled by the row underneath the pointer, which knows its own name and
  // not the travelling one's — and the announcement has to name the section
  // that actually moved.
  const [drag, setDrag] = useState<{ key: string; label: string } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const dragKey = drag?.key ?? null

  const endDrag = () => {
    setDrag(null)
    setDropKey(null)
  }

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

  // ─── Add / remove a section (the builder round) ───────────────────────
  //
  // Both write immediately and both follow `onImageChanged`'s pairing
  // exactly — invalidate, then bump `previewNonce`, because the SAVED draft
  // really did change and the preview renders from it. (Adding a band moves
  // nothing visible yet: an unwritten text block does not render at all, by
  // `PageContent::count()`'s own rule. Bumping anyway is the honest thing —
  // the nonce claims "there is a newer saved draft", not "you will see a
  // difference".)
  //
  // The local `form` patch beside each is what makes the row appear at once
  // rather than after the refetch, and it is CONDITIONAL on `form` already
  // existing. Patching a null `form` would flip `dirty` to true — showing
  // "Unsaved changes" and disabling Publish — for a change the server has
  // already committed, which is a plain lie about the state of the page.
  // When `form` is null there is nothing to patch anyway: `f` falls through
  // to `page`, and the invalidated query brings the row back with it.
  //
  // Known and accepted: that leaves a sub-second window where an add has
  // succeeded, `form` is still null, the refetch has not landed, and an edit
  // to some OTHER field clones the pre-add `page` into `form` — so the new
  // row waits until the next Save to reappear. Nothing is lost (the row and
  // its key exist server-side; `PUT /sections` leaves rows it is not named,
  // and the post-save refetch brings it back), and closing it would mean
  // writing this endpoint's response into the query cache as if it were
  // `show()`'s — a second, differently-produced shape standing in for the
  // canonical one, which is a worse trade than a window a tenant would have
  // to be typing during to reach.
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const addMut = useMutation({
    mutationFn: (type: string) =>
      api.post('/v1/admin/landing-pages/sections', { type }).then(r => r.data as { key: string }),
    onSuccess: ({ key }) => {
      setForm(p => (p === null ? null : { ...p, sections: appendSection(p.sections ?? [], key) }))
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      setPreviewNonce(n => n + 1)
      // Focuses the new band's first writable field on mount, so a tenant
      // who pressed "Add" can start typing without hunting for where the
      // thing landed. Cleared as soon as it is spent — it must not steal
      // focus back on the next unrelated re-render.
      setJustAdded(key)
    },
    onError: (e: unknown) => toast.error(sectionErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const removeMut = useMutation({
    mutationFn: (key: string) => api.delete('/v1/admin/landing-pages/sections', { data: { key } }),
    onSuccess: (_res, key) => {
      setForm(p => (p === null ? null : {
        ...p,
        sections: removeSection(p.sections ?? [], key),
        // The dead section's copy goes with it. `PUT /v1/admin/landing-pages`
        // replaces `content` WHOLESALE, so an unsaved clone left behind here
        // would be written straight back — and since keys are allocated
        // lowest-free, the next text block the tenant adds would open holding
        // the words they just deleted. See `removeSectionContent`.
        content: removeSectionContent(p.content, key) as LandingPageDTO['content'],
      }))
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      setPreviewNonce(n => n + 1)
    },
    onError: (e: unknown) => toast.error(sectionErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const handleRemove = (row: EditorSectionRow, label: string) => {
    // Plain language about what is actually destroyed — `destroy()` removes
    // the row, unsets `content.<key>` and deletes the uploaded file, and a
    // tenant is owed all three in words rather than "Are you sure?".
    const confirmed = window.confirm(
      t('landing_pages.editor.section_remove_confirm', {
        label,
        defaultValue:
          'Remove "{{label}}"? The words you wrote in it and any photo you added to it are deleted too, and that cannot be undone.',
      }),
    )
    if (confirmed) removeMut.mutate(row.key)
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
          // Landing phase 3c, Plan A: `industry` and `template_key`, and
          // ONLY when they actually moved to a value the server offered —
          // the opposite of the four fields above, which are sent whole on
          // every save because the endpoint replaces them wholesale. See
          // `catalogPayload`'s own docblock for both narrowings; the short
          // version is that `industry` is not a column this endpoint writes
          // at all (it moves the ORGANISATION, and a resync sweep across
          // every landing page follows), so re-asserting it on every
          // headline edit would be asking for that sweep on every save.
          ...catalogPayload({
            industries,
            templates,
            industry: body.industry,
            templateKey: body.template_key,
            // The SAVED row, never `f`/`body` — the same "diff against what
            // is really stored" source the address block's own
            // `pendingSlug` reads.
            savedIndustry: page?.industry,
            savedTemplateKey: page?.template_key,
          }),
        }),
      ]

      // Section enable/reorder — the Task 1 endpoint, a separate resource
      // with a different body shape. Re-derives the merged rows (rather
      // than trusting `body.sections` as-is) so `isOfferable`'s
      // forced-off gate applies to what actually reaches the server, not
      // only to what the toggle displays.
      //
      // BUILDER ROUND, and this argument is load-bearing: `sectionTypes` is
      // what lets a tenant-added `text_1` row survive this re-derivation.
      // Without it `buildSectionRows` drops every key it does not recognise,
      // so the added band's `sort` never reached the server and a reorder
      // that moved it silently did not stick — the row kept whatever `sort`
      // `store()` appended it with while every other row was renumbered
      // around it.
      const toSave = buildSectionRows(body.sections ?? [], availability, sectionTypes, page?.content)
      if (toSave.length > 0) {
        calls.push(api.put('/v1/admin/landing-pages/sections', { sections: buildSectionsPayload(toSave) }))
      }

      await Promise.all(calls)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      // Landing phase 3c, Plan A: the onboarding response too, because a
      // saved industry change moves what it says. `sections` (this
      // component's own `availability` prop) is computed from the page's
      // industry profile server-side — its LABELS are that industry's
      // vocabulary ("Treatments" vs "Courses") and its ROWS are that
      // industry's bands (only `hotel` has an available booking band) — so
      // without this the section list below would keep describing the
      // industry the tenant just left until something else happened to
      // refetch it. The host (`LandingPages.tsx`) owns that query; it
      // re-reads `completed`, which is still true for a page that exists,
      // so nothing flashes back to the wizard.
      qc.invalidateQueries({ queryKey: ['landing-onboarding', currentBrandId] })
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
            {/*
              Landing phase 3c, Plan A: `industries`/`templates` and their
              two callbacks are what turn this into the whole Design panel —
              industry and page style above the palette, type and brand
              colour that were already here. The wizard renders the same
              component with neither prop set (it asks about industry in its
              own step 1 and never asks about the template), so its "Make it
              yours" step is unchanged.
            */}
            <DesignPanel
              businessName={businessName}
              palette={themeFields.palette}
              fontPairing={themeFields.font_pairing}
              brandColor={themeFields.brand_color}
              onPaletteChange={id => updateTheme({ palette: id })}
              onFontPairingChange={id => updateTheme({ font_pairing: id })}
              onBrandColorChange={hex => updateTheme({ brand_color: hex })}
              industries={industries}
              industry={f.industry}
              savedIndustry={page.industry}
              onIndustryChange={id => update('industry', id)}
              templates={templates}
              templateKey={templateKey}
              onTemplateChange={key => update('template_key', key)}
            />
          </div>

          <div>
            {/*
              Said ONCE, above the list, rather than as a hint on every one
              of up to sixteen cards — which is also the only way a page
              with twelve sections stays calm. It has to be said somewhere:
              a grip icon is not self-explanatory to the tenant this screen
              is for, and the keyboard route is not discoverable at all
              without being named.
            */}
            {rows.length > 0 && (
              <p id="lp-reorder-help" className="text-xs text-t-secondary mb-2">
                {t(
                  'landing_pages.editor.reorder_help',
                  'Drag a section by its handle to move it, or use the arrows. Sections appear on your page from top to bottom.',
                )}
              </p>
            )}

            <div className="space-y-3">
              {rows.map((row, i) => (
                <SectionRow
                  key={row.key}
                  row={row}
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                  index={i}
                  total={rows.length}
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
                  autoFocusFirstField={row.key === justAdded}
                  onFocusHandled={() => setJustAdded(null)}
                  dragging={dragKey === row.key}
                  dragActive={dragKey !== null}
                  dropTarget={dropKey === row.key && dragKey !== null && dragKey !== row.key}
                  onDragStart={label => { setDrag({ key: row.key, label }); setDropKey(null) }}
                  onDragOverRow={() => { if (dragKey !== null && dragKey !== row.key) setDropKey(row.key) }}
                  onDragEnd={endDrag}
                  onDropRow={() => {
                    // The DRAGGED row moves to THIS row's position, and it is
                    // the DRAGGED row that gets announced — which is why its
                    // label was captured at drag start rather than read off
                    // `row` here, where it would name the wrong section.
                    if (drag !== null && drag.key !== row.key) dropRow(drag.key, row.key, drag.label)
                    endDrag()
                  }}
                  onToggle={() => toggleRow(row.key)}
                  onMove={(dir, label) => moveRow(row.key, dir, label)}
                  // Home/End. Resolved to the first/last VISIBLE row's key
                  // here, where the rendered list is — a row this build does
                  // not draw is not somewhere "top of the list" could mean.
                  onMoveEdge={(edge, label) => {
                    const target = edge === 'first' ? rows[0] : rows[rows.length - 1]
                    if (target && target.key !== row.key) dropRow(row.key, target.key, label)
                  }}
                  onRemove={label => handleRemove(row, label)}
                  removing={removeMut.isPending && removeMut.variables === row.key}
                  onFieldChange={(field, value) => updateContent(row.key, field, value)}
                  onImageChanged={onImageChanged}
                />
              ))}
            </div>

            {rows.length === 0 && (
              <p className={card + ' text-sm text-t-secondary'}>
                {t(
                  'landing_pages.editor.sections_empty',
                  'Your page has no sections yet. Add one below and it will show up here, ready to write in.',
                )}
              </p>
            )}

            <AddSectionCard
              types={addable}
              adding={addMut.isPending ? (addMut.variables ?? null) : null}
              onAdd={type => addMut.mutate(type)}
            />

            {/*
              The one polite channel every reorder path writes to. Visually
              hidden, never `hidden`/`display:none` — a hidden live region
              announces nothing at all.
            */}
            <p aria-live="polite" className="sr-only">{announcement}</p>
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

/** `t()` fallback per section TYPE id, for the bands a tenant adds
 *  themselves. The fixed bands take their label off the wire instead (the
 *  industry's own vocabulary — a clinic's "Procedures", a salon's
 *  "Treatments"), which is why there is no entry here for any of them.
 *
 *  A tenant-added band cannot be named that way: it is not in any industry's
 *  `defaultSections`, so `LandingOnboardingService::sections()` — which maps
 *  over exactly that list — has nothing to say about it, in any industry.
 *  Naming it here rather than adding it to the wire is also the honest
 *  split: "Text block" is not vocabulary about somebody's trade, it is the
 *  editor describing one of its own controls, which is what the rest of this
 *  file's i18n already is. */
const TYPE_NAME_FALLBACK: Record<string, string> = {
  text: 'Text block',
}

/** The one sentence the "Add a section" control gives each type — what the
 *  tenant would GET, not what the type is called. */
const TYPE_BLURB_FALLBACK: Record<string, string> = {
  text: 'A short heading and a few lines in your own words, with a photo if you want one.',
}

function SectionRow({
  row, isFirst, isLast, index, total, content, imageUrl, autoFocusFirstField, onFocusHandled,
  dragging, dragActive, dropTarget, onDragStart, onDragOverRow, onDragEnd, onDropRow,
  onToggle, onMove, onMoveEdge, onRemove, removing, onFieldChange, onImageChanged,
}: {
  row: EditorSectionRow
  isFirst: boolean
  isLast: boolean
  /** Position in the VISIBLE list, 0-based, and how long that list is.
   *  Announcements and the handle's own accessible name both need it —
   *  `sort` is an implementation detail nobody should be read out. */
  index: number
  total: number
  content: Record<string, string>
  /** Task 6: `page.content?.[row.key]?.image_url`, straight off the QUERY
   *  — see the field-loop's own comment below for why this can never be
   *  `content` (which is `f.content`, form-merged) instead. */
  imageUrl: string | null
  /** Set for exactly one render, on the band the tenant has just added, so
   *  they can start typing where they are already looking. */
  autoFocusFirstField: boolean
  onFocusHandled: () => void
  dragging: boolean
  dragActive: boolean
  dropTarget: boolean
  /** Carries this row's own display label up, so the drop — handled by a
   *  DIFFERENT row — can announce the right section by name. */
  onDragStart: (label: string) => void
  onDragOverRow: () => void
  onDragEnd: () => void
  onDropRow: () => void
  onToggle: () => void
  onMove: (direction: 'up' | 'down', label: string) => void
  onMoveEdge: (edge: 'first' | 'last', label: string) => void
  onRemove: (label: string) => void
  removing: boolean
  onFieldChange: (field: string, value: string) => void
  onImageChanged: () => void
}) {
  const { t } = useTranslation()
  // RULING 4, from ./sections — the one predicate the wizard's step 4 and
  // this row both call, so the two screens cannot disagree about which
  // sections are real. A tenant-added band falls through it to `true`, which
  // is correct and is argued at the predicate itself.
  const offerable = isOfferable(row)
  const checked = offerable && row.enabled
  // Built once, in `buildSectionRows`: the curated map for a fixed band, the
  // SERVED catalogue for a tenant-added one (`fieldsForType`). This
  // component no longer knows which of the two it is looking at, which is
  // the point — a second repeatable type renders its own fields, and its own
  // photo control, with no edit here.
  const fields = row.fields
  const firstWritableField = fields.findIndex(field => field.type !== 'image')

  // `draggable` is armed by the HANDLE, not left permanently on the card.
  // A permanently draggable card cannot have its text selected — every
  // input and textarea inside it would start a drag instead of a
  // selection — which is the whole reason the handle exists. Disarmed
  // again on drag end and on a press that never became a drag.
  const [armed, setArmed] = useState(false)

  // A tenant-added band names itself; a fixed one is named by the wire, in
  // the industry's own vocabulary. See `TYPE_NAME_FALLBACK`.
  const typeName = t(
    `landing_pages.editor.section_type_name_${row.typeId}`,
    TYPE_NAME_FALLBACK[row.typeId] ?? row.typeId,
  )
  const displayLabel = row.fixed ? row.label : instanceRowLabel(typeName, row.ordinal, row.siblings)

  const stopDrag = () => setArmed(false)

  const onHandleKeyDown = (e: React.KeyboardEvent) => {
    // The handle IS the keyboard reorder control, so a keyboard user who
    // lands on the drag affordance can actually use it rather than having
    // to go and find the arrows. Same two operations, same save path.
    if (e.key === 'ArrowUp' && !isFirst) { e.preventDefault(); onMove('up', displayLabel) }
    else if (e.key === 'ArrowDown' && !isLast) { e.preventDefault(); onMove('down', displayLabel) }
    else if (e.key === 'Home' && !isFirst) { e.preventDefault(); onMoveEdge('first', displayLabel) }
    else if (e.key === 'End' && !isLast) { e.preventDefault(); onMoveEdge('last', displayLabel) }
  }

  return (
    <div
      draggable={armed}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        // Firefox starts no drag at all unless the payload is set, even
        // when nothing ever reads it back.
        e.dataTransfer.setData('text/plain', row.key)
        onDragStart(displayLabel)
      }}
      onDragEnd={() => { stopDrag(); onDragEnd() }}
      onDragOver={e => {
        // Only while one of OUR rows is in flight: without this guard the
        // card would accept a file dropped from the desktop, and preventing
        // the default on that is what turns a stray drop into a silent
        // nothing instead of the browser opening the file.
        if (!dragActive) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverRow()
      }}
      onDrop={e => {
        if (!dragActive) return
        e.preventDefault()
        onDropRow()
      }}
      className={card + ' space-y-4 transition-[opacity,box-shadow] motion-reduce:transition-none '
        + (dragging ? 'opacity-40 ' : '')
        + (dropTarget ? 'ring-2 ring-primary-500/70 ' : '')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col items-center shrink-0 -mt-0.5">
            <button
              type="button"
              // Not `draggable` itself — the CARD is what gets dragged, and
              // this only arms it. Dragging the handle alone would carry a
              // 15px icon across the screen instead of the section.
              onPointerDown={() => setArmed(true)}
              onPointerUp={stopDrag}
              onKeyDown={onHandleKeyDown}
              onBlur={stopDrag}
              aria-describedby="lp-reorder-help"
              aria-label={t('landing_pages.editor.reorder_handle', {
                label: displayLabel,
                position: index + 1,
                total,
                defaultValue: 'Move {{label}} — position {{position}} of {{total}}',
              })}
              className="text-t-secondary hover:text-white cursor-grab active:cursor-grabbing outline-none rounded focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <GripVertical size={15} />
            </button>
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onMove('up', displayLabel)}
              aria-label={t('landing_pages.editor.move_up', 'Move up')}
              className="text-t-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUp size={15} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onMove('down', displayLabel)}
              aria-label={t('landing_pages.editor.move_down', 'Move down')}
              className="text-t-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown size={15} />
            </button>
          </div>

          <div className="min-w-0">
            <span className="block text-sm font-medium text-white">{displayLabel}</span>
            {!row.fixed ? (
              /* A tenant-added band, whose one honest thing to say is
                 whether it will actually appear. `PageContent::count()`
                 publishes a text band only once its BODY is filled — an
                 eyebrow, a heading or a photo over blank space is a
                 fragment, not a section — so a tenant who adds a block,
                 uploads a photo and sees the preview not change has to be
                 told why here, or they never find out at all. */
              <span className={'block text-xs mt-0.5 '
                + (row.available ? 'text-t-secondary' : 'text-t-secondary/80 leading-relaxed')}>
                {row.available
                  ? t('landing_pages.editor.section_own_words', 'Words you write here')
                  : t(
                    'landing_pages.editor.section_needs_words',
                    'Nothing written yet — this block appears on your page once you add some words.',
                  )}
              </span>
            ) : offerable ? (
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
              <span className="block text-xs text-t-secondary/80 mt-0.5 leading-relaxed">
                {/* Fix 2 (phase 3a correctness review) — same preference as
                    the wizard's identical step 4 branch: the backend's own
                    authored reason, when it sent one, beats the generic
                    invitation.

                    Landing phase 3c (the industry step's own fix round):
                    the amber `warning` colour this line used to carry, and
                    the greyed-out dead switch beside it, are this product's
                    grammar for "something is wrong" — and a section the
                    tenant simply has not filled in yet is not wrong. Same
                    quiet treatment and same wording as the wizard's step 4,
                    because the two screens must not describe the same
                    section differently (RULING 4's own discipline, applied
                    to the presentation rather than the predicate). */}
                {unavailableReason(row, t('landing_pages.editor.section_pending', {
                  source: row.sourceLabel,
                  defaultValue: 'Add this from {{source}} whenever you are ready — it appears on your page as soon as you do.',
                }))}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {offerable ? (
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              aria-label={displayLabel}
              onClick={onToggle}
              className={'relative shrink-0 w-9 h-5 rounded-full transition-colors motion-reduce:transition-none outline-none '
                + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
                + (checked ? 'bg-primary-500' : 'bg-dark-border')}
            >
              <span
                aria-hidden
                className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform motion-reduce:transition-none '
                  + (checked ? 'translate-x-4' : 'translate-x-0.5')}
              />
            </button>
          ) : (
            <span className="shrink-0 rounded-full border border-dark-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-t-secondary/70">
              {t('landing_pages.editor.section_not_yet', 'Not yet')}
            </span>
          )}

          {/*
            ONLY on a band the tenant added. The fixed bands are seeded with
            the page and `LandingPageSectionController::destroy()` refuses
            them outright — offering a Remove button that always fails would
            be a worse answer than the toggle beside it, which is the real
            way to take a fixed band off the page. `row.fixed` is derived
            from the served catalogue's own key grammar, not from a list of
            removable keys kept here.
          */}
          {!row.fixed && (
            <button
              type="button"
              disabled={removing}
              onClick={() => onRemove(displayLabel)}
              title={t('landing_pages.editor.section_remove', 'Remove this section')}
              aria-label={t('landing_pages.editor.section_remove_named', {
                label: displayLabel,
                defaultValue: 'Remove {{label}}',
              })}
              className={btnSec + ' !px-2 hover:!text-warning'}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
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
          {fields.map((field, fieldIndex) => (
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
                  autoFocus={autoFocusFirstField && fieldIndex === firstWritableField}
                  onFocus={onFocusHandled}
                  value={content[field.name] ?? ''}
                  onChange={e => onFieldChange(field.name, e.target.value)}
                />
              ) : (
                <input
                  id={`lp-${row.key}-${field.name}`}
                  // "Expanded, ready to type into": the band the tenant just
                  // added takes the caret, so they can start writing where
                  // they are already looking instead of hunting for where it
                  // landed. The FIRST WRITABLE field, never simply the first
                  // — a text block's first control is its photo picker, and
                  // opening a file dialog nobody asked for would be a worse
                  // welcome than none at all.
                  autoFocus={autoFocusFirstField && fieldIndex === firstWritableField}
                  onFocus={onFocusHandled}
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
 * "Add a section", at the foot of the list.
 *
 * One button per ADDABLE type, and the list of them is the server's
 * (`section_types` filtered to `repeatable`), never a hand list here — which
 * is what makes a second repeatable type a backend change and nothing else.
 * Today that is exactly one button; the layout is a column of them rather
 * than a special case for one, because the day there are three the only
 * thing that should have to change is the catalogue.
 *
 * A type at its cap is DISABLED WITH ITS REASON SHOWN, not hidden: a tenant
 * who is looking for the control they used ten minutes ago must find it and
 * be told why it will not work, rather than watch it vanish. Both sentences
 * name the real number, interpolated from the served cap — see
 * `addableTypes`, which decides which of the two applies.
 */
function AddSectionCard({ types, adding, onAdd }: {
  types: AddableType[]
  /** The type id currently in flight, or null. */
  adding: string | null
  onAdd: (type: string) => void
}) {
  const { t } = useTranslation()

  // Nothing addable at all — an older backend that serves no catalogue, or
  // one whose catalogue has no repeatable type. No card, no empty heading
  // over nothing.
  if (types.length === 0) return null

  return (
    <div className={card + ' mt-3 space-y-3'}>
      <div>
        <h2 className="text-sm font-semibold text-white">
          {t('landing_pages.editor.add_section', 'Add a section')}
        </h2>
        <p className="text-xs text-t-secondary mt-0.5">
          {t(
            'landing_pages.editor.add_section_hint',
            'New sections go to the bottom of the page. You can move them anywhere afterwards.',
          )}
        </p>
      </div>

      <div className="space-y-2">
        {types.map(type => {
          const name = t(
            `landing_pages.editor.section_type_name_${type.id}`,
            TYPE_NAME_FALLBACK[type.id] ?? type.id,
          )
          // `limit`, deliberately never `count`: i18next reads `count` as a
          // plural selector and starts looking for `_one`/`_other` variants
          // of the key. These two sentences are written whole in each
          // language and have no plural forms to select between.
          const reason = type.disabledReason === 'type_limit'
            ? t('landing_pages.editor.add_section_type_full', {
              limit: type.limit,
              name,
              defaultValue: 'You already have {{limit}} of these — that is as many as one page can hold. Remove one to add another.',
            })
            : type.disabledReason === 'page_full'
              ? t('landing_pages.editor.add_section_page_full', {
                limit: type.pageLimit ?? 0,
                defaultValue: 'Your page is full — it holds up to {{limit}} sections. Remove one to add another.',
              })
              : null

          return (
            <div key={type.id}>
              <button
                type="button"
                disabled={reason !== null || adding !== null}
                onClick={() => onAdd(type.id)}
                className={btnSec + ' w-full !py-2.5'}
              >
                <Plus size={14} />
                {adding === type.id
                  ? t('landing_pages.editor.add_section_working', 'Adding…')
                  : t('landing_pages.editor.add_section_named', { name, defaultValue: 'Add a {{name}}' })}
              </button>
              <p className={'text-xs mt-1 ' + (reason ? 'text-t-secondary/80 leading-relaxed' : 'text-t-secondary')}>
                {reason ?? t(
                  `landing_pages.editor.section_type_blurb_${type.id}`,
                  TYPE_BLURB_FALLBACK[type.id] ?? '',
                )}
              </p>
            </div>
          )
        })}
      </div>
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
 *
 * Builder round: `sectionKey` widened from `SectionKey` to a plain string,
 * because a tenant-added band takes a photo too and `text_1` is not in that
 * union. The slot allowlist was never this type's job in the first place —
 * `SectionType::imageKeys()` is the one that decides, and it enumerates
 * every `text_N` alongside `hero`/`about` precisely so this endpoint could
 * accept them. `imageErrorMessage` already surfaces its refusal in words.
 */
function ImageField({ sectionKey, imageUrl, onChanged }: {
  sectionKey: string
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
