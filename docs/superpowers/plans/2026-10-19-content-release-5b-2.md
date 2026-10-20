# HexaTech Content — Release 5b, Plan 2: the Portal for Tracked Links and the Link-in-Bio Page; Release Checks; Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portal half of release 5b "measure it" (spec §5.5, §6.4, §7.3) on Plan 5B-1's server, prove the whole release with the spec's checks (§8), and deploy it (§9) after the owner's final "yes, deploy".

**Architecture:**
- **One data layer:** `lib/types.ts`, `lib/api.ts`, `lib/errors.ts` and `lib/planCache.ts` learn the server's new fields (`link` on a post, `clicks` on a card, the bio page), calls (`bio`, `saveBio`, `link` on a save) and refusal families (`link`, `bio`). The server's `GET bio` gains `base_url` (one line) so the editor can show the address of a name not saved yet.
- **The panel:** a **Link** field after the call to action; under it, `ShortLink` shows the short link with Copy, its clicks (all and from the bio page) and 14 bars named for screen readers, or a line saying what saving will do (make, keep, switch off, switch back on). A refused Link marks the field and uses the Link's own words.
- **Cards:** a click count from 1 (`CardFlags`), and in a Plan card's name.
- **The Brand page:** a **Link-in-bio** section after Channels (`LinkInBioSection`): everyone reads it (staff get the address with Copy while it is on); managers edit the page and its buttons in one save (switch, name with the full address and a rename warning, title, line, latest posts, buttons with add, move and remove), the portal checking first.
- **Then** the runbook, the release checks (every PHP folder, the frontend suites, the build, Appointments pixel for pixel, a browser pass as a manager and a staff member that follows a real short link and opens the public page, Lighthouse including the public page, eyes) and the deploy of release 5b (Plans 5B-1 + 5B-2 together) by the source-patch recipe.

**Tech Stack:** React 19 + TypeScript + Vite, TanStack Query, react-i18next (five bundles), Tailwind tokens (`a-*`, `c-*`), vitest in node with `renderToStaticMarkup`; Laravel 13 / PHP 8.4.20 for the checks; Playwright (headless shell) and Lighthouse 13.5 for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (approved 2026-10-19), §5.5, §6.4, §7 (5b), §8, §9. The server half is Plan `docs/superpowers/plans/2026-10-19-content-release-5b-1.md` (built, reviewed, fixed; feature tip `250c784da`; its ledger and eyes tools `.superpowers/sdd/archive/2026-10-19-content-release-5b-1/`).

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `250c784da` plus this plan's commit. Production is release 5a: prod main `afbacf056` = the source of feature tip `ceda0c4aa` + a build. The local database already has release 5b's four migrations (applied by Plan 5B-1). The server endpoints this plan uses (all under `/api/v1/admin/content`, `?brand_id=` as today):
- `POST posts` and `PUT posts/{id}` take `link` (an address, or null / '' to switch the short link off); `bad_link` 422 for anything but an http(s) address of up to 2,000 characters.
- `GET posts/{id}` (and every post answer) → `post.link`: `{code, short_url, destination, on, clicks, clicks_bio, days: [{day, clicks}] ×14 oldest first}` or null for a post that never had a Link; every card → `clicks` (0 without a Link).
- `GET bio` → `{page: {is_on, slug, title, line, show_posts} | null, buttons: [{id, label, destination, short_url, clicks_30d}], url, suggested_name, base_url}` (`base_url` from Task 1); `PUT bio` (owners and managers) with `{is_on, slug, title, line, show_posts, buttons: [{id?, label, destination}]}` → the same shape; refusals `bio_name_invalid` 422, `bio_name_taken` 409, `too_many_buttons` 422, `bad_link` 422, `manager_only` 403, `invalid` 422 (`errors` keyed like `buttons.0.label`, `title`).
- Public host: `GET /go/{code}` (302 with tags, `no-store`; a switched-off code 404 "This link is no longer active"), `GET /links/{name}`.

**Design calls beyond the spec** (each pinned by a test or a comment):
- **The panel says what a save will do to a short link already made**: a new address keeps the code ("it will lead to the new address, also from posts already out"); an emptied field switches it off; an address typed into a switched-off one switches it back on. Before the first save of a Link, "The short link appears once the post is saved." — shown once something is typed (an empty field says nothing).
- **The bars are percent heights of the busiest day** (a day with clicks at least 8 %), drawn with an inline `height` style as the readiness bars already are (the portal is not under the landing CSP); each bar's day and count is an `sr-only` line.
- **The name field types lowercase**, spaces becoming hyphens; the portal checks the name's shape, each button's label and address, and the count of eight before sending (`bioProblems`); the server stays the judge (`bio_name_taken`, reserved words).
- **Renaming a saved page warns inline** ("The old address stops working when you save: …"), no dialog.
- **The keyboard follows the buttons**: after a move, the moved row's same arrow (its other arrow at an end); after a removal, the next row's Remove, else the previous one's, else "Add a button" (`focusAfterMove`, `focusAfterRemove`).
- **Staff see only the address with Copy while the page is on**, "The page is not switched on." otherwise; managers also get Open page, the settings and each button's clicks for 30 days.
- **The click count on cards uses the pointer icon and "Clicks: N"** (the bundles' counted words put the number after a colon).
- **The three questions from Plan 5B-1's review stay open for the owner** (utm_medium for email and blog posts, the Pinterest robot match, the shared-domain risk of short links); this plan builds the spec as written and repeats them at the deploy question.

## Global Constraints

- **Branch:** never push the feature branch; never commit its built `frontend/dist`, `public/spa` or `resources/spa-shell`. Only Task 7 pushes, and only after the owner's explicit "yes, deploy" given at Task 7's question (an earlier "yes, deploy" does not carry over).
- **Ledger and tools:** `$R` = `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2`; shell state does not survive between tool calls, so every command that uses it starts with `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2`. Task 1, Step 1 sets it up with `vt.sh` (vitest on paths, honest exit code), `words.mjs` (locale keys inserted into the five bundles without reformatting them, from a JSON spec), `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R/extract.mjs $R/task-N-brief.md "<line naming the file>" <path>`) from 5A-2's archive.
- **Appending to a test file:** a block the plan says to append is extracted to `$R/append.txt` and added with `cat "$R/append.txt" >> <file>` (never a heredoc).
- **Frontend commands** (Git Bash): types `cd frontend && npx tsc -b`; tests `$R/vt.sh <paths…>` (paths relative to `frontend/`); scoped lint `cd frontend && npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts`.
- **Baselines** (Task 1, Step 1 measures them again and ledgers them): the full vitest run has exactly 3 failures (`src/lib/plannerMeta.test.ts`); the scoped lint has exactly 17 errors. Anything else is ours.
- **Tests cannot click** (`vitest.config.ts`: node environment, no jsdom). Every click rule lives in a pure helper with its own test; components are rendered with `renderToStaticMarkup` and checked by their markup. Static markup escapes `'` as `&#x27;`: English words the tests look for use the typographic `’`. Adjacent text nodes render with `<!-- -->` between them: a line the tests look for is built as one string.
- **Types:** every new field on a type that literal test fixtures build (`PostCard`, `PostDetail`) is optional, so the fixtures still compile; `PostForm` gains `link: string` (built only by `formOf` and `newForm`).
- **Words:** every new literal `content.*` key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`), inserted with `cd /c/wamp64/www/Hexa-Tech-content && node $R/words.mjs $R/tN-words.json` from a JSON spec the plan gives (keys from the bundle root, each with `en`, `ru`, `de`, `fr`, `es`), written with the Write tool. Keys built at run time go into `FAMILIES` in `content/i18n/contentLocales.test.ts`; a word holding a count puts the number after a colon (`COUNTED` in the same test). German is formal (Sie), Spanish informal (tú), French formal (vous), as the bundles are.
- **Refusals:** a new family in `lib/errors.ts` (`ERRORS`) must deep-equal `en.<family>.error` (`errors.test.ts`); the portal's own sentence for every refusal; the server's message is never shown.
- **Portal rules (`content/tokens.test.ts`):** nothing imported from `src/appointments`; no bare `hover:-translate-*`; no text under 12 px; only `a-*` / `c-*` colour classes (this plan uses `text-a-text`, `text-a-text-2`, `text-a-danger`, `text-a-accent-text`, `bg-a-accent`, `bg-a-surface`, `bg-a-surface-2`, `bg-a-border`, `border-a-border`, `border-a-danger`, all already in use).
- **React lint:** no synchronous `setState` inside an effect; no `ref.current` read during render; no component defined inside another; a component file exports components only (helpers live in `*.ts` files).
- **Appointments and the shared workspace core (`src/appointments`, `src/workspace`) do not change in this plan:** the release checks expect `46 screens, 0 differ`.
- **PHP:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by folder, in the foreground (`$R/php.sh <paths…>`); never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace — write code holding backslashes with the Write or Edit tool (or `extract.mjs`), never a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A Link already out in the world, edited or cleared:** before the save, the panel says that a new address keeps the short link (and so changes where old posts lead) and that an empty field switches it off.
   - Pinned by Task 2's `linkMath.test.ts` ("warns that clearing switches the short link off, and that a new address keeps the code") and `shortLink.test.tsx`.
2. **Renaming a link-in-bio page that is already live:** the editor names the old address that will stop working; a new page or the same name says nothing.
   - Pinned by Task 4's `bioForm.test.ts` (`renamedFrom`) and `linkInBio.test.tsx` ("warns that the old address stops working…").
3. **A save refused for its Link:** the Link field is marked and the Link's own sentence is shown, not "The post could not be saved".
   - Pinned by Task 2's `panelState.test.ts` (`refusalOf`).
4. **A keyboard user reordering or removing buttons:** the keyboard stays on the moved button's row (its other arrow at an end), and after a removal goes to the next Remove, else "Add a button".
   - Pinned by Task 4's `bioForm.test.ts` (`focusAfterMove`, `focusAfterRemove`) and the pass's B2 check.
5. **A brand with no page yet, or a page switched off:** staff are told it is not switched on (never a dead address to copy); managers get "Set up the page".
   - Pinned by Task 4's `linkInBio.test.tsx` ("gives staff the address with Copy while the page is on…", "offers managers to set the page up…").

---

## File map

- **Task 1 (the data layer):** `frontend/src/content/lib/types.ts`, `lib/api.ts`, `lib/errors.ts`, `lib/planCache.ts`; `app/Services/Content/ContentBio.php` (`base_url`); tests `lib/api.test.ts`, `lib/errors.test.ts`, `lib/planCache.test.ts`, `tests/Feature/Content/BioEditorTest.php`; words (`link`, `bio` refusals).
- **Task 2 (the panel's Link):** new `panel/linkMath.ts`, new `panel/ShortLink.tsx`, new `ui/CopyButton.tsx`; `panel/panelState.ts`, `panel/PostFormFields.tsx`, `panel/PostPanel.tsx`; tests new `panel/linkMath.test.ts`, new `panel/shortLink.test.tsx`, `panel/panelState.test.ts`, `panel/postFormFields.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 3 (click counts on cards):** `lib/approval.ts`, `ui/CardFlags.tsx`, `plan/PostCardView.tsx`; tests `lib/approval.test.ts`, `ui/cardFlags.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 4 (Link-in-bio on the Brand page):** new `brand/bioForm.ts`, new `brand/sections/LinkInBio.tsx`; `brand/BrandPage.tsx`; tests new `brand/bioForm.test.ts`, new `brand/linkInBio.test.tsx`, `i18n/contentLocales.test.ts`; words.
- **Task 5 (runbook):** `docs/content-workspace.md`.
- **Task 6 (release checks):** files under `$R` only (seed/unseed, the browser pass, Lighthouse), plus test-first fixes of any defect found.
- **Task 7 (deploy):** a temporary deploy worktree on branch `deploy/content-r5b`.

---

### Task 1: The data layer — types, calls, refusal words, the card's clicks, the editor's base address

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `frontend/src/content/lib/api.ts`, `frontend/src/content/lib/errors.ts`, `frontend/src/content/lib/planCache.ts`, `app/Services/Content/ContentBio.php`
- Test: `frontend/src/content/lib/api.test.ts`, `frontend/src/content/lib/errors.test.ts`, `frontend/src/content/lib/planCache.test.ts`, `tests/Feature/Content/BioEditorTest.php`
- Words: `$R/t1-words.json`

**Interfaces:**
- Produces (types): `ShortLinkFacts {code, short_url, destination: string | null, on, clicks, clicks_bio, days: {day: DateKey; clicks: number}[]}`; `BioPage {is_on, slug, title: string | null, line: string | null, show_posts}`; `BioButton {id, label, destination: string | null, short_url: string | null, clicks_30d}`; `BioPayload {page: BioPage | null, buttons: BioButton[], url: string | null, suggested_name, base_url}`; `BioBody {is_on, slug, title: string | null, line: string | null, show_posts, buttons: {id?: number; label: string; destination: string}[]}`; optional `PostCard.clicks?: number`, `PostDetail.link?: ShortLinkFacts | null`; `PostFields.link?: string | null`.
- Produces (calls on `contentApi(brand)`): `bio()` → `BioPayload`; `saveBio(body: BioBody)` → `BioPayload`; `savePost` / `createPost` carry `link`.
- Produces (refusals): families `link` (`bad_link`, `unknown`) and `bio` (`bio_name_invalid`, `bio_name_taken`, `too_many_buttons`, `bad_link`, `invalid`, `manager_only`, `no_profile`, `unknown`).
- Produces (cache): `cardOf` carries `clicks`.
- Produces (server): `GET bio` / `PUT bio` answer `base_url` (the page address without a name, e.g. `https://sites.hexa-tech.uk/links/`).

- [ ] **Step 1: Set up the ledger and measure the baselines**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-19-content-release-5b-2.md)
A=.superpowers/sdd/archive/2026-10-19-content-release-5a-2
cp "$A/vt.sh" "$A/words.mjs" "$A/php.sh" "$A/extract.mjs" "$R/" && chmod +x "$R/vt.sh" "$R/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-19-content-release-5b-2.md" > "$R/progress.md"
echo "$R"; ls "$R"; grep -n "^cd " "$R/php.sh" "$R/vt.sh"
cd frontend && npx vitest run > "$R/base-vitest.txt" 2>&1; tail -5 "$R/base-vitest.txt"; grep -E '^ FAIL ' "$R/base-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `$R` ends in `.superpowers/sdd/2026-10-19-content-release-5b-2`; the listing shows `extract.mjs php.sh plan-path progress.md vt.sh words.mjs`; both scripts `cd` into `/c/wamp64/www/Hexa-Tech-content`; vitest `Tests  3 failed | … passed` with the only `FAIL` file `src/lib/plannerMeta.test.ts`; lint `✖ 17 problems (17 errors, 0 warnings)`. Ledger: `Task 1: note: baselines — vitest <n> passed + 3 plannerMeta; lint 17`. If either baseline differs, ledger the new numbers and use them from here on.

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/content/lib/api.test.ts` (extract the block to `$R/append.txt`, then `cat "$R/append.txt" >> frontend/src/content/lib/api.test.ts`):

```ts

describe('release 5b calls (spec 2026-10-19 §5, §6)', () => {
  it('sends a post’s Link with a save and a new post, and reads and saves the link-in-bio page under the prefix', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.savePost(9, { link: 'https://lumiere.example/autumn', updated_at: 'x' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/posts/9?brand_id=5', body: { link: 'https://lumiere.example/autumn' } })
    await api.createPost({ platform: 'instagram', link: null })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts?brand_id=5', body: { platform: 'instagram', link: null } })
    await api.bio()
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/bio?brand_id=5' })
    const body = {
      is_on: true, slug: 'lumiere', title: null, line: null, show_posts: true,
      buttons: [{ id: 4, label: 'Book', destination: 'https://lumiere.example/book' }, { label: 'Gifts', destination: 'https://lumiere.example/gifts' }],
    }
    await api.saveBio(body)
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/bio?brand_id=5', body })
  })
})
```

Append to `frontend/src/content/lib/errors.test.ts` (same way):

```ts

describe('release 5b refusals (spec 2026-10-19 §7.3)', () => {
  it('words a bad Link and the link-in-bio page’s refusals in the portal’s own sentence', () => {
    expect(errorKey('link', 'bad_link')).toEqual(['content.link.error.bad_link', 'The link must be a web address that starts with http:// or https://.'])
    expect(errorKey('bio', 'bio_name_taken')).toEqual(['content.bio.error.bio_name_taken', 'Another page already has this name. Choose another one.'])
    expect(errorKey('bio', 'bio_name_invalid')[0]).toBe('content.bio.error.bio_name_invalid')
    expect(errorKey('bio', 'too_many_buttons')).toEqual(['content.bio.error.too_many_buttons', 'A page has at most 8 buttons.'])
    expect(errorKey('bio', 'bad_link')[0]).toBe('content.bio.error.bad_link')
    expect(errorKey('bio', 'whatever')[0]).toBe('content.bio.error.unknown')
  })
})
```

Append to `frontend/src/content/lib/planCache.test.ts` (same way):

```ts

describe('cardOf, release 5b', () => {
  it('carries the card’s clicks (spec 2026-10-19 §5.5)', () => {
    const detail = { ...card(5, '2026-10-07', { clicks: 6 }), language: 'en', main_copy: 'Text', hashtags: [], link: null } as unknown as PostDetail
    expect(cardOf(detail).clicks).toBe(6)
  })
})
```

In `tests/Feature/Content/BioEditorTest.php`, replace:

```php
            ->assertExactJson(['page' => null, 'buttons' => [], 'url' => null, 'suggested_name' => 'lumiere-riga']);
```

with:

```php
            ->assertExactJson([
                'page' => null, 'buttons' => [], 'url' => null, 'suggested_name' => 'lumiere-riga',
                // The address without a name: the editor shows the full address of a name not saved yet.
                'base_url' => 'http://' . config('landing.host') . '/links/',
            ]);
```

- [ ] **Step 3: Run them to see them fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; "$R/vt.sh" src/content/lib/api.test.ts src/content/lib/errors.test.ts src/content/lib/planCache.test.ts; "$R/php.sh" tests/Feature/Content/BioEditorTest.php
```

Expected: vitest fails the three new blocks (`api.bio is not a function`; `ERRORS.link` undefined; `clicks` undefined from `cardOf`); `BioEditorTest | … 1 failed` (`base_url` missing) and `exit 1`.

- [ ] **Step 4: The types, calls, refusals, cache and the base address**

In `frontend/src/content/lib/types.ts`, replace:

```ts
  /** Spec 2026-10-19 §4.1: who posts it, as stored (the panel's `poster` says whether they are still on the team). */
  poster_id?: number | null
}
```

with:

```ts
  /** Spec 2026-10-19 §4.1: who posts it, as stored (the panel's `poster` says whether they are still on the team). */
  poster_id?: number | null
  /** Spec 2026-10-19 §5.5: its short link's clicks in all (0 without a Link). */
  clicks?: number
}
```

replace:

```ts
  /** Who posts it: a member of the brand's team, or null for nobody (also someone who left) (spec 2026-10-19 §4.1). */
  poster?: Person | null
}
```

with:

```ts
  /** Who posts it: a member of the brand's team, or null for nobody (also someone who left) (spec 2026-10-19 §4.1). */
  poster?: Person | null
  /** Its tracked short link (spec 2026-10-19 §5.5); null when it never had a Link. */
  link?: ShortLinkFacts | null
}
```

replace:

```ts
/** Someone on the brand's team, for "Who posts it" (spec 2026-10-19 §4.1). */
export interface TeamMember { id: number; name: string; role: 'manager' | 'staff' }
```

with:

```ts
/** Someone on the brand's team, for "Who posts it" (spec 2026-10-19 §4.1). */
export interface TeamMember { id: number; name: string; role: 'manager' | 'staff' }

/** A post's short link and its clicks (spec 2026-10-19 §5.5): `on` false once its Link was cleared; `days` the last 14 venue days, oldest first. */
export interface ShortLinkFacts { code: string; short_url: string; destination: string | null; on: boolean; clicks: number; clicks_bio: number; days: { day: DateKey; clicks: number }[] }
/** A brand's link-in-bio page (spec §6): off until a manager switches it on; `title` null is the brand's name. */
export interface BioPage { is_on: boolean; slug: string; title: string | null; line: string | null; show_posts: boolean }
/** A button on it, with its short link and its clicks over the last 30 venue days. */
export interface BioButton { id: number; label: string; destination: string | null; short_url: string | null; clicks_30d: number }
/** `GET bio`: the page (null before its first save), its buttons in order, its address, a name to start from, and the address without a name. */
export interface BioPayload { page: BioPage | null; buttons: BioButton[]; url: string | null; suggested_name: string; base_url: string }
/** `PUT bio`: the whole page and its buttons in order; a button sent with its id keeps its short link. */
export interface BioBody { is_on: boolean; slug: string; title: string | null; line: string | null; show_posts: boolean; buttons: { id?: number; label: string; destination: string }[] }
```

and replace:

```ts
  /** Who posts it (spec 2026-10-19 §4.1): a member of the team, or null for nobody. */
  poster_id?: number | null
}
```

with:

```ts
  /** Who posts it (spec 2026-10-19 §4.1): a member of the team, or null for nobody. */
  poster_id?: number | null
  /** The Link (spec 2026-10-19 §5.1): an http(s) address, or null to switch its short link off. */
  link?: string | null
}
```

In `frontend/src/content/lib/api.ts`, replace:

```ts
  TimelineComment, Variation, VoiceFields, InboxPayload, TeamMember,
} from './types'
```

with:

```ts
  TimelineComment, Variation, VoiceFields, InboxPayload, TeamMember, BioBody, BioPayload,
} from './types'
```

and replace:

```ts
    setMorningEmail: (on: boolean): Promise<{ on: boolean }> => watched(api.put(url('me/morning-email'), { on })),
```

with:

```ts
    setMorningEmail: (on: boolean): Promise<{ on: boolean }> => watched(api.put(url('me/morning-email'), { on })),
    /** The link-in-bio page (spec 2026-10-19 §6.4): everyone reads it; a manager saves the page and its buttons in one call. */
    bio: (): Promise<BioPayload> => watched(api.get(url('bio'))),
    saveBio: (body: BioBody): Promise<BioPayload> => watched(api.put(url('bio'), body)),
```

In `frontend/src/content/lib/errors.ts`, replace:

```ts
    unknown: 'The versions could not be made. Please try again.',
  },
} as const
```

with:

```ts
    unknown: 'The versions could not be made. Please try again.',
  },
  // Release 5b (spec 2026-10-19 §5.1, §6.4). The bio page's `invalid` and `bad_link` are also the portal's own checks,
  // made before anything is sent.
  link: {
    bad_link: 'The link must be a web address that starts with http:// or https://.',
    unknown: 'The link could not be saved. Please try again.',
  },
  bio: {
    bio_name_invalid: 'Use 3 to 63 lowercase letters, digits and single hyphens, and not a word HexaTech keeps for itself.',
    bio_name_taken: 'Another page already has this name. Choose another one.',
    too_many_buttons: 'A page has at most 8 buttons.',
    bad_link: 'Each button needs a web address that starts with http:// or https://.',
    invalid: 'Some fields need attention.',
    manager_only: 'Only an owner or a manager can change the link-in-bio page.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The page could not be saved. Please try again.',
  },
} as const
```

In `frontend/src/content/lib/planCache.ts`, replace:

```ts
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id }
```

with:

```ts
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id, clicks } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id, clicks }
```

In `app/Services/Content/ContentBio.php`, replace:

```php
     * @return array{page: ?array<string, mixed>, buttons: list<array<string, mixed>>, url: ?string, suggested_name: string}
```

with:

```php
     * @return array{page: ?array<string, mixed>, buttons: list<array<string, mixed>>, url: ?string, suggested_name: string, base_url: string}
```

and replace:

```php
            'suggested_name' => self::suggestedName($profile, $page?->id),
        ];
```

with:

```php
            'suggested_name' => self::suggestedName($profile, $page?->id),
            // The address without a name, for the editor's preview of a name not saved yet.
            'base_url'       => Str::beforeLast(route('content.bio', ['name' => 'name']), 'name'),
        ];
```

Write `$R/t1-words.json` with the Write tool:

```json
{
  "link.error.bad_link": { "en": "The link must be a web address that starts with http:// or https://.", "ru": "Ссылка должна быть веб-адресом, который начинается с http:// или https://.", "de": "Der Link muss eine Webadresse sein, die mit http:// oder https:// beginnt.", "fr": "Le lien doit être une adresse web commençant par http:// ou https://.", "es": "El enlace debe ser una dirección web que empiece por http:// o https://." },
  "link.error.unknown": { "en": "The link could not be saved. Please try again.", "ru": "Не удалось сохранить ссылку. Попробуйте ещё раз.", "de": "Der Link konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "Le lien n’a pas pu être enregistré. Veuillez réessayer.", "es": "No se pudo guardar el enlace. Inténtalo de nuevo." },
  "bio.error.bio_name_invalid": { "en": "Use 3 to 63 lowercase letters, digits and single hyphens, and not a word HexaTech keeps for itself.", "ru": "Используйте от 3 до 63 строчных латинских букв, цифр и одиночных дефисов; слова, которые HexaTech оставляет за собой, не подходят.", "de": "Verwenden Sie 3 bis 63 Kleinbuchstaben, Ziffern und einzelne Bindestriche, und kein Wort, das HexaTech für sich vorbehält.", "fr": "Utilisez de 3 à 63 lettres minuscules, chiffres et tirets simples, et pas un mot que HexaTech garde pour lui.", "es": "Usa de 3 a 63 letras minúsculas, cifras y guiones sueltos, y no una palabra que HexaTech reserva para sí." },
  "bio.error.bio_name_taken": { "en": "Another page already has this name. Choose another one.", "ru": "Это имя уже занято другой страницей. Выберите другое.", "de": "Eine andere Seite hat diesen Namen schon. Wählen Sie einen anderen.", "fr": "Une autre page porte déjà ce nom. Choisissez-en un autre.", "es": "Otra página ya tiene este nombre. Elige otro." },
  "bio.error.too_many_buttons": { "en": "A page has at most 8 buttons.", "ru": "На странице может быть не больше 8 кнопок.", "de": "Eine Seite hat höchstens 8 Schaltflächen.", "fr": "Une page compte au plus 8 boutons.", "es": "Una página tiene como máximo 8 botones." },
  "bio.error.bad_link": { "en": "Each button needs a web address that starts with http:// or https://.", "ru": "Каждой кнопке нужен веб-адрес, который начинается с http:// или https://.", "de": "Jede Schaltfläche braucht eine Webadresse, die mit http:// oder https:// beginnt.", "fr": "Chaque bouton a besoin d’une adresse web commençant par http:// ou https://.", "es": "Cada botón necesita una dirección web que empiece por http:// o https://." },
  "bio.error.invalid": { "en": "Some fields need attention.", "ru": "Проверьте отмеченные поля.", "de": "Einige Felder müssen geprüft werden.", "fr": "Certains champs sont à vérifier.", "es": "Algunos campos necesitan revisión." },
  "bio.error.manager_only": { "en": "Only an owner or a manager can change the link-in-bio page.", "ru": "Изменять страницу ссылок может только владелец или менеджер.", "de": "Nur Inhaber oder Manager können die Link-in-Bio-Seite ändern.", "fr": "Seul un propriétaire ou un responsable peut modifier la page de liens.", "es": "Solo un propietario o un responsable puede cambiar la página de enlaces." },
  "bio.error.no_profile": { "en": "This brand is not set up yet.", "ru": "Бренд ещё не настроен.", "de": "Diese Marke ist noch nicht eingerichtet.", "fr": "Cette marque n’est pas encore configurée.", "es": "Esta marca aún no está configurada." },
  "bio.error.unknown": { "en": "The page could not be saved. Please try again.", "ru": "Не удалось сохранить страницу. Попробуйте ещё раз.", "de": "Die Seite konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "fr": "La page n’a pas pu être enregistrée. Veuillez réessayer.", "es": "No se pudo guardar la página. Inténtalo de nuevo." }
}
```

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R/words.mjs" "$R/t1-words.json"
```

Expected: the tool reports the ten keys added to each of the five bundles.

- [ ] **Step 5: Run the tests, the types and the Content folders**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R/vt.sh" src/content/lib src/content/i18n; "$R/php.sh" tests/Feature/Content/BioEditorTest.php tests/Feature/Content/
```

Expected: `TSC-CLEAN`; vitest all passed in `src/content/lib` and `src/content/i18n` (the bundles' key sets equal, `errors.test.ts` green); `BioEditorTest | Tests:    7 passed`, `tests/Feature/Content/ | Tests:    258 passed`, both `exit 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/types.ts frontend/src/content/lib/api.ts frontend/src/content/lib/errors.ts frontend/src/content/lib/planCache.ts frontend/src/content/lib/api.test.ts frontend/src/content/lib/errors.test.ts frontend/src/content/lib/planCache.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json app/Services/Content/ContentBio.php tests/Feature/Content/BioEditorTest.php && git commit -q -m "Content portal: the data layer for tracked links and the link-in-bio page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: The panel's Link, its short link and its clicks (spec §5.1, §5.5)

**Files:**
- Create: `frontend/src/content/panel/linkMath.ts`, `frontend/src/content/panel/ShortLink.tsx`, `frontend/src/content/ui/CopyButton.tsx`
- Modify: `frontend/src/content/panel/panelState.ts`, `frontend/src/content/panel/PostFormFields.tsx`, `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: create `frontend/src/content/panel/linkMath.test.ts`, `frontend/src/content/panel/shortLink.test.tsx`; modify `frontend/src/content/panel/panelState.test.ts`, `frontend/src/content/panel/postFormFields.test.tsx`
- Words: `$R/t2-words.json`

**Interfaces:**
- Consumes: Task 1's `ShortLinkFacts`, `PostDetail.link`, `PostFields.link`, family `link`.
- Produces: `PostForm.link: string`; `refusalOf(code: string, fields?: Record<string, string[]>): { invalid: (keyof PostForm)[]; family: 'save' | 'link' }` (panelState); `LinkState = 'none' | 'pending' | 'live' | 'moving' | 'clearing' | 'off' | 'reviving'`, `LINK_NOTES`, `linkState(typed: string, link: ShortLinkFacts | null | undefined): LinkState`, `barsOf<T extends { clicks: number }>(days: readonly T[]): (T & { height: number })[]` (linkMath); component `ShortLink({ typed, link })`; component `CopyButton({ text, label })` (ui, Task 4 uses it); `PostFormFields` takes `link?: ShortLinkFacts | null`.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/panel/linkMath.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { ShortLinkFacts } from '../lib/types'
import { LINK_NOTES, barsOf, linkState } from './linkMath'

const link = (more: Partial<ShortLinkFacts> = {}): ShortLinkFacts => ({
  code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true,
  clicks: 0, clicks_bio: 0, days: [], ...more,
})

describe('the short link’s note (spec 2026-10-19 §5.1, §5.5)', () => {
  it('says nothing without a Link, and that the short link comes once the post is saved when one is typed', () => {
    expect(linkState('', null)).toBe('none')
    expect(linkState('   ', undefined)).toBe('none')
    expect(linkState('https://lumiere.example', null)).toBe('pending')
  })

  // Review Focus 1: a Link already out in the world.
  it('warns that clearing switches the short link off, and that a new address keeps the code', () => {
    expect(linkState('https://lumiere.example/autumn', link())).toBe('live')
    expect(linkState(' https://lumiere.example/autumn ', link())).toBe('live')
    expect(linkState('https://lumiere.example/winter', link())).toBe('moving')
    expect(linkState('', link())).toBe('clearing')
  })

  it('says a switched-off short link is off, and that a typed address switches it back on', () => {
    expect(linkState('', link({ on: false, destination: null }))).toBe('off')
    expect(linkState('https://lumiere.example', link({ on: false, destination: null }))).toBe('reviving')
  })

  it('reads in the English bundle’s words', () => {
    expect(en.links.note).toEqual(LINK_NOTES)
  })
})

describe('the click bars (spec §5.5)', () => {
  it('give each day its share of the busiest day; a day with clicks never vanishes, a day without is empty', () => {
    expect(barsOf([{ day: 'a', clicks: 0 }, { day: 'b', clicks: 10 }, { day: 'c', clicks: 5 }]).map(b => b.height)).toEqual([0, 100, 50])
    expect(barsOf([{ day: 'a', clicks: 1 }, { day: 'b', clicks: 200 }]).map(b => b.height)).toEqual([8, 100])
    expect(barsOf([{ day: 'a', clicks: 0 }, { day: 'b', clicks: 0 }]).map(b => b.height)).toEqual([0, 0])
    expect(barsOf([])).toEqual([])
  })
})
```

Write `frontend/src/content/panel/shortLink.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))

import type { ShortLinkFacts } from '../lib/types'
import { ShortLink } from './ShortLink'

const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, clicks: i === 13 ? 4 : i === 12 ? 2 : 0 }))
const link: ShortLinkFacts = {
  code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true,
  clicks: 9, clicks_bio: 3, days,
}

describe('the short link under the Link field (spec 2026-10-19 §5.5)', () => {
  it('says nothing without a Link, and that the short link comes with the save when one is typed', () => {
    expect(renderToStaticMarkup(<ShortLink typed="" link={null} />)).toBe('')
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example" link={null} />)).toContain('The short link appears once the post is saved.')
  })

  it('shows the short link with Copy, the clicks and those from the bio page, and 14 bars each named for a screen reader', () => {
    const html = renderToStaticMarkup(<ShortLink typed="https://lumiere.example/autumn" link={link} />)
    expect(html).toContain('https://sites.hexa-tech.uk/go/abc2345')
    expect(html).toContain('Copy</button>')
    expect(html).toContain('Clicks: 9')
    expect(html).toContain('From the link-in-bio page: 3')
    expect(html).toContain('Clicks per day, last 14 days')
    expect(html.match(/<li/g)?.length).toBe(14)
    expect(html).toContain('<span class="sr-only">14 Oct: 4</span>')
    expect(html).toContain('<span class="sr-only">1 Oct: 0</span>')
    expect(html).not.toContain('Saving')
  })

  // Review Focus 1
  it('warns before a save moves or clears it, and says when it is off, without Copy', () => {
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example/winter" link={link} />)).toContain('Saving keeps this short link: it will lead to the new address, also from posts already out.')
    expect(renderToStaticMarkup(<ShortLink typed="" link={link} />)).toContain('Saving without a link switches this short link off')
    const off = renderToStaticMarkup(<ShortLink typed="" link={{ ...link, on: false, destination: null }} />)
    expect(off).toContain('This short link is switched off. Enter a link to switch it back on.')
    expect(off).toContain('switched off')
    expect(off).not.toContain('Copy</button>')
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example" link={{ ...link, on: false, destination: null }} />)).toContain('Saving switches this short link back on.')
  })
})
```

In `frontend/src/content/panel/panelState.test.ts`, replace:

```ts
import { BRIEF_TEXT, REWRITE_TEXT, changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, withChannels } from './panelState'
```

with:

```ts
import { BRIEF_TEXT, REWRITE_TEXT, changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, refusalOf, withChannels } from './panelState'
```

and replace:

```ts
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair', poster_id: '',
```

with:

```ts
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair', poster_id: '', link: '',
```

Append to `frontend/src/content/panel/panelState.test.ts` (via `$R/append.txt`):

```ts

describe('the Link (spec 2026-10-19 §5.1)', () => {
  const facts = { code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true, clicks: 0, clicks_bio: 0, days: [] }
  const withLink: PostDetail = { ...detail, link: facts }

  it('holds the short link’s address, and none for a post without one or with its short link off', () => {
    expect(formOf(withLink).link).toBe('https://lumiere.example/autumn')
    expect(formOf(detail).link).toBe('')
    expect(formOf({ ...withLink, link: { ...facts, on: false, destination: null } }).link).toBe('')
    expect(newForm({ date: '2026-10-09', platform: 'instagram' }, ['instagram']).link).toBe('')
  })

  it('sends a new address trimmed, null when emptied, nothing when unchanged; a new post sends one only when typed', () => {
    const base = formOf(withLink)
    expect(changes(base, { ...base, link: ' https://lumiere.example/winter ' })).toEqual({ link: 'https://lumiere.example/winter' })
    expect(changes(base, { ...base, link: '' })).toEqual({ link: null })
    expect(changes(base, base)).toEqual({})
    const fresh = newForm({ date: '2026-10-09', platform: 'instagram' }, ['instagram'])
    expect(createBody(fresh)).not.toHaveProperty('link')
    expect(createBody({ ...fresh, link: 'https://lumiere.example' })).toMatchObject({ link: 'https://lumiere.example' })
  })

  // Review Focus 3: a save refused for its Link says so in the Link's own words, on the Link.
  it('marks the Link and names its family when a save is refused for it; any other refusal as before', () => {
    expect(refusalOf('bad_link', undefined)).toEqual({ invalid: ['link'], family: 'link' })
    expect(refusalOf('invalid', { hook: ['too long'] })).toEqual({ invalid: ['hook'], family: 'save' })
    expect(refusalOf('unknown', undefined)).toEqual({ invalid: [], family: 'save' })
  })
})
```

Append to `frontend/src/content/panel/postFormFields.test.tsx` (via `$R/append.txt`):

```tsx

describe('the Link next to the call to action (spec 2026-10-19 §5.1, §5.5)', () => {
  const linked = (link: string, facts: import('../lib/types').ShortLinkFacts | null = null) => renderToStaticMarkup(
    <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), link }} onChange={() => {}}
      platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
      snippets={[]} link={facts} />,
  )

  it('is a web address field after the call to action and before the hashtags, saying the short link comes with the save', () => {
    const html = linked('https://lumiere.example')
    expect(html).toMatch(/Call to action[\s\S]*>Link<[\s\S]*type="url"[^>]*value="https:\/\/lumiere.example"[\s\S]*Hashtags/)
    expect(html).toContain('Where readers should go. HexaTech makes a short link that counts clicks.')
    expect(html).toContain('The short link appears once the post is saved.')
  })

  it('shows the saved post’s short link and its clicks under it', () => {
    const facts = { code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true, clicks: 2, clicks_bio: 0, days: [] }
    const html = linked('https://lumiere.example/autumn', facts)
    expect(html).toContain('https://sites.hexa-tech.uk/go/abc2345')
    expect(html).toContain('Clicks: 2')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; "$R/vt.sh" src/content/panel/linkMath.test.ts src/content/panel/shortLink.test.tsx src/content/panel/panelState.test.ts src/content/panel/postFormFields.test.tsx
```

Expected: failures — `./linkMath` and `./ShortLink` cannot be resolved; `formOf` has no `link`; `refusalOf` is not a function; no Link field in the panel's markup.

- [ ] **Step 3: The helpers, the short link, the Copy button, the field, the panel**

Write `frontend/src/content/panel/linkMath.ts` with the Write tool:

```ts
import type { ShortLinkFacts } from '../lib/types'

/** What the panel says about a post's short link while its Link field holds what the person typed (spec 2026-10-19 §5.1, §5.5). */
export type LinkState = 'none' | 'pending' | 'live' | 'moving' | 'clearing' | 'off' | 'reviving'

/** The notes' English words, the fallback under the bundles' (linkMath.test.ts keeps them equal to `links.note`). */
export const LINK_NOTES = {
  pending: 'The short link appears once the post is saved.',
  moving: 'Saving keeps this short link: it will lead to the new address, also from posts already out.',
  clearing: 'Saving without a link switches this short link off: anyone who taps it is told it is no longer active.',
  off: 'This short link is switched off. Enter a link to switch it back on.',
  reviving: 'Saving switches this short link back on.',
} as const

/**
 * The short link's state against the field: nothing without a Link; before its first save, that it comes with the save;
 * then live, or what saving the field would do — keep the code for a new address, switch it off when emptied, switch a
 * switched-off one back on.
 */
export function linkState(typed: string, link: ShortLinkFacts | null | undefined): LinkState {
  const address = typed.trim()
  if (!link) return address === '' ? 'none' : 'pending'
  if (!link.on) return address === '' ? 'off' : 'reviving'
  if (address === '') return 'clearing'
  return address === link.destination ? 'live' : 'moving'
}

/** The 14 bars (spec §5.5): each day's share of the busiest day, in percent; a day with clicks shows at least 8 %. */
export function barsOf<T extends { clicks: number }>(days: readonly T[]): (T & { height: number })[] {
  const most = Math.max(0, ...days.map(d => d.clicks))
  return days.map(d => ({ ...d, height: d.clicks <= 0 || most === 0 ? 0 : Math.max(8, Math.round((d.clicks / most) * 100)) }))
}
```

Write `frontend/src/content/ui/CopyButton.tsx` with the Write tool:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'

/**
 * Copies `text` (a short link, a page's address) and says so; where the browser refuses the clipboard (an insecure
 * page, a denied permission) it says to copy the text by hand. The status line is read out by screen readers.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = () => {
    // navigator.clipboard is missing on an insecure page: that throw becomes the refusal too.
    void Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => setState('copied'), () => setState('failed'))
  }
  const copied = t('content.common.copied', 'Copied')
  return (
    <>
      <Button size="sm" variant="secondary" onClick={copy}><Copy size={14} aria-hidden />{state === 'copied' ? copied : label}</Button>
      <span role="status" className={state === 'failed' ? 'text-xs text-a-danger' : 'sr-only'}>
        {state === 'failed' ? t('content.common.copy_failed', 'Could not copy. Select the text and copy it yourself.') : state === 'copied' ? copied : ''}
      </span>
    </>
  )
}
```

Write `frontend/src/content/panel/ShortLink.tsx` with the Write tool:

```tsx
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { ShortLinkFacts } from '../lib/types'
import { CopyButton } from '../ui/CopyButton'
import { LINK_NOTES, barsOf, linkState } from './linkMath'

/**
 * Under the Link field (spec 2026-10-19 §5.5): the short link with Copy, its clicks in all and from the bio page, and a
 * bar for each of the last 14 venue days, each named for a screen reader with its day and count. Before the first save
 * of a Link, and while an edit would move, clear or switch the short link back on, a line says what saving does.
 */
export function ShortLink({ typed, link }: { typed: string; link: ShortLinkFacts | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const state = linkState(typed, link)
  if (state === 'none') return null
  if (!link) return <p data-short-link-note="" className="text-xs text-a-text-2">{t('content.links.note.pending', LINK_NOTES.pending)}</p>
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.links.${key}`, english, vars)
  const bars = barsOf(link.days)
  return (
    <div data-short-link="" className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-a-text-2">{w('short', 'Short link')}</span>
        <span className={`min-w-0 break-all font-a-mono text-sm ${link.on ? 'text-a-text' : 'text-a-text-2'}`}>{link.short_url}</span>
        {link.on
          ? <CopyButton text={link.short_url} label={w('copy', 'Copy')} />
          : <span className="text-xs font-medium text-a-text-2">{`(${w('off_badge', 'switched off')})`}</span>}
      </div>
      {state !== 'live' && state !== 'pending' && <p className="text-xs text-a-text-2">{t(`content.links.note.${state}`, LINK_NOTES[state])}</p>}
      <p className="text-sm text-a-text">
        {w('clicks', 'Clicks: {{count}}', { count: link.clicks })}
        <span className="text-a-text-2">{` · ${w('from_bio', 'From the link-in-bio page: {{count}}', { count: link.clicks_bio })}`}</span>
      </p>
      <figure className="space-y-1">
        <figcaption className="text-xs text-a-text-2">{w('days', 'Clicks per day, last 14 days')}</figcaption>
        <ul className="flex h-12 items-end gap-1">
          {bars.map(bar => (
            <li key={bar.day} className="flex h-full flex-1 flex-col justify-end">
              <span aria-hidden className={`block w-full rounded-sm ${bar.height > 0 ? 'bg-a-accent' : 'h-px bg-a-border'}`}
                style={bar.height > 0 ? { height: `${bar.height}%` } : undefined} />
              <span className="sr-only">{w('bar', '{{day}}: {{count}}', { day: formatDate(bar.day, locale, { day: 'numeric', month: 'short' }), count: bar.clicks })}</span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  )
}
```

In `frontend/src/content/panel/panelState.ts`, replace:

```ts
  /** Who posts it (spec 2026-10-19 §4.1): a team member's id, '' for nobody. */
  poster_id: string
}
```

with:

```ts
  /** Who posts it (spec 2026-10-19 §4.1): a team member's id, '' for nobody. */
  poster_id: string
  /** The Link (spec 2026-10-19 §5.1): the address its short link leads to, '' for none (or a short link switched off). */
  link: string
}
```

replace:

```ts
    // The effective poster: someone who left reads as nobody, and nothing is sent for them unless changed.
    poster_id: post.poster ? String(post.poster.id) : '',
  }
}
```

with:

```ts
    // The effective poster: someone who left reads as nobody, and nothing is sent for them unless changed.
    poster_id: post.poster ? String(post.poster.id) : '',
    link: text(post.link?.destination),
  }
}
```

replace:

```ts
    hashtags: '',
    poster_id: '',
    // The words it starts with (a key date's name, a template's fields) over the empty ones.
```

with:

```ts
    hashtags: '',
    poster_id: '',
    link: '',
    // The words it starts with (a key date's name, a template's fields) over the empty ones.
```

replace:

```ts
    hashtags: parseHashtags(form.hashtags),
    poster_id: id(form.poster_id),
  }
}
```

with:

```ts
    hashtags: parseHashtags(form.hashtags),
    poster_id: id(form.poster_id),
    link: orNull(form.link),
  }
}
```

replace:

```ts
const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags', 'poster_id']
```

with:

```ts
const FIELDS: readonly (keyof PostForm)[] = ['platform', 'scheduled_date', 'scheduled_time', 'status', 'pillar_id', 'audience_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags', 'poster_id', 'link']
```

and replace:

```ts
/** The form fields a refused save names (Laravel's `errors`; `hashtags.0` is the hashtags field). */
export function invalidFields(fields: Record<string, string[]> | undefined): (keyof PostForm)[] {
  const named = new Set(Object.keys(fields ?? {}).map(name => name.split('.')[0]))
  return FIELDS.filter(key => named.has(key))
}
```

with:

```ts
/** The form fields a refused save names (Laravel's `errors`; `hashtags.0` is the hashtags field). */
export function invalidFields(fields: Record<string, string[]> | undefined): (keyof PostForm)[] {
  const named = new Set(Object.keys(fields ?? {}).map(name => name.split('.')[0]))
  return FIELDS.filter(key => named.has(key))
}

/** A refused save in the panel's terms: a refused Link is the Link's (its field, its own words: spec 2026-10-19 §5.1). */
export function refusalOf(code: string, fields: Record<string, string[]> | undefined): { invalid: (keyof PostForm)[]; family: 'save' | 'link' } {
  return code === 'bad_link' ? { invalid: ['link'], family: 'link' } : { invalid: invalidFields(fields), family: 'save' }
}
```

In `frontend/src/content/panel/PostFormFields.tsx`, replace:

```ts
import type { AudienceRef, Person, PillarRef, Platform, PostStatus, Snippet, Template } from '../lib/types'
```

with:

```ts
import type { AudienceRef, Person, PillarRef, Platform, PostStatus, ShortLinkFacts, Snippet, Template } from '../lib/types'
```

replace:

```ts
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'
import type { PostForm } from './panelState'
```

with:

```ts
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'
import type { PostForm } from './panelState'
import { ShortLink } from './ShortLink'
```

replace:

```ts
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [], team = [] }: {
```

with:

```ts
export function PostFormFields({ form, onChange, platforms, statuses, pillars, audiences, published, invalid, locale, industry, snippets, templates = [], team = [], link = null }: {
```

replace:

```ts
  /** Who can post it (spec 2026-10-19 §4.1): the brand's team, the post's own poster kept (posterChoices). */
  team?: Person[]
}) {
```

with:

```ts
  /** Who can post it (spec 2026-10-19 §4.1): the brand's team, the post's own poster kept (posterChoices). */
  team?: Person[]
  /** The saved post's short link (spec 2026-10-19 §5.5), shown under the Link field; null for a new post or one without. */
  link?: ShortLinkFacts | null
}) {
```

and replace:

```tsx
      <div className="relative">
        <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
```

with:

```tsx
      <div className="space-y-2">
        <FieldBox label={t('content.panel.fields.link', 'Link')} invalid={invalid.includes('link')}
          hint={t('content.panel.fields.link_hint', 'Where readers should go. HexaTech makes a short link that counts clicks.')}>
          <input type="url" inputMode="url" value={form.link} maxLength={2000} placeholder="https://" onChange={(e) => set('link', e.target.value)}
            aria-invalid={bad('link')} className={box('link')} />
        </FieldBox>
        <ShortLink typed={form.link} link={link} />
      </div>
      <div className="relative">
        <FieldBox label={t('content.panel.fields.hashtags', 'Hashtags')} invalid={invalid.includes('hashtags')}
```

In `frontend/src/content/panel/PostPanel.tsx`, replace:

```ts
import { changes, createBody, formOf, invalidFields, isDirty, newForm, newer, posterChoices, rebase, withChannels, type Editing, type PostForm } from './panelState'
```

with:

```ts
import { changes, createBody, formOf, isDirty, newForm, newer, posterChoices, rebase, refusalOf, withChannels, type Editing, type PostForm } from './panelState'
```

replace:

```ts
        setInvalid(invalidFields(failure.fields))
        const [key, text] = errorKey('save', failure.code)
```

with:

```ts
        // A refused Link (spec 2026-10-19 §5.1) is the Link's own: its field marked, its own words.
        const refused = refusalOf(failure.code, failure.fields)
        setInvalid(refused.invalid)
        const [key, text] = errorKey(refused.family, failure.code)
```

and replace:

```tsx
            templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} />
```

with:

```tsx
            templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} link={post?.link ?? null} />
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment', 'to_post', 'not_posted'],
```

with:

```ts
  'bell.kind': ['waiting', 'approved', 'sent_back', 'comment', 'to_post', 'not_posted'],
  // Spec 2026-10-19 §5.5: what the panel says a save does to a short link.
  'links.note': ['pending', 'moving', 'clearing', 'off', 'reviving'],
```

and replace:

```ts
'versions.made', 'flags.versions']
```

with:

```ts
'versions.made', 'flags.versions', 'links.clicks', 'links.from_bio', 'links.bar']
```

Write `$R/t2-words.json` with the Write tool:

```json
{
  "panel.fields.link": { "en": "Link", "ru": "Ссылка", "de": "Link", "fr": "Lien", "es": "Enlace" },
  "panel.fields.link_hint": { "en": "Where readers should go. HexaTech makes a short link that counts clicks.", "ru": "Куда должны попасть читатели. HexaTech создаст короткую ссылку, которая считает клики.", "de": "Wohin die Leser gelangen sollen. HexaTech erstellt einen Kurzlink, der Klicks zählt.", "fr": "Où les lecteurs doivent aller. HexaTech crée un lien court qui compte les clics.", "es": "Adónde deben ir los lectores. HexaTech crea un enlace corto que cuenta los clics." },
  "links.short": { "en": "Short link", "ru": "Короткая ссылка", "de": "Kurzlink", "fr": "Lien court", "es": "Enlace corto" },
  "links.copy": { "en": "Copy", "ru": "Копировать", "de": "Kopieren", "fr": "Copier", "es": "Copiar" },
  "links.off_badge": { "en": "switched off", "ru": "отключена", "de": "abgeschaltet", "fr": "désactivé", "es": "desactivado" },
  "links.clicks": { "en": "Clicks: {{count}}", "ru": "Клики: {{count}}", "de": "Klicks: {{count}}", "fr": "Clics : {{count}}", "es": "Clics: {{count}}" },
  "links.from_bio": { "en": "From the link-in-bio page: {{count}}", "ru": "Со страницы ссылок: {{count}}", "de": "Von der Link-in-Bio-Seite: {{count}}", "fr": "Depuis la page de liens : {{count}}", "es": "Desde la página de enlaces: {{count}}" },
  "links.days": { "en": "Clicks per day, last 14 days", "ru": "Клики по дням за последние 14 дней", "de": "Klicks pro Tag, letzte 14 Tage", "fr": "Clics par jour, 14 derniers jours", "es": "Clics por día, últimos 14 días" },
  "links.bar": { "en": "{{day}}: {{count}}", "ru": "{{day}}: {{count}}", "de": "{{day}}: {{count}}", "fr": "{{day}} : {{count}}", "es": "{{day}}: {{count}}" },
  "links.note.pending": { "en": "The short link appears once the post is saved.", "ru": "Короткая ссылка появится после сохранения поста.", "de": "Der Kurzlink erscheint, sobald der Beitrag gespeichert ist.", "fr": "Le lien court apparaît une fois la publication enregistrée.", "es": "El enlace corto aparece cuando se guarda la publicación." },
  "links.note.moving": { "en": "Saving keeps this short link: it will lead to the new address, also from posts already out.", "ru": "После сохранения короткая ссылка останется прежней и будет вести на новый адрес — в том числе из уже опубликованных постов.", "de": "Beim Speichern bleibt dieser Kurzlink erhalten: Er führt zur neuen Adresse, auch aus bereits veröffentlichten Beiträgen.", "fr": "L’enregistrement garde ce lien court : il mènera à la nouvelle adresse, y compris depuis les publications déjà parues.", "es": "Al guardar se mantiene este enlace corto: llevará a la nueva dirección, también desde las publicaciones ya publicadas." },
  "links.note.clearing": { "en": "Saving without a link switches this short link off: anyone who taps it is told it is no longer active.", "ru": "Если сохранить без ссылки, короткая ссылка отключится: по ней будет сообщение, что ссылка больше не действует.", "de": "Speichern ohne Link schaltet diesen Kurzlink ab: Wer ihn antippt, erfährt, dass er nicht mehr aktiv ist.", "fr": "Enregistrer sans lien désactive ce lien court : qui le touche apprend qu’il n’est plus actif.", "es": "Guardar sin enlace desactiva este enlace corto: quien lo toque verá que ya no está activo." },
  "links.note.off": { "en": "This short link is switched off. Enter a link to switch it back on.", "ru": "Эта короткая ссылка отключена. Введите ссылку, чтобы снова её включить.", "de": "Dieser Kurzlink ist abgeschaltet. Geben Sie einen Link ein, um ihn wieder einzuschalten.", "fr": "Ce lien court est désactivé. Saisissez un lien pour le réactiver.", "es": "Este enlace corto está desactivado. Escribe un enlace para volver a activarlo." },
  "links.note.reviving": { "en": "Saving switches this short link back on.", "ru": "После сохранения короткая ссылка снова заработает.", "de": "Beim Speichern wird dieser Kurzlink wieder eingeschaltet.", "fr": "L’enregistrement réactive ce lien court.", "es": "Al guardar se vuelve a activar este enlace corto." },
  "common.copied": { "en": "Copied", "ru": "Скопировано", "de": "Kopiert", "fr": "Copié", "es": "Copiado" },
  "common.copy_failed": { "en": "Could not copy. Select the text and copy it yourself.", "ru": "Не удалось скопировать. Выделите текст и скопируйте вручную.", "de": "Kopieren hat nicht geklappt. Markieren Sie den Text und kopieren Sie ihn selbst.", "fr": "Copie impossible. Sélectionnez le texte et copiez-le vous-même.", "es": "No se pudo copiar. Selecciona el texto y cópialo tú." }
}
```

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R/words.mjs" "$R/t2-words.json"
```

- [ ] **Step 4: Run the tests, the types, the lint**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R/vt.sh" src/content; npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; every file in `src/content` passes (the four test files of this task included, the bundles' key sets equal, `tokens.test.ts` green); the lint at Task 1's baseline.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/panel/linkMath.ts frontend/src/content/panel/ShortLink.tsx frontend/src/content/ui/CopyButton.tsx frontend/src/content/panel/panelState.ts frontend/src/content/panel/PostFormFields.tsx frontend/src/content/panel/PostPanel.tsx frontend/src/content/panel/linkMath.test.ts frontend/src/content/panel/shortLink.test.tsx frontend/src/content/panel/panelState.test.ts frontend/src/content/panel/postFormFields.test.tsx frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: the panel's Link — its short link with Copy, its clicks and 14 days of bars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Click counts on cards (spec §5.5)

**Files:**
- Modify: `frontend/src/content/lib/approval.ts`, `frontend/src/content/ui/CardFlags.tsx`, `frontend/src/content/plan/PostCardView.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: `frontend/src/content/lib/approval.test.ts`, `frontend/src/content/ui/cardFlags.test.tsx`
- Words: `$R/t3-words.json`

**Interfaces:**
- Consumes: Task 1's `PostCard.clicks`.
- Produces: `clicksOf(post: Pick<PostCard, 'clicks'>): number`; `flagWords(flags, t, versions = 0, clicks = 0)` (clicks last); `CardFlags` draws a click count from 1 (chip, or icon and number when compact).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/content/lib/approval.test.ts`, replace:

```ts
import { approvalsOn, canMarkPublished, cardFlags, flagWords, staffLocked, statusChoices, versionsOf } from './approval'
```

with:

```ts
import { approvalsOn, canMarkPublished, cardFlags, clicksOf, flagWords, staffLocked, statusChoices, versionsOf } from './approval'
```

Append to `frontend/src/content/lib/approval.test.ts` (via `$R/append.txt`):

```ts

describe('clicks in a card’s words (spec 2026-10-19 §5.5)', () => {
  const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace('{{count}}', String(vars?.count ?? ''))

  it('come last, from 1; a card without a Link has none', () => {
    expect(flagWords({ waiting: false, sentBack: false, comments: 1 }, t, 2, 4)).toBe('Comments: 1, Versions: 2, Clicks: 4')
    expect(flagWords({ waiting: false, sentBack: false, comments: 0 }, t, 0, 0)).toBe('')
    expect(clicksOf({})).toBe(0)
    expect(clicksOf({ clicks: 7 })).toBe(7)
  })
})
```

Append to `frontend/src/content/ui/cardFlags.test.tsx` (via `$R/append.txt`):

```tsx

describe('clicks on cards (spec 2026-10-19 §5.5)', () => {
  it('count a post’s short-link clicks from 1 without reading the number twice, and end a Plan card’s name with them', () => {
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 0 })} />)).toBe('')
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 12 })} />)).toContain('<span aria-hidden="true">12</span><span class="sr-only">Clicks: 12</span>')
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 1 })} compact />)).toContain('title="Clicks: 1"')
    expect(render(false, <PostCardView post={card({ status: 'draft', clicks: 3, group_size: 2 })} onOpen={() => {}} />))
      .toContain('aria-label="instagram 09:00: Three colours, draft, Versions: 2, Clicks: 3"')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; "$R/vt.sh" src/content/lib/approval.test.ts src/content/ui/cardFlags.test.tsx
```

Expected: failures — `clicksOf` is not a function; the cards draw no click count.

- [ ] **Step 3: The helper, the mark, the card's name**

In `frontend/src/content/lib/approval.ts`, replace:

```ts
/** A card's flags in words, in order, its versions last: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate, versions = 0): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
    versions > 0 ? t('content.flags.versions', 'Versions: {{count}}', { count: versions }) : '',
  ].filter(Boolean).join(', ')
}
```

with:

```ts
/** Spec 2026-10-19 §5.5: a card's short-link clicks (0 without a Link); a card says so from 1. */
export const clicksOf = (post: Pick<PostCard, 'clicks'>): number => Math.max(0, post.clicks ?? 0)

/** A card's flags in words, in order, its versions and clicks last: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate, versions = 0, clicks = 0): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
    versions > 0 ? t('content.flags.versions', 'Versions: {{count}}', { count: versions }) : '',
    clicks > 0 ? t('content.flags.clicks', 'Clicks: {{count}}', { count: clicks }) : '',
  ].filter(Boolean).join(', ')
}
```

In `frontend/src/content/ui/CardFlags.tsx`, replace:

```tsx
import { Hourglass, Layers, MessageSquare, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, versionsOf } from '../lib/approval'
```

with:

```tsx
import { Hourglass, Layers, MessageSquare, MousePointerClick, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, clicksOf, versionsOf } from '../lib/approval'
```

replace:

```tsx
  const versions = versionsOf(post)
  if (!flags.waiting && !flags.sentBack && flags.comments === 0 && versions === 0) return null
```

with:

```tsx
  const versions = versionsOf(post)
  // Spec 2026-10-19 §5.5: its short link's clicks, from 1.
  const clicks = clicksOf(post)
  if (!flags.waiting && !flags.sentBack && flags.comments === 0 && versions === 0 && clicks === 0) return null
```

replace:

```tsx
  const versionWords = t('content.flags.versions', 'Versions: {{count}}', { count: versions })
```

with:

```tsx
  const versionWords = t('content.flags.versions', 'Versions: {{count}}', { count: versions })
  const clickWords = t('content.flags.clicks', 'Clicks: {{count}}', { count: clicks })
```

replace:

```tsx
        {versions > 0 && (
          <span title={versionWords} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
          </span>
        )}
      </span>
    )
  }
```

with:

```tsx
        {versions > 0 && (
          <span title={versionWords} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
          </span>
        )}
        {clicks > 0 && (
          <span title={clickWords} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <MousePointerClick size={12} aria-hidden /><span aria-hidden>{clicks}</span><span className="sr-only">{clickWords}</span>
          </span>
        )}
      </span>
    )
  }
```

and replace:

```tsx
      {versions > 0 && (
        <span title={versionWords} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
        </span>
      )}
    </span>
  )
}
```

with:

```tsx
      {versions > 0 && (
        <span title={versionWords} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <Layers size={12} aria-hidden /><span aria-hidden>{versions}</span><span className="sr-only">{versionWords}</span>
        </span>
      )}
      {clicks > 0 && (
        <span title={clickWords} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <MousePointerClick size={12} aria-hidden /><span aria-hidden>{clicks}</span><span className="sr-only">{clickWords}</span>
        </span>
      )}
    </span>
  )
}
```

In `frontend/src/content/plan/PostCardView.tsx`, replace:

```tsx
import { approvalsOn, cardFlags, flagWords, versionsOf } from '../lib/approval'
```

with:

```tsx
import { approvalsOn, cardFlags, clicksOf, flagWords, versionsOf } from '../lib/approval'
```

and replace:

```tsx
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars), versionsOf(post))
```

with:

```tsx
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars), versionsOf(post), clicksOf(post))
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
'links.clicks', 'links.from_bio', 'links.bar']
```

with:

```ts
'links.clicks', 'links.from_bio', 'links.bar', 'flags.clicks']
```

Write `$R/t3-words.json` with the Write tool:

```json
{
  "flags.clicks": { "en": "Clicks: {{count}}", "ru": "Клики: {{count}}", "de": "Klicks: {{count}}", "fr": "Clics : {{count}}", "es": "Clics: {{count}}" }
}
```

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R/words.mjs" "$R/t3-words.json"
```

- [ ] **Step 4: Run the tests and the types**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R/vt.sh" src/content
```

Expected: `TSC-CLEAN`; every file in `src/content` passes.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/lib/approval.ts frontend/src/content/ui/CardFlags.tsx frontend/src/content/plan/PostCardView.tsx frontend/src/content/lib/approval.test.ts frontend/src/content/ui/cardFlags.test.tsx frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: cards count their short link's clicks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: The Link-in-bio section on the Brand page (spec §6.4)

**Files:**
- Create: `frontend/src/content/brand/bioForm.ts`, `frontend/src/content/brand/sections/LinkInBio.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx`, `frontend/src/content/i18n/contentLocales.test.ts`
- Test: create `frontend/src/content/brand/bioForm.test.ts`, `frontend/src/content/brand/linkInBio.test.tsx`
- Words: `$R/t4-words.json`

**Interfaces:**
- Consumes: Task 1's `BioPayload`, `BioBody`, `contentApi.bio`, `contentApi.saveBio`, family `bio`; Task 2's `CopyButton`.
- Produces (bioForm.ts): `MAX_BUTTONS` (8); `BioButtonForm {key, id: number | null, label, destination}`; `BioForm {is_on, slug, title, line, show_posts, buttons: BioButtonForm[]}`; `bioFormOf(bio: BioPayload): BioForm`; `bioBody(form: BioForm): BioBody`; `slugInput(raw: string): string`; `addressOf(base: string, slug: string): string`; `bioProblems(form: BioForm): string[]`; `moveButton(buttons, index, by: -1 | 1)`; `addButton(buttons, key)`; `removeButton(buttons, index)`; `renamedFrom(bio: BioPayload, form: BioForm): string | null`; `refusedFields(code: string, fields?: Record<string, string[]>): string[]`; `focusAfterMove(buttons, index, by): string | null`; `focusAfterRemove(buttons, index): string`.
- Produces (components): `LinkInBioSection({ canEdit })` (heading id `content-bio`, `data-bio`), `BioReadView({ bio, canEdit, brandName })`, `BioEditor({ bio, draft, onChange, invalid, error, busy, brandName, onFocus, onSave, onCancel })` (`data-bio-editor`, rows `data-bio-row`, arrows `data-move`, `data-remove`, `data-bio-add`, `data-bio-save`, `data-bio-edit`, `data-bio-address`).

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/content/brand/bioForm.test.ts` with the Write tool:

```ts
import { describe, expect, it } from 'vitest'
import type { BioPayload } from '../lib/types'
import {
  MAX_BUTTONS, addButton, addressOf, bioBody, bioFormOf, bioProblems, focusAfterMove, focusAfterRemove, moveButton, refusedFields, removeButton,
  renamedFrom, slugInput,
} from './bioForm'

const payload = (more: Partial<BioPayload> = {}): BioPayload => ({
  page: { is_on: true, slug: 'lumiere', title: null, line: 'Hair & colour', show_posts: true },
  buttons: [
    { id: 4, label: 'Book now', destination: 'https://lumiere.example/book', short_url: 'https://sites.hexa-tech.uk/go/abc2345', clicks_30d: 6 },
    { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts', short_url: 'https://sites.hexa-tech.uk/go/def2345', clicks_30d: 0 },
  ],
  url: 'https://sites.hexa-tech.uk/links/lumiere', suggested_name: 'lumiere-salon', base_url: 'https://sites.hexa-tech.uk/links/', ...more,
})

describe('the link-in-bio form (spec 2026-10-19 §6.4)', () => {
  it('starts from the saved page, or — before the first save — off, with the suggested name and the posts shown', () => {
    expect(bioFormOf(payload())).toEqual({
      is_on: true, slug: 'lumiere', title: '', line: 'Hair & colour', show_posts: true, buttons: [
        { key: 'b4', id: 4, label: 'Book now', destination: 'https://lumiere.example/book' },
        { key: 'b5', id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts' },
      ],
    })
    expect(bioFormOf(payload({ page: null, buttons: [], url: null }))).toEqual({ is_on: false, slug: 'lumiere-salon', title: '', line: '', show_posts: true, buttons: [] })
  })

  it('sends the whole page in order: words trimmed, empty words as null, a kept button with its id and a new one without', () => {
    const form = bioFormOf(payload())
    const buttons = addButton(moveButton(form.buttons, 1, -1), 'n0')
      .map(b => (b.key === 'n0' ? { ...b, label: ' Prices ', destination: ' https://lumiere.example/prices ' } : b))
    expect(bioBody({ ...form, title: '  ', line: ' Hair ', buttons })).toEqual({
      is_on: true, slug: 'lumiere', title: null, line: 'Hair', show_posts: true,
      buttons: [
        { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts' },
        { id: 4, label: 'Book now', destination: 'https://lumiere.example/book' },
        { label: 'Prices', destination: 'https://lumiere.example/prices' },
      ],
    })
  })

  it('moves, adds up to eight and removes buttons; a move past an end changes nothing', () => {
    const { buttons } = bioFormOf(payload())
    expect(moveButton(buttons, 0, -1)).toBe(buttons)
    expect(moveButton(buttons, 1, 1)).toBe(buttons)
    expect(moveButton(buttons, 0, 1).map(b => b.key)).toEqual(['b5', 'b4'])
    expect(removeButton(buttons, 0).map(b => b.key)).toEqual(['b5'])
    let many = buttons
    for (let i = 0; i < 10; i++) many = addButton(many, `n${i}`)
    expect(many).toHaveLength(MAX_BUTTONS)
  })

  it('types a name in lowercase with hyphens for spaces, and shows the address it will have', () => {
    expect(slugInput('Lumiere Salon')).toBe('lumiere-salon')
    expect(addressOf('https://sites.hexa-tech.uk/links/', 'lumiere')).toBe('https://sites.hexa-tech.uk/links/lumiere')
  })

  it('checks the name and every button before anything is sent', () => {
    const form = bioFormOf(payload())
    expect(bioProblems(form)).toEqual([])
    for (const slug of ['ab', 'lumière', '-lumiere', 'lumiere-', 'a'.repeat(64)]) expect(bioProblems({ ...form, slug }), slug).toEqual(['slug'])
    const buttons = [{ key: 'n0', id: null, label: ' ', destination: 'lumiere.example' }, ...form.buttons]
    expect(bioProblems({ ...form, buttons })).toEqual(['buttons.0.label', 'buttons.0.destination'])
  })

  // Review Focus 2: renaming a page that is out in the world.
  it('names the old address when a saved page is renamed, and nothing for a new page or the same name', () => {
    expect(renamedFrom(payload(), { ...bioFormOf(payload()), slug: 'lumiere-riga' })).toBe('https://sites.hexa-tech.uk/links/lumiere')
    expect(renamedFrom(payload(), bioFormOf(payload()))).toBeNull()
    expect(renamedFrom(payload({ page: null, url: null }), { ...bioFormOf(payload()), slug: 'other' })).toBeNull()
  })

  it('marks the name for a name refusal, the buttons for too many, and the fields a refused form names', () => {
    expect(refusedFields('bio_name_taken')).toEqual(['slug'])
    expect(refusedFields('bio_name_invalid')).toEqual(['slug'])
    expect(refusedFields('too_many_buttons')).toEqual(['buttons'])
    expect(refusedFields('invalid', { 'buttons.1.label': ['x'], title: ['y'] })).toEqual(['buttons.1.label', 'title'])
  })

  // Review Focus 4: the keyboard stays with the button it moved.
  it('keeps the keyboard on the moved button’s row, and sends it on after a removal', () => {
    const three = ['b1', 'b2', 'b3'].map(key => ({ key, id: null, label: '', destination: '' }))
    expect(focusAfterMove(three, 2, -1)).toBe('[data-bio-row="b3"] [data-move="up"]')
    expect(focusAfterMove(three, 1, -1)).toBe('[data-bio-row="b2"] [data-move="down"]')
    expect(focusAfterMove(three, 1, 1)).toBe('[data-bio-row="b2"] [data-move="up"]')
    expect(focusAfterMove(three, 0, -1)).toBeNull()
    expect(focusAfterRemove(three, 1)).toBe('[data-bio-row="b3"] [data-remove]')
    expect(focusAfterRemove(three, 2)).toBe('[data-bio-row="b2"] [data-remove]')
    expect(focusAfterRemove(three.slice(0, 1), 0)).toBe('[data-bio-add]')
  })
})
```

Write `frontend/src/content/brand/linkInBio.test.tsx` with the Write tool:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import type { BioPayload } from '../lib/types'
import { bioFormOf } from './bioForm'
import { bootFor, brandWith, renderBrand } from './brandTesting'
import { BioEditor, LinkInBioSection } from './sections/LinkInBio'

const payload = (more: Partial<BioPayload> = {}): BioPayload => ({
  page: { is_on: true, slug: 'lumiere', title: null, line: 'Hair and colour', show_posts: true },
  buttons: [
    { id: 4, label: 'Book now', destination: 'https://lumiere.example/book', short_url: 'https://sites.hexa-tech.uk/go/abc2345', clicks_30d: 6 },
    { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts', short_url: 'https://sites.hexa-tech.uk/go/def2345', clicks_30d: 0 },
  ],
  url: 'https://sites.hexa-tech.uk/links/lumiere', suggested_name: 'lumiere-salon', base_url: 'https://sites.hexa-tech.uk/links/', ...more,
})
const section = (bio: BioPayload, canManage: boolean) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'bio'], bio)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <LinkInBioSection canEdit={canManage} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}
const editor = (draft = bioFormOf(payload()), invalid: string[] = [], bio = payload()) => renderToStaticMarkup(
  <BioEditor bio={bio} draft={draft} onChange={() => {}} invalid={invalid} error={null} busy={false} brandName="Lumière Salon"
    onFocus={() => {}} onSave={() => {}} onCancel={() => {}} />,
)

describe('the Link-in-bio section (spec 2026-10-19 §6.4)', () => {
  it('sits on the Brand page after Channels', () => {
    const html = renderBrand(brandWith(), true)
    const at = html.indexOf('id="content-bio"')
    expect(at).toBeGreaterThan(html.indexOf('id="content-channels"'))
    expect(at).toBeLessThan(html.indexOf('id="content-keydates"'))
  })

  it('shows managers the page, its address with Copy and Open page, its buttons with their clicks, and Edit', () => {
    const html = section(payload(), true)
    expect(html).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(html).toContain('Copy address')
    expect(html).toMatch(/<a href="https:\/\/sites.hexa-tech.uk\/links\/lumiere" target="_blank" rel="noopener noreferrer"[^>]*>(?:<[^>]+>)*Open page<\/a>/)
    expect(html).toContain('Book now')
    expect(html).toContain('Clicks in the last 30 days: 6')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('>Edit<')
  })

  // Review Focus 5
  it('offers managers to set the page up before its first save', () => {
    const html = section(payload({ page: null, buttons: [], url: null }), true)
    expect(html).toContain('No page yet.')
    expect(html).toContain('Set up the page')
  })

  // Review Focus 5
  it('gives staff the address with Copy while the page is on, and nothing to edit', () => {
    const on = section(payload(), false)
    expect(on).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(on).toContain('Copy address')
    expect(on).not.toContain('>Edit<')
    expect(on).not.toContain('Book now')
    const off = section(payload({ page: { is_on: false, slug: 'lumiere', title: null, line: null, show_posts: true } }), false)
    expect(off).toContain('The page is not switched on.')
    expect(off).not.toContain('Copy address')
    expect(section(payload({ page: null, buttons: [], url: null }), false)).toContain('The page is not switched on.')
  })
})

describe('the link-in-bio editor', () => {
  it('holds the switch, the name with the full address, title, line, the posts switch and each button with its moves', () => {
    const html = editor()
    expect(html).toMatch(/role="switch" aria-checked="true"/)
    expect(html).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(html).toContain('placeholder="Lumière Salon"')
    expect(html).toContain('Show the latest posts that have a link')
    expect(html).toContain('aria-label="Button 2: address"')
    expect(html).toMatch(/<button type="button" data-move="up" disabled=""[^>]*aria-label="Move button 1 up"/)
    expect(html).toContain('aria-label="Remove button 2"')
    expect(html).toContain('Removing a button switches its short link off.')
  })

  // Review Focus 2
  it('warns that the old address stops working when the name changes', () => {
    expect(editor({ ...bioFormOf(payload()), slug: 'lumiere-riga' })).toContain('The old address stops working when you save: https://sites.hexa-tech.uk/links/lumiere')
    expect(editor()).not.toContain('The old address stops working')
  })

  it('stops adding at eight buttons, and marks the fields a check named', () => {
    const form = bioFormOf(payload())
    const full = { ...form, buttons: Array.from({ length: 8 }, (_, i) => ({ key: `n${i}`, id: null, label: `B${i}`, destination: 'https://lumiere.example/' })) }
    expect(editor(full)).toMatch(/<button[^>]*data-bio-add=""[^>]*disabled=""/)
    expect(editor(full)).toContain('A page has at most 8 buttons.')
    expect(editor(form, ['slug'])).toMatch(/aria-invalid="true" aria-describedby="content-bio-address"/)
    expect(editor(form, ['buttons.1.label'])).toMatch(/aria-label="Button 2: label" aria-invalid="true"/)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; "$R/vt.sh" src/content/brand/bioForm.test.ts src/content/brand/linkInBio.test.tsx
```

Expected: failures — `./bioForm` and `./sections/LinkInBio` cannot be resolved.

- [ ] **Step 3: The form's helpers, the section, the Brand page**

Write `frontend/src/content/brand/bioForm.ts` with the Write tool:

```ts
import type { BioBody, BioPayload } from '../lib/types'

/** A page has at most eight buttons (spec 2026-10-19 §6.2). */
export const MAX_BUTTONS = 8
/** The landing-page name rule (LandingSlug::isValid): 3–63 lowercase letters and digits, single hyphens between. */
const NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** An http(s) address with a host and no spaces: the portal's first check; the server's is the rule. */
const ADDRESS_RULE = /^https?:\/\/[^\s/?#]+\S*$/i

/** A button as the editor holds it: `key` keeps its row while it moves; `id` null for a button not saved yet. */
export interface BioButtonForm { key: string; id: number | null; label: string; destination: string }
/** The page as the editor holds it: text, '' for none. */
export interface BioForm { is_on: boolean; slug: string; title: string; line: string; show_posts: boolean; buttons: BioButtonForm[] }

/** The saved page, or — before its first save — off, with the suggested name and the latest posts shown. */
export function bioFormOf(bio: BioPayload): BioForm {
  const page = bio.page
  return {
    is_on: page?.is_on ?? false,
    slug: page?.slug ?? bio.suggested_name,
    title: page?.title ?? '',
    line: page?.line ?? '',
    show_posts: page?.show_posts ?? true,
    buttons: bio.buttons.map(b => ({ key: `b${b.id}`, id: b.id, label: b.label, destination: b.destination ?? '' })),
  }
}

/** The page as `PUT bio` takes it, in order: words trimmed, '' as null; a kept button with its id (it keeps its short link). */
export function bioBody(form: BioForm): BioBody {
  const words = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  return {
    is_on: form.is_on,
    slug: form.slug.trim(),
    title: words(form.title),
    line: words(form.line),
    show_posts: form.show_posts,
    buttons: form.buttons.map(b => ({ ...(b.id === null ? {} : { id: b.id }), label: b.label.trim(), destination: b.destination.trim() })),
  }
}

/** What the name field keeps of a key press: lowercase, spaces as hyphens (the rest is bioProblems' to say). */
export const slugInput = (raw: string): string => raw.toLowerCase().replace(/\s+/g, '-')

/** The page's address for a name: the server's base (`base_url`) and the name. */
export const addressOf = (base: string, slug: string): string => `${base}${slug}`

/** What stops a save before it is sent: the name's shape, and each button's label and address (keys like the server's `errors`). */
export function bioProblems(form: BioForm): string[] {
  const out: string[] = []
  const slug = form.slug.trim()
  if (slug.length < 3 || slug.length > 63 || !NAME_RULE.test(slug)) out.push('slug')
  if (form.buttons.length > MAX_BUTTONS) out.push('buttons')
  form.buttons.forEach((b, i) => {
    if (b.label.trim() === '') out.push(`buttons.${i}.label`)
    if (!ADDRESS_RULE.test(b.destination.trim())) out.push(`buttons.${i}.destination`)
  })
  return out
}

/** A button moved one place up (-1) or down (1); past an end, the same list. */
export function moveButton(buttons: BioButtonForm[], index: number, by: -1 | 1): BioButtonForm[] {
  const to = index + by
  if (to < 0 || to >= buttons.length) return buttons
  const out = [...buttons]
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

/** A new empty button at the end, while there are fewer than eight. */
export const addButton = (buttons: BioButtonForm[], key: string): BioButtonForm[] =>
  buttons.length >= MAX_BUTTONS ? buttons : [...buttons, { key, id: null, label: '', destination: '' }]

export const removeButton = (buttons: BioButtonForm[], index: number): BioButtonForm[] => buttons.filter((_, i) => i !== index)

/** The saved page's address when this form renames it (spec §6.1: the old address stops working), else null. */
export function renamedFrom(bio: BioPayload, form: BioForm): string | null {
  return bio.page && bio.url && form.slug.trim() !== bio.page.slug ? bio.url : null
}

/** The fields a refusal names: the name for the two name refusals, the buttons for too many, else the refused form's own. */
export function refusedFields(code: string, fields?: Record<string, string[]>): string[] {
  if (code === 'bio_name_invalid' || code === 'bio_name_taken') return ['slug']
  if (code === 'too_many_buttons') return ['buttons']
  return Object.keys(fields ?? {})
}

/** Where the keyboard goes after a move: the moved row's same arrow, or its other one at an end (that arrow is then off). */
export function focusAfterMove(buttons: readonly BioButtonForm[], index: number, by: -1 | 1): string | null {
  const to = index + by
  if (to < 0 || to >= buttons.length) return null
  const atEnd = to === 0 || to === buttons.length - 1
  const same = by < 0 ? 'up' : 'down'
  const other = by < 0 ? 'down' : 'up'
  return `[data-bio-row="${buttons[index].key}"] [data-move="${atEnd ? other : same}"]`
}

/** After a removal: the next row's Remove, else the previous row's, else "Add a button". */
export function focusAfterRemove(buttons: readonly BioButtonForm[], index: number): string {
  const next = buttons[index + 1] ?? buttons[index - 1]
  return next ? `[data-bio-row="${next.key}"] [data-remove]` : '[data-bio-add]'
}
```

Write `frontend/src/content/brand/sections/LinkInBio.tsx` with the Write tool:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BioPayload } from '../../lib/types'
import { CopyButton } from '../../ui/CopyButton'
import { INPUT, ReadRow } from '../inputs'
import {
  MAX_BUTTONS, addButton, addressOf, bioBody, bioFormOf, bioProblems, focusAfterMove, focusAfterRemove, moveButton, refusedFields, removeButton,
  renamedFrom, slugInput, type BioButtonForm, type BioForm,
} from '../bioForm'

const edge = (bad: boolean) => (bad ? 'border-a-danger' : 'border-a-border')
const ICON = 'rounded-md border border-a-border p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-40'

/**
 * Link-in-bio (spec 2026-10-19 §6.4), after Channels: the brand's one public page of links and latest posts. Everyone
 * reads it — staff get its address with Copy while it is on; managers open an editor that saves the page and its buttons
 * in one call (a button keeps its short link while it exists; removing one switches its link off). The portal checks the
 * name and the buttons first; the server stays the judge.
 */
export function LinkInBioSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brandId, 'bio'], queryFn: api.bio, staleTime: 60_000 })
  const [draft, setDraft] = useState<BioForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])
  const box = useRef<HTMLElement>(null)
  const focusAfter = useRef<string | null>(null)
  const brandName = boot.brand?.name ?? ''
  const bio = query.data

  // Edit puts the keyboard in the form, Save and Cancel back on Edit, a refusal on the first marked field, a move or a
  // removal where the editor says (a selector set in the handler, read here after the render).
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    box.current?.querySelector<HTMLElement>(want)?.focus()
  })

  const open = (from: BioPayload) => {
    focusAfter.current = '[data-bio-editor] [role="switch"]'
    setError(null)
    setInvalid([])
    setDraft(bioFormOf(from))
  }
  const close = () => {
    focusAfter.current = '[data-bio-edit]'
    setDraft(null)
    setError(null)
    setInvalid([])
  }
  const save = async () => {
    if (draft === null || busy) return
    const problems = bioProblems(draft)
    if (problems.length > 0) {
      setInvalid(problems)
      const [key, text] = errorKey('bio', 'invalid')
      setError(t(key, text))
      focusAfter.current = '[aria-invalid="true"]'
      return
    }
    setBusy(true)
    setError(null)
    setInvalid([])
    try {
      const answer = await api.saveBio(bioBody(draft))
      queryClient.setQueryData(['content', brandId, 'bio'], answer)
      close()
    } catch (e) {
      const failure = failureOf(e)
      setInvalid(refusedFields(failure.code, failure.fields))
      const [key, text] = errorKey('bio', failure.code)
      setError(t(key, text))
      focusAfter.current = '[aria-invalid="true"], [data-bio-save]'
    } finally {
      setBusy(false)
    }
  }

  return (
    <section ref={box} data-bio="" aria-labelledby="content-bio" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-bio" className="font-a-display text-lg font-normal text-a-text">{t('content.bio.title', 'Link-in-bio')}</h2>
          <p className="text-sm text-a-text-2">{t('content.bio.intro', 'One page with your links and latest posts, for the link in your profiles.')}</p>
        </div>
        {canEdit && bio && draft === null && (
          <Button size="sm" variant="secondary" data-bio-edit="" onClick={() => open(bio)}>
            {bio.page ? t('content.brand.edit', 'Edit') : t('content.bio.setup', 'Set up the page')}
          </Button>
        )}
      </div>
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && !bio && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button size="sm" variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {bio && draft === null && <BioReadView bio={bio} canEdit={canEdit} brandName={brandName} />}
      {bio && draft !== null && (
        <BioEditor bio={bio} draft={draft} onChange={setDraft} invalid={invalid} error={error} busy={busy} brandName={brandName}
          onFocus={(selector) => { focusAfter.current = selector }} onSave={() => { void save() }} onCancel={close} />
      )}
    </section>
  )
}

/** The page's address with Copy, and Open page while it is on. */
function AddressLine({ address, open }: { address: string; open: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-a-text-2">{t('content.bio.address', 'Address')}</span>
      <span data-bio-address="" className="min-w-0 break-all font-a-mono text-sm text-a-text">{address}</span>
      <CopyButton text={address} label={t('content.bio.copy', 'Copy address')} />
      {open && (
        <a href={address} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-a-border px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <ExternalLink size={14} aria-hidden />{t('content.bio.open', 'Open page')}
        </a>
      )}
    </div>
  )
}

/** The section as read: staff the address with Copy while the page is on; managers the page, its settings and its buttons. */
export function BioReadView({ bio, canEdit, brandName }: { bio: BioPayload; canEdit: boolean; brandName: string }) {
  const { t } = useTranslation()
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.bio.${key}`, english, vars)
  const page = bio.page
  const notOn = <p className="text-sm text-a-text-2">{w('none_staff', 'The page is not switched on.')}</p>
  if (!page) return canEdit ? <p className="text-sm text-a-text-2">{w('none_manager', 'No page yet.')}</p> : notOn
  const address = bio.url ?? addressOf(bio.base_url, page.slug)
  if (!canEdit) return page.is_on ? <AddressLine address={address} open={false} /> : notOn
  const onOff = (on: boolean) => (on ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off'))
  return (
    <div className="space-y-3">
      <AddressLine address={address} open={page.is_on} />
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReadRow label={w('state', 'Page')} value={onOff(page.is_on)} />
        <ReadRow label={w('posts_state', 'Latest posts')} value={onOff(page.show_posts)} />
        <ReadRow label={w('page_title', 'Title')} value={page.title ?? brandName} />
        <ReadRow label={w('line', 'Line under the title')} value={page.line ?? ''} />
      </dl>
      <div>
        <h3 className="mb-1 text-xs font-medium text-a-text-2">{w('buttons', 'Buttons')}</h3>
        {bio.buttons.length === 0 ? <p className="text-sm text-a-text-2">{w('no_buttons', 'No buttons yet.')}</p> : (
          <ol className="space-y-2">
            {bio.buttons.map(button => (
              <li key={button.id} className="text-sm">
                <span className="block font-medium text-a-text">{button.label}</span>
                <span className="block break-all text-xs text-a-text-2">{button.destination ?? ''}</span>
                <span className="block text-xs text-a-text-2">{w('clicks_30d', 'Clicks in the last 30 days: {{count}}', { count: button.clicks_30d })}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/**
 * The editor (managers): the switch, the name with the page's full address (and a warning when a saved page is renamed),
 * title, line, "Show latest posts", and up to eight buttons — add, edit, move up and down, remove — then Save or Cancel.
 */
export function BioEditor({ bio, draft, onChange, invalid, error, busy, brandName, onFocus, onSave, onCancel }: {
  bio: BioPayload
  draft: BioForm
  onChange: (draft: BioForm) => void
  invalid: string[]
  error: string | null
  busy: boolean
  brandName: string
  /** Where the keyboard goes after the change the handler makes next (a selector). */
  onFocus: (selector: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.bio.${key}`, english, vars)
  const counter = useRef(0)
  const bad = (key: string) => invalid.includes(key)
  const set = (part: Partial<BioForm>) => onChange({ ...draft, ...part })
  const setButton = (index: number, part: Partial<BioButtonForm>) => set({ buttons: draft.buttons.map((b, i) => (i === index ? { ...b, ...part } : b)) })
  const move = (index: number, by: -1 | 1) => {
    const target = focusAfterMove(draft.buttons, index, by)
    if (target) onFocus(target)
    set({ buttons: moveButton(draft.buttons, index, by) })
  }
  const remove = (index: number) => {
    onFocus(focusAfterRemove(draft.buttons, index))
    set({ buttons: removeButton(draft.buttons, index) })
  }
  const add = () => {
    const key = `n${counter.current++}`
    onFocus(`[data-bio-row="${key}"] input`)
    set({ buttons: addButton(draft.buttons, key) })
  }
  const old = renamedFrom(bio, draft)
  const full = draft.buttons.length >= MAX_BUTTONS

  return (
    <div data-bio-editor="" className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={draft.is_on} aria-labelledby="content-bio-switch" aria-describedby="content-bio-switch-line"
            onClick={() => set({ is_on: !draft.is_on })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.is_on ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${draft.is_on ? 'left-[1.375rem]' : 'left-0.5'}`} />
          </button>
          <span id="content-bio-switch" className="text-sm text-a-text">{w('switch', 'Page is on')}</span>
        </div>
        <p id="content-bio-switch-line" className="text-xs text-a-text-2">{w('switch_line', 'While it is off, its address shows a page that is not found.')}</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('name', 'Name')}</span>
        <input value={draft.slug} maxLength={63} autoCapitalize="none" spellCheck={false} aria-invalid={bad('slug') || undefined} aria-describedby="content-bio-address"
          onChange={(e) => set({ slug: slugInput(e.target.value) })} className={`${INPUT} ${edge(bad('slug'))}`} />
        <span id="content-bio-address" className="mt-1 block break-all text-xs text-a-text-2">
          {`${addressOf(bio.base_url, draft.slug.trim())} · ${w('name_hint', 'Lowercase letters, digits and hyphens.')}`}
        </span>
      </label>
      {old && <Notice tone="warning">{w('rename', 'The old address stops working when you save: {{old}}', { old })}</Notice>}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('page_title', 'Title')}</span>
        <input value={draft.title} maxLength={60} placeholder={brandName} aria-invalid={bad('title') || undefined} onChange={(e) => set({ title: e.target.value })}
          className={`${INPUT} ${edge(bad('title'))}`} />
        <span className="mt-1 block text-xs text-a-text-2">{w('title_hint', 'Up to 60 characters. Empty: the brand’s name.')}</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('line', 'Line under the title')}</span>
        <textarea value={draft.line} rows={2} maxLength={160} aria-invalid={bad('line') || undefined} onChange={(e) => set({ line: e.target.value })}
          className={`${INPUT} ${edge(bad('line'))}`} />
        <span className="mt-1 block text-xs text-a-text-2">{w('line_hint', 'Up to 160 characters.')}</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={draft.show_posts} onChange={(e) => set({ show_posts: e.target.checked })} />
        {w('show_posts', 'Show the latest posts that have a link')}
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-a-text-2">{w('buttons', 'Buttons')}</legend>
        {draft.buttons.length === 0 && <p className="text-sm text-a-text-2">{w('no_buttons', 'No buttons yet.')}</p>}
        <ol className="space-y-2">
          {draft.buttons.map((button, i) => {
            const n = i + 1
            return (
              <li key={button.key} data-bio-row={button.key} className="space-y-2 rounded-lg border border-a-border p-2">
                <input value={button.label} maxLength={40} aria-label={w('button_label', 'Button {{n}}: label', { n })} aria-invalid={bad(`buttons.${i}.label`) || undefined}
                  onChange={(e) => setButton(i, { label: e.target.value })} className={`${INPUT} ${edge(bad(`buttons.${i}.label`))}`} />
                <input type="url" inputMode="url" value={button.destination} maxLength={2000} placeholder="https://" aria-label={w('button_address', 'Button {{n}}: address', { n })}
                  aria-invalid={bad(`buttons.${i}.destination`) || undefined} onChange={(e) => setButton(i, { destination: e.target.value })}
                  className={`${INPUT} ${edge(bad(`buttons.${i}.destination`))}`} />
                <div className="flex gap-1">
                  <button type="button" data-move="up" disabled={i === 0} aria-label={w('up', 'Move button {{n}} up', { n })} onClick={() => move(i, -1)} className={ICON}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button type="button" data-move="down" disabled={i === draft.buttons.length - 1} aria-label={w('down', 'Move button {{n}} down', { n })} onClick={() => move(i, 1)} className={ICON}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button type="button" data-remove="" aria-label={w('remove', 'Remove button {{n}}', { n })} onClick={() => remove(i)} className={`${ICON} ml-auto`}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
        <Button size="sm" variant="secondary" data-bio-add="" disabled={full} onClick={add}><Plus size={14} aria-hidden />{w('add', 'Add a button')}</Button>
        <p className="text-xs text-a-text-2">{full ? w('max', 'A page has at most 8 buttons.') : w('removed_note', 'Removing a button switches its short link off.')}</p>
      </fieldset>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button data-bio-save="" loading={busy} onClick={onSave}>{t('content.brand.save', 'Save')}</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}
```

In `frontend/src/content/brand/BrandPage.tsx`, replace:

```tsx
import { KeyDatesSection } from './sections/KeyDates'
```

with:

```tsx
import { KeyDatesSection } from './sections/KeyDates'
import { LinkInBioSection } from './sections/LinkInBio'
```

and replace:

```tsx
              <ChannelsSection brand={brand} canEdit={canEdit} />
```

with:

```tsx
              <ChannelsSection brand={brand} canEdit={canEdit} />
              {/* Spec 2026-10-19 §6.4: the brand's link-in-bio page, after Channels. */}
              <LinkInBioSection canEdit={canEdit} />
```

In `frontend/src/content/i18n/contentLocales.test.ts`, replace:

```ts
'links.bar', 'flags.clicks']
```

with:

```ts
'links.bar', 'flags.clicks', 'bio.clicks_30d']
```

Write `$R/t4-words.json` with the Write tool:

```json
{
  "bio.title": { "en": "Link-in-bio", "ru": "Ссылки в био", "de": "Link in Bio", "fr": "Lien en bio", "es": "Enlace en la bio" },
  "bio.intro": { "en": "One page with your links and latest posts, for the link in your profiles.", "ru": "Одна страница с вашими ссылками и последними постами — для ссылки в профилях.", "de": "Eine Seite mit Ihren Links und neuesten Beiträgen – für den Link in Ihren Profilen.", "fr": "Une page avec vos liens et vos dernières publications, pour le lien de vos profils.", "es": "Una página con tus enlaces y tus últimas publicaciones, para el enlace de tus perfiles." },
  "bio.setup": { "en": "Set up the page", "ru": "Настроить страницу", "de": "Seite einrichten", "fr": "Configurer la page", "es": "Configurar la página" },
  "bio.none_manager": { "en": "No page yet.", "ru": "Страницы пока нет.", "de": "Noch keine Seite.", "fr": "Pas encore de page.", "es": "Todavía no hay página." },
  "bio.none_staff": { "en": "The page is not switched on.", "ru": "Страница не включена.", "de": "Die Seite ist nicht eingeschaltet.", "fr": "La page n’est pas activée.", "es": "La página no está activada." },
  "bio.state": { "en": "Page", "ru": "Страница", "de": "Seite", "fr": "Page", "es": "Página" },
  "bio.address": { "en": "Address", "ru": "Адрес", "de": "Adresse", "fr": "Adresse", "es": "Dirección" },
  "bio.copy": { "en": "Copy address", "ru": "Копировать адрес", "de": "Adresse kopieren", "fr": "Copier l’adresse", "es": "Copiar la dirección" },
  "bio.open": { "en": "Open page", "ru": "Открыть страницу", "de": "Seite öffnen", "fr": "Ouvrir la page", "es": "Abrir la página" },
  "bio.switch": { "en": "Page is on", "ru": "Страница включена", "de": "Seite ist eingeschaltet", "fr": "La page est activée", "es": "La página está activada" },
  "bio.switch_line": { "en": "While it is off, its address shows a page that is not found.", "ru": "Пока страница выключена, по её адресу открывается «Страница не найдена».", "de": "Solange sie ausgeschaltet ist, zeigt ihre Adresse die Meldung „Seite nicht gefunden“.", "fr": "Tant qu’elle est désactivée, son adresse affiche une page introuvable.", "es": "Mientras está desactivada, su dirección muestra una página no encontrada." },
  "bio.name": { "en": "Name", "ru": "Имя", "de": "Name", "fr": "Nom", "es": "Nombre" },
  "bio.name_hint": { "en": "Lowercase letters, digits and hyphens.", "ru": "Строчные латинские буквы, цифры и дефисы.", "de": "Kleinbuchstaben, Ziffern und Bindestriche.", "fr": "Lettres minuscules, chiffres et tirets.", "es": "Letras minúsculas, cifras y guiones." },
  "bio.rename": { "en": "The old address stops working when you save: {{old}}", "ru": "После сохранения старый адрес перестанет работать: {{old}}", "de": "Nach dem Speichern funktioniert die alte Adresse nicht mehr: {{old}}", "fr": "Après l’enregistrement, l’ancienne adresse ne fonctionnera plus : {{old}}", "es": "Al guardar, la dirección anterior dejará de funcionar: {{old}}" },
  "bio.page_title": { "en": "Title", "ru": "Заголовок", "de": "Titel", "fr": "Titre", "es": "Título" },
  "bio.title_hint": { "en": "Up to 60 characters. Empty: the brand’s name.", "ru": "До 60 символов. Пусто — название бренда.", "de": "Bis zu 60 Zeichen. Leer: der Name der Marke.", "fr": "Jusqu’à 60 caractères. Vide : le nom de la marque.", "es": "Hasta 60 caracteres. Vacío: el nombre de la marca." },
  "bio.line": { "en": "Line under the title", "ru": "Строка под заголовком", "de": "Zeile unter dem Titel", "fr": "Ligne sous le titre", "es": "Línea bajo el título" },
  "bio.line_hint": { "en": "Up to 160 characters.", "ru": "До 160 символов.", "de": "Bis zu 160 Zeichen.", "fr": "Jusqu’à 160 caractères.", "es": "Hasta 160 caracteres." },
  "bio.show_posts": { "en": "Show the latest posts that have a link", "ru": "Показывать последние посты со ссылкой", "de": "Die neuesten Beiträge mit Link zeigen", "fr": "Afficher les dernières publications qui ont un lien", "es": "Mostrar las últimas publicaciones que tienen enlace" },
  "bio.posts_state": { "en": "Latest posts", "ru": "Последние посты", "de": "Neueste Beiträge", "fr": "Dernières publications", "es": "Últimas publicaciones" },
  "bio.buttons": { "en": "Buttons", "ru": "Кнопки", "de": "Schaltflächen", "fr": "Boutons", "es": "Botones" },
  "bio.no_buttons": { "en": "No buttons yet.", "ru": "Кнопок пока нет.", "de": "Noch keine Schaltflächen.", "fr": "Pas encore de boutons.", "es": "Todavía no hay botones." },
  "bio.button_label": { "en": "Button {{n}}: label", "ru": "Кнопка {{n}}: надпись", "de": "Schaltfläche {{n}}: Beschriftung", "fr": "Bouton {{n}} : libellé", "es": "Botón {{n}}: texto" },
  "bio.button_address": { "en": "Button {{n}}: address", "ru": "Кнопка {{n}}: адрес", "de": "Schaltfläche {{n}}: Adresse", "fr": "Bouton {{n}} : adresse", "es": "Botón {{n}}: dirección" },
  "bio.up": { "en": "Move button {{n}} up", "ru": "Переместить кнопку {{n}} выше", "de": "Schaltfläche {{n}} nach oben verschieben", "fr": "Monter le bouton {{n}}", "es": "Subir el botón {{n}}" },
  "bio.down": { "en": "Move button {{n}} down", "ru": "Переместить кнопку {{n}} ниже", "de": "Schaltfläche {{n}} nach unten verschieben", "fr": "Descendre le bouton {{n}}", "es": "Bajar el botón {{n}}" },
  "bio.remove": { "en": "Remove button {{n}}", "ru": "Удалить кнопку {{n}}", "de": "Schaltfläche {{n}} entfernen", "fr": "Supprimer le bouton {{n}}", "es": "Quitar el botón {{n}}" },
  "bio.add": { "en": "Add a button", "ru": "Добавить кнопку", "de": "Schaltfläche hinzufügen", "fr": "Ajouter un bouton", "es": "Añadir un botón" },
  "bio.max": { "en": "A page has at most 8 buttons.", "ru": "На странице может быть не больше 8 кнопок.", "de": "Eine Seite hat höchstens 8 Schaltflächen.", "fr": "Une page compte au plus 8 boutons.", "es": "Una página tiene como máximo 8 botones." },
  "bio.removed_note": { "en": "Removing a button switches its short link off.", "ru": "Если удалить кнопку, её короткая ссылка отключится.", "de": "Wird eine Schaltfläche entfernt, wird ihr Kurzlink abgeschaltet.", "fr": "Supprimer un bouton désactive son lien court.", "es": "Al quitar un botón se desactiva su enlace corto." },
  "bio.clicks_30d": { "en": "Clicks in the last 30 days: {{count}}", "ru": "Клики за последние 30 дней: {{count}}", "de": "Klicks in den letzten 30 Tagen: {{count}}", "fr": "Clics sur les 30 derniers jours : {{count}}", "es": "Clics en los últimos 30 días: {{count}}" }
}
```

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content && node "$R/words.mjs" "$R/t4-words.json"
```

- [ ] **Step 4: Run the tests, the types, the lint**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2; cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN; "$R/vt.sh" src/content; npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; every file in `src/content` passes (the Brand page's own tests too: staff see no `>Edit<`); the lint at Task 1's baseline.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add frontend/src/content/brand/bioForm.ts frontend/src/content/brand/sections/LinkInBio.tsx frontend/src/content/brand/BrandPage.tsx frontend/src/content/brand/bioForm.test.ts frontend/src/content/brand/linkInBio.test.tsx frontend/src/content/i18n/contentLocales.test.ts frontend/src/content/i18n/content.en.json frontend/src/content/i18n/content.ru.json frontend/src/content/i18n/content.de.json frontend/src/content/i18n/content.fr.json frontend/src/content/i18n/content.es.json && git commit -q -m "Content portal: the Link-in-bio section on the Brand page — read by all, edited by managers in one save" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: The runbook — release 5b's portal

**Files:**
- Modify: `docs/content-workspace.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: The portal's release-5b rules and the owner's checks**

In `docs/content-workspace.md`, replace:

```markdown
- **The bell's reminders** ("To post today", with the time and a status not yet ready; "Not marked as posted", with the
  day it was due) and, at its foot, **the morning email switch** (each person's own).
```

with:

```markdown
- **The bell's reminders** ("To post today", with the time and a status not yet ready; "Not marked as posted", with the
  day it was due) and, at its foot, **the morning email switch** (each person's own).
- **Tracked links** (release 5b): the panel's **Link** field after the call to action; under it the short link with
  Copy, "Clicks: N" (and those from the link-in-bio page) and 14 bars, each named for screen readers. Before a save the
  panel says what it will do: make the short link, keep it for a new address, switch it off when the field is emptied,
  switch it back on. A refused Link marks the field (`link` refusals). Cards say "Clicks: N" from 1.
- **Link-in-bio** on the Brand page, after Channels (`brand/sections/LinkInBio.tsx`): staff see the address with Copy
  while the page is on; managers edit the switch, the name (lowercase as typed; the full address shown; a warning when
  a saved page is renamed), title, line, "Show latest posts" and up to eight buttons (add, move up and down, remove),
  saved in one call; each button's clicks for the last 30 days; Open page while it is on.
```

and replace:

```markdown
- Verify release 5b by content (after Plan 5B-2's deploy): `/api/v1/admin/content/bio` answers 401 when signed out
  (404 before release 5b); `https://sites.hexa-tech.uk/landing/content-public.css` answers 200 (404 before);
  `https://sites.hexa-tech.uk/go/zzzz222` and `https://sites.hexa-tech.uk/links/zzzz-none` answer 404 without a cookie.
```

with:

```markdown
- Verify release 5b by content (after Plan 5B-2's deploy): `/api/v1/admin/content/bio` answers 401 when signed out
  (404 before release 5b); `https://sites.hexa-tech.uk/landing/content-public.css` answers 200 (404 before);
  `https://sites.hexa-tech.uk/go/zzzz222` and `https://sites.hexa-tech.uk/links/zzzz-none` answer 404 without a cookie;
  the `ContentApp` chunk carries "Link-in-bio", "Short link" and "Clicks per day".
- After the deploy (owner): on a real brand, give one post a Link, save it, open its short link on a phone (the visit
  counts by the next panel read), and look at the card's click count; on the Brand page, set up the link-in-bio page,
  switch it on, add two buttons, open it, and put its address in one profile's bio; open your own landing page once (the
  public host's list of paths changed); reload admin tabs left open.
```

- [ ] **Step 2: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md && git commit -q -m "Runbook: release 5b's portal — the Link and its clicks, the link-in-bio section; the owner's checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The release checks

The spec's checks (§8) on the finished branch, before the final whole-branch review (whose fix pass, if it changes the portal, runs Steps 1–3 and the touched pass checks again) and before anything is deployed. This task writes only to `$R` (git-ignored), to the local database (a temporary brand and a temporary staff member, removed at the end) and, for each defect a check finds, to the branch: every such fix goes in test-first with a ledger line `Task 6: fixed <what> — <test> RED→GREEN`, and its own commit.

**Files:**
- Create (all under `$R`): `tools/` (a copy of 5A-2's tools) with a new `tools/pass.mjs` and `tools/lh.mjs`; `pass-seed.php`, `pass-unseed.php`, `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `keys-base.txt`, `keys-new.txt`, `pass.txt`
- Temporary: a base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main), local servers on :8012 (API and the public host `sites.localhost:8012`), :5173 (Vite), :8099 (Lighthouse sign-in); all undone in Step 10.

**Interfaces:**
- Consumes: everything Plans 5B-1 and 5B-2 built.
- Produces: the evidence Task 7's question to the owner quotes.

- [ ] **Step 1: The frontend suites**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R/final-vitest.txt" 2>&1; tail -6 "$R/final-vitest.txt"; grep -E '^ FAIL ' "$R/final-vitest.txt" | sed 's/ >.*//' | sort -u
npx eslint src/content src/workspace src/App.tsx src/components/Layout.tsx src/pages/hubs/MarketingHub.tsx src/lib/api.ts 2>&1 | tail -2
```

Expected: `TSC-CLEAN`; `Tests  3 failed | … passed` (more passed than Task 1's baseline), the only `FAIL` file `src/lib/plannerMeta.test.ts`; the lint ends `✖ 17 problems (17 errors, 0 warnings)` (or the baseline Task 1 ledgered). Ledger: `Task 6: note: vitest <n> passed, 3 baseline failures; tsc clean; lint baseline`.

- [ ] **Step 2: Every PHP suite, by folder**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R/php-paths.txt"; wc -l < "$R/php-paths.txt"; rm -f "$R/final-php.txt"
"$R/php.sh" $(sed -n 1,10p "$R/php-paths.txt") | tee -a "$R/final-php.txt"      # then 11,20p, 21,30p … to the end, one call each
grep -v "exit 0" "$R/final-php.txt"; echo "(nothing above: every path green)"
```

Expected: one line per path (about 72), each `Tests: … passed` and `exit 0`; `tests/Feature/Content/` (258 tests) and `tests/Unit/Content/` (82) among them; `tests/Feature/Landing/` takes about 28 minutes, longer than a foreground call may run: leave it out of the batches (`grep -v '^tests/Feature/Landing/$'`) and run `"$R/php.sh" tests/Feature/Landing/ | tee -a "$R/final-php.txt"` on its own with the Bash tool's `run_in_background` (it re-invokes when done) while the other batches run. A failing path: if its test or the code it covers is in this release's change list (`git diff --name-only ceda0c4aa HEAD`), it is ours — fix it test-first, commit, run the path again. If neither is, run it once more alone; if it still fails, ledger `Task 6: note: pre-existing failure <path> <test> — not in the change list` (it goes to the owner and does not block).

- [ ] **Step 3: The build check**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content/frontend && npx vite build --outDir "$R/build" --emptyOutDir > "$R/build.txt" 2>&1; echo "build exit $?"
cd "$R/build/assets" && ls ContentApp-*.js AppointmentsApp-*.js
for w in 'Link-in-bio' 'Short link' 'Clicks per day'; do printf '%s: ' "$w"; grep -l "$w" *.js | tr '\n' ' '; echo; done
grep -l "data-content\|data-appointments" index-*.js; echo "(no index file listed above)"
cd /c/wamp64/www/Hexa-Tech-content && git checkout -- frontend/dist/stats.html && rm -rf "$R/build" && git status --short
```

Expected: `build exit 0`; one `ContentApp-*.js` and one `AppointmentsApp-*.js`; each phrase found only in `ContentApp-*.js`; nothing listed for the index; `git status --short` prints nothing.

- [ ] **Step 4: Appointments, pixel for pixel, against what is live — no difference**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content && git fetch -q origin && git log -1 --format='%h %s' origin/main
git diff --quiet origin/main HEAD -- frontend/package.json frontend/package-lock.json && echo SAME-DEPS
git worktree add --detach ../Hexa-Tech-content-base origin/main
mkdir -p "$R/tools" && cp -r .superpowers/sdd/archive/2026-10-19-content-release-5a-2/tools/. "$R/tools/"
netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'; echo "ports above must be empty"
```

Expected: origin/main is `afbacf056` (or a later commit the ledger names); `SAME-DEPS`. On `ENOSPC`, stop and report it. Then in PowerShell:

```powershell
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

In `$R/tools/pixels.mjs` (Edit tool): replace

```js
/** Which tree served the page: only the branch has content/panel/VersionsSection.tsx (release 5a); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/panel/VersionsSection.tsx')
```

with

```js
/** Which tree served the page: only the branch has content/panel/ShortLink.tsx (release 5b); origin/main does not. */
async function assertTree(page, which) {
  const branch = await page.evaluate(async () => {
    const r = await fetch('/src/content/panel/ShortLink.tsx')
```

and change `const TOKEN_NAME = 'content-r5a-pixels'` to `const TOKEN_NAME = 'content-r5b-pixels'`.

The local database has release 5b's migrations already (Plan 5B-1); confirm:

```bash
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan migrate:status --no-ansi < /dev/null | grep -E "2026_10_19_100[2-5]00" | grep -c Ran
```

Expected: `4`. (Any other number: apply them with `artisan migrate --path=database/migrations/<file> --force < /dev/null` one by one, and ledger it.)

Start the API (background). `LANDING_HOST=sites.localhost` makes the same server the public host too, so short links and the bio page answer at `http://sites.localhost:8012`:

```bash
cd /c/wamp64/www/Hexa-Tech-content && LANDING_HOST=sites.localhost CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8012 --no-reload
```

Start the BASE tree's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content-base/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

Capture the base, a control run on the same server, and the keyboard checks:

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd "$R/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture base && node pixels.mjs capture control && node pixels.mjs compare base control | tail -1
node pixels.mjs keys | tee "$R/keys-base.txt" | tail -3
```

Expected: `46 screens, 0 differ` and every keys line `PASS`. If `capture` stops with "no appointment with a client on 2026-09-30", pick a day that has one, use it for every run, and ledger it.

Stop the base Vite (TaskStop); `netstat -ano | grep ':5173 .*LISTENING'` must print nothing (a leftover node PID: check its command line names `Hexa-Tech-content-base`, then `taskkill //PID <pid> //F`). Start the BRANCH's Vite (background):

```bash
cd /c/wamp64/www/Hexa-Tech-content/frontend && VITE_API_URL=http://127.0.0.1:8012/api npx vite --port 5173 --strictPort
```

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd "$R/tools" && export DAY=2026-09-30 BACKEND=C:/wamp64/www/Hexa-Tech-content
node pixels.mjs capture new; node pixels.mjs compare base new | grep -E '^(DIFF|SIZE|MISSING)|screens'
node pixels.mjs keys | tee "$R/keys-new.txt" | tail -3; diff "$R/keys-base.txt" "$R/keys-new.txt" && echo KEYS-SAME
```

Expected: `46 screens, 0 differ`; `KEYS-SAME`. Any differing screen is a defect of this release: find the change (`git diff ceda0c4aa HEAD -- frontend/src/workspace frontend/src/appointments` must print nothing), fix it, capture `new` again. Keep the branch's Vite and the API running for Steps 5–6.

- [ ] **Step 5: The browser pass that writes for real — as a manager and as a staff member**

It runs on local org 16, on a temporary brand that is set up (approvals off), as the manager `appointments-tester@example.test` and as a temporary staff member the seed makes. Write the two PHP files with the Write tool.

`$R/pass-seed.php`:

```php
<?php
// Plan 5B-2 browser pass: a set-up brand on local org 16 (approvals off, Instagram every day), a temporary staff member,
// and three posts: one for tomorrow without a Link (the pass gives it one), one published yesterday with a live short
// link and clicks (3 direct and 1 from the bio page today, 2 direct two days ago), and an idea without a day.
// pass-unseed.php removes the brand, everything under it, its links and bio page, and the member.
use App\Services\Content\ContentLinks;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 5b: links and link-in-bio';
$email = 'release-check-5b-staff@example.test';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$today = Carbon\CarbonImmutable::parse(App\Services\Appointments\VenueClock::today($org));
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r5b-pass', 'primary_color' => '#1f6f5c', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
$staff = App\Models\User::where('email', $email)->first() ?? App\Models\User::create([
    'organization_id' => $org, 'name' => 'Release Check Staff', 'email' => $email, 'password' => bcrypt(Str::random(40)), 'user_type' => 'staff',
]);
if (!DB::table('staff')->where('user_id', $staff->id)->exists()) {
    DB::table('staff')->insert(['organization_id' => $org, 'user_id' => $staff->id, 'role' => 'staff', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
}
// The planner models take the tenant from the container, as a request would.
app()->instance('current_organization_id', $org);
app()->instance('current_brand_id', $brand);
$profile = App\Models\ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now]);
$days = fn (array $on) => array_merge(array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false), array_fill_keys($on, true));
App\Models\ContentPlannerChannel::create(['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'label' => 'Release check Instagram', 'active' => true, 'frequency' => $days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'posts_per_week' => 3, 'post_time' => '08:30']);
$post = fn (array $fields) => App\Models\ContentPlannerPost::create($fields + [
    'planner_profile_id' => $profile->id, 'brand_id' => $brand, 'platform' => 'instagram', 'language' => 'en', 'generated_by' => 'manual', 'created_by' => $staff->id, 'hashtags' => [],
]);
$post(['status' => 'draft', 'topic' => 'Release check link', 'hook' => 'Release check link', 'scheduled_date' => $today->addDay()->toDateString(), 'scheduled_time' => '08:30']);
$clicked = $post(['status' => 'published', 'topic' => 'Release check clicks', 'hook' => 'Release check clicks', 'scheduled_date' => $today->subDay()->toDateString(), 'scheduled_time' => '08:30', 'published_at' => $now->copy()->subDay()]);
ContentLinks::set($clicked, 'https://example.com/autumn');
$linkId = DB::table('content_links')->where('post_id', $clicked->id)->value('id');
DB::table('content_link_clicks')->insert([
    ['link_id' => $linkId, 'day' => $today->toDateString(), 'via' => 'direct', 'clicks' => 3],
    ['link_id' => $linkId, 'day' => $today->toDateString(), 'via' => 'bio', 'clicks' => 1],
    ['link_id' => $linkId, 'day' => $today->subDays(2)->toDateString(), 'via' => 'direct', 'clicks' => 2],
]);
$post(['status' => 'idea', 'topic' => 'Release check idea']);
echo "BRAND {$brand} PROFILE {$profile->id} STAFF {$staff->id} TODAY {$today->toDateString()}\n";
```

`$R/pass-unseed.php`:

```php
<?php
// Removes what pass-seed.php and the pass made: the brand and every Content row under it (profile, channel, posts and
// their events, comments, briefs and variations, the bell's reads), its link-in-bio page and buttons, its short links
// with their clicks, and the temporary staff member with their tokens.
use Illuminate\Support\Facades\DB;

$email = 'release-check-5b-staff@example.test';
$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 5b: links and link-in-bio')->value('id');
$removed = [];
if ($brand) {
    $profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
    $posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
    $pages = DB::table('content_bio_pages')->where('brand_id', $brand)->pluck('id');
    DB::table('content_bio_buttons')->whereIn('bio_page_id', $pages)->delete();
    DB::table('content_bio_pages')->whereIn('id', $pages)->delete();
    $links = DB::table('content_links')->where('brand_id', $brand)->pluck('id');
    DB::table('content_link_clicks')->whereIn('link_id', $links)->delete();
    DB::table('content_links')->whereIn('id', $links)->delete();
    DB::table('content_planner_post_comments')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_post_events')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_reads')->whereIn('planner_profile_id', $profiles)->delete();
    DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_post_variations')->whereIn('post_id', $posts)->delete();
    DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->delete();
    foreach (['content_planner_ai_generations', 'content_planner_channels', 'content_planner_key_dates', 'content_planner_templates', 'content_planner_snippets', 'content_planner_brand_voices', 'content_planner_audiences', 'content_planner_pillars', 'content_planner_strategies'] as $table) {
        DB::table($table)->whereIn('planner_profile_id', $profiles)->delete();
    }
    DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
    DB::table('brands')->where('id', $brand)->delete();
    $removed[] = "brand {$brand}, posts {$posts->count()}, links {$links->count()}, bio pages {$pages->count()}";
}
$user = DB::table('users')->where('email', $email)->value('id');
if ($user) {
    DB::table('personal_access_tokens')->where('tokenable_type', App\Models\User::class)->where('tokenable_id', $user)->delete();
    if (Illuminate\Support\Facades\Schema::hasTable('admin_access_refusals')) {
        DB::table('admin_access_refusals')->where('user_id', $user)->delete();
    }
    DB::table('staff')->where('user_id', $user)->delete();
    DB::table('users')->where('id', $user)->delete();
    $removed[] = "staff member {$user}";
}
echo $removed ? 'REMOVED ' . implode('; ', $removed) . "\n" : "NOTHING\n";
```

Write `$R/tools/pass.mjs` with the Write tool (it replaces 5A-2's):

```js
// Plan 5B-2 release check (Task 6): one browser pass that writes for real on local org 16, on a temporary brand and a
// temporary staff member made by pass-seed.php (removed by pass-unseed.php), as the manager and as the staff member.
// API and the public host on :8012 (LANDING_HOST=sites.localhost), Vite on :5173 (the feature tree). Sign-in tokens are
// minted through tinker into memory, never printed, and deleted when the run ends.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.resolve(HERE, '../shots/pass')
const APP = 'http://localhost:5173'
const API = 'http://127.0.0.1:8012/api'
const PUBLIC = 'http://sites.localhost:8012'
const PHP = 'C:/wamp64/bin/php/php8.4.20/php.exe'
const BACKEND = 'C:/wamp64/www/Hexa-Tech-content'
const MANAGER = 'appointments-tester@example.test'
const STAFF = 'release-check-5b-staff@example.test'
const TOKEN_NAME = 'content-r5b-pass'
const BRAND_NAME = 'Release check 5b: links and link-in-bio'
const BIO_NAME = 'release-check-5b-pass'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')

// stdin closed: tinker waits on an open one.
const tinker = code => execFileSync(PHP, ['artisan', 'tinker', `--execute=${code}`], { cwd: BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const lastLine = out => out.trim().split('\n').pop().trim()
const brandId = () => Number(lastLine(tinker(`echo DB::table('brands')->where('organization_id',16)->where('name','${BRAND_NAME}')->whereNull('deleted_at')->value('id');`)))
function mint(email) {
  const token = tinker(`echo App\\Models\\User::where('email', '${email}')->firstOrFail()->createToken('${TOKEN_NAME}')->plainTextToken;`).match(/\d+\|[A-Za-z0-9]{20,}/)?.[0]
  if (!token) throw new Error(`no token minted for ${email}`)
  return token
}
const dropTokens = () => tinker(`Laravel\\Sanctum\\PersonalAccessToken::where('name', '${TOKEN_NAME}')->delete();`)
const api = (token, url) => fetch(`${API}/v1/admin/content/${url}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).then(r => r.json())
/** A visit to the local public host: `sites.localhost:8012` names it, 127.0.0.1 answers (Node does not resolve *.localhost everywhere). */
function hit(url) {
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: u.port || 80, path: u.pathname + u.search, method: 'GET', headers: { Host: u.host, 'User-Agent': 'release-check' } }, res => {
      res.resume()
      resolve({ status: res.statusCode, location: res.headers.location ?? null, cookies: res.headers['set-cookie'] ?? [] })
    })
    req.on('error', reject)
    req.end()
  })
}

const results = []
const consoleErrors = []
function record(name, ok, note = '') { results.push([name, !!ok, note]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`) }
/** Polls until `check` holds (this local server answers in 1–2 s, after its CORS preflight). */
async function until(check, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check().catch(() => false)) return true; await new Promise(r => setTimeout(r, 250)) }
  return false
}

async function session(browser, token, { brand = null, theme = 'light', lang = 'en', width = 1440, height = 900, mobile = false } = {}) {
  const me = await (await fetch(`${API}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
  if (!me?.id) throw new Error('auth/me did not answer with a user')
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', locale: lang === 'ru' ? 'ru-RU' : 'en-GB', hasTouch: mobile, isMobile: mobile })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP })
  await context.addInitScript(([t, user, look, language, b]) => {
    localStorage.setItem('auth_token', t)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: t, user, staff: user.staff ?? null }, version: 1 }))
    localStorage.setItem('content:look', look)
    localStorage.setItem('admin_lang', language)
    if (b) localStorage.setItem('content:brand', String(b))
  }, [token, me, JSON.stringify({ theme, rail: 'full' }), lang, brand])
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${page.url()}: ${m.text()}`) })
  page.on('dialog', d => { void d.accept() })
  return { context, page }
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const ready = page => page.getByRole('button', { name: 'New post' }).first().waitFor({ timeout: 30_000 })
const panel = page => page.locator('[data-panel]')
/** A panel field by its label's own words. */
const field = (page, label, tag) => panel(page).locator('label').filter({ has: page.locator(`span:text-is("${label}")`) }).locator(tag)
const cardName = async (page, id) => (await page.locator(`[data-post="${id}"]`).first().getAttribute('aria-label')) ?? ''

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const brand = brandId()
  if (!brand) throw new Error('no release-check brand: run pass-seed.php first')
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none', '--host-resolver-rules=MAP sites.localhost 127.0.0.1'] })
  const manager = mint(MANAGER)
  const staff = mint(STAFF)
  try {
    const postOf = async id => (await api(manager, `posts/${id}?brand_id=${brand}`)).post
    const find = async words => ((await api(manager, `posts?brand_id=${brand}&q=${encodeURIComponent(words)}`)).data ?? [])[0]
    const linkPost = await find('Release check link')
    const clicked = await find('Release check clicks')
    if (!linkPost || !clicked) throw new Error('the seeded posts are missing: run pass-unseed.php, then pass-seed.php')

    // The manager gives a post its Link, copies and follows the short link, then clears it.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${linkPost.scheduled_date}`)
      await ready(page)
      await page.locator(`[data-post="${linkPost.id}"]`).first().click()
      const link = field(page, 'Link', 'input')
      await link.waitFor({ timeout: 30_000 })
      await link.fill('https://example.com/book')
      record('L1 a typed Link says the short link comes with the save', await panel(page).getByText('The short link appears once the post is saved.').isVisible())
      await panel(page).getByRole('button', { name: 'Save', exact: true }).click()
      record('L2 Save makes the short link and shows it under the field', await until(async () => (await postOf(linkPost.id))?.link?.on === true)
        && await until(async () => /\/go\/[a-z2-9]{7}$/.test((await panel(page).locator('[data-short-link] .font-a-mono').first().innerText().catch(() => '')).trim())))
      const shortUrl = (await postOf(linkPost.id)).link.short_url
      await panel(page).locator('[data-short-link]').getByRole('button', { name: 'Copy' }).click()
      record('L3 Copy puts the short link on the clipboard', await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) === shortUrl))
      await shot(page, 'panel-short-link')
      const followed = await hit(shortUrl)
      record('L4 the short link sends a visitor on with its tags and sets no cookie',
        followed.status === 302 && (followed.location ?? '').startsWith('https://example.com/book?utm_source=instagram&utm_medium=social') && followed.cookies.length === 0,
        `${followed.status} ${followed.location}`)
      record('L5 the visit is counted', await until(async () => (await postOf(linkPost.id))?.link?.clicks === 1))
      await link.fill('')
      record('L6 emptying the Link warns before the save', await panel(page).getByText('Saving without a link switches this short link off').isVisible())
      await panel(page).getByRole('button', { name: 'Save', exact: true }).click()
      record('L7 saving switches the short link off; it then answers 404', await until(async () => (await postOf(linkPost.id))?.link?.on === false)
        && (await hit(shortUrl)).status === 404)
      await panel(page).getByRole('button', { name: 'Close' }).click()
      await page.reload()
      await ready(page)
      record('L8 the card names its click', await until(async () => (await cardName(page, linkPost.id)).includes('Clicks: 1')))
      await context.close()
    }
    // The published post with clicks: its card and its panel.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content?date=${clicked.scheduled_date}`)
      await ready(page)
      record('C1 a published post’s card names its 6 clicks', await until(async () => (await cardName(page, clicked.id)).includes('Clicks: 6')))
      await page.locator(`[data-post="${clicked.id}"]`).first().click()
      const facts = panel(page).locator('[data-short-link]')
      await facts.waitFor({ timeout: 30_000 })
      const text = await facts.innerText()
      record('C2 the panel shows its clicks, those from the bio page and 14 bars', text.includes('Clicks: 6') && text.includes('From the link-in-bio page: 1') && (await facts.locator('li').count()) === 14)
      await shot(page, 'panel-clicks')
      await context.close()
    }
    // The manager sets up the link-in-bio page, opens it, then starts a rename.
    {
      const { context, page } = await session(browser, manager, { brand })
      await page.goto(`${APP}/content/brand`)
      const section = page.locator('[data-bio]')
      await section.getByRole('button', { name: 'Set up the page' }).waitFor({ timeout: 30_000 })
      await section.getByRole('button', { name: 'Set up the page' }).click()
      const name = section.getByLabel('Name')
      record('B1 Set up the page opens the editor with a suggested name', (await name.inputValue()) !== '')
      await section.getByRole('switch', { name: 'Page is on' }).click()
      await name.fill(BIO_NAME)
      await section.getByRole('button', { name: 'Add a button' }).click()
      await section.getByLabel('Button 1: label').fill('Book now')
      await section.getByLabel('Button 1: address').fill('https://example.com/book')
      await section.getByRole('button', { name: 'Add a button' }).click()
      await section.getByLabel('Button 2: label').fill('Gift cards')
      await section.getByLabel('Button 2: address').fill('https://example.com/gifts')
      await section.getByRole('button', { name: 'Move button 2 up' }).click()
      const focused = await page.evaluate(() => ({ move: document.activeElement?.getAttribute('data-move'), row: document.activeElement?.closest('[data-bio-row]')?.querySelector('input')?.value }))
      record('B2 moving a button up keeps the keyboard on that button’s row', focused.move === 'down' && focused.row === 'Gift cards', JSON.stringify(focused))
      await shot(page, 'bio-editor')
      await section.getByRole('button', { name: 'Save', exact: true }).click()
      record('B3 Save switches the page on with its name and the buttons in order', await until(async () => {
        const bio = await api(manager, `bio?brand_id=${brand}`)
        return bio.page?.is_on === true && bio.page.slug === BIO_NAME && bio.buttons.map(b => b.label).join('|') === 'Gift cards|Book now'
      }))
      const address = section.locator('[data-bio-address]')
      record('B4 the section shows the address, Copy and Open page', await until(async () => (await address.innerText()).endsWith(`/links/${BIO_NAME}`))
        && await section.getByRole('link', { name: 'Open page' }).isVisible())
      await shot(page, 'bio-read')
      const [publicPage] = await Promise.all([context.waitForEvent('page'), section.getByRole('link', { name: 'Open page' }).click()])
      await publicPage.waitForLoadState('networkidle')
      const text = await publicPage.locator('main').innerText()
      record('B5 Open page shows the public page: the buttons in order and the post with a live link',
        text.indexOf('Gift cards') >= 0 && text.indexOf('Gift cards') < text.indexOf('Book now') && text.includes('Release check clicks'))
      await publicPage.close()
      await section.getByRole('button', { name: 'Edit' }).click()
      await name.fill('release-check-5b-renamed')
      record('B6 renaming warns that the old address stops working', await section.getByText('The old address stops working when you save').isVisible())
      await section.getByRole('button', { name: 'Cancel' }).click()
      await context.close()
    }
    // The staff member: the address with Copy, nothing to edit.
    {
      const { context, page } = await session(browser, staff, { brand })
      await page.goto(`${APP}/content/brand`)
      const section = page.locator('[data-bio]')
      await section.waitFor({ timeout: 30_000 })
      record('S1 staff see the page’s address with Copy, and nothing to edit',
        await until(async () => (await section.locator('[data-bio-address]').innerText().catch(() => '')).endsWith(`/links/${BIO_NAME}`))
        && (await section.getByRole('button', { name: 'Copy address' }).count()) === 1 && (await section.getByRole('button', { name: 'Edit' }).count()) === 0)
      await shot(page, 'bio-staff')
      await context.close()
    }
    // Phones: the panel's short link, the editor; the public page at 360.
    {
      const phone = await session(browser, manager, { brand, width: 390, height: 844, mobile: true })
      await phone.page.goto(`${APP}/content?date=${clicked.scheduled_date}`)
      await ready(phone.page)
      await phone.page.locator(`[data-post="${clicked.id}"]`).first().click()
      const facts = panel(phone.page).locator('[data-short-link]')
      await facts.waitFor({ timeout: 30_000 })
      await facts.scrollIntoViewIfNeeded()
      const fits = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'panel-clicks-phone')
      record('P1 on a phone the short link and its bars fit', fits)
      await phone.page.goto(`${APP}/content/brand`)
      const section = phone.page.locator('[data-bio]')
      await section.getByRole('button', { name: 'Edit' }).waitFor({ timeout: 30_000 })
      await section.getByRole('button', { name: 'Edit' }).click()
      await section.locator('[data-bio-editor]').scrollIntoViewIfNeeded()
      const fitsEditor = await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      await shot(phone.page, 'bio-editor-phone')
      record('P2 on a phone the link-in-bio editor fits', fitsEditor)
      await phone.context.close()
    }
    {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
      const page = await context.newPage()
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${page.url()}: ${m.text()}`) })
      const answer = await page.goto(`${PUBLIC}/links/${BIO_NAME}`, { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      await page.screenshot({ path: path.join(SHOTS, 'bio-public-360.png'), fullPage: true })
      record('P3 the public page at 360 answers and fits', answer?.status() === 200 && overflow === 0, `overflow ${overflow}`)
      await context.close()
    }
  } finally {
    await browser.close()
    dropTokens()
  }
  console.log(`console errors: ${consoleErrors.length}`)
  for (const line of consoleErrors.slice(0, 20)) console.log(`  ${line}`)
  const failed = results.filter(r => !r[1])
  console.log(`${results.length} checks, ${failed.length} failed`)
  process.exitCode = failed.length ? 1 : 0
}

await main()
```

Run it (the branch's Vite and the API still run from Step 4):

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R/pass-seed.php" < /dev/null | tail -1
cd "$R/tools" && node pass.mjs | tee "$R/pass.txt" | tail -30
```

Expected: the jobs count noted (ledger it); `BRAND <id> PROFILE <id> STAFF <id> TODAY <date>`; every line `PASS`, `console errors: 0`, `20 checks, 0 failed`. A FAIL: read the line and the screenshot; a defect of the portal is fixed test-first, committed, and the pass run again (run `pass-unseed.php` and `pass-seed.php` first). A defect of the script is fixed in the script and ledgered `Task 6: Ruling: pass script <what> — <why the page is right>`.

- [ ] **Step 6: Lighthouse accessibility on the Plan, Ideas, the panel, Brand, the editor and the public page**

In `$R/tools/token-server.mjs` (Edit tool): change `const NAME = 'content-r5a-lighthouse'` to `const NAME = 'content-r5b-lighthouse'` and `const BRAND_NAME = 'Release check 5a: versions, who posts it, reminders'` to `const BRAND_NAME = 'Release check 5b: links and link-in-bio'`.

Write `$R/tools/lh.mjs` with the Write tool (it replaces 5A-2's):

```js
// Plan 5B-2 release check (Task 6, Step 6): Lighthouse accessibility on the Plan (cards with click counts), Ideas, the
// panel with its short link and bars, Brand with the Link-in-bio section, its editor, and the public link-in-bio page, on
// a Chrome of our own, in snapshot mode once each page's content is on screen. The sign-in comes from token-server.mjs
// (port 8099): the manager, on the release-check brand.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(HERE, '../lighthouse')
const CACHE = 'C:/Users/user6399/AppData/Local/npm-cache/_npx/1722e863ebfd623b/node_modules'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const APP = 'http://localhost:5173'
const PUBLIC = 'http://sites.localhost:8012/links/release-check-5b-pass'
const DAY = process.argv[2]
if (!DAY) throw new Error('usage: node lh.mjs <the clicks post’s day, YYYY-MM-DD>')

const { snapshot } = await import(pathToFileURL(`${CACHE}/lighthouse/core/index.js`).href)
const { default: puppeteer } = await import(pathToFileURL(`${CACHE}/puppeteer-core/lib/puppeteer/puppeteer-core.js`).href)

fs.mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, userDataDir: path.resolve(HERE, '../lh-profile'),
  defaultViewport: { width: 1440, height: 900 }, args: ['--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP sites.localhost 127.0.0.1'],
})
const flags = { onlyCategories: ['accessibility'], formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false } }
const lines = []
try {
  const page = await browser.newPage()
  await page.goto(`${APP}/login`)
  const signedIn = await page.evaluate(async () => {
    const { token, brand } = await (await fetch('http://127.0.0.1:8099/session')).json()
    const me = await (await fetch('http://127.0.0.1:8012/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })).json()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token, user: me, staff: me.staff ?? null }, version: 1 }))
    localStorage.setItem('content:brand', String(brand))
    return me.id ? 'signed in' : 'not signed in'
  })
  console.log(signedIn)
  const audit = async name => {
    const result = await snapshot(page, { flags })
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result.lhr, null, 1))
    const score = Math.round((result.lhr.categories.accessibility.score ?? 0) * 100)
    const failing = Object.values(result.lhr.audits)
      .filter(a => a.score !== null && a.score < 1 && (a.scoreDisplayMode === 'binary' || a.scoreDisplayMode === 'numeric'))
      .map(a => `  - ${a.id}: ${a.title}${(a.details?.items ?? []).slice(0, 5).map(i => `\n      ${i.node?.selector ?? ''} ${(i.node?.snippet ?? '').slice(0, 140)}`).join('')}`)
    lines.push(`## ${name}: accessibility ${score}`, ...(failing.length ? failing : ['  - no failing audit']), '')
    console.log(`${name}: ${score} (${failing.length} failing)`)
  }

  await page.goto(`${APP}/content?date=${DAY}`)
  await page.waitForSelector('[data-post]', { timeout: 60_000 })
  await audit('plan')

  await page.goto(`${APP}/content/ideas`)
  await page.waitForSelector('[data-ideas]', { timeout: 60_000 })
  await audit('ideas')

  await page.goto(`${APP}/content?date=${DAY}`)
  await page.waitForSelector('[data-post]', { timeout: 60_000 })
  await page.click('[data-post]')
  await page.waitForSelector('[data-short-link]', { timeout: 60_000 })
  await audit('panel')

  await page.goto(`${APP}/content/brand`)
  await page.waitForSelector('[data-bio-address]', { timeout: 60_000 })
  await audit('brand')

  await page.click('[data-bio-edit]')
  await page.waitForSelector('[data-bio-editor]', { timeout: 60_000 })
  await audit('bio-editor')

  await page.goto(PUBLIC)
  await page.waitForSelector('.cp-bio', { timeout: 60_000 })
  await audit('bio-page')
} finally {
  await browser.close()
}
fs.writeFileSync(path.resolve(HERE, '../lighthouse.md'), `# Plan 5B-2 release check — Lighthouse accessibility (snapshot mode, desktop 1440)\n\n${lines.join('\n')}\n`)
```

The release-check brand and its link-in-bio page from Step 5 are still there. Start `node "$R/tools/token-server.mjs"` in the background (it prints only `serving on 127.0.0.1:8099`), then run `cd "$R/tools" && node lh.mjs <the clicks post's day from the pass: TODAY − 1>`. Stop the token server (TaskStop) and run `node "$R/tools/token-server.mjs" drop` → `dropped`.

Read `$R/lighthouse.md`: per page the accessibility score and every failing audit with its elements. Expected: no failing audit the portal (or the public page) can fix. Each one it can is a defect: fix it test-first, commit, and audit that page again. One the portal cannot fix gets `Task 6: Ruling: <audit> — <why it is not the portal's> — <cost if wrong>`. No conformance is claimed.

- [ ] **Step 7: Eyes**

Open every screenshot in `$R/shots/pass/` with the Read tool and write one line each in `$R/eyes.md`:
- `panel-short-link.png`: the Link field after the call to action with `https://example.com/book`; under it the short link with Copy ("Copied"), "Clicks: 0 · From the link-in-bio page: 0" and 14 empty bars.
- `panel-clicks.png`: the published post's panel: the short link, "Clicks: 6 · From the link-in-bio page: 1", bars on today (4) and two days ago (2), the rest empty.
- `bio-editor.png`: the switch on, the name with its full address under it, title and line empty (the brand's name as placeholder), the posts box ticked, two button rows (Gift cards first) with their arrows and Remove, "Add a button", Save and Cancel.
- `bio-read.png`: the address with Copy address and Open page, the page On, latest posts On, the title (the brand's name), the two buttons with "Clicks in the last 30 days: 0".
- `bio-staff.png`: the section with only the address and Copy address.
- `panel-clicks-phone.png`: the panel full width at 390, the short link wrapping, the bars across the width, nothing cut.
- `bio-editor-phone.png`: the editor at 390, inputs full width, the arrows and Remove on one line, nothing cut.
- `bio-public-360.png`: the public page at 360 — initials "RC" in the brand green, title, two green buttons with white text (Gift cards first), "LATEST POSTS" with the one post's tile.

Anything that looks wrong to a person is a defect: fix it (test-first where a test can hold it), take the screenshot again, and say so in `eyes.md`.

- [ ] **Step 8: The suites again if anything was fixed**

If Steps 2–7 committed any fix, run Step 1 again and the PHP paths those fixes touch (`"$R/php.sh" <paths>`). Expected: as in Steps 1–2.

- [ ] **Step 9: Ledger**

Append to `$R/progress.md`: `Task 6: note: vitest …; PHP <n> paths green (<pre-existing failures, if any>); build check clean; Appointments 46 screens, 0 differ, keys same; Lighthouse <plan / ideas / panel / brand / bio-editor / bio-page>; pass 20 checks 0 failed; eyes ok`.

- [ ] **Step 10: Clean up**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R/pass-unseed.php" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo Laravel\Sanctum\PersonalAccessToken::where('name', 'like', 'content-r5b-%')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('jobs')->count();" < /dev/null | tail -1
/c/wamp64/bin/php/php8.4.20/php.exe artisan workspace:content 16 --status < /dev/null | tail -2
```

Expected: `REMOVED brand <id>, posts 3, links 4, bio pages 1; staff member <id>` (the two posts' short links and the two buttons' links); tokens `0`; jobs as noted before the pass; org 16's Content `on`. Stop the API and the Vite tasks (TaskStop); `netstat -ano | grep -E ':(8012|5173|8099) .*LISTENING'` must print nothing (a leftover node PID: check its command line, then `taskkill //PID <pid> //F`). Remove the base worktree — junction first, in PowerShell:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-content-base\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove ../Hexa-Tech-content-base && git worktree list | grep -c content-base; test -d frontend/node_modules/react && echo MODULES-KEPT; git status --short
```

Expected: `0`; `MODULES-KEPT`; `git status --short` prints nothing.

- [ ] **Step 11: Record the task**

```bash
cd /c/wamp64/www/Hexa-Tech-content && bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/executing-plans/scripts/task-done docs/superpowers/plans/2026-10-19-content-release-5b-2.md 6 <BASE> -- .superpowers/sdd/2026-10-19-content-release-5b-2/vt.sh src/content src/workspace src/appointments
```

---

### Task 7: The deploy (source-patch recipe), after the owner's "yes, deploy"

Run this task after the final whole-branch review and its fix pass (executing-plans' Final Review), so the feature tip it ships is final.

Merging to `main` is a production deploy: Laravel Cloud runs `migrate --force` (release 5b brings four additive migrations) and rebuilds the SPA. Release 5b = Plans 5B-1 and 5B-2 together: the change list runs from the last deployed feature tip `ceda0c4aa`. This task prepares the artifact in its own worktree, proves it, then **stops and asks the owner**. Nothing is pushed without the owner's explicit "yes, deploy" given in answer to Step 6's question.

**Files:**
- Temporary: worktree `C:\wamp64\www\Hexa-Tech-deploy-content-r5b` on branch `deploy/content-r5b` (from `origin/main`), with a copied `vendor`, the local `.env` and a `frontend/node_modules` junction; removed in Step 9 (the branch is kept).
- Ledger: `$R/deploy-list.txt`, `$R/deploy-php.txt`, `$R/deploy-vitest.txt`, `$R/deploy-build.txt`, `$R/postdeploy.txt`.

**Interfaces:**
- Consumes: the feature tip after the review and Task 6 (`TIP`), the last deployed feature tip `ceda0c4aa`, prod main `afbacf056`, `$R/php.sh`.

- [ ] **Step 1: Fix the inputs**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git status --short && git fetch -q origin
TIP=$(git rev-parse HEAD); echo "TIP $TIP"; git log -1 --format='%h %s' origin/main
git diff --stat ceda0c4aa origin/main -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
curl -s -o /dev/null -w 'sites /links %{http_code}\n' https://sites.hexa-tech.uk/links
```

Expected: a clean status; origin/main `afbacf056`; the `git diff` line prints nothing (production's source is exactly the last deployed feature tip); `sites /links 404` — no tenant's landing page (or redirect) is named `links`, the word this release reserves. Anything but 404 there: stop and tell the owner (a page named `links` would keep working, but its owner could not save it again). If origin/main moved on, the `git diff` line lists what changed there: Step 3's fourth guard proves none of it touches this release's files; ledger the new origin/main.

Ledger: `Task 7: note: TIP <sha>; origin/main <sha>; sites /links 404`.

- [ ] **Step 2: The deploy worktree**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree add ../Hexa-Tech-deploy-content-r5b -B deploy/content-r5b origin/main
cp .env ../Hexa-Tech-deploy-content-r5b/.env
```

In PowerShell (robocopy, never a junction for `vendor`; robocopy's exit codes 0–7 mean success):

```powershell
robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-deploy-content-r5b\vendor /E /NFL /NDL /NJH /NJS /NP; if ($LASTEXITCODE -lt 8) { 'VENDOR-OK' }
New-Item -ItemType Junction -Path C:\wamp64\www\Hexa-Tech-deploy-content-r5b\frontend\node_modules -Target C:\wamp64\www\Hexa-Tech-content\frontend\node_modules
```

Expected: `VENDOR-OK`; the junction made. On `ENOSPC` (or robocopy's "not enough space"), stop and report it; delete nothing to make room.

- [ ] **Step 3: The change list and its guards**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-content && git diff --no-renames --name-status ceda0c4aa "$TIP" > "$R/deploy-list.txt"; wc -l < "$R/deploy-list.txt"
cut -f2 "$R/deploy-list.txt" | grep -vE '^(app/|routes/(api|landing)\.php$|config/landing\.php$|lang/(en|ru|de|fr|es)/content_public\.php$|resources/views/content-public/|public/landing/content-public\.css$|tests/|frontend/src/|docs/|database/migrations/2026_10_19_100[2-5]00_)'; echo "(nothing above: every path is in the allowlist)"
cut -f2 "$R/deploy-list.txt" | grep -E '^(frontend/dist/|public/spa/|resources/spa-shell/|composer\.|frontend/package)'; cut -f2 "$R/deploy-list.txt" | grep '^config/' | grep -v '^config/landing\.php$'; echo "(nothing above: no built file, no other config, no dependency)"
cut -f2 "$R/deploy-list.txt" | grep '^database/'; echo "(above: exactly the four release-5b migrations)"
git diff --name-only afbacf056 origin/main -- $(cut -f2 "$R/deploy-list.txt"); echo "(nothing above: production has not changed any file of this release since afbacf056)"
cut -f1 "$R/deploy-list.txt" | sort | uniq -c
```

Expected: about 80 lines; the first two guards print nothing but their notes; the third lists exactly `database/migrations/2026_10_19_100200_create_content_links_table.php`, `…100300_create_content_link_clicks_table.php`, `…100400_create_content_bio_pages_table.php` and `…100500_create_content_bio_buttons_table.php`; the fourth prints nothing; the status count shows `A` and `M` only (release 5b deletes nothing). A path outside the allowlist: stop and find out why before going on (another feature's commit must not ride the deploy); ledger the answer.

- [ ] **Step 4: Apply, check parity, commit**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b
awk -F'\t' '$1 != "D" {print $2}' "$R/deploy-list.txt" > "$R/deploy-am.txt"
awk -F'\t' '$1 == "D" {print $2}' "$R/deploy-list.txt" > "$R/deploy-d.txt"
xargs -a "$R/deploy-am.txt" git checkout "$TIP" --
[ -s "$R/deploy-d.txt" ] && xargs -a "$R/deploy-d.txt" git rm -q --
git diff --cached --stat | tail -1
git diff --cached "$TIP" -- $(cut -f2 "$R/deploy-list.txt") | head -5; echo "(nothing above: parity with the feature tip, deletions included)"
git diff "$TIP" --stat -- . ':!frontend/dist' ':!public/spa' ':!resources/spa-shell' | tail -1
```

Expected: the cached stat counts every line of the list; the parity diff prints nothing; when origin/main was still `afbacf056`, the last line prints nothing too (whole-tree parity with the feature tip outside the built files).

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b && git commit -q -F - <<'EOF'
HexaTech Content, release 5b: tracked links and the link-in-bio page

A post's Link becomes a short link on the public host (/go/{code}) that
adds UTM tags and counts clicks by venue day, direct or from the bio
page; robots and HEAD requests are not counted and nothing about the
visitor is stored. Changing the address keeps the code, clearing it
switches it off ("This link is no longer active"); versions, repeat
copies and duplicates get their own code. The panel shows the short
link with Copy, its clicks and 14 days of bars; cards count clicks.
Each brand gets a link-in-bio page (/links/{name}, off by default) with
up to eight buttons and its latest posts, edited on the Brand page.
Four additive migrations (content_links, content_link_clicks,
content_bio_pages, content_bio_buttons); `links` is a reserved landing
name. Source of feature/content-workspace at TIP_SHA (since ceda0c4aa).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log -1 --format='%h %s'
```

(Before committing, replace `TIP_SHA` in the message with the short sha of `$TIP`, by editing the command.)

- [ ] **Step 5: Every suite on the artifact**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
sed 's#cd /c/wamp64/www/Hexa-Tech-content #cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b #' "$R/php.sh" > "$R/php-deploy.sh" && chmod +x "$R/php-deploy.sh" && grep -n "^cd " "$R/php-deploy.sh"
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b && { ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > "$R/deploy-paths.txt"; wc -l < "$R/deploy-paths.txt"; rm -f "$R/deploy-php.txt"
"$R/php-deploy.sh" $(sed -n 1,10p "$R/deploy-paths.txt") | tee -a "$R/deploy-php.txt"     # then 11,20p … to the end
grep -v "exit 0" "$R/deploy-php.txt"; echo "(nothing above: every path green)"
```

Expected: the `grep -n` line shows `cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b || exit 1`; every PHP path `exit 0` (the same paths and results as Task 6). As in Task 6, `tests/Feature/Landing/` runs on its own in the background.

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b/frontend && npx tsc -b && echo TSC-CLEAN
npx vitest run > "$R/deploy-vitest.txt" 2>&1; tail -5 "$R/deploy-vitest.txt"; grep -E '^ FAIL ' "$R/deploy-vitest.txt" | sed 's/ >.*//' | sort -u
npm run build > "$R/deploy-build.txt" 2>&1; echo "build exit $?"; tail -5 "$R/deploy-build.txt"
cd .. && git status --short | cut -c4- | cut -d/ -f1-2 | sort | uniq -c
```

Expected: `TSC-CLEAN`; vitest `3 failed` only in `src/lib/plannerMeta.test.ts`; `build exit 0`; the status shows changes only under `frontend/dist`, `public/spa` and `resources/spa-shell`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b && git add frontend/dist public/spa resources/spa-shell && git commit -q -m "Build the SPA for HexaTech Content release 5b" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git status --short && git log -3 --format='%h %s'
```

Expected: a clean status; the build commit on top of the source commit, on top of origin/main.

- [ ] **Step 6: STOP — ask the owner**

Ledger `Task 7: note: artifact ready — deploy/content-r5b <sha> (source <sha> + build <sha>), <n> files (A <a>, M <m>), PHP <n> paths green, vitest <n> passed + 3 baseline, build ok`, then ask the owner, with the facts in plain words:

- what ships: tracked short links (a post's Link, the short link with Copy, clicks and 14 days of bars in the panel, click counts on cards; `/go/{code}` adds UTM tags, counts clicks without storing anything about the visitor, and says "This link is no longer active" once cleared); the link-in-bio page per brand (`/links/{name}`, off until a manager switches it on, up to eight buttons and the latest posts, edited on the Brand page);
- the four additive migrations, the two new public paths on `sites.hexa-tech.uk`, the new reserved landing name `links` (Step 1 found no page using it), the new stylesheet `public/landing/content-public.css`; no queue or schedule change;
- what changes for people at once: nothing until someone types a Link or sets up the page; admin tabs left open across the deploy must be reloaded;
- the open questions from Plan 5B-1's review, still the owner's: `utm_medium=social` also for email and blog posts (Google Analytics files those clicks under social), the robot rule's `pinterest` also matching taps inside Pinterest's app, and that any account's staff can make short links that redirect from the shared domain;
- the open items carried: the runbook's "After the deploy" checks for releases 2–5a, the queue `retry_after` check, the three approval questions, the deferred minors of Plans 5A-1, 5A-2 and 5B-1;
- the checks: Task 6's results (suites, `46 screens, 0 differ`, Lighthouse, the browser pass as manager and staff with a real short link and the public page) and Step 5's;
- the question: **"Shall I deploy? Reply 'yes, deploy' to push it to production."**

Wait for the answer. Anything other than a clear yes: do not push; keep the deploy worktree, and do what the owner asks.

- [ ] **Step 7: Push (only after "yes, deploy")**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b && git fetch -q origin && git log -1 --format='%h' origin/main
OLD=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "OLD $OLD" | tee "$R/postdeploy.txt"
for u in /api/v1/admin/content/bio /api/v1/admin/content/bootstrap; do printf 'before %s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: application/json' "https://app.hexa-tech.uk$u")"; done | tee -a "$R/postdeploy.txt"
printf 'before css %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://sites.hexa-tech.uk/landing/content-public.css)" | tee -a "$R/postdeploy.txt"
```

Expected: origin/main is still the commit the deploy branch was cut from (if it moved, stop: rebase nothing, tell the owner and start again from Step 1); `OLD /spa/assets/index-….js`; `before /api/v1/admin/content/bio 404`, `before /api/v1/admin/content/bootstrap 401`, `before css 404`.

```bash
cd /c/wamp64/www/Hexa-Tech-deploy-content-r5b && git push origin deploy/content-r5b:main 2>&1 | tail -2; date -u +%FT%TZ
```

Then wait for Laravel Cloud's new bundle (Bash, `run_in_background`; it re-invokes when it exits):

```bash
OLD='<the OLD path from above>'; for i in $(seq 1 60); do NEW=$(curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && { echo "NEW $NEW at $(date -u +%T)"; exit 0; }; sleep 15; done; echo "STILL OLD after 15 minutes"; exit 1
```

Expected: `NEW /spa/assets/index-….js`. "STILL OLD": look at the Laravel Cloud deploy log with the owner (a failed migration stops the deploy); do not push again.

- [ ] **Step 8: Verify by content**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-2
B=https://app.hexa-tech.uk; S=https://sites.hexa-tech.uk; NEW=$(curl -s $B/ | grep -o '/spa/assets/index-[A-Za-z0-9_-]*\.js' | head -1); echo "NEW $NEW" | tee -a "$R/postdeploy.txt"
curl -s "$B$NEW" -o "$R/live-index.js"; printf 'index data-content/data-appointments: %s\n' "$(grep -c 'data-content\|data-appointments' "$R/live-index.js")" | tee -a "$R/postdeploy.txt"
CA=$(grep -o 'ContentApp-[A-Za-z0-9_-]*\.js' "$R/live-index.js" | head -1); AA=$(grep -o 'AppointmentsApp-[A-Za-z0-9_-]*\.js' "$R/live-index.js" | head -1); echo "chunks $CA $AA" | tee -a "$R/postdeploy.txt"
curl -s "$B/spa/assets/$CA" -o "$R/live-content.js"; for w in 'Link-in-bio' 'Short link' 'Clicks per day'; do printf 'ContentApp has "%s": %s\n' "$w" "$(grep -c "$w" "$R/live-content.js")"; done | tee -a "$R/postdeploy.txt"
curl -s "$B/spa/assets/$AA" | grep -c 'data-appointments' | sed 's/^/AppointmentsApp has data-appointments: /' | tee -a "$R/postdeploy.txt"
for u in /api/v1/admin/content/bio /api/v1/admin/content/bootstrap; do printf 'after %s %s %s\n' "$u" "$(curl -s -o "$R/body.json" -w '%{http_code}' -H 'Accept: application/json' "$B$u")" "$(head -c 80 "$R/body.json")"; done | tee -a "$R/postdeploy.txt"
printf 'after css %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $S/landing/content-public.css)" | tee -a "$R/postdeploy.txt"
for p in /go/zzzz222 /links/zzzz-none; do printf 'public %s %s cookies %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' $S$p)" "$(curl -s -D - -o /dev/null $S$p | grep -ci '^set-cookie')"; done | tee -a "$R/postdeploy.txt"
for p in / /content /content/ideas /content/brand /appointments; do printf 'page %s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done | tee -a "$R/postdeploy.txt"
rm -f "$R/live-index.js" "$R/live-content.js" "$R/body.json"
```

Expected: `index data-content/data-appointments: 0`; both chunk names found; the ContentApp chunk has each of the three phrases (counts ≥ 1); `AppointmentsApp has data-appointments:` ≥ 1; `after /api/v1/admin/content/bio 401 {"message":"Unauthenticated."…` (it answered 404 before) and `after /api/v1/admin/content/bootstrap 401`; `after css 200` (404 before); `public /go/zzzz222 404 cookies 0` and `public /links/zzzz-none 404 cookies 0`; the five pages `200`. Any other answer: tell the owner at once, with the line.

- [ ] **Step 9: Clean up and record**

In PowerShell, the junction first, then the worktree:

```powershell
cmd /c rmdir C:\wamp64\www\Hexa-Tech-deploy-content-r5b\frontend\node_modules
```

```bash
cd /c/wamp64/www/Hexa-Tech-content && git worktree remove --force ../Hexa-Tech-deploy-content-r5b && git worktree list | grep -c deploy-content-r5b; test -d frontend/node_modules/react && echo MODULES-KEPT
```

Expected: `0`; `MODULES-KEPT`. (`--force` because the copied `vendor` and `.env` are untracked files in it; the branch `deploy/content-r5b` stays.)

Ledger: `Task 7: complete — LIVE as prod main <sha> (source <sha> + build <sha>; <n> files) pushed <time>Z, new index live <time>Z (<index>, <ContentApp chunk>); verified by content (postdeploy.txt): …`.

Update the memory file `content-workspace.md` and its line in `MEMORY.md`: release 5b LIVE as prod main `<sha>` (date), verified by content; release 5 complete; the owner's checks open (the runbook's "After the deploy" lines for releases 2–5b, the queue `retry_after` check, the three approval questions, the three 5B-1 review questions, the deferred minors of Plans 5A-1, 5A-2 and 5B-1).

Tell the owner it is live, with the verification lines and the runbook's "After the deploy" checks.
