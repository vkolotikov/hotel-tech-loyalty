/**
 * "How your page appears in search and when shared" — the pure half
 * (template fidelity 1.5).
 *
 * THE COLUMN WAS ACCEPTED AND WRITTEN BY NOTHING. `PUT /v1/admin/landing-
 * pages` has validated `seo` as a scalar map since the column existed, and
 * `LandingEditor.tsx` has always put `seo: body.seo ?? {}` on the wire — but
 * no control anywhere ever set a key in it. Meanwhile both layouts read
 * `page.seo.description` into `<meta name="description">` AND into the
 * footer tagline, and `page.seo.title` into `<title>`, `og:title`, the h1
 * fallback and the legal name. So every published page shipped an empty
 * meta description and a footer with no tagline, and no tenant could fix
 * it. All three of the author's kits write a real tagline.
 *
 * Pure — no React, no DOM, no i18next — because this repo's vitest is
 * node-env, pure-function-only (`vitest.config.ts`'s own docblock), and the
 * two things worth proving here (what the tenant will actually see in a
 * search result, and what reaches the wire) are both plain functions.
 */

/**
 * How much of a title Google renders before it truncates, and how much of a
 * description.
 *
 * APPROXIMATE BY NATURE and treated as such: the real limit is pixel width
 * in a proportional face, not characters, and it moves. These are the widely
 * used character approximations, and they are used for ONE thing — where the
 * preview below puts its ellipsis — never to refuse a keystroke. A tenant
 * whose tagline runs long gets to see it run long.
 */
export const SEO_TITLE_PREVIEW = 60
export const SEO_DESCRIPTION_PREVIEW = 155

/**
 * The hard caps on the two inputs.
 *
 * Generous, and about the COLUMN rather than about search: `seo` is a
 * schemaless JSON column with no per-key length rule server-side, and these
 * exist so a paste of an entire article cannot quietly become a page's
 * `<title>`. Well clear of the preview lengths above, so the cap is never
 * what stops a tenant writing a sentence that reads well.
 */
export const SEO_TITLE_MAX = 120
export const SEO_DESCRIPTION_MAX = 320

/** One `seo` leaf as a string, or '' for every shape that is not one — the
 *  column is schemaless and a number, a bool or a nested object are all
 *  things a raw write can legally have left in it. */
export function seoField(seo: Record<string, unknown> | null | undefined, key: string): string {
  const value = seo == null || typeof seo !== 'object' ? undefined : seo[key]

  return typeof value === 'string' ? value : ''
}

/**
 * What the page will actually be called and described, given what the
 * tenant has typed and what the page already holds.
 *
 * MIRRORS THE LAYOUTS' OWN FALLBACK CHAIN, which both templates spell
 * identically: `seo.title ?? contact name ?? hero.headline ?? app name`.
 * Restated here rather than served because it is a Blade expression with no
 * endpoint behind it, and because the whole value of this card is that a
 * tenant sees the consequence of leaving the field EMPTY — which is the
 * state every page is in today.
 *
 * One deliberate difference from the Blade: `??` there means a stored empty
 * string wins and produces an empty `<title>`. `seoPayload` below is what
 * stops an empty string ever being stored, so this preview treats blank as
 * absent and the two agree.
 */
export function searchPreview(args: {
  title: string
  description: string
  /** The tenant's own business name, as the editor already resolves it. */
  businessName: string
  /** `content.hero.headline`, the layouts' third fallback. */
  headline: string
  /** The page's public address, shown the way a search result shows it. */
  url: string
}): { title: string; url: string; description: string; descriptionIsEmpty: boolean } {
  const title = firstFilled([args.title, args.businessName, args.headline])
  const description = args.description.trim()

  return {
    title: clip(title, SEO_TITLE_PREVIEW),
    url: args.url,
    description: clip(description, SEO_DESCRIPTION_PREVIEW),
    descriptionIsEmpty: description === '',
  }
}

/**
 * The `seo` object a save should carry.
 *
 * BLANK IS REMOVED, NOT STORED, and that is the one rule here worth having.
 * `update()` replaces the column wholesale, and both layouts read it with
 * `??` — so a stored `''` is NOT the same as an absent key: it wins the
 * fallback chain and publishes an empty `<title>` and an empty
 * `<meta name="description">`. A tenant who types a tagline and then clears
 * it must end up back where they started, not worse off than a tenant who
 * never touched the card.
 *
 * Every OTHER key already in the column is carried through untouched: this
 * card owns two of them, and a `seo` leaf written by something else (or by
 * a later phase) is not this control's to drop.
 */
export function seoPayload(
  seo: Record<string, unknown> | null | undefined,
  patch: { title?: string; description?: string },
): Record<string, unknown> {
  const out: Record<string, unknown> = seo != null && typeof seo === 'object' && !Array.isArray(seo)
    ? { ...seo }
    : {}

  for (const [key, value] of Object.entries(patch)) {
    const trimmed = (value ?? '').trim()

    if (trimmed === '') delete out[key]
    else out[key] = trimmed
  }

  return out
}

/** The first entry with something in it, trimmed, or ''. */
function firstFilled(candidates: string[]): string {
  for (const candidate of candidates) {
    const trimmed = (candidate ?? '').trim()
    if (trimmed !== '') return trimmed
  }

  return ''
}

/** Cut to a length with an ellipsis, on a word boundary where there is one
 *  nearby — a preview that severs a word mid-syllable reads as broken
 *  rather than as truncated. */
function clip(value: string, limit: number): string {
  if (value.length <= limit) return value

  const cut = value.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')

  return (lastSpace > limit - 15 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}
