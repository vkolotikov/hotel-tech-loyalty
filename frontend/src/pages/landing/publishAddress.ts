/**
 * Pure logic for the web-address / publish / unpublish block Task 10 adds
 * to `LandingEditor.tsx` — split out for the same reason as every other
 * pure module in this folder (`editorSections.ts`, `previewFreshness.ts`,
 * `landingDraft.ts`, `wizardGate.ts`): this repo's vitest is
 * pure-function-only (no jsdom, no React Testing Library — see
 * `vitest.config.ts`'s own docblock), so nothing about the rendered
 * component itself — the toggle firing, the confirm dialogs, the actual
 * PUT/POST round-trips — can be exercised by an automated test here.
 *
 * Two concerns live in this one file rather than two, because both belong
 * to the same new UI block and neither is large enough to earn its own
 * module: building the address a tenant sees/copies/edits, and deriving
 * the live-vs-draft banner's copy from the page's own state. The word
 * "slug" never appears in anything this module returns to a caller —
 * spec §9 — even though `LandingPage.slug` is what it reads.
 */

/**
 * `App\Models\LandingPage::getUrlAttribute()` (Task 10) is the ONE place
 * that knows how to build the tenant's full public address — off the
 * `landing.show` named route, the same domain-bound mechanism
 * `previewUrl()` already uses for `landing.preview`. Nothing here
 * reimplements scheme+host: every function below only ever repoints the
 * PATH of an already-real `page.url`, so this file can never independently
 * drift from what `config('landing.host')` actually is in any environment.
 */

/**
 * A cosmetic, NEVER-authoritative preview of what a typed business name or
 * in-progress address will normalise to. The server (`LandingSlug::normalise`,
 * `Illuminate\Support\Str::slug`) is the only thing that actually decides
 * what gets stored — it transliterates accented characters ("Café Mimi" →
 * "cafe-mimi"), which this deliberately does NOT attempt to replicate: a
 * second, partial reimplementation of that rule is exactly the "two
 * implementations of one fact" shape this whole phase has repeatedly had to
 * fix (Ruling 4, Ruling 6, Task 4's whole fix history). This only has to be
 * close enough that a tenant typing a plain ASCII name sees something
 * sensible while they type; the real value submitted is the tenant's raw
 * (trimmed) input, which the server then normalises for real.
 */
export function previewSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The host (and port, if any — `sites.localhost:8000` in local dev) a
 * page's address lives on, read off its own `url` rather than any
 * frontend-held copy of `config('landing.host')` (there isn't one — see
 * this file's top docblock). Falls back to the input unchanged if it is
 * not a parseable absolute URL, which should not happen for a real
 * `page.url` but must not throw the render if it somehow did.
 */
export function addressHost(pageUrl: string): string {
  try {
    return new URL(pageUrl).host
  } catch {
    return pageUrl
  }
}

/**
 * `pageUrl` with its path replaced by `rawSlug`, cosmetically normalised
 * via `previewSlug()`. Used for: the "this will be your new address"
 * preview while editing, and the "new address after you save" line for a
 * queued-but-unsaved rename — never for what is actually submitted to the
 * server, which sends the tenant's raw typed text and lets
 * `LandingPageGuard::validatedSlug()` be the one real authority on it.
 *
 * Falls back to `pageUrl` unchanged if it is not a parseable absolute URL
 * — same reasoning as `addressHost()`.
 */
export function buildAddressUrl(pageUrl: string, rawSlug: string): string {
  try {
    const u = new URL(pageUrl)
    u.pathname = '/' + previewSlug(rawSlug)
    return u.toString()
  } catch {
    return pageUrl
  }
}

export type PageStatus = 'draft' | 'published'

/**
 * The live/draft banner's copy, as i18n key + inline-default pairs rather
 * than already-translated strings, so the caller is the one thing that
 * calls `t()` (keeping every translation call in the component, matching
 * house convention) while this function stays a plain, testable mapping
 * from state to WHICH copy applies.
 *
 * `dirty` only changes anything while `status === 'published'`: a draft
 * page is invisible to the public regardless of what is or is not saved,
 * so there is nothing for an unsaved-edit note to warn about there. A
 * published page's live copy is always exactly its last SAVE — never its
 * current unsaved form state (no optimistic updates, same rule the
 * preview pane's own caption states) — so `dirty` here is what tells a
 * tenant their next edit has not reached the public yet.
 */
export type VisibilityState = {
  tone: 'live' | 'draft'
  headlineKey: string
  headlineFallback: string
  noteKey: string | null
  noteFallback: string | null
}

export function pageVisibilityState(status: PageStatus, dirty: boolean): VisibilityState {
  if (status === 'published') {
    return {
      tone: 'live',
      headlineKey: 'landing_pages.editor.status_live',
      headlineFallback: 'Live — anyone can see this page',
      noteKey: dirty ? 'landing_pages.editor.status_live_dirty' : null,
      noteFallback: dirty
        ? 'You have unsaved changes. The live page still shows your last saved version.'
        : null,
    }
  }

  return {
    tone: 'draft',
    headlineKey: 'landing_pages.editor.status_draft',
    headlineFallback: 'Not public yet — only you can see this page',
    noteKey: null,
    noteFallback: null,
  }
}
