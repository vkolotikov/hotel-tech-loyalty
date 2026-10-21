# HexaTech Loyalty — the loyalty programme as its own workspace (design)

**Date:** 2026-10-21 · **Status:** owner's answers taken (below); written spec for the owner's review · **Branch:**
`ccr-9a004154-cs7txb`, cut from `origin/main` `e17d417` (Content release 7a).
Reference pattern: HexaTech Content (`/content`, `docs/content-workspace.md`, release 7a look) and HexaTech Appointments
(`/appointments`, `docs/appointments-workspace.md`).

## 1. Why

The loyalty programme lives in the full admin as four hubs of the "Members & Loyalty" group (Members, Program, Rewards,
Campaigns) plus Scan, wallet, the loyalty parts of Settings and Analytics: about 8,000 lines of screens, much of it
English only or missing translation keys (Program and Rewards hubs, boost events, Scan, member import, loyalty settings,
about 100 Analytics labels). Some of what the server can do has no screen at all: a member's points cannot be reversed
(the Appointments runbook says they can), the benefit requests members send from the app have no queue, and the
programme's "on" switch is the server's alone. The owner wants loyalty and membership to become a workspace of their
own, in the same style as HexaTech Content.

## 2. Owner decisions

| # | Question | Answer | When |
|---|---|---|---|
| D1 | Name and address | **HexaTech Loyalty** at **`/loyalty`** (the staff side; `/portal` stays the members' own portal). | 2026-10-21 |
| D2 | First release | **Members and the member's page** (points: award, redeem, reverse; benefit requests), **Program** (tiers, benefits, boost events), **Rewards** (catalogue, redemptions, offers, referrals), **Scan**. Later: campaigns, wallet and the member app's look, analytics, import, duplicates, segments. | 2026-10-21 |
| D3 | The full admin's screens | **Stay, beside the workspace**, as with Appointments. Nothing in the full admin is removed or changed in behaviour. | 2026-10-21 |
| D4 | Look | **Content's new look** (release 7a): the navy palette, the side panel as cards, Settings / Help & resources / the person at its foot, the breadcrumb, the page header. The owner answered "Yes, please proceed" to the list whose first option this was; read as that option. | 2026-10-21 |
| D5 | Who has it | **Every organisation, on by default**, as Content (not asked back: the owner said proceed; this is the default proposed). The Appointments plan does not hold it. | 2026-10-21 |

Earlier rulings that still bind: text on a coloured fill is white while white reads ≥ 3:1, else dark ink (2026-10-09);
fills use the brand colour, lines and text the readable accent (`--a-accent-text`); owner-only UI is gated on the
server's `isPlatformAdmin`; a way in that reads the stored session user refreshes it from `/v1/auth/me`.

## 3. Non-goals (this release)

- No change to the full admin's loyalty screens or their endpoints (D3). They keep working as they do.
- No change to the member portal (`/portal`), the mobile app's member API (`/v1/member/*`), the public join page, or
  the staff mobile app's scan endpoints (`/v1/admin/scan/*`): their requests and answers stay as they are.
- No campaigns, push or email, wallet passes, member-app look, analytics, member import, duplicates, merge or segments
  in the workspace (the full admin keeps them; D2's later list).
- No new table, no migration. The workspace switch lives in `organizations.settings` like Content's.
- No AI call: the full admin's scan asks the AI for an upsell sentence on every scan; the workspace's scan does not.
- No brand choice: the programme is the organisation's (members and tiers have no brand). Lists the server scopes by
  brand (rewards, offers, boost events, the points ledger) are read for the whole organisation, as the full admin's
  "All brands"; a staff member restricted to one brand still sees only that brand's (the shared `brand` middleware).
  Anything created lands on the organisation's default brand, as in "All brands" today.

## 4. The workspace — screens

Content's frame (§6.1): the navy side panel with the areas as cards under "Workspace", Settings · Help & resources ·
the person at its foot, a top bar that starts with a breadcrumb (the organisation's mark and name, "/", the page) and
holds Find. Light / Dark / Auto; the organisation's brand colour as the accent.

### 4.1 Side panel

Members · Requests · Program · Rewards · Scan. Every staff member sees every area; what they may not do is absent
(§5).

### 4.2 Members — home (`/loyalty`)

- Header "Members" with the numbers line: members, active, new this month, average points (the server's figures).
- A tier chip row (each tier with its count; pressing one filters, pressing it again clears), a search box (name,
  email, phone, member number; from two characters), a sort menu (newest, points, name, last activity) and Active /
  Inactive / All.
- A table (a list of cards below 768 px): name with email, member number, tier chip, points, last activity, joined.
  50 a page. The search, filters, sort and page live in the address, so a list can be shared.
- A row opens the member's page.

### 4.3 The member's page (`/loyalty/members/<id>`)

- Header: the name, the tier chip, member number, joined, last activity; "Open in full admin" (the full admin's member
  page, for what the workspace does not do: edit details, CRM, bookings).
- Cards: Points (balance, lifetime, the progress to the next tier from the server's `progress`), Tier benefits (the
  tier's active benefits with their values), Requests (this member's pending and approved benefit requests with their
  actions, §4.4).
- Actions: **Award points** and **Redeem points** (a dialog each: points, a reason; the balance after is shown before
  sending; redeem refuses more than the balance).
- **Points history**: the member's whole ledger, newest first, 25 a page — type, points (+/−), balance after,
  description, who, when, and "Reversed" / "Reversal of …" marks. A manager's **Reverse** on a line (a dialog with a
  reason) undoes it through `LoyaltyService::reverseTransaction()`; a reversal line and a line already reversed offer
  none.

### 4.4 Requests (`/loyalty/requests`)

The benefit requests members send from the app (`benefit_entitlements`): tabs Waiting (pending), Approved, Done
(fulfilled, declined), newest first, 25 a page. Each row: the member (opens their page), the benefit, when it was asked,
the state. Waiting: Approve, Decline (a reason, required); Approved: Mark done, Decline. The side panel's card shows the
waiting count.

### 4.5 Program (`/loyalty/program`)

Three sections:

- **Tiers** — the ladder in order: colour, name, from N points (and nights, stays, spend where set), earn rate,
  members in it, active or not, and the tier's benefits as chips. Managers add and edit a tier (name, colour, min points,
  earn rate, description, active) and add a benefit to a tier (its wording and, where it is a discount or multiplier,
  its typed value and what it applies to) or take one off.
- **Benefits** — the catalogue: name, code, category, how it is given (automatic, staff approved, on request, voucher,
  linked to the booking system), active. Managers add, edit, switch off.
- **Boost events** — points multipliers: name, ×multiplier, from–to, weekdays, tiers, live / upcoming / ended. Managers
  add, edit, remove.

### 4.6 Rewards (`/loyalty/rewards`)

Tabs (in the address, `?tab=`):

- **Catalogue** — cards: name, category, points cost, stock, per-member limit, redeemed and fulfilled counts, active.
  Staff with "manage offers" add and edit (name, description, terms, category, points, stock, per-member limit,
  discount type and value, applies to, expiry, active).
- **Redemptions** — Pending first, then the rest: code, member, reward, points, when, state. "Mark fulfilled" and
  "Cancel" (a pending cancel gives the points back, as the full admin's) for staff who may redeem points.
- **Offers** — title, type and value, code, dates, tiers, used / limit, active. Staff with "manage offers" add and edit
  (title, description, type, value, code, applies to, tiers, dates, limits, featured).
- **Referrals** — the numbers (total, rewarded, pending, points paid out) and the list (referrer, referee, state,
  points, when). Read only.

### 4.7 Scan (`/loyalty/scan`)

One field that takes what a card scanner or a typed entry gives: a member number, the member app's QR code (a secure
token, the legacy token, or the v2 JSON with `member_number`), or an NFC card's ID. Found: the member's card (name, tier,
points, the tier's benefits, open requests) with Award, Redeem and "Open member". Not found: the reason in our words
(not found, expired, revoked, used up, inactive). Every scan is recorded in `scan_events` as the full admin's is.

### 4.8 Find, shortcuts, notices

- **Find** (Ctrl/⌘ K or "/"): members by name, email, phone or number from two characters (up to 8), plus the areas and
  the look actions (theme, collapse menu, shortcuts).
- Shortcuts: / or Ctrl K Find · ? the list · S Scan · on a member's page A awards and R redeems (the shared engine takes
  single letters only).
- Notices: switched off, subscription not active, the programme not set up (no active tier: managers are pointed to
  Program).

## 5. Roles

Decided on the server (`App\Services\Loyalty\LoyaltyAccess`); the bootstrap carries the answers so the screens never
show a button the server would refuse.

| Action | Who | Same as the full admin |
|---|---|---|
| Open the workspace; read every page; Scan; Find | every active staff member | yes |
| Award points | `can_award_points` | yes (`MemberAdminController::awardPoints`) |
| Redeem points; fulfil or cancel a redemption | `can_redeem_points` | yes |
| Reverse a ledger line | managers (`super_admin`, `manager`) | new: the full admin has no screen for it |
| Approve, decline, mark done a benefit request | every active staff member | yes (`admin/entitlements` is staff) |
| Edit tiers, benefits, tier benefits, boost events | managers | yes (the Program hub is manager-only) |
| Edit rewards and offers | `can_manage_offers` | yes (`staff.can:can_manage_offers`) |

A deactivated staff row counts for nothing. A platform admin passes every flag (as `staff.can`).

## 6. How it is built

### 6.1 Shared core — `frontend/src/workspace/` grows with Content's frame

Loyalty may not import from `content/` (the sweeps forbid one workspace importing another), so the generic pieces of
Content's release 7a frame move into the shared core, unchanged in behaviour and look, and Content imports them from
there:

| Piece | From | To |
|---|---|---|
| The side-panel foot and the phone menu (`FrameFooter`, `PhoneMenu`, `SettingsPanel`, `HelpList`, `PersonList`) | `content/shell/FrameFooter.tsx` | `workspace/shell/FrameFooter.tsx` |
| The small list a button opens (`SideMenu`) | `content/shell/SideMenu.tsx` | `workspace/shell/SideMenu.tsx` |
| `menuKey`, `roleLabelKey` | `content/shell/shellMath.ts` | `workspace/shell/shellMath.ts` (Content keeps `brandInitials`, `pageKeyOf`) |
| `outside`, `focusWasInside`, `listPlace` | `content/ui/menuFocus.ts` | `workspace/lib/menuFocus.ts` |
| The modal (`Dialog`) and `trapTarget` | `content/ui/Dialog.tsx`, `dialogFocus.ts` | `workspace/ui/Dialog.tsx`, `workspace/lib/dialogFocus.ts` |
| The page's error boundary | `content/ui/ContentErrorBoundary.tsx` | `workspace/ui/PageBoundary.tsx` |
| The page header's frame (title, line, below, actions) | `content/ui/PageHeader.tsx` | `workspace/ui/PageHeader.tsx` (Content's adds New post) |

Their words move with them, from `content.*` to `workspace.*` (Settings, Help & resources, Keyboard shortcuts, Find,
the three role names), with the same text in all five languages; Content's own copies stay in its bundles unread, as
Appointments' did. The navy palette stays Content's (`[data-content]`); Loyalty sets the same values under
`[data-loyalty]`, and a test proves the two are equal to `NAVY_SURFACES` (the shared constant Content's maths already
uses, today named `CONTENT_SURFACES`, kept as an alias).

Content looks and behaves the same: its suites, the build check, and a before/after screenshot of the Plan, the panel
and the side panel's menus (1440 and 390 px, light and dark).

### 6.2 HexaTech Loyalty — `frontend/src/loyalty/`

- `LoyaltyApp.tsx` lazily imported by `App.tsx` at `/loyalty/*` (own chunk, outside the full admin's `Layout`, the full
  admin's copilot hidden there). Guard: no session → `/login?redirect=…`; a member → `/portal`.
- `LoyaltyProvider` (bootstrap query `['loyalty','bootstrap']`, no retry on 401/403), `LoyaltyShell` (on
  `WorkspaceShell` with `variant: 'cards'`, the footer, the phone menu, the breadcrumb), pages `members/`, `member/`,
  `requests/`, `program/`, `rewards/`, `scan/`, `find/`.
- `lib/api.ts` with `BASE = '/v1/admin/loyalty'`, every call sending `brand_id=all` so the full admin's brand choice
  does not narrow the programme, a `watched()` wrapper that raises the switched-off notice on `workspace_disabled`.
- Words in `loyalty/i18n/loyalty.{en,ru,de,fr,es}.json` under `loyalty.*`, registered when the chunk loads; every
  refusal shown in the workspace's own words (`lib/errors.ts`).
- `theme/loyalty.css` under `[data-loyalty]`: the navy palette (§6.1), the tier chip (the tier's own colour as a
  fill, white or dark ink by the 3:1 rule, outlined where it nearly vanishes on the surface), the state tones
  (pending, approved, fulfilled, declined, cancelled), each ≥ 4.5:1 over its tint.
- Only `a-*` and `l-*` classes, only `/v1/admin/loyalty` (`loyalty/tokens.test.ts`).

### 6.3 Workspace flag, sign-in, command

- `Organization::WORKSPACE_DEFAULTS = ['appointments' => true, 'content' => true, 'loyalty' => true]`; the
  Appointments plan holds only its own workspace (as today, by the same rule).
- `workspacesPayload()` carries `loyalty: {landing}`; sign-in and `/auth/me` carry it as they do the others.
- One landing per organisation (`setWorkspace` already loops over every workspace). `landingPath`: Appointments-only →
  Appointments landing → Content landing → Loyalty landing → unchanged.
- `php artisan workspace:loyalty <organisation id> --on [--landing] | --off | --status`, and `--list`.

### 6.4 API — `/v1/admin/loyalty/*`

Inside the admin group (`saas.auth, auth:sanctum, tenant, brand, throttle`, then `admin, admin.access,
check.subscription`) behind `workspace:loyalty`; a test proves every route under the prefix carries the gate.
Controllers in `app/Http/Controllers/Api/V1/Admin/Loyalty/`. Access map: `admin/loyalty` → `staff, staff, loyalty`
and one key per area mirroring §5 (`admin/loyalty/program` change `manager`, `admin/loyalty/rewards` change
`can_manage_offers`, …); the controllers check §5 themselves too, since the map only records outside `enforce`.

| Method + path | What |
|---|---|
| GET `bootstrap` | name, organization {id, name, industry}, accent, venue {timezone, today}, staff {id, name, role, can: {award, redeem, reverse, manage_program, manage_rewards}}, programme {on, tiers: [{id, name, color, min_points}]}, counts {members, requests_waiting} |
| GET `members?q&tier_id&state&sort&page` | 50 a page, with the numbers line (`figures`) |
| GET `find?q` | up to 8 members |
| GET `members/{id}` | member, tier, progress, the tier's benefits, open requests |
| GET `members/{id}/history?page` | the member's whole ledger, 25 a page (every brand) |
| POST `members/{id}/award` · `members/{id}/redeem` | `{points, reason, idempotency_key}` → the member's new balance |
| POST `members/{id}/history/{line}/reverse` | `{reason}`; the line must be the member's, not a reversal, not reversed |
| GET `requests?state&page` · POST `requests/{id}/approve` · `/decline` (`reason`) · `/done` | the benefit-request queue |
| POST `scan` | `{code}` → the member's card, or `{error: not_found | expired | revoked | used_up | inactive}` |
| GET `program` | tiers (with member counts and benefits), benefits, boost events |
| POST/PUT `program/tiers[/{id}]` · POST/PUT/DELETE `program/benefits[/{id}]` · POST/DELETE `program/tiers/{id}/benefits[/{tb}]` · POST/PUT/DELETE `program/boosts[/{id}]` | managers |
| GET `rewards` · POST/PUT `rewards[/{id}]` | catalogue (changes: `can_manage_offers`) |
| GET `redemptions?state&page` · POST `redemptions/{id}/fulfil` · `/cancel` | `can_redeem_points` for the actions |
| GET `offers` · POST/PUT `offers[/{id}]` | offers (changes: `can_manage_offers`) |
| GET `referrals?page` | the numbers and the list |

Refusals are `{error, message}` with a code the workspace turns into its own words: `not_found`, `manager_only`,
`not_allowed` (a missing capability, with `need`), `not_enough_points` (with `balance`), `cannot_reverse`,
`already_reversed`, `wrong_state` (with `state`), the scan's five, and Laravel's validation answer (field names) for a
form — a taken code, a percentage over 100 or a multiplier under 1 are field errors there. (As built, 2026-10-21.)

### 6.5 Server pieces — `app/Services/Loyalty/`

- `LoyaltyAccess` — §5's rules, used by every controller and the bootstrap; `LoyaltyRefused` — the refusal
  (rendered `{error, message}`, never logged as an incident), as `ContentRefused`.
- `MemberDirectory` — the list, the figures and Find, in SQL that runs on PostgreSQL and on the tests' SQLite (no
  `ILIKE`; `LOWER(…) LIKE ? ESCAPE '!'`, the search words literal).
- `MemberLedger` — the history (whole ledger, every brand, still the organisation's only) and the reversal's rules.
- `CardLookup` — what a scanned code names, within this organisation only, recorded in `scan_events`.
- The writers stay where they are and are called as the full admin calls them: `LoyaltyService::awardPoints()`,
  `redeemPoints()`, `reverseTransaction()`; `BenefitEntitlement::approve()/fulfill()/decline()`; the redemption's
  fulfil and cancel (moved from `RewardAdminController` into `App\Services\Loyalty\RedemptionActions`, which that
  controller then calls, with the same answers). Program and Rewards writes are new, small and checked: every id a
  request names (a tier, a benefit, a property, `tier_ids`) must belong to this organisation (422 on the field),
  which the full admin's `exists:` rules do not check.

### 6.6 Time

"Today", "this month" and a boost event's live/upcoming/ended are the venue's (`VenueClock`, sent in the bootstrap);
ledger and request times are instants shown in the venue's zone.

### 6.7 Way in, way back

- Full admin menu: **HexaTech Loyalty** first in "Members & Loyalty" (`gate: 'all'`, `workspace: 'loyalty'`), shown by
  `showsWorkspaceLink(liveUser, 'loyalty')`.
- "Full admin" in the workspace opens `/members` (staff and managers alike: the Members hub is everyone's).
- The member's page links to the full admin's member page; the full admin's member page is not changed (D3).

## 7. Words, errors, accessibility

- Every word in English, Russian, German, French and Spanish; `loyaltyLocales.test.ts` keeps the key sets equal and the
  `{{names}}` intact; the global completeness net reads the bundle too.
- Session expired: `/login?redirect=<same page>` and back. Switched off: a calm notice with the way to the full admin.
- Everything by keyboard; dialogs hold and give back the focus; text never under 12 px; every colour pair meets 4.5:1
  (3:1 for fills and marks) in light and dark, pinned by tests.

## 8. Tests

- **Server** `tests/Feature/LoyaltyWorkspace/`: the gate on every route; the Appointments plan refused; staff vs
  managers vs capabilities, endpoint by endpoint; another organisation's member, line, request, tier, reward and offer
  answer 404, and its ids in a body 422; award, redeem and reverse through the real ledger (balance, lifetime, the
  reversal line, a second reversal refused, a reversal line refused); the history includes every brand's lines; the
  scan's five refusals and that it never finds another organisation's member; the request queue's transitions; the
  redemption's fulfil and cancel give the same answers through both addresses; sign-in / `me` payload, one landing;
  `workspace:loyalty`; the access map keys.
- **Frontend** (`src/loyalty/**`, `src/workspace/**`): locale completeness; the token sweep; the pure decisions (which
  actions a role sees, a ledger line's Reverse, the tier chip's ink, the address ↔ filters round trip); Content's suites
  unchanged after the move.
- **Real browser**: 1440 and 390 px, light and dark, English and Russian, as a manager and as staff.

## 9. Rollout

One deploy, through the source-patch recipe (`docs/landing-page-builder.md` §6), waiting for the owner's "yes,
deploy": the shared-core move and HexaTech Loyalty, no migration. Verify by content on the live site: the `LoyaltyApp`
chunk carries the workspace's words and the index bundle does not; `/api/v1/admin/loyalty/bootstrap` answers 401 when
signed out (404 before); `/content` as before.

Owner after the deploy: open `/loyalty` as a manager and as a staff member; award and reverse 1 point on a test member;
approve one benefit request; scan one member's QR code; reload admin tabs left open.

## 10. Risks

| Risk | Answer |
|---|---|
| The move breaks Content. | Pure moves with the same words; Content's suites and a before/after screenshot of its frame. |
| Content release 7b is written at the same time and edits a moved file. | 7b's spec names no shared file; its branch merges `main` before its deploy (a moved file merges as a rename). |
| A reversal makes a balance negative. | `reverseTransaction()` already allows it (a refunded booking's points spent meanwhile); the dialog shows the balance after, and the line says so. |
| Staff see programme numbers they did not see in the full admin (Program and Rewards are manager-only menus there). | Read-only for them; the owner can say "managers only" and the bootstrap hides the areas. |
