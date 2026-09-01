import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  ArrowDown, ArrowUp, Check, ChevronDown, Copy, ExternalLink, EyeOff, Globe, GripVertical, LayoutList,
  Loader2, Palette, Plus, Save, Trash2, X,
} from 'lucide-react'
import { api, resolveImage } from '../../lib/api'
import { QueryError } from '../../components/QueryError'
import { useBrandStore } from '../../stores/brandStore'
import { isDataBackedSection, isOfferable, unavailableReason, type SectionGroup } from './sections'
import {
  addableTypes, appendSection, buildSectionRows, buildSectionsPayload, fieldHintKey, fieldLabelKey,
  freeGalleryLeaves, gallerySlotName,
  gallerySlots, instanceRowLabel, moveSection,
  moveSectionToKey, removeSection, removeSectionContent, safeImageUrl, sectionIndex, setSectionTone,
  stripImageLeaves, toggleSection, visibleFaqPairs,
  type AddableType, type EditorSectionRow, type PageSection, type SectionAvailability,
  type SectionTypeOption,
} from './editorSections'
import { selectedTone, toneChoices, type ToneChoice } from './sectionTones'
import { downscaledName, downscaleTarget, drawToBlob } from './imageDownscale'
import { addressHost, buildAddressUrl, pageVisibilityState, previewSlug } from './publishAddress'
import { LandingPreview } from './LandingPreview'
import type { DraftPayload } from './livePreview'
import { DesignPanel } from './DesignPanel'
import { paletteFor, themePayload } from './designChoices'
import type { IndustryOption } from './industryChoices'
import {
  catalogPayload, resolveTemplateKey, templateContentFields, templateFixedBlocks, templateImageDefaults,
  templatePhotoBlocks,
  templateRenders, templateSupports, templatesDrawing,
  type TemplateOption,
} from './editorCatalog'
import { searchPreview, seoField, seoPayload, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from './seoCard'
import {
  BUILDER_TABS, SECTION_FILTERS, blockPlacement, expandedWithin, filterCounts, nextExpanded,
  reorderableUnderFilter, resolveBuilderTab, rowCanMove, rowGroup, rowStatus, sectionThumbUrl,
  templateDrawsBlock, visibleRows,
  type BlockPlacement, type BuilderTab, type RowStatus, type SectionFilter,
} from './builderShape'
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
 * (the served catalogue’s `fields` for that section’s type). Any of the
 * three can genuinely be `null` on a page nothing has ever written to (a
 * plain `store()`-created page never sets them), which is why every read
 * below falls through `?? {}` rather than assuming an object.
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
  /**
   * `onboarding.section_tones` — `SectionType::TONES`' ids, in the order the
   * picker should offer them.
   *
   * The third served allowlist on this screen, for the third identical
   * reason: it is what `LandingPageSectionController::update()` validates a
   * band's colour against, so a swatch row built from a hand-kept copy here
   * is a swatch row that can offer a colour the save would 422 on.
   *
   * `null` (an older backend, or a failed onboarding fetch) draws NO tone
   * control at all rather than falling back to a guessed list — see
   * `toneChoices` in `sectionTones.ts`, which owns that refusal.
   */
  sectionTones: string[] | null
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

/**
 * The section row's icon buttons, one shape for all of them.
 *
 * The house icon button (EarnRateEvents.tsx:266, InquiryDetail.tsx:337) is
 * `p-1.5 rounded hover:bg-dark-surface3 text-t-secondary hover:text-white` —
 * quiet by default, lit on hover, no border. This is that, with two things
 * added rather than invented: a fixed 32px square so every control on the
 * row has the same hit target whatever glyph sits in it (the old grip and
 * chevrons had no size at all beyond their 15px icons, which is why they
 * read as cramped), and the focus ring the rest of this screen's controls
 * already carry — a keyboard user must be able to see where they are on a
 * row of four look-alike squares.
 */
const iconBtn = 'flex items-center justify-center w-8 h-8 shrink-0 rounded-md text-t-secondary '
  + 'hover:text-white hover:bg-dark-surface3 transition-colors motion-reduce:transition-none '
  + 'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-t-secondary '
  + 'outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60'

/**
 * The same button, for the one action that destroys something.
 *
 * SECONDARY UNTIL REACHED FOR, which is the whole point: removing a band
 * deletes its copy and its photo and cannot be undone, so it must be
 * findable and must not sit on the card shouting. It is the same grey as its
 * neighbours at rest and only takes the warning colour under hover or
 * keyboard focus. `warning` rather than `error` deliberately — this file
 * already argues (see `btnSec`'s note) that a red treatment frightens
 * tenants off controls they need, and the amber is the product's own
 * "careful now".
 */
const iconBtnDanger = 'flex items-center justify-center w-8 h-8 shrink-0 rounded-md text-t-secondary '
  + 'hover:text-warning hover:bg-warning/10 focus-visible:text-warning focus-visible:bg-warning/10 '
  + 'transition-colors motion-reduce:transition-none '
  + 'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-t-secondary '
  + 'outline-none focus-visible:ring-2 focus-visible:ring-warning/60'

/** One 14px glyph for every control on the row header. The old mix (15px
 *  grip and chevrons against a 13px trash) is a difference with no meaning
 *  behind it, and it is most of what made the set look assembled rather than
 *  designed. */
const ROW_ICON = 14

/**
 * The "+ Add a block" rail AFTER the last card, as an insertion point
 * (template fidelity 3.4).
 *
 * A sentinel rather than a nullable second piece of state, so "which rail is
 * open" is one value. Safe against collision by construction:
 * `SectionType::typeOf()`'s key grammar is `[a-z][a-z0-9_]*(_[1-9][0-9]*)?`
 * and this is upper case, so no section key can ever equal it.
 */
const ADD_AT_END = 'END'

/** Field types whose control is a COMPOSITE — several inputs, or none at
 *  all — so the card's own `<label>` names the group rather than pointing
 *  `htmlFor` at an id no single element carries. */
const COMPOSITE_FIELD_TYPES = ['image', 'gallery', 'faq_pairs']

/** The tenant's word for each tone (`App\Landing\SectionType::TONES`' ids) —
 *  `t()` fallbacks, so the swatch row is never a line of unlabelled colour.
 *  Named for what the tenant is choosing, not for the band class behind it;
 *  see `localeCompleteness.test.ts` for the hand-verified net over these
 *  template-literal keys. */
const TONE_NAME_FALLBACK: Record<string, string> = {
  page: 'Page background',
  soft: 'Soft band',
  accent: 'Accent band',
}

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
  // `FIELD_PRESENTATION` in `editorSections.ts`).
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  // Task 6: label above the photo control (hero/about only).
  image_url: 'Photo',

  // ─── Template fidelity 4.3 ────────────────────────────────────────────
  //
  // The two text leaves that belong to a PICTURE rather than to the band —
  // drawn inside the photo control that owns them (see `fieldsForType`,
  // which consumes them out of the flat field list). One label each, however
  // many photographs a band holds: a gallery's eight `caption_N` leaves all
  // take `caption`, because "Caption under the photo" means the same thing
  // beside every one of them and eight numbered labels would be eight ways
  // of saying it.
  //
  // Named for what the tenant is WRITING, not for the attribute: "alt text"
  // is the trade's word and means nothing to a salon owner.
  alt: 'What the photo shows',
  caption: 'Caption under the photo',
  // The gallery round: label above the photo STRIP. Not a `content` field —
  // like `image_url` above it, this names a control rather than a leaf.
  gallery: 'Photos',

  // ─── Template fidelity 1.4 ────────────────────────────────────────────
  //
  // 1.3 made the fixed rows read the SERVED catalogue instead of a
  // hand-written mirror, so every field the shipped partials already read
  // now has a control. This is the other half of that change and it ships
  // in the same commit for a reason: without it those controls appear
  // labelled `call_short`, `map_label`, `q1` — the fallback chain at the
  // render site ends in `field.name`, so an unlabelled field is rendered
  // as its raw leaf name above an input a salon owner is asked to fill in.
  //
  // Named for what a tenant is WRITING, never for what the leaf is called.
  // "Phone line wording" is a thing somebody can answer; `call_label` is
  // not, and neither is "CTA".

  // announcement — the offer bar above the header.
  text: 'Your message',
  cta_label: 'Link wording',

  // trust — the highlights strip. `feature_4` is here ahead of the
  // catalogue (which ships three today) because 5.4 raises the cap to four
  // to match kits 02 and 03, and a label waiting for it is what keeps that
  // change backend-only. An unrendered label costs nothing; a control
  // labelled `feature_4` costs a tenant their confidence in the screen.
  quote: 'What someone said about you',
  feature_1: 'Highlight 1',
  feature_2: 'Highlight 2',
  feature_3: 'Highlight 3',
  feature_4: 'Highlight 4',

  // faq — six question/answer pairs, flat leaves (see
  // `SectionType::faqLeaves()`; 3.3 turns them into a pair control).
  q1: 'Question 1',
  a1: 'Answer 1',
  q2: 'Question 2',
  a2: 'Answer 2',
  q3: 'Question 3',
  a3: 'Answer 3',
  q4: 'Question 4',
  a4: 'Answer 4',
  q5: 'Question 5',
  a5: 'Answer 5',
  q6: 'Question 6',
  a6: 'Answer 6',

  // booking — the two phone-line overrides `booking.blade.php` already
  // reads and nothing could fill in.
  call_label: 'Phone line wording',
  call_short: 'Short phone label',

  // contact — the five wording overrides `contact.blade.php` already reads.
  // Distinct from `phone`/`email`/`address` above, which are the VALUES:
  // these are the words printed above them.
  phone_label: 'Wording above your phone number',
  email_label: 'Wording above your email',
  address_label: 'Wording above your address',
  map_label: 'Map link wording',
  closed_label: 'Closed-today wording',

  // ─── Template fidelity 5.1 / R6 ───────────────────────────────────────
  //
  // The companion leaf beside every heading a kit sets in two tones. Keyed
  // by FAMILY (`fieldLabelKey`), because `headline_accent`, `heading_accent`
  // and `lead_accent` are one control on nine types and one sentence
  // describes all of them.
  accent: 'Words to highlight',

  // ─── Template fidelity 5.2 ────────────────────────────────────────────
  //
  // hero — the three terms over the facts card. Named for the fact each one
  // sits above, because that is what a tenant is rewording; the VALUES stay
  // derived and there is no control for them.
  hours_label: 'Wording above your closing time',
  rating_label: 'Wording above your rating',
  city_label: 'Wording above your town',
  // services / team — the wording on each row's own Book link.
  item_cta_label: 'Wording on each Book link',
  // about — the numbered list beside the story. One key for all three: the
  // inputs are in order under one heading and the sentence is the same
  // beside each (the `caption_N` precedent).
  fact: 'A line for your numbered list',
  // booking — the short promises under the button.
  promise: 'A short promise under your button',

  // ─── Template fidelity 5.4 ────────────────────────────────────────────
  //
  // The second line of a highlight ("Combined studio experience" under
  // "15 years"). One key for all four, same reasoning as `fact`.
  feature_caption: 'Line under the highlight',

  // ─── Template fidelity 5.5 ────────────────────────────────────────────
  //
  // The footer hub. `descriptor` is the small word under the business name
  // in the header and the footer lockups; the rest are the Follow column.
  descriptor: 'Word under your business name',
  social_label: 'Wording above your social links',
  social_instagram: 'Instagram address',
  social_facebook: 'Facebook address',
  social_tiktok: 'TikTok address',
  legal_note: 'Small print under your footer',
}

/**
 * Template fidelity 5.1 / 5.5 — the one-line note under a field, for the two
 * families whose behaviour a label alone cannot carry. See `fieldHintKey`,
 * which decides which fields have one.
 */
const FIELD_HINT_FALLBACK: Record<string, string> = {
  accent: 'Shown in your accent colour at the end of the heading.',
  social: 'A full web address, starting with https://. Leave blank to hide the icon.',
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
  sections: availability, industries, templates, sectionTypes, maxSections, sectionTones,
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

  /**
   * TEMPLATE FIDELITY 2.1 — WHICH OF THE THREE TABS IS OPEN.
   *
   * Read straight off `?tab=` rather than mirrored into state, which is the
   * one difference from `HubTabs.tsx`'s otherwise identical idiom: that
   * component also accepts a `defaultTab` prop and so needs somewhere to
   * hold it, while here the URL is the only input and a copy of it in state
   * is a second answer that has to be re-synced by an effect. Reload, the
   * back button and a pasted link all work for free, and an unknown value
   * lands on Content rather than on a blank column (`resolveBuilderTab`).
   *
   * `navigate` rather than `setSearchParams` so a tab change is a real
   * history entry — the back button taking a tenant from Publish to where
   * they were writing is the behaviour the house idiom already has.
   */
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = resolveBuilderTab(params.get('tab'))
  const selectTab = (next: BuilderTab) => {
    if (next === tab) return
    const search = new URLSearchParams(window.location.search)
    search.set('tab', next)
    navigate({ search: '?' + search.toString() }, { replace: false })
  }

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

  /**
   * Template fidelity 1.5: the two `seo` leaves, narrowed out of the raw
   * JSON column exactly the way `themeFields` narrows `theme` — a legal
   * non-string leaf falls through to '' here rather than reaching a
   * string-typed input.
   *
   * Queued into `form` and saved by the same Save button as everything else
   * on this screen: `saveMut` has always put `seo` on the wire and the
   * endpoint has always accepted it. Until now nothing ever set a key in
   * it, so every published page shipped an empty meta description and — on
   * all three kit templates — a footer with no tagline.
   */
  const seoFields = {
    title: seoField(f.seo, 'title'),
    description: seoField(f.seo, 'description'),
  }

  const updateSeo = (field: 'title' | 'description', value: string) =>
    update('seo', seoPayload(f.seo, { [field]: value }))

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

  // Template fidelity 1.2: WHAT THE CHOSEN DESIGN ACTUALLY HONOURS, off the
  // served `templates[*].supports`. Resolved against the key the panel is
  // SHOWING (which includes an unsaved template change queued this session)
  // rather than against `page.template_key`, so switching template makes the
  // controls that design ignores disappear immediately — the preview beside
  // them has already changed.
  const supports = templateSupports(templates, templateKey)

  /**
   * Template fidelity 2.6: the other two served facts about the chosen
   * design — which blocks it ships a partial for, and which of them it
   * draws in a place of its own. Resolved against the SHOWN template key
   * for the same reason `supports` is, so switching design updates the
   * rows' explanations at the same moment the preview beside them changes.
   *
   * Neither is ever compared to a template id here; see `builderShape.ts`.
   */
  const renders = templateRenders(templates, templateKey)
  const fixedBlocks = templateFixedBlocks(templates, templateKey)

  /**
   * Template fidelity 4.1/4.5 — the two facts the photo controls need.
   *
   * `photoBlocks` is which blocks this design actually DRAWS a photograph
   * in, which is narrower than `renders`: a slot belongs to a type and is
   * shared by every design, a drawn photograph belongs to a partial and is
   * not. `imageDefaults` is the design's OWN photographs, slot → URL, which
   * is what makes "Remove" mean "restore the original" and what lets a
   * control say which of the two subjects it is showing.
   *
   * Resolved against the SHOWN template key, like the two above: switching
   * design changes which photographs a tenant is looking at, and the preview
   * beside them has already changed.
   */
  const photoBlocks = templatePhotoBlocks(templates, templateKey)
  // Template fidelity 5.x: one level finer than `photoBlocks` — which of
  // each type's LEAVES this design prints. Resolved against the same shown
  // template key, for the same reason.
  const contentFields = templateContentFields(templates, templateKey)
  const imageDefaults = templateImageDefaults(templates, templateKey)

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
  const rows: EditorSectionRow[] = buildSectionRows(
    f.sections ?? [], availability, sectionTypes, page?.content, photoBlocks, contentFields,
  )

  /**
   * TEMPLATE FIDELITY 2.2 — ONE CARD OPEN AT A TIME.
   *
   * Lifted here rather than held per row, because "which card is open" is a
   * fact about the LIST: the accordion is single-expand so that the card
   * being edited and the preview beside it have one subject between them.
   * `null` — nothing open — is the state this screen now starts in, which
   * is what turns roughly a hundred always-visible controls into a page a
   * tenant can read.
   */
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  /**
   * TEMPLATE FIDELITY 2.3 — the chip, and only the chip.
   *
   * It hides rows; it never moves one and never regroups the list. The
   * list's vertical order IS the page's vertical order — that is the whole
   * meaning of the handle and the arrows — so while a chip is active the
   * reorder affordances are withdrawn together and the list says so.
   */
  const [filter, setFilter] = useState<SectionFilter>('all')

  /**
   * TEMPLATE FIDELITY 3.4 — which "+ Add a block" rail has its picker open.
   *
   * The KEY of the row the picker sits above, `END` for the rail after the
   * last card, or null for none. Lifted to the list for the same reason
   * `expandedKey` is: there is one picker at a time, and two rails both
   * believing they are open would be two claims about where the next block
   * lands.
   */
  const [addOpenAt, setAddOpenAt] = useState<string | null>(null)

  const chipCounts = filterCounts(rows)
  const shownRows = visibleRows(rows, filter)
  const reorderable = reorderableUnderFilter(filter)

  // The open card must be one that is actually on screen: a filter, a
  // removal or a template change can all take it out of the list, and an
  // `expanded` key pointing at a row nobody can see is a card that springs
  // back open over a subject the tenant left ten minutes ago.
  const expanded = expandedWithin(expandedKey, shownRows.map(row => row.key))

  const toggleExpanded = (key: string) => setExpandedKey(current => nextExpanded(current, key))

  // Counted over the RAW rows, never `rows` — see `addableTypes`. A row this
  // build failed to recognise still takes up a place on the page as far as
  // `store()`'s cap is concerned. `renders` (3.1) keeps a block this design
  // has no partial for out of the picker entirely.
  const addable: AddableType[] = addableTypes(sectionTypes, f.sections ?? [], maxSections, renders)

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

  /**
   * The swatch row every section card offers, computed once for the whole
   * list: the SERVED tone ids painted in the colours of the palette the page
   * is currently wearing — including an unsaved palette change queued in
   * `form` this session, which is why it reads `themeFields` rather than
   * `page.theme`. Switch palette and every band's swatches restyle with it,
   * because the tone a band is on genuinely is a different colour now.
   *
   * `paletteFor` resolves an absent or unrecognised id to the stylesheet's
   * own no-choice default (porcelain), which is exactly what such a page
   * actually renders as.
   */
  const tonePalette = paletteFor(themeFields.palette)
  // Template fidelity 1.2: EMPTY WHEN THIS DESIGN DOES NOT READ TONES.
  // `SectionRow` already renders no colour control for an empty list (that
  // is how an older backend serving no tone allowlist is handled), so
  // gating here rather than in the row is one decision in one place — and
  // it takes twenty-one dead swatches off a Nocturne page, three per card,
  // on a design whose layout says in words that a band on the wrong surface
  // breaks the composed dark/paper/sand sequence rather than just that band.
  const tones: ToneChoice[] = supports.tones ? toneChoices(sectionTones, tonePalette) : []

  /**
   * What the preview pane renders RIGHT NOW — the live-preview round.
   *
   * Built from the SAME three helpers `saveMut` builds its own body from
   * (`themePayload`, `stripImageLeaves`, `buildSectionsPayload` over the
   * re-derived `rows`), because the whole promise of a live preview is that
   * it shows what a save would produce. A second, nearly-identical payload
   * builder here would be a second answer to that question.
   *
   * Three deliberate details:
   *
   *   - `themePayload(themeFields)` rather than the raw `f.theme` that
   *     `saveMut` sends. `theme` is a schemaless JSON column, so a page
   *     written before `ThemeRules` existed can hold a key the server's
   *     allowlist now refuses — and a 422 on every keystroke would leave
   *     the pane stuck on "could not refresh" over something the tenant
   *     cannot see or fix. Narrowing to the three allowlisted keys is the
   *     same narrowing `updateTheme` already applies to everything this
   *     screen writes, and the server carries forward whatever stored value
   *     an omitted key had — so the pane shows what a save the server
   *     ACCEPTS would produce.
   *   - `stripImageLeaves`, for exactly the reason `saveMut` uses it:
   *     `updateContent`'s spread drags a stored `image_url` along the
   *     moment a sibling field on that section is edited, and the server
   *     refuses that leaf unconditionally (D4). The photo still appears in
   *     the preview, because the server takes it from the STORED row.
   *   - `rows`, not `f.sections`, so `isOfferable`'s forced-off gate
   *     applies to what is previewed exactly as it applies to what is
   *     saved.
   *
   * Not memoised: `LandingPreview` fingerprints the payload rather than
   * comparing object identity (see `livePreview.ts`), so a fresh object
   * per render costs a stringify and changes nothing.
   */
  const draftPayload: DraftPayload = {
    theme: themePayload(themeFields),
    content: stripImageLeaves(f.content),
    sections: buildSectionsPayload(rows),
  }

  /**
   * Queued into `form` and saved by the Save button through the existing
   * `PUT /sections` call — never a straight-to-server write, the same as the
   * enable toggle and the reorder controls beside it, and unlike add/remove
   * (which must write at once because the row has to exist server-side
   * before anything can be written into it). `saveMut.onSuccess` is what
   * bumps `previewNonce`, so the preview refreshes when — and only when —
   * there is genuinely a newer saved draft to show.
   */
  const setToneRow = (key: string, tone: string | null) =>
    update('sections', setSectionTone(f.sections ?? [], key, tone))

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
    // 3.4: `before` is the key of the row the picker was opened ABOVE, or
    // null for the rail after the last card. The ENDPOINT still appends —
    // that is the one placement that can never silently reorder something a
    // tenant had already arranged, and it is the same rule two simultaneous
    // adds have to agree on — so the requested position is applied here, to
    // the form, and travels with the next save alongside every other
    // reorder. The row itself exists the moment this returns.
    mutationFn: ({ type }: { type: string; before: string | null }) =>
      api.post('/v1/admin/landing-pages/sections', { type }).then(r => r.data as { key: string }),
    onSuccess: ({ key }, { before }) => {
      setForm(p => {
        if (p === null) return null

        const appended = appendSection(p.sections ?? [], key)

        return { ...p, sections: before === null ? appended : moveSectionToKey(appended, key, before) }
      })
      qc.invalidateQueries({ queryKey: ['landing-page', currentBrandId] })
      setPreviewNonce(n => n + 1)
      // Focuses the new band's first writable field on mount, so a tenant
      // who pressed "Add" can start typing without hunting for where the
      // thing landed. Cleared as soon as it is spent — it must not steal
      // focus back on the next unrelated re-render.
      setJustAdded(key)
      // 2.2: and OPENS it. Cards are collapsed by default now, so without
      // this the band a tenant just asked for would land closed and the
      // caret above would have nothing to land in.
      setExpandedKey(key)
      // A band added while a chip is active would otherwise land outside
      // the filter and appear not to have been added at all.
      setFilter('all')
      // 3.4: the picker has done its job. Left open it would sit between
      // the card the tenant just asked for and the one above it.
      setAddOpenAt(null)
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

  /**
   * Template fidelity 1.2: the industry picker asks first.
   *
   * It is the most destructive control in the builder — saving it rewrites
   * every heading, the wording on every button, the words the rest of the
   * workspace uses, and which sections are on offer — and it is the one
   * control here whose effect a tenant cannot see until after they save.
   * `handleRemove` already puts a plain-language `window.confirm` in front
   * of the only other irreversible control on this screen; this is the same
   * pattern, in the same words, for the same reason.
   *
   * Only when they are actually MOVING off the saved industry: re-selecting
   * the card the panel opened on is not a change and must not interrogate
   * anybody. The confirm text is the change note `DesignPanel` already
   * shows, so what a tenant is warned about and what they are asked to
   * confirm are one sentence.
   */
  const handleIndustryChange = (id: string) => {
    if (id === f.industry) return

    if (id !== page?.industry) {
      const confirmed = window.confirm(
        t(
          'landing_pages.design.industry_change_note',
          'Saving this rewrites your page in the new trade’s words — headings, section names and the wording on your buttons — and changes which sections you can show (online booking is offered to hotels only). It also changes the words the rest of your workspace uses. Nothing you have already saved — bookings, clients, settings — is changed or deleted.',
        ),
      )
      if (!confirmed) return
    }

    update('industry', id)
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
          content: stripImageLeaves(body.content),
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
      const toSave = buildSectionRows(body.sections ?? [], availability, sectionTypes, page?.content, photoBlocks, contentFields)
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

  /**
   * Template fidelity 1.6 — ONE SAVE STORY.
   *
   * Publish used to be `disabled={dirty}` with "Save your changes first."
   * underneath it, which meant the button a first-time tenant reaches for
   * was greyed out for most of their session: every keystroke on this
   * screen sets `dirty`, and the one thing they came here to do was the one
   * thing they could not press. Worse, the instruction was for a step the
   * screen could plainly have taken itself.
   *
   * So it takes it: a dirty page SAVES and then publishes, in that order,
   * as one action. `mutateAsync` rather than `mutate` because the ordering
   * is the whole point — publishing a page whose save has not landed would
   * put the previous version on the internet, which is the exact confusion
   * the old gate existed to prevent. A failed save throws, `saveMut`'s own
   * `onError` has already said why in words the tenant can act on, and the
   * publish never happens.
   */
  const handlePublish = async () => {
    if (!page) return
    const confirmed = window.confirm(
      t('landing_pages.editor.publish_confirm', {
        url: page.url,
        defaultValue: 'Publish your page? Anyone with the link will be able to see it at {{url}}.',
      }),
    )
    if (!confirmed) return

    if (dirty) {
      try {
        await saveMut.mutateAsync(f)
      } catch {
        // Already surfaced by saveMut.onError — and deliberately NOT
        // followed by a publish. Swallowed rather than rethrown because
        // nothing above this is an error boundary and an unhandled
        // rejection here would be noise, not information.
        return
      }
    }

    publishMut.mutate()
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
    <div className="space-y-4">
      {/*
        TEMPLATE FIDELITY 2.1 — THE STATUS STRIP.

        `WebAddressCard`'s own invariant, kept literally at a fifth of the
        height: "a tenant must never be unsure whether the public can see
        their page." The card that used to say it has moved to the Publish
        tab, so the STATE stays here, above the tabs, on every one of them —
        the first thing on the screen whatever the tenant is doing.

        Nothing in it is clickable, deliberately: it is a fact, not a
        control, and every action it used to sit beside (Copy, Change,
        Publish, Unpublish) is one press away on the Publish tab.
      */}
      <StatusStrip status={page.status} dirty={dirty} />

      <BuilderTabBar active={tab} onSelect={selectTab} />

      {/*
        The grid stays BELOW the tab bar, so the right-hand column — and the
        live preview in it — is the same element on all three tabs and is
        never unmounted by a tab change. That is the difference between this
        and `HubTabs.tsx`, which renders only the active tab's subtree: the
        preview is the thing that makes this screen feel live, and a tab
        change that reloaded it would cost a full server render every time
        somebody went to look at a colour.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 space-y-5 min-w-0">
          {tab === 'design' && (
            /*
              Task 6 (landing phase 3c, D4): the Design panel — palette +
              type-pairing cards and the brand-colour input, all saved
              through the SAME text-save path every other field on this
              screen already uses (`update` + the sticky Save button below);
              `image_url` handling is untouched (D4's one-writer rule stays
              with the photo controls).
            */
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
                onIndustryChange={handleIndustryChange}
                templates={templates}
                templateKey={templateKey}
                onTemplateChange={key => update('template_key', key)}
                // Template fidelity 1.2 — the four bools that decide which of
                // this panel's blocks are drawn at all. See `templateSupports`.
                supports={supports}
              />
            </div>
          )}

          {tab === 'publish' && (
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
              onPublish={() => { void handlePublish() }}
              onUnpublish={handleUnpublish}
              // 1.6: the save this button now performs on the tenant's behalf is
              // part of publishing as far as they are concerned, so it is part of
              // "publishing…" too. Anything else would leave the button live for
              // the half-second the save is in flight.
              publishing={publishMut.isPending || saveMut.isPending}
              unpublishing={unpublishMut.isPending}
              seoTitle={seoFields.title}
              seoDescription={seoFields.description}
              onSeoChange={updateSeo}
              businessName={businessName}
              headline={typeof f.content?.hero?.headline === 'string' ? f.content.hero.headline : ''}
            />
          )}

          {tab === 'content' && (
          <div>
            {/*
              TEMPLATE FIDELITY 2.3 — the chips, above the list they filter.
              A chip that would show nothing is DISABLED WITH ITS ZERO
              VISIBLE rather than hidden: "you have no photo blocks yet" is
              guidance, and a control that vanishes is a control a tenant
              goes looking for.
            */}
            {rows.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-3" role="group" aria-label={t('landing_pages.editor.filter_label', 'Show')}>
                {SECTION_FILTERS.map(id => {
                  const count = chipCounts[id]
                  const active = filter === id
                  const empty = count === 0 && id !== 'all'

                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      disabled={empty}
                      onClick={() => setFilter(id)}
                      className={'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border outline-none '
                        + 'transition-colors motion-reduce:transition-none '
                        + 'focus-visible:ring-2 focus-visible:ring-primary-500/60 '
                        + 'disabled:opacity-40 disabled:cursor-not-allowed '
                        + (active
                          ? 'bg-primary-500/15 border-primary-500 text-white'
                          : 'bg-dark-bg border-dark-border text-t-secondary hover:text-white enabled:hover:border-dark-border2')}
                    >
                      {t(`landing_pages.editor.filter_${id}`, FILTER_FALLBACK[id])}
                      <span className="text-[10px] font-mono tabular-nums opacity-70">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/*
              Said ONCE, above the list, rather than as a hint on every one
              of up to sixteen cards — which is also the only way a page
              with twelve sections stays calm. It has to be said somewhere:
              a grip icon is not self-explanatory to the tenant this screen
              is for, and the keyboard route is not discoverable at all
              without being named.

              2.3: while a chip is active it is REPLACED, not merely
              contradicted, by the sentence that says why the handles have
              gone. Leaving the promise "sections appear from top to bottom"
              over a list that is showing four of thirteen would be the
              screen lying about the page again.
            */}
            {rows.length > 0 && (reorderable ? (
              <p id="lp-reorder-help" className="text-xs text-t-secondary mb-2">
                {t(
                  'landing_pages.editor.reorder_help',
                  'Drag a section by its handle to move it, or use the arrows. Sections appear on your page from top to bottom.',
                )}
              </p>
            ) : (
              <p className="text-xs text-t-secondary mb-2 leading-relaxed">
                {t('landing_pages.editor.filter_active_note', {
                  shown: shownRows.length,
                  total: rows.length,
                  defaultValue: 'Showing {{shown}} of your {{total}} sections. Choose “All” to change the order.',
                })}
              </p>
            ))}

            <div className="space-y-3">
              {shownRows.map((row, i) => (
                <React.Fragment key={row.key}>
                  {/*
                    3.4: the insertion point ABOVE this card. Offered only
                    over the whole list — while a chip is active the list is
                    a subset in page order, so "above this card" names no
                    position the page has, exactly as the reorder arrows are
                    withdrawn for the same reason. The trailing rail below
                    still works under a filter and adds at the end.
                  */}
                  {reorderable && (
                    <AddBlockRail
                      types={addable}
                      adding={addMut.isPending ? (addMut.variables?.type ?? null) : null}
                      onAdd={type => addMut.mutate({ type, before: row.key })}
                      templateKey={templateKey}
                      open={addOpenAt === row.key}
                      onOpenChange={next => setAddOpenAt(next ? row.key : null)}
                    />
                  )}
                <SectionRow
                  key={row.key}
                  row={row}
                  isFirst={i === 0}
                  isLast={i === shownRows.length - 1}
                  index={i}
                  total={shownRows.length}
                  // 2.2: single-expand, decided by the list (see `expanded`).
                  expanded={expanded === row.key}
                  onToggleExpanded={() => toggleExpanded(row.key)}
                  // 2.3 + 2.6: reordering is offered only over the WHOLE
                  // list, and only for a row this design does not pin.
                  reorderable={reorderable && rowCanMove(fixedBlocks, row)}
                  placement={blockPlacement(fixedBlocks, row.key)}
                  // 2.6: does this design put the band on the page at all,
                  // and — when it does not — is there one that would?
                  drawn={templateDrawsBlock(renders, fixedBlocks, row)}
                  drawnBy={templatesDrawing(templates, row.typeId, templateKey).map(o => o.name)}
                  templateName={templates.find(o => o.key === templateKey)?.name ?? ''}
                  // 2.4: the wireframe for this block ON THIS DESIGN.
                  thumbUrl={sectionThumbUrl(templateKey, row.typeId)}
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
                  // 4.1: the design's own photographs, for the controls that
                  // have to say whether the picture on screen is the
                  // tenant's or the designer's.
                  imageDefaults={imageDefaults}
                  // Same source and the same reason as `imageUrl` above —
                  // the raw QUERY leaf, never `f`/`form`. The photo strip
                  // reads it whole (it needs the OCCUPIED leaves to
                  // allocate the next upload, not only the usable ones),
                  // and `gallerySlots` applies the identical `safeImageUrl`
                  // allowlist to each picture it shows, so a
                  // legal-but-unusable leaf from a raw write cannot reach
                  // `resolveImage()`.
                  storedSection={page.content?.[row.key] ?? null}
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
                  tones={tones}
                  onToneChange={tone => setToneRow(row.key, tone)}
                  onMove={(dir, label) => moveRow(row.key, dir, label)}
                  // Home/End. Resolved to the first/last VISIBLE row's key
                  // here, where the rendered list is — a row this build does
                  // not draw is not somewhere "top of the list" could mean.
                  onMoveEdge={(edge, label) => {
                    const target = edge === 'first' ? shownRows[0] : shownRows[shownRows.length - 1]
                    if (target && target.key !== row.key) dropRow(row.key, target.key, label)
                  }}
                  onRemove={label => handleRemove(row, label)}
                  removing={removeMut.isPending && removeMut.variables === row.key}
                  onFieldChange={(field, value) => updateContent(row.key, field, value)}
                  onImageChanged={onImageChanged}
                />
                </React.Fragment>
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

            {/*
              A chip whose rows all disappeared under it — a band removed,
              a photo taken off the last picture block. The chips themselves
              disable at zero, so this is the race rather than the ordinary
              case, and it still gets a sentence and a way out rather than a
              blank column.
            */}
            {rows.length > 0 && shownRows.length === 0 && (
              <div className={card + ' text-sm text-t-secondary space-y-2'}>
                <p>{t('landing_pages.editor.filter_empty', 'Nothing on your page matches this filter yet.')}</p>
                <button
                  type="button"
                  className={btnSec}
                  onClick={() => setFilter('all')}
                >
                  {t('landing_pages.editor.filter_clear', 'Show all sections')}
                </button>
              </div>
            )}

            {/* 3.4: the last insertion point — after the final card, and
                the only one offered while a chip is active. `END` is not a
                section key (the grammar is `[a-z][a-z0-9_]*`), so it can
                never collide with a row. */}
            <AddBlockRail
              types={addable}
              adding={addMut.isPending ? (addMut.variables?.type ?? null) : null}
              onAdd={type => addMut.mutate({ type, before: null })}
              templateKey={templateKey}
              open={addOpenAt === ADD_AT_END}
              onOpenChange={next => setAddOpenAt(next ? ADD_AT_END : null)}
            />

            {/*
              The one polite channel every reorder path writes to. Visually
              hidden, never `hidden`/`display:none` — a hidden live region
              announces nothing at all.
            */}
            <p aria-live="polite" className="sr-only">{announcement}</p>
          </div>
          )}

          <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-dark-bg/95 backdrop-blur border-t border-dark-border flex items-center justify-between">
            {/*
              Template fidelity 1.6 — SAY WHAT THIS BAR IS ACTUALLY ABOUT.
              It used to read "Unsaved changes" / "All changes saved", which
              is true of only half the card: photo upload and remove, and
              section add and remove, write IMMEDIATELY (they are database
              rows and files, not fields — see `onImageChanged` and the
              add/remove mutations above). A tenant who had just uploaded a
              photo and read "Unsaved changes" had every reason to think
              their photo was at risk, and one who read "All changes saved"
              after removing a band had no idea it already was.

              2.1: OUTSIDE the tab switch, on all three. Every tab queues
              into the same `form` — a headline on Content, a palette on
              Design, a tagline or an address on Publish — and one save
              story means one bar, not one per tab. It is also why a tenant
              can leave the Content tab mid-edit and press Save from
              wherever they end up.
            */}
            <span className="text-xs text-t-secondary">
              {dirty
                ? t('landing_pages.editor.words_unsaved', 'Your words aren’t saved yet')
                : t('landing_pages.editor.words_saved', 'Everything saved')}
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
            {/*
              TEMPLATE FIDELITY 2.5 — the card and the pane share a subject.

              `focusKey` is the open card's section key, and the pane tells
              its frame about it (explicit target origin, see
              `previewBridge.ts`). `onSelect` is the return leg: a click on
              a band in the preview opens that band's card here. Both are
              deliberately keyed off the SINGLE-EXPAND accordion — with two
              cards open there would be no single answer to send.
            */}
            <LandingPreview
              nonce={previewNonce}
              draft={draftPayload}
              dirty={dirty}
              focusKey={expanded}
              onSelect={key => {
                // Only a row that is actually on this page — a message
                // naming anything else selects nothing at all.
                if (!rows.some(row => row.key === key)) return
                // A band clicked in the preview is on the page whether or
                // not a chip happens to be hiding its card, so the chip
                // gets out of the way rather than swallowing the request.
                setFilter('all')
                setExpandedKey(key)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The four chips' `t()` fallbacks. The SAME four words the cards' own
 *  badges use (`GROUP_FALLBACK` below), so the filter is learnable from the
 *  list rather than needing a legend: a tenant reads "Photos you add" on a
 *  card and finds the chip that gathers them by the same name. */
const FILTER_FALLBACK: Record<SectionFilter, string> = {
  all: 'All',
  write: 'Words',
  photos: 'Photos',
  workspace: 'From your workspace',
}

/** The badge one card wears — `sectionGroup`'s single answer, in the chips'
 *  own words. */
const GROUP_FALLBACK: Record<SectionGroup, string> = {
  write: 'Words you write',
  photos: 'Photos you add',
  workspace: 'From your workspace',
}

/** Where a design pins a block the tenant cannot move — one sentence per
 *  served placement (`LandingOnboardingService::PLACEMENTS`). Translated
 *  here rather than sent as prose, so a template says WHERE and the editor
 *  says it in the tenant's language. */
const PLACEMENT_FALLBACK: Record<BlockPlacement, string> = {
  top: 'This design always shows it across the top of your page, so it cannot be moved.',
  footer: 'This design always shows it in your footer, so it cannot be moved.',
  fixed: 'This design gives it a fixed place on the page, so it cannot be moved.',
}

/**
 * TEMPLATE FIDELITY 2.1 — the state of the page, in one strip, on every
 * tab.
 *
 * `WebAddressCard` used to carry this at the top of the screen and it is
 * now behind a tab, so the FACT is lifted out and the ACTIONS stay with the
 * address. That split is the whole reason this is allowed to exist: the
 * card's own invariant is that a tenant must never be unsure whether the
 * public can see their page, and a fact stated on all three tabs satisfies
 * it better than a card that is only on one.
 *
 * Nothing here is a control. There is no button, no link and no toggle —
 * every action it used to sit beside is one press away, and a strip that is
 * partly clickable is a strip a tenant has to test.
 */
function StatusStrip({ status, dirty }: { status: LandingPageDTO['status']; dirty: boolean }) {
  const { t } = useTranslation()
  const vis = pageVisibilityState(status, dirty)

  return (
    <div
      className={'flex items-center gap-x-3 gap-y-0.5 flex-wrap rounded-xl border px-4 py-2.5 '
        + (vis.tone === 'live'
          ? 'border-accent/30 bg-accent/[0.07]'
          : 'border-dark-border bg-dark-surface')}
    >
      <span className={'shrink-0 ' + (vis.tone === 'live' ? 'text-accent' : 'text-t-secondary')}>
        {vis.tone === 'live' ? <Globe size={16} /> : <EyeOff size={16} />}
      </span>
      <p className={'text-sm font-semibold ' + (vis.tone === 'live' ? 'text-accent' : 'text-white')}>
        {t(vis.headlineKey, vis.headlineFallback)}
      </p>
      {/* Wraps rather than truncating: the note is the sentence that says
          the live page is NOT what the tenant is looking at, and a phone is
          exactly where somebody would miss it. */}
      {vis.noteKey && (
        <p className="text-xs text-t-secondary">{t(vis.noteKey, vis.noteFallback ?? '')}</p>
      )}
    </div>
  )
}

/**
 * TEMPLATE FIDELITY 2.1 — three tabs.
 *
 * The house idiom, taken from `HubTabs.tsx` down to the class strings, so
 * this reads as the same product as Members and Rewards. What it does NOT
 * take is that component's `render()` switch: the preview must survive a
 * tab change, so the caller keeps the grid and swaps only the left column.
 *
 * Three, and only three, because the tenant arrives with one of three
 * questions — what does my page say, what does it look like, can anyone
 * see it — and a fourth tab would be a place for something to hide.
 *
 * `aria-pressed` buttons in a named group, NOT `role="tablist"`/`role="tab"`
 * — the same refusal `SectionRow`'s tone swatches already make about
 * `radiogroup`, and for the same reason. The ARIA tab pattern promises
 * arrow-key navigation with a roving tabindex AND a single `role="tabpanel"`
 * these controls own; neither is true here (the preview deliberately lives
 * OUTSIDE whatever the active tab renders), and claiming a pattern without
 * implementing it is worse for a keyboard user than three plain buttons
 * they can tab through.
 */
const TAB_FALLBACK: Record<BuilderTab, string> = {
  content: 'Content',
  design: 'Design',
  publish: 'Publish',
}

function BuilderTabBar({ active, onSelect }: { active: BuilderTab; onSelect: (tab: BuilderTab) => void }) {
  const { t } = useTranslation()

  const icon = (tab: BuilderTab) =>
    tab === 'content' ? <LayoutList size={14} />
      : tab === 'design' ? <Palette size={14} />
        : <Globe size={14} />

  return (
    <div
      className="flex gap-1 border-b border-dark-border overflow-x-auto"
      role="group"
      aria-label={t('landing_pages.editor.tabs_label', 'What you are editing')}
    >
      {BUILDER_TABS.map(tab => (
        <button
          key={tab}
          type="button"
          aria-pressed={active === tab}
          onClick={() => onSelect(tab)}
          className={'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 outline-none '
            + 'transition-colors motion-reduce:transition-none '
            + 'focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-0 '
            + (active === tab
              ? 'text-primary-400 border-primary-400'
              : 'text-t-secondary border-transparent hover:text-white')}
        >
          {icon(tab)}
          {t(`landing_pages.editor.tab_${tab}`, TAB_FALLBACK[tab])}
        </button>
      ))}
    </div>
  )
}

/**
 * TEMPLATE FIDELITY 2.4 — a picture of the band, not another word for it.
 *
 * "Highlights" and "Offer bar" are honest words that tell a salon owner
 * nothing about which stripe of the dark page they are about to edit, and
 * the owner's whole pitch is that tenants pick THESE designs. So each card
 * carries a wireframe of its own band ON THE CHOSEN DESIGN, served as a
 * static same-origin file (`sectionThumbUrl`).
 *
 * A MISSING FILE IS NOT AN ERROR. It falls back to a generic wireframe,
 * which doubles as the honest signal 2.6 wants for "this design does not
 * draw this block" — the row's own sentence says the rest. That is also why
 * there is no manifest of which files exist: a list here would be a second
 * source of truth about the contents of a directory.
 *
 * `alt=""` throughout: the block's name sits immediately beside it, and a
 * screen reader reading "wireframe of the gallery band" before the word
 * "Photo gallery" is one thing said twice.
 */
function SectionThumb({ url, size }: { url: string | null; size: 'row' | 'picker' }) {
  const [failed, setFailed] = useState(false)
  // 64×40 on a row, 160×100 in the picker — the same 8:5 wireframe, sized
  // for how much of the decision it is carrying.
  const box = size === 'row' ? 'w-16 h-10' : 'w-40 h-[100px]'
  const frame = 'shrink-0 rounded-md border border-dark-border bg-dark-bg overflow-hidden ' + box

  if (url === null || failed) {
    return (
      <span aria-hidden className={frame + ' flex flex-col justify-center gap-1 px-2'}>
        <span className="block h-[3px] w-3/5 rounded-full bg-white/20" />
        <span className="block h-[3px] w-full rounded-full bg-white/10" />
        <span className="block h-[3px] w-4/5 rounded-full bg-white/10" />
      </span>
    )
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      className={frame + ' object-cover'}
    />
  )
}

/**
 * TEMPLATE FIDELITY 2.2/2.3 — the three things a closed card says.
 *
 * The NAME, the BADGE (where its substance comes from, in the filter
 * chips' own words — which is how the chips become learnable without a
 * legend), and ONE status line: the single most surprising true thing about
 * this row right now, chosen by `rowStatus` rather than by a ladder of
 * conditions in the markup.
 *
 * Its own component because the same block is rendered twice — inside the
 * disclosure button for a card that opens, and as plain markup for one that
 * has nothing behind it — and two copies of it would be two places for the
 * badge to drift from the chip.
 */
function RowHeading({ label, group, status, statusLine, placementNote }: {
  label: string
  group: SectionGroup
  status: RowStatus['kind']
  statusLine: string
  placementNote: string | null
}) {
  const { t } = useTranslation()

  // The one case where the line is not information but a problem: the
  // tenant's words are stored and this design will not print them. Every
  // other state here — not written yet, nothing on the Services screen,
  // switched off — is a page mid-build, and this product's grammar reserves
  // the amber for something actually wrong.
  const alarming = status === 'not_drawn'

  return (
    <span className="min-w-0 flex-1 block">
      <span className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="shrink-0 rounded border border-dark-border px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-t-secondary/80">
          {t(`landing_pages.editor.group_${group}`, GROUP_FALLBACK[group])}
        </span>
      </span>

      <span className={'block text-xs mt-0.5 leading-relaxed '
        + (alarming ? 'text-warning/90' : 'text-t-secondary')}>
        {statusLine}
      </span>

      {placementNote !== null && (
        <span className="block text-xs mt-0.5 leading-relaxed text-t-secondary/70">{placementNote}</span>
      )}
    </span>
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
  seoTitle, seoDescription, onSeoChange, businessName, headline,
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
  /** Template fidelity 1.5 — the two `seo` leaves, already narrowed to
   *  strings by the parent (see `seoFields`). */
  seoTitle: string
  seoDescription: string
  onSeoChange: (field: 'title' | 'description', value: string) => void
  /** The two things the layouts fall back to when `seo.title` is blank, so
   *  the preview can show a tenant what an EMPTY field actually publishes —
   *  which is the state every page is in today. */
  businessName: string
  headline: string
}) {
  const { t } = useTranslation()
  const vis = pageVisibilityState(page.status, dirty)
  const preview = searchPreview({
    title: seoTitle, description: seoDescription, businessName, headline, url: page.url,
  })

  return (
    <div className={card + ' space-y-4'}>
      {/*
        TEMPLATE FIDELITY 2.1: the live/draft HEADLINE that used to open
        this card has moved out to the status strip above the tabs, where it
        is stated once and shown on all three of them. Saying it again here,
        four centimetres below itself, would be the same fact in two places
        — and this file argues elsewhere at length that a fact in two places
        is a fact that eventually disagrees with itself.

        What stays is the ACTION, which is the only thing on this screen
        that could not follow the fact upstairs: the strip is deliberately
        not clickable.
      */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold text-white pt-2">
          {t('landing_pages.editor.publish_heading', 'Your page on the internet')}
        </h2>

        <div className="shrink-0 text-right">
          {page.status === 'draft' ? (
            <button
              type="button"
              className={btnPrimary}
              // Template fidelity 1.6: NOT gated on `dirty` any more. The
              // handler saves first when there is anything to save — see
              // `handlePublish` — so the instruction this button used to
              // print underneath itself ("Save your changes first.") is a
              // step the screen now takes on the tenant's behalf.
              disabled={publishing}
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
          {/* 1.6: the "Save your changes first." line that sat here is gone
              with the gate that made it necessary. What replaces it is
              honest about what pressing the button will do, and only while
              there is actually something to save. */}
          {page.status === 'draft' && dirty && (
            <p className="text-[11px] text-t-secondary mt-1">
              {t('landing_pages.editor.publish_saves_first', 'This saves your changes too.')}
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

      {/*
        TEMPLATE FIDELITY 1.5 — the two lines a search result and a shared
        link are made of, which until now no tenant could write.

        `page.seo.description` is BOTH the `<meta name="description">` and
        the footer tagline on every template; `page.seo.title` backs the
        `<title>`, the `og:title`, the h1 fallback and the legal name. The
        endpoint has accepted the column since it existed and this editor
        has always put it on the wire — nothing ever set a key in it. So
        every published page shipped an empty meta description and a footer
        with no tagline, on designs whose own kits all write a real one.

        Here, beside the address, because this is the "how the world sees
        this page" block — the same card that answers "is it public" and
        "what is the link". Phase 2 moves the whole card to a Publish tab
        and this travels with it.
      */}
      <div className="border-t border-dark-border pt-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {t('landing_pages.editor.seo_title_heading', 'How your page appears in search and when shared')}
          </h3>
          <p className="text-xs text-t-secondary mt-0.5 leading-relaxed">
            {t(
              'landing_pages.editor.seo_intro',
              'These two lines are what Google shows, what appears when someone shares your link, and — on most designs — the tagline in your footer.',
            )}
          </p>
        </div>

        <div>
          <label className={label} htmlFor="lp-seo-title">
            {t('landing_pages.editor.seo_title_label', 'Page title')}
          </label>
          <input
            id="lp-seo-title"
            className={input}
            maxLength={SEO_TITLE_MAX}
            value={seoTitle}
            onChange={e => onSeoChange('title', e.target.value)}
            placeholder={businessName}
          />
        </div>

        <div>
          <label className={label} htmlFor="lp-seo-description">
            {t('landing_pages.editor.seo_description_label', 'One line about your business')}
          </label>
          <textarea
            id="lp-seo-description"
            className={input + ' resize-y'}
            rows={2}
            maxLength={SEO_DESCRIPTION_MAX}
            value={seoDescription}
            onChange={e => onSeoChange('description', e.target.value)}
          />
        </div>

        {/*
          A REAL PREVIEW, not a caption about one — the same discipline the
          Design panel's palette cards follow. The tenant sees the exact
          words that will be published, INCLUDING what an empty description
          publishes, which is the state their page is in right now.

          Deliberately plain admin chrome rather than a Google pastiche: it
          is a preview of their own words, not an impression of somebody
          else's product.
        */}
        <div className="rounded-lg border border-dark-border bg-dark-bg p-3 space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-[0.12em] text-t-secondary/70">
            {t('landing_pages.editor.seo_preview_kicker', 'Preview')}
          </span>
          <p className="text-sm text-primary-400 truncate">{preview.title}</p>
          <p className="text-[11px] text-accent truncate">{preview.url}</p>
          {preview.descriptionIsEmpty ? (
            <p className="text-xs text-warning/90 leading-relaxed">
              {t(
                'landing_pages.editor.seo_preview_empty',
                'With this blank, search results show whatever Google picks off your page — and your footer tagline is empty.',
              )}
            </p>
          ) : (
            <p className="text-xs text-t-secondary leading-relaxed">{preview.description}</p>
          )}
        </div>
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
  gallery: 'Photo gallery',
  // Template fidelity 1.4: the four fixed types no industry's
  // `defaultSections` names — the three blocks the BeautyTech kits add, and
  // the footer. They are unreachable from any screen today (3.1 is what
  // makes them addable and seeds them per template), and their names are
  // here now so that change is a backend-only one. `LandingOnboardingService
  // ::SECTION_COPY` already carries the same three words for a row that
  // exists; these name the TYPE, for the picker and for a row the wire has
  // nothing to say about.
  announcement: 'Offer bar',
  trust: 'Highlights',
  faq: 'Questions',
  footer: 'Footer',
}

/** The one sentence the "Add a section" control gives each type — what the
 *  tenant would GET, not what the type is called. */
const TYPE_BLURB_FALLBACK: Record<string, string> = {
  text: 'A short heading and a few lines in your own words, with a photo if you want one.',
  gallery: 'A grid of up to eight photos, shown in the order you add them.',
  announcement: 'A single line across the top of your page — an opening offer, late hours, a seasonal note.',
  trust: 'Three or four short things worth knowing about you, with your review score beside them.',
  faq: 'The questions people ask before they book, answered once so you stop answering them.',
  footer: 'The band at the very bottom, with your contact details and opening hours.',
}

function SectionRow({
  row, isFirst, isLast, index, total, content, imageUrl, imageDefaults, storedSection, autoFocusFirstField,
  onFocusHandled,
  expanded, onToggleExpanded, reorderable, placement, drawn, drawnBy, templateName, thumbUrl,
  dragging, dragActive, dropTarget, onDragStart, onDragOverRow, onDragEnd, onDropRow,
  onToggle, tones, onToneChange, onMove, onMoveEdge, onRemove, removing, onFieldChange, onImageChanged,
}: {
  row: EditorSectionRow
  isFirst: boolean
  isLast: boolean
  /** TEMPLATE FIDELITY 4.1 — the DESIGN's own photographs, slot => URL.
   *  Handed down whole rather than resolved per control, because a gallery
   *  needs eight of them and a single plate one, and both are looked up by
   *  the endpoints' own slot spelling. */
  imageDefaults: Record<string, string>
  /** TEMPLATE FIDELITY 2.2 — is this the one open card? Decided by the
   *  LIST (single-expand), never held here: two cards open and the preview
   *  beside them can only be about one of them. */
  expanded: boolean
  onToggleExpanded: () => void
  /** 2.3 + 2.6: whether the move affordances exist at all — false while a
   *  filter is active (the list is not the whole page, so a move past rows
   *  the tenant cannot see has no honest meaning) and false for a block
   *  this design pins. `placement` is what says which of the two, and
   *  supplies the sentence. */
  reorderable: boolean
  placement: BlockPlacement | null
  /** 2.6: whether the chosen design puts this band on the page at all, the
   *  names of the designs that WOULD, and this design's own name — so a
   *  dropped row can be explained by name rather than by "this template".
   *  All three come off the served `renders`/`fixed_blocks`; nothing here
   *  compares a template id. */
  drawn: boolean
  drawnBy: string[]
  templateName: string
  /** 2.4: the wireframe of this band on this design, or null. */
  thumbUrl: string | null
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
  /** This section's whole raw stored leaf — `page.content[row.key]`, off the
   *  QUERY, never `form`. Only the photo strip reads it, and it needs the
   *  WHOLE map rather than the usable photos: an occupied-but-unusable leaf
   *  is still a leaf the next upload would overwrite. `unknown` because
   *  `content` is schemaless and this can legitimately be a scalar. */
  storedSection: unknown
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
  /** The colours this band may sit on, already painted in the palette the
   *  page is wearing. Empty (an older backend published no tone list) draws
   *  no colour control at all. */
  tones: ToneChoice[]
  onToneChange: (tone: string) => void
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
  // Neither photo control is somewhere a caret can land: a band's first
  // control is its picture picker, and autofocusing it would either open a
  // file dialog nobody asked for or silently focus nothing at all.
  const firstWritableField = fields.findIndex(field => field.type !== 'image' && field.type !== 'gallery')

  // Which swatch is lit. A row with no stored tone is not "unset" — it is
  // sitting on the colour its section was authored with, and the served
  // `default_tone` is what names that. Null only when this build recognises
  // neither, which it says in words rather than silently lighting nothing.
  const currentTone = selectedTone(row.tone, row.defaultTone, tones)

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

  // ─── TEMPLATE FIDELITY 2.2/2.3/2.6 — what the CLOSED card says ────────
  //
  // The card is shut by default now, so these three lines are all a tenant
  // has to decide whether to open it: what the band is called, where its
  // substance comes from (the badge, in the filter chips' own words), and
  // the single most surprising true thing about it right now.
  const group = rowGroup(row)
  const status = rowStatus(row, { drawn, offerable, dataBacked: isDataBackedSection(row.key) })

  // Nothing to open: a band that cannot be switched on has no controls
  // behind the header, and a `footer` row's catalogue entry declares no
  // fields at all. A chevron over an empty box is a promise the card
  // cannot keep, so the header renders as plain text instead of a button.
  const expandable = offerable && fields.length > 0
  const isOpen = expandable && expanded
  const bodyId = `lp-${row.key}-body`

  // 2.6's own sentence, assembled from served facts: this design's name,
  // and the names of the designs that WOULD draw the band. Never "switch
  // templates" as an abstraction — a way out a tenant can act on names the
  // design they would be switching to.
  const notDrawnNote = drawnBy.length === 1
    ? t('landing_pages.editor.block_not_drawn_switch', {
      template: templateName,
      other: drawnBy[0],
      defaultValue: '{{template}} does not show this block. Your words are kept — switch to {{other}} to show it, or leave it here.',
    })
    : drawnBy.length > 1
      ? t('landing_pages.editor.block_not_drawn_other', {
        template: templateName,
        defaultValue: '{{template}} does not show this block. Your words are kept — switch to another design to show it, or leave it here.',
      })
      : t('landing_pages.editor.block_not_drawn_none', {
        template: templateName,
        defaultValue: '{{template}} does not show this block, and no other design here shows it either. Your words are kept.',
      })

  const statusLine =
    status.kind === 'not_drawn' ? notDrawnNote
      : status.kind === 'unavailable'
        ? unavailableReason(row, t('landing_pages.editor.section_pending', {
          source: row.sourceLabel,
          defaultValue: 'Add this from {{source}} whenever you are ready — it appears on your page as soon as you do.',
        }))
        : status.kind === 'hidden'
          ? t('landing_pages.editor.section_hidden', 'Hidden from your page')
          : status.kind === 'needs_photos'
            ? t('landing_pages.editor.section_needs_photos', 'No photos yet — this block appears on your page once you add one.')
            : status.kind === 'needs_words'
              ? t('landing_pages.editor.section_needs_words', 'Nothing written yet — this block appears on your page once you add some words.')
              : status.kind === 'counted'
                ? t('landing_pages.section_source', {
                  count: status.count,
                  source: status.source,
                  defaultValue: '{{count}} from {{source}}',
                })
                : status.kind === 'source' ? status.source
                  : status.kind === 'own_photos'
                    ? t('landing_pages.editor.section_own_photos', 'Photos you add here')
                    : t('landing_pages.editor.section_own_words', 'Words you write here')

  // A quiet line, not a warning: a fixed place is the design working as
  // drawn, and this is the answer to "where did my arrows go".
  const placementNote = placement === null
    ? null
    : t(`landing_pages.editor.placement_${placement}`, PLACEMENT_FALLBACK[placement])

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
        //
        // 2.6: and only onto a row whose POSITION means something. A block
        // this design pins is drawn where the author put it whatever its
        // `sort` says, so "drop it here" would name a place that does not
        // exist — the same reason the row has no handle and no arrows.
        if (!dragActive || !reorderable) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverRow()
      }}
      onDrop={e => {
        if (!dragActive || !reorderable) return
        e.preventDefault()
        onDropRow()
      }}
      className={card + ' space-y-3 transition-[opacity,box-shadow] motion-reduce:transition-none '
        + (dragging ? 'opacity-40 ' : '')
        + (dropTarget ? 'ring-2 ring-primary-500/70 ' : '')}
    >
      {/*
        THE ROW HEADER. Since template fidelity 2.2 it is also the whole
        card most of the time — the body is closed by default — so it has to
        answer, at a glance, four questions a tenant would otherwise open the
        card to find out: what band is this, what does it look like on THIS
        design (the thumbnail), where does its content come from (the badge),
        and is anything the matter with it (the one status line).

        Left to right, and each position is an argument:
          - the DRAG HANDLE, where a drag affordance belongs, and only on a
            row a move would actually move (2.6);
          - the DISCLOSURE — chevron, thumbnail, name, badge, status — as ONE
            control, because the thing a tenant reaches for is the name of
            the section, not a 14px glyph beside it;
          - the two reorder ARROWS and the enable switch grouped in a single
            bordered pill: the three things you do to a section that already
            exists. Arrows rather than the chevrons this used to draw, now
            that the card's own disclosure is a chevron;
          - the REMOVE button outside that group, with air around it. It is
            the one action here that cannot be undone, so it is deliberately
            not adjacent to the switch a tenant presses casually.

        Every control 32px, every glyph 14px, every one of them with a
        visible focus ring and an accessible name.
      */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {/*
            TEMPLATE FIDELITY 2.6 — the handle exists only where a move
            would do something. It is withdrawn for a block this design
            pins (the layout draws it where the author put it, whatever
            `sort` says) and for every row while a filter is active (the
            list on screen is not the whole page). `placementNote` and the
            filter's own sentence are the two explanations; a control that
            cannot act is not rendered.
          */}
          {reorderable && (
            <button
              type="button"
              // Not `draggable` itself — the CARD is what gets dragged, and
              // this only arms it. Dragging the handle alone would carry a
              // 14px icon across the screen instead of the section.
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
              className={iconBtn + ' cursor-grab active:cursor-grabbing'}
            >
              <GripVertical size={ROW_ICON} />
            </button>
          )}

          {/*
            TEMPLATE FIDELITY 2.2 — THE CARD IS A DISCLOSURE.

            One control over the whole name/thumbnail/status block rather
            than a lone chevron: the thing a tenant reaches for is the name
            of the section they want to edit, and asking them to hit a 14px
            glyph beside it instead would be the opposite of the point. The
            chevron rides inside it, at the left, where a disclosure
            triangle belongs and where it cannot be confused with the two
            reorder arrows at the far end of the row.

            A row with nothing behind it (a band that cannot be switched on,
            or a type whose catalogue entry declares no fields) renders the
            same markup as plain text — no button, no chevron, no promise.
          */}
          {expandable ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={isOpen}
              aria-controls={bodyId}
              className={'flex items-start gap-3 min-w-0 flex-1 text-left rounded-lg -my-1 py-1 px-1.5 -mx-1.5 outline-none '
                + 'transition-colors motion-reduce:transition-none hover:bg-dark-surface3/50 '
                + 'focus-visible:ring-2 focus-visible:ring-primary-500/60'}
            >
              <ChevronDown
                size={ROW_ICON}
                aria-hidden
                className={'shrink-0 mt-1.5 text-t-secondary transition-transform motion-reduce:transition-none '
                  + (isOpen ? '' : '-rotate-90')}
              />
              <SectionThumb url={thumbUrl} size="row" />
              <RowHeading
                label={displayLabel}
                group={group}
                status={status.kind}
                statusLine={statusLine}
                placementNote={placementNote}
              />
            </button>
          ) : (
            <div className="flex items-start gap-3 min-w-0 flex-1 pl-[26px]">
              <SectionThumb url={thumbUrl} size="row" />
              <RowHeading
                label={displayLabel}
                group={group}
                status={status.kind}
                statusLine={statusLine}
                placementNote={placementNote}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Reorder + enable, in one container: the three things you do to
              a section that is already on the page. ARROWS rather than the
              chevrons this used to draw — the card's own disclosure is a
              chevron now, and two glyphs that differ only in position is
              how a tenant collapses a card while trying to move it. It also
              matches the help sentence above the list, which has always
              said "or use the arrows". */}
          <div className="flex items-center gap-0.5 rounded-lg border border-dark-border bg-dark-bg/60 p-0.5">
            {reorderable && (
              <>
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => onMove('up', displayLabel)}
                  aria-label={t('landing_pages.editor.move_up', 'Move up')}
                  className={iconBtn}
                >
                  <ArrowUp size={ROW_ICON} />
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onMove('down', displayLabel)}
                  aria-label={t('landing_pages.editor.move_down', 'Move down')}
                  className={iconBtn}
                >
                  <ArrowDown size={ROW_ICON} />
                </button>

                <span aria-hidden className="mx-1 h-4 w-px bg-dark-border" />
              </>
            )}

            {offerable ? (
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={displayLabel}
                // The state in words as well as in colour, for everyone who
                // is not reading it off a screen reader.
                title={checked
                  ? t('landing_pages.editor.section_showing', 'Showing on your page')
                  : t('landing_pages.editor.section_hidden', 'Hidden from your page')}
                onClick={onToggle}
                // The pill lives INSIDE a 32px-tall button rather than being
                // one: a 20px-high control is under every hit-target floor
                // there is, and growing the pill itself would have made the
                // loudest thing on the card louder still.
                className={'flex items-center justify-center h-8 px-1.5 shrink-0 rounded-md outline-none '
                  + 'hover:bg-dark-surface3 transition-colors motion-reduce:transition-none '
                  + 'focus-visible:ring-2 focus-visible:ring-primary-500/60'}
              >
                <span
                  aria-hidden
                  // `accent` (the product's green) rather than `primary` —
                  // primary is the TENANT'S brand colour, and on a blue or
                  // magenta brand this switch became the loudest thing on
                  // the screen while saying nothing about state. Green reads
                  // as "on" without being asked to, and it is the same token
                  // this very file already uses for "live" a few components
                  // down.
                  className={'relative block w-9 h-5 rounded-full border transition-colors motion-reduce:transition-none '
                    + (checked ? 'bg-accent border-accent' : 'bg-dark-surface3 border-dark-border')}
                >
                  <span
                    className={'absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white transition-transform motion-reduce:transition-none '
                      + (checked ? 'translate-x-[18px]' : 'translate-x-[2px]')}
                  />
                </span>
              </button>
            ) : (
              <span className="flex items-center h-8 px-2 shrink-0 text-[10px] font-mono uppercase tracking-[0.12em] text-t-secondary/70">
                {t('landing_pages.editor.section_not_yet', 'Not yet')}
              </span>
            )}
          </div>

          {/*
            ONLY on a band the tenant added. The fixed bands are seeded with
            the page and `LandingPageSectionController::destroy()` refuses
            them outright — offering a Remove button that always fails would
            be a worse answer than the toggle beside it, which is the real
            way to take a fixed band off the page. `row.fixed` is derived
            from the served catalogue's own key grammar, not from a list of
            removable keys kept here.

            Outside the group above, and spaced away from it: this is the
            only control on the row that destroys anything.
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
              className={iconBtnDanger + ' ml-1'}
            >
              <Trash2 size={ROW_ICON} />
            </button>
          )}
        </div>
      </div>

      {/*
        THE BODY, BEHIND THE HEADER SINCE 2.2.

        This is the change the whole phase turns on. Every one of these
        cards used to be open at once — roughly a hundred controls down one
        four-thousand-pixel column, before Phases 3–5 add another forty-five
        fields and three photo slots. Closed by default, one open at a time,
        the same page is a list a tenant can read and the growth is absorbed
        instead of compounding.

        `id`/`aria-controls`/`aria-expanded` are the accessible half: the
        header says what it controls and what state it is in, and the body
        is genuinely unmounted rather than hidden, so nothing inside a
        closed card is in the tab order.
      */}
      {isOpen && (
        <div id={bodyId} className="space-y-3 border-t border-dark-border/60 pt-3">
          {/*
            THE COLOUR OF THIS BAND.

            First in the card, above the words, because it is the one control
            here that changes how the section LOOKS rather than what it says
            — and because a tenant who came to this card to recolour it
            should not have to scroll past four textareas to find out whether
            they can.

            Swatches, not a dropdown of colour NAMES: "Soft band" means
            nothing until you have seen it, and the same id is a different
            colour in each of the six palettes. Each swatch is painted in the
            actual colour that band will be, in the palette the page is
            currently wearing (`toneChoices`), and the chosen one is named in
            words beside them so the control is not colour-alone.

            `aria-pressed` toggle buttons rather than a `radiogroup`: the
            same shape `DesignPanel.tsx`'s palette and pairing cards already
            use, and it is the honest one here — a radiogroup promises
            arrow-key navigation with a roving tabindex, and claiming that
            without implementing it is worse for a keyboard user than three
            plain buttons they can tab through.
          */}
          {tones.length > 0 && (
            <div>
              <span className={label} id={`lp-${row.key}-tone`}>
                {t('landing_pages.editor.tone_label', 'Background colour')}
              </span>
              <div className="flex items-center gap-2 flex-wrap" role="group" aria-labelledby={`lp-${row.key}-tone`}>
                {tones.map(tone => {
                  const toneName = t(`landing_pages.editor.tone_name_${tone.id}`, TONE_NAME_FALLBACK[tone.id] ?? tone.id)
                  const active = tone.id === currentTone

                  return (
                    <button
                      key={tone.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={toneName}
                      title={toneName}
                      onClick={() => onToneChange(tone.id)}
                      className={'flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border-2 outline-none '
                        + 'transition-colors motion-reduce:transition-none '
                        + 'focus-visible:ring-2 focus-visible:ring-primary-500/60 '
                        + (active ? 'border-primary-500' : 'border-dark-border hover:border-dark-border2')}
                    >
                      {/* The ring is the palette colour itself, on a hairline
                          so a white or near-black surface still has an edge
                          against the card it sits on. */}
                      <span
                        aria-hidden
                        className="block w-5 h-5 rounded-md border border-white/15"
                        style={{ backgroundColor: tone.color }}
                      />
                    </button>
                  )
                })}
                <span className="text-xs text-t-secondary">
                  {currentTone === null
                    ? t('landing_pages.editor.tone_unknown', 'Set by your design')
                    : t(`landing_pages.editor.tone_name_${currentTone}`, TONE_NAME_FALLBACK[currentTone] ?? currentTone)}
                </span>
              </div>
            </div>
          )}

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
          {fields.map((field, fieldIndex) => {
            // Template fidelity 5.x: numbered families share one label (and,
            // for two of them, one hint) — see `fieldLabelKey`.
            const labelKey = fieldLabelKey(field.name)
            const hintKey = fieldHintKey(field.name)

            return (
            <div key={field.name}>
              <label
                className={label}
                // A composite control has no ONE input to label — the photo
                // strip has eight thumbnails and a picker, the questions
                // form has a pair of inputs per row, each already labelled.
                htmlFor={COMPOSITE_FIELD_TYPES.includes(field.type ?? '') ? undefined : `lp-${row.key}-${field.name}`}
              >
                {t(`landing_pages.editor.field_${labelKey}`, FIELD_FALLBACK[labelKey] ?? field.name)}
              </label>
              {hintKey !== null && (
                <p className="text-xs text-t-secondary -mt-1 mb-1">
                  {t(`landing_pages.editor.field_hint_${hintKey}`, FIELD_HINT_FALLBACK[hintKey])}
                </p>
              )}
              {field.type === 'gallery' ? (
                /*
                 * The same D4 reasoning as the single plate below, eight
                 * leaves at a time: the picture leaves are never part of
                 * `form`/dirty state, so this control reads the `gallery`
                 * PROP (sourced from the QUERY's raw `page.content` at the
                 * call site above) and never `content`, and it never writes
                 * through `onFieldChange` — there is no keystroke to queue,
                 * only immediate, already-saved server round-trips.
                 */
                <GalleryField
                  sectionKey={row.key}
                  stored={storedSection}
                  limit={field.slots ?? 0}
                  defaults={imageDefaults}
                  content={content}
                  onFieldChange={onFieldChange}
                  onChanged={onImageChanged}
                />
              ) : field.type === 'faq_pairs' ? (
                /*
                 * 3.3: the questions band is ONE control, not fifteen boxes.
                 * Synthesised in `fieldsForType` exactly the way the gallery
                 * strip is, and writing the same `q1`/`a1`… leaves through
                 * the same `onFieldChange` every other text field uses —
                 * these ARE ordinary content leaves and they save with the
                 * words, not through an endpoint of their own.
                 */
                <FaqPairsField
                  sectionKey={row.key}
                  content={content}
                  pairs={field.pairs ?? 0}
                  onFieldChange={onFieldChange}
                />
              ) : field.type === 'image' ? (
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
                <ImageField
                  sectionKey={row.key}
                  imageUrl={imageUrl}
                  // 4.1: this row's slot is the bare section key for a
                  // single plate — the endpoints' own spelling, which is
                  // also how the served map is keyed.
                  defaultUrl={imageDefaults[row.key] ?? null}
                  content={content}
                  onFieldChange={onFieldChange}
                  onChanged={onImageChanged}
                />
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
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * TEMPLATE FIDELITY 3.4 — "+ Add a block", between the cards and after the
 * last one.
 *
 * The affordance this replaces was a card at the FOOT of the list carrying
 * an apology: "New sections go to the bottom of the page. You can move them
 * anywhere afterwards." A tenant who wanted a words band between their
 * services and their story had to add it, scroll to the bottom, and drag it
 * six rows up. Offering the add WHERE the block goes removes the apology and
 * the drag together.
 *
 * A hairline with a quiet button in it, at rest; the picker opens INLINE
 * beneath it rather than in a portal, so the tenant keeps the list they were
 * reading in view and there is no focus trap to get wrong. One picker open
 * at a time, decided by the list (the same single-expand rule the cards
 * follow), which is also what stops two rails claiming the same insertion
 * point.
 */
function AddBlockRail({ types, adding, onAdd, templateKey, open, onOpenChange }: {
  types: AddableType[]
  /** The type id currently in flight, or null. */
  adding: string | null
  onAdd: (type: string) => void
  templateKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  // Nothing addable at all — an older backend that serves no catalogue, or
  // a design that draws none of the addable types. No rail, no empty
  // heading over nothing.
  if (types.length === 0) return null

  return (
    <div className="relative">
      {/* The rail reads as a seam between two cards rather than as a
          control until it is hovered or focused — thirteen of these down a
          list must not be louder than the sections they sit between. */}
      <div className="group flex items-center gap-2 py-1">
        <span aria-hidden className="h-px flex-1 bg-dark-border/60" />
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className={'flex items-center gap-1 px-2 py-1 rounded-full border border-dark-border bg-dark-bg '
            + 'text-[11px] text-t-secondary opacity-60 group-hover:opacity-100 focus-visible:opacity-100 '
            + 'hover:text-white transition-opacity motion-reduce:transition-none outline-none '
            + 'focus-visible:ring-2 focus-visible:ring-primary-500/60'}
        >
          <Plus size={12} />
          {t('landing_pages.editor.add_block', 'Add a block')}
        </button>
        <span aria-hidden className="h-px flex-1 bg-dark-border/60" />
      </div>

      {open && (
        <AddBlockPicker
          types={types}
          adding={adding}
          onAdd={onAdd}
          templateKey={templateKey}
          onClose={() => onOpenChange(false)}
        />
      )}
    </div>
  )
}

/**
 * The picker sheet itself: one entry per ADDABLE type, and the list of them
 * is the server's (`section_types` filtered by `addable` and by what this
 * design actually draws), never a hand list here — which is what makes a new
 * block a backend change and nothing else.
 *
 * A type that cannot be added right now is DISABLED WITH ITS REASON SHOWN,
 * not hidden: a tenant who is looking for the control they used ten minutes
 * ago must find it and be told why it will not work, rather than watch it
 * vanish. Every sentence names the real number, interpolated from the served
 * cap — see `addableTypes`, which decides which of the three applies.
 */
function AddBlockPicker({ types, adding, onAdd, templateKey, onClose }: {
  types: AddableType[]
  adding: string | null
  onAdd: (type: string) => void
  /** 2.4: which design's wireframes to show beside each choice. The block a
   *  tenant is picking looks different on each template, and the name alone
   *  ("Photo gallery") does not say which stripe of the page they are about
   *  to add. Interpolated into a URL, never compared. */
  templateKey: string
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className={card + ' mb-1 space-y-3'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {t('landing_pages.editor.add_section', 'Add a section')}
          </h2>
          <p className="text-xs text-t-secondary mt-0.5">
            {t(
              'landing_pages.editor.add_block_hint',
              'It goes in right here. You can still move it afterwards.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('landing_pages.editor.add_block_close', 'Close')}
          className={iconBtn}
        >
          <X size={ROW_ICON} />
        </button>
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
            // 3.1: a FIXED block a page can only hold one of. There is
            // nothing to remove and no cap to explain — the band is already
            // in the list above, possibly switched off, and switching it
            // back on is the actual next step.
            : type.disabledReason === 'already_on_page'
              ? t('landing_pages.editor.add_section_already_on_page', {
                name,
                defaultValue: 'Your page already has one of these — find it in the list above.',
              })
              : type.disabledReason === 'page_full'
                ? t('landing_pages.editor.add_section_page_full', {
                  limit: type.pageLimit ?? 0,
                  defaultValue: 'Your page is full — it holds up to {{limit}} sections. Remove one to add another.',
                })
                : null

          return (
            /* 2.4: the wireframe beside the words, at the larger of the two
               sizes — this is the moment a tenant is CHOOSING a band, so
               the picture is doing more work here than in the row header
               where the choice has already been made. */
            <div key={type.id} className="flex items-start gap-3">
              <SectionThumb url={sectionThumbUrl(templateKey, type.id)} size="picker" />
              <div className="min-w-0 flex-1">
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * TEMPLATE FIDELITY 3.3 — the FAQ needs a form, not fifteen boxes.
 *
 * `faq.fields` is `kicker, heading, subtext, q1, a1, … q6, a6`. Through the
 * flat field loop that was fifteen stacked inputs on one card, twelve of
 * them labelled `q1`…`a6` — a control a salon owner cannot read, on the one
 * band whose entire content is a list of couplets.
 *
 * BOTH HALVES OR NEITHER, said on the card rather than discovered from a
 * preview. `PageContent::faqPairs()` drops any pair missing a half, so a
 * tenant who types a question and no answer has written something the page
 * will never show — this mirrors that rule where the typing happens instead
 * of letting a lone answer be saved silently.
 *
 * HOW MANY ROWS ARE SHOWN is `visibleFaqPairs`, a pure function so the rule
 * is testable: every pair that has anything in it, plus the ones the tenant
 * has revealed, never fewer than one and never more than the served cap. The
 * cap comes off the wire (`SectionField.pairs`, derived from the leaves the
 * server published) and is never the literal six.
 */
function FaqPairsField({ sectionKey, content, pairs, onFieldChange }: {
  sectionKey: string
  /** `f.content[sectionKey]` — the same form-merged object every other text
   *  control on this card reads and writes. These are ordinary content
   *  leaves; nothing here talks to an endpoint. */
  content: Record<string, string>
  /** The served cap — how many couplets this band may hold. */
  pairs: number
  onFieldChange: (field: string, value: string) => void
}) {
  const { t } = useTranslation()

  // How many EMPTY rows the tenant has asked to see beyond the written ones.
  // Local, because it is a fact about this card being open rather than about
  // the page: a revealed-but-never-filled row leaves nothing behind.
  const [revealed, setRevealed] = useState(0)

  const shown = visibleFaqPairs(content, pairs, revealed)
  const full = shown >= pairs

  return (
    <div className="space-y-3">
      {Array.from({ length: shown }, (_, i) => {
        const n = i + 1
        const question = content[`q${n}`] ?? ''
        const answer = content[`a${n}`] ?? ''
        // Exactly `PageContent::faqPairs()`'s own test, said where the
        // typing is: trimmed, both halves, or the pair does not publish.
        const halfWritten = (question.trim() === '') !== (answer.trim() === '')

        return (
          <div key={n} className="rounded-lg border border-dark-border bg-dark-bg/40 p-3 space-y-2">
            <div>
              <label className={label} htmlFor={`lp-${sectionKey}-q${n}`}>
                {t(`landing_pages.editor.field_q${n}`, FIELD_FALLBACK[`q${n}`] ?? `Question ${n}`)}
              </label>
              <input
                id={`lp-${sectionKey}-q${n}`}
                className={input}
                value={question}
                onChange={e => onFieldChange(`q${n}`, e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor={`lp-${sectionKey}-a${n}`}>
                {t(`landing_pages.editor.field_a${n}`, FIELD_FALLBACK[`a${n}`] ?? `Answer ${n}`)}
              </label>
              <textarea
                id={`lp-${sectionKey}-a${n}`}
                className={input + ' resize-y'}
                rows={2}
                value={answer}
                onChange={e => onFieldChange(`a${n}`, e.target.value)}
              />
            </div>
            {halfWritten && (
              <p className="text-xs text-warning leading-relaxed">
                {t(
                  'landing_pages.editor.faq_pair_incomplete',
                  'A question needs its answer. This one stays off your page until both are filled in.',
                )}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          className={btnSec}
          disabled={full}
          onClick={() => setRevealed(r => r + 1)}
        >
          <Plus size={14} />
          {t('landing_pages.editor.faq_add_pair', 'Add another question')}
        </button>
        {/* At the cap the count is REPLACED by the reason rather than joined
            by one — the same choice the photo strip makes, and for the same
            reason: a button going quietly grey with no sentence beside it is
            a refusal with no explanation. */}
        <p className="text-xs text-t-secondary/80 leading-relaxed">
          {full
            ? t('landing_pages.editor.faq_full', {
              limit: pairs,
              defaultValue: 'You have {{limit}} questions — that is as many as one band can hold.',
            })
            : t('landing_pages.editor.faq_count', {
              used: shown,
              limit: pairs,
              defaultValue: '{{used}} of {{limit}} questions',
            })}
        </p>
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
function ImageField({ sectionKey, imageUrl, defaultUrl, content, onFieldChange, onChanged }: {
  sectionKey: string
  /** The TENANT's own upload for this slot, off the raw query — null when
   *  they have not made one. Never the effective picture: the difference
   *  between the two is the whole control. */
  imageUrl: string | null
  /** The DESIGN's own photograph for this slot, off the served
   *  `image_defaults` — null when it ships none (template fidelity 4.1). */
  defaultUrl: string | null
  /** `f.content[sectionKey]`, for the two WORD leaves that belong to this
   *  picture. They are ordinary content and save with the words; only the
   *  picture itself has an endpoint of its own. */
  content: Record<string, string>
  onFieldChange: (field: string, value: string) => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  // Template fidelity 1.6: photos write IMMEDIATELY (D4 — the image
  // endpoints are their one writer and they save straight to the row), and
  // the save bar at the foot of this screen is about the tenant's WORDS.
  // Without a word here, the only feedback an upload gives is a thumbnail
  // appearing, and the bar below it may well be saying "not saved yet"
  // about something else entirely.
  const [justSaved, setJustSaved] = useSavedFlash()

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
      // 4.8: a re-encoded upload is WebP whatever the picked file was
      // called, and the name has to say so — see `downscaledName`.
      body.append('image', image, target ? downscaledName(file.name) : file.name)
      // The shared `api` client strips Content-Type for a FormData body
      // (api.ts:28-37) so this plain multipart POST needs no extra config.
      return api.post('/v1/admin/landing-pages/image', body)
    },
    onSuccess: () => { onChanged(); setJustSaved() },
    onError: (e: unknown) => toast.error(imageErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const removeMut = useMutation({
    mutationFn: () => api.delete('/v1/admin/landing-pages/image', { data: { slot: sectionKey } }),
    onSuccess: () => { onChanged(); setJustSaved() },
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

  // WHAT THE TENANT IS ACTUALLY LOOKING AT — their own picture when they
  // have chosen one, the design's when they have not. The same resolution
  // `PageContent::imageUrl()` makes server-side, from the same two facts,
  // because a control that showed a different picture from the page would
  // be worse than one that showed none.
  const shown = imageUrl ?? defaultUrl
  const isDefault = imageUrl === null && defaultUrl !== null

  return (
    <div className="space-y-2">
      {shown ? (
        <div className="space-y-1">
          <img
            src={resolveImage(shown) ?? undefined}
            alt=""
            className="max-h-24 rounded-lg border border-dark-border object-cover"
          />
          {/* Said plainly, because it is the one thing about this control a
              tenant cannot see: the picture on their page right now is the
              designer's, and it will stay there until they replace it. */}
          {isDefault && (
            <p className="text-xs text-t-secondary/80">
              {t('landing_pages.editor.photo_is_the_designs', 'This photo comes with your design. Add your own to replace it.')}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-t-secondary">{t('landing_pages.editor.no_photo', 'No photo yet')}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={onPick}
          aria-label={isDefault || imageUrl
            ? t('landing_pages.editor.replace_photo', 'Replace photo')
            : t('landing_pages.editor.upload_photo', 'Upload photo')}
          className="block w-full max-w-xs text-xs text-t-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-dark-border file:bg-dark-bg file:text-t-secondary file:text-xs hover:file:text-white disabled:opacity-50"
        />
        {uploadMut.isPending && (
          <span className="text-xs text-t-secondary">{t('landing_pages.editor.photo_uploading', 'Uploading…')}</span>
        )}
        {!busy && justSaved && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <Check size={12} /> {t('landing_pages.editor.photo_saved', 'Saved')}
          </span>
        )}
        {/* TEMPLATE FIDELITY 4.1 — the verb follows what actually happens.
            The endpoint is the same one either way (it clears the leaf and
            deletes the file); what differs is what the page shows next, and
            on a design that ships its own photograph that is the designer's
            picture rather than a hole. A button saying "Remove photo" that
            leaves a photograph behind would be the control lying about
            itself; one saying "Restore original" where there is no original
            would be worse. */}
        {imageUrl && (
          <button
            type="button"
            className={btnSec}
            disabled={busy}
            onClick={() => removeMut.mutate()}
          >
            {defaultUrl
              ? t('landing_pages.editor.restore_photo', 'Restore original')
              : t('landing_pages.editor.remove_photo', 'Remove photo')}
          </button>
        )}
      </div>

      {/* THE WORDS THAT BELONG TO THIS PICTURE (4.3), under it rather than
          beside the rest of the card's fields: they describe the thing
          immediately above them, and every kit writes both.

          Ordinary content leaves — they queue into the same save as the
          headline, and the one-writer rule that protects the picture does
          not apply to them. Offered only once there is a picture to
          describe. */}
      {shown && (
        <div className="grid gap-2 sm:grid-cols-2 pt-1">
          <div>
            <label className={label} htmlFor={`lp-${sectionKey}-alt`}>
              {t('landing_pages.editor.field_alt', FIELD_FALLBACK.alt)}
            </label>
            <input
              id={`lp-${sectionKey}-alt`}
              className={input}
              maxLength={191}
              value={content.alt ?? ''}
              onChange={e => onFieldChange('alt', e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor={`lp-${sectionKey}-caption`}>
              {t('landing_pages.editor.field_caption', FIELD_FALLBACK.caption)}
            </label>
            <input
              id={`lp-${sectionKey}-caption`}
              className={input}
              maxLength={191}
              value={content.caption ?? ''}
              onChange={e => onFieldChange('caption', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * "Saved", for two seconds, on a control that writes straight to the server
 * (template fidelity 1.6).
 *
 * A hook rather than the same three lines in both photo controls, and a
 * hook rather than a toast: an upload is a change to ONE card and the
 * confirmation belongs on that card, where the tenant is already looking —
 * `saveMut`'s toast is for a save that spans the whole page.
 *
 * The timer is cleared on unmount, so removing a section (or switching
 * brand, which remounts everything) cannot leave a `setState` pointed at a
 * component that no longer exists.
 */
function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  const flash = () => {
    setSaved(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaved(false), 2000)
  }

  return [saved, flash]
}

/**
 * The gallery photo strip — the multi-photo half of the same control
 * `ImageField` above is the single-photo half of.
 *
 * ONE UPLOADER, NOT TWO. This reuses the same downscale path
 * (`imageDownscale.ts`) and the exact same endpoint
 * (`POST`/`DELETE /v1/admin/landing-pages/image`) the single plate has
 * always used; the only difference is what goes in `slot`. A gallery names
 * the PICTURE (`gallery_1.image_3`) where a single-plate band names itself
 * (`hero`) — see `SectionType::imageSlot()`, the one parser behind both — so
 * a second uploader here would have been a second copy of the downscale
 * rule, the error surfacing and the invalidate-and-bump pairing, differing
 * from the first in whichever detail somebody forgot.
 *
 * WHICH LEAF an added photo lands in is decided HERE, from the leaves the
 * server has already stored: `freeGalleryLeaves` hands back the LOWEST FREE
 * ones, so a tenant who removes the third of five photos has the next upload
 * fill that gap rather than burning `image_6` — the same lowest-free rule
 * `SectionType::nextInstanceKey()` uses for section keys, and for the same
 * reason. A multi-file pick allocates ALL of its leaves up front, from one
 * read of the stored section, so two files in one pick cannot both claim
 * `image_1`; the uploads then run in sequence.
 *
 * THE CAP IS SERVED (`section_types[*].image_slots`, carried onto the row as
 * `SectionField.slots`), never a literal eight here — the number the strip
 * counts against and the number the endpoint's slot allowlist enforces are
 * one number. Past it the picker is DISABLED WITH ITS REASON SHOWN rather
 * than hidden, the same choice `AddSectionCard` makes for a type at its own
 * cap: a tenant looking for the control they used a minute ago must find it
 * and be told, in words, why it will not work.
 *
 * No drag-and-drop and no canvas UI, per the spec the single-photo control
 * already follows: a native multi-select `<input type="file">`, a strip of
 * thumbnails, and a remove button on each.
 */
function GalleryField({ sectionKey, stored, limit, defaults, content, onFieldChange, onChanged }: {
  sectionKey: string
  /** `page.content[sectionKey]`, raw and off the QUERY — see the call site. */
  stored: unknown
  /** The served cap. Zero means the backend published no count, and the
   *  control shows no picker rather than guessing at a number. */
  limit: number
  /** The design's own photographs, slot => URL (template fidelity 4.1). */
  defaults: Record<string, string>
  /** `f.content[sectionKey]`, for the per-tile caption leaves. Ordinary
   *  content: they queue into the same save as the words. */
  content: Record<string, string>
  onFieldChange: (field: string, value: string) => void
  onChanged: () => void
}) {
  const { t } = useTranslation()

  const photos = gallerySlots(stored, sectionKey, limit, defaults)
  // Counted over the TENANT's own uploads, never the design's: "6 of 8" is
  // about how many more they can add, and the endpoint's cap is on leaves
  // they have written. A design's photograph occupies a leaf they have not.
  const used = photos.filter(photo => !photo.isDefault).length
  const full = limit === 0 || used >= limit
  // 1.6, same reason as the single plate's: these uploads and removals are
  // already saved the moment they return, and the save bar below is about
  // words. See `useSavedFlash`.
  const [justSaved, setJustSaved] = useSavedFlash()

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      // Allocated ONCE, before any upload starts, against the section this
      // render was built from — never one at a time inside the loop, which
      // would read the same stale snapshot each pass and send every file to
      // the same slot.
      const leaves = freeGalleryLeaves(stored, limit, files.length)

      for (const [i, file] of files.entries()) {
        const leaf = leaves[i]
        if (leaf === undefined) break

        // Downscale only when the photo is actually larger than this screen
        // ever needs — identical to the single plate's own rule, through the
        // same two helpers.
        const bitmap = await createImageBitmap(file)
        const target = downscaleTarget(bitmap.width, bitmap.height)
        const image = target ? await drawToBlob(file, target) : file

        const body = new FormData()
        body.append('slot', gallerySlotName(sectionKey, leaf))
        // 4.8, same rule as the single plate's: a re-encoded upload is WebP
        // whatever the picked file was called.
        body.append('image', image, target ? downscaledName(file.name) : file.name)

        // Sequential, deliberately: each upload is its own row-locking
        // transaction on the same page row, so firing eight at once would
        // queue them on that lock anyway while making any one failure
        // harder to attribute.
        await api.post('/v1/admin/landing-pages/image', body)
      }

      return files.length - leaves.length
    },
    onSuccess: (dropped: number) => {
      onChanged()
      setJustSaved()
      // Said plainly rather than silently: a tenant who picked ten files
      // with two slots left has to be told six of them are not on their
      // page. `limit` and never `count` — i18next reads `count` as a plural
      // selector and would go looking for `_one`/`_other` variants of a
      // sentence written whole in each language.
      if (dropped > 0) {
        toast.error(t('landing_pages.editor.gallery_pick_over_cap', {
          limit,
          defaultValue: 'Only the first few fitted — a gallery holds up to {{limit}} photos.',
        }))
      }
    },
    onError: (e: unknown) => toast.error(imageErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const removeMut = useMutation({
    mutationFn: (slot: string) => api.delete('/v1/admin/landing-pages/image', { data: { slot } }),
    onSuccess: () => { onChanged(); setJustSaved() },
    onError: (e: unknown) => toast.error(imageErrorMessage(e, t('common.error', 'Something went wrong'))),
  })

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    // Reset immediately so picking the SAME files again (e.g. after fixing
    // one and re-selecting) still fires a change event next time.
    e.target.value = ''
    if (files.length > 0) uploadMut.mutate(files)
  }

  const busy = uploadMut.isPending || removeMut.isPending

  return (
    <div className="space-y-2">
      {photos.length > 0 ? (
        /* A COLUMN OF TILES, not a wrapped row of thumbnails, since 4.3:
           each picture now carries a caption input of its own, and a caption
           belongs beside the photograph it names. */
        <ul className="space-y-2 list-none p-0 m-0">
          {photos.map((photo, i) => (
            <li key={photo.leaf} className="flex items-start gap-3">
              <div className="relative shrink-0">
                <img
                  src={resolveImage(photo.url) ?? undefined}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-dark-border object-cover"
                />
                {/* Nothing to remove from a tile the tenant has not filled:
                    the design's photograph is not theirs to delete, and the
                    way to change it is to upload one over it. */}
                {!photo.isDefault && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeMut.mutate(photo.slot)}
                    // Numbered by POSITION in the strip, not by leaf:
                    // `image_5` is a storage detail, and "photo 3" is what
                    // the tenant is actually looking at. The VERB follows
                    // what happens next — on a design that ships its own
                    // picture for this slot, clearing the leaf puts that
                    // picture back rather than leaving a hole.
                    aria-label={t(
                      defaults[photo.slot]
                        ? 'landing_pages.editor.restore_photo_n'
                        : 'landing_pages.editor.remove_photo_n',
                      {
                        position: i + 1,
                        defaultValue: defaults[photo.slot]
                          ? 'Restore the original photo {{position}}'
                          : 'Remove photo {{position}}',
                      },
                    )}
                    title={t(
                      defaults[photo.slot]
                        ? 'landing_pages.editor.restore_photo_n'
                        : 'landing_pages.editor.remove_photo_n',
                      {
                        position: i + 1,
                        defaultValue: defaults[photo.slot]
                          ? 'Restore the original photo {{position}}'
                          : 'Remove photo {{position}}',
                      },
                    )}
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-dark-bg border border-dark-border text-t-secondary hover:text-white disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <label className={label} htmlFor={`lp-${sectionKey}-${photo.captionLeaf}`}>
                  {t('landing_pages.editor.field_caption', FIELD_FALLBACK.caption)}
                </label>
                <input
                  id={`lp-${sectionKey}-${photo.captionLeaf}`}
                  className={input}
                  maxLength={191}
                  value={content[photo.captionLeaf] ?? ''}
                  onChange={e => onFieldChange(photo.captionLeaf, e.target.value)}
                />
                {photo.isDefault && (
                  <p className="text-xs text-t-secondary/80 mt-1">
                    {t('landing_pages.editor.photo_is_the_designs', 'This photo comes with your design. Add your own to replace it.')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-t-secondary">{t('landing_pages.editor.no_photos', 'No photos yet')}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || full}
          onChange={onPick}
          aria-label={t('landing_pages.editor.add_photos', 'Add photos')}
          className="block w-full max-w-xs text-xs text-t-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-dark-border file:bg-dark-bg file:text-t-secondary file:text-xs hover:file:text-white disabled:opacity-50"
        />
        {uploadMut.isPending && (
          <span className="text-xs text-t-secondary">{t('landing_pages.editor.photo_uploading', 'Uploading…')}</span>
        )}
        {!busy && justSaved && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <Check size={12} /> {t('landing_pages.editor.photo_saved', 'Saved')}
          </span>
        )}
      </div>

      {/* At the cap the count is REPLACED by the reason rather than joined
          by one: "8 of 8" alone is a fact about the gallery, not an
          explanation of why the picker just stopped working — and the
          picker going quietly grey with no sentence beside it is exactly
          the refusal-without-a-reason this screen's other caps already
          refuse to ship. */}
      <p className="text-xs text-t-secondary/80 leading-relaxed">
        {full && limit > 0
          ? t('landing_pages.editor.gallery_full', {
            limit,
            defaultValue: 'You have {{limit}} photos — that is as many as one gallery can hold. Remove one to add another.',
          })
          : t('landing_pages.editor.gallery_count', {
            used,
            limit,
            defaultValue: '{{used}} of {{limit}} photos',
          })}
      </p>
    </div>
  )
}
