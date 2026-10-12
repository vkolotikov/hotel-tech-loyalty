# HexaTech Appointments — "Atelier" redesign

Status: design agreed with the owner section by section (2026-10-11 / 2026-10-12); written spec awaiting the owner's review.
Mock-up (private canvas, three interactive boards; A is the chosen one): https://claude.ai/artifact/85gyh2CMopJAGGiUcYHePW

## 1. Why

The owner wants the Appointments workspace (`/appointments`) to feel modern, calm and premium, so that people *like*
using it, and wants daily desk work to be faster. Today it has a light canvas, a fixed navy rail, one teal accent,
no dark theme, no collapsing, no motion, no keyboard shortcuts beyond moving a selected card, and no colour per team
member.

## 2. Owner decisions (binding)

| # | Decision | When |
|---|----------|------|
| D1 | Scope: a new look on every screen **plus** faster daily work (Find, shortcuts, colour per team member, Today strip, hover preview). | 2026-10-11 |
| D2 | Dark theme chosen **per person**: Light / Dark / Auto switch, remembered **on that device**. | 2026-10-11 |
| D3 | Direction **A · Atelier** from the mock: editorial and calm, serif headings and figures, ink side panel, white cards with a team-colour dot. | 2026-10-12 |
| D4 | Accent = **the organisation's own brand colour** (Settings → Branding → Primary), made readable automatically. | 2026-10-12 |
| D5 | Two releases: **R1** new look (every screen, dark theme, collapsible side panel, accent, motion); **R2** faster daily work. | 2026-10-12 |
| D6 | Default theme for everyone is **Light**; Auto follows the device; nobody turns dark unasked. | 2026-10-12 |
| D7 | Section 2 (screens) and section 3 (R2 features) approved as presented; "proceed and deploy": each release ships once its tests pass and it has been checked in a real browser. | 2026-10-12 |

Earlier rulings that still bind: the full admin's styles (Glass / Classic / Clean light) and the public booking page do
not change; text on a coloured fill is white while white reads ≥ 3:1 on it, else dark ink (owner, 2026-10-09);
money figures stay manager-only, as today.

## 3. Non-goals

- No change to what anyone can do: actions, permissions, URLs, data, the 30-second refresh, drag/resize/arrow-key
  behaviour, the narrow-screen List view below 1024 px.
- No new UI or animation library (no Radix/shadcn, no Framer Motion). CSS transitions and keyframes only.
- No per-organisation choice of look: the workspace has one design (Atelier) in two themes.
- No change to the full admin, the member portal, the public widget or e-mails.

## 4. Release 1 — the new look

### 4.1 Theme system

The workspace already draws every colour through its own tokens (`--a-*` in `appointments/theme/appointments.css`,
Tailwind `a-*` aliases; `theme/tokens.test.ts` forbids raw colours). R1 keeps that mechanism:

- `[data-appointments]` keeps the **light** token set; `[data-appointments][data-theme="dark"]` adds the **dark** set.
  The root element gets `data-theme="light|dark"` from the resolved preference (4.3).
- Light (Atelier): canvas `#F4F6F8`, surface `#FFFFFF`, surface-2 `#EEF2F5`, border `#DDE3E8`, text `#1B2A34`,
  text-2 `#54626E`; side panel ink `#0E1A24`, side-2 `#1F2D38`, side text `#E8EEF2`, side text-2 `#A9BAC4`.
  Status tones keep today's light values.
- Dark (Atelier): canvas `#0E1A24`, surface `#13232F`, surface-2 `#1A2E3C`, border `#2A3B48`, text `#E8EEF2`,
  text-2 `#9FB2BD`; side panel `#0A141C`, side-2 `#16242F`; status tones pending `#F0B35A`, confirmed `#5FD39A`,
  in progress `#B3A6FF`, completed `#A9C1E3`, cancelled `#A3ADB8`, no-show / danger `#FF8A9B`.
- New tokens: `--a-hatch` (time-off stripes), `--a-grid-half` (half-hour lines), `--a-now` + `--a-now-ink` (now line),
  `--a-shadow`, `--a-shadow-lg`, `--a-scrim`, `--a-accent-text` (4.2).
- `color-scheme` follows the theme (form controls, scrollbars).
- `theme/contrast.test.ts` is extended to check **both** sets: every text/background pair it checks today, at 4.5:1,
  in light and in dark, plus the new tokens' pairs (now-ink on now, text on surface-2 under the hatch).

### 4.2 Accent from the organisation's brand

- The bootstrap payload (`GET …/appointments/bootstrap`, `BootstrapController`) gains `accent`: the organisation's
  `primary_color` setting when it is a valid `#rrggbb`, else `null`. The client falls back to `#3B82F6` (the admin's
  default palette) when `null`.
- The client derives, per theme, in one pure module (`appointments/theme/accent.ts`):
  - `--a-accent` = the brand colour (fills: primary button, selected segment, mark);
  - `--a-accent-ink` = white when white reads ≥ 3:1 on the brand, else ink (`#0E1A24`) — the owner's rule;
  - `--a-accent-deep` = the hover fill: the brand moved 12 % away from its ink, so the ink keeps (or gains) contrast;
  - `--a-accent-text` = accent-coloured text: the brand darkened (light) / lightened (dark) in 5 % steps until it reads
    ≥ 4.6:1 on a 14 % accent tint over the surface — so also on canvas, surface and surface-2.
- Every current text use of `accent-deep` (links, selected labels) moves to `accent-text`.
- One rule (final review, 2026-10-12): **fills** use the brand (`--a-accent`: primary button, mark, selected day);
  **lines and text** use `--a-accent-text` for every brand (focus outline, selected rings and outlines, tab underline,
  borders, links) — the raw brand drew rings below 3:1 for most industry default colours.
- Tests: a 28-colour brand fixture (pale `#ffffff`, `#f5f5f5`, `#fde68a`; dark `#111111`; saturated; the 14 presets)
  proves, for both themes, accent-ink on accent ≥ 3:1 (white) or ≥ 4.5:1 (ink), accent-ink on accent-deep likewise,
  accent-text ≥ 4.5:1 on canvas, surface and surface-2.
- A brand that reads < 1.5:1 against the weakest of canvas, surface and surface-2 (`data-accent-edge`) gets a 1 px
  inset edge in `accent-text` on accent fills, so a white or near-black button still has an edge on its page.
- The frame remembers the last accent and organisation initial on the device (`appointments:brand`), so it does not
  flash the fallback blue while the bootstrap loads.

### 4.3 Preferences (per device)

`lib/prefs.ts` (`appointments:prefs` in localStorage) gains:

- `theme: 'light' | 'dark' | 'auto'` — default `'light'` (D6). Auto resolves through
  `matchMedia('(prefers-color-scheme: dark)')` and follows changes while open.
- `rail: 'full' | 'slim'` — default `'full'`.
- (R2) `hiddenMasters: number[]` — default `[]`.

Unknown or broken values fall back to the defaults (the existing parser pattern). The resolved theme is read
synchronously in the shell's first render, so the workspace never paints in the wrong theme.

### 4.4 Typography (self-hosted, no Google requests)

- Display (headings, the date, big figures, client names in panels): **Fraunces** (variable weight, Latin + Latin
  Extended). Fraunces has no Cyrillic, so the same family name also maps the Cyrillic range to **Source Serif 4**
  (variable) through `unicode-range`; Russian headings get a matching serif automatically.
- Text: **Inter Tight** (variable; Latin, Latin Extended, Cyrillic).
- Times, small labels, references: **IBM Plex Mono** 500 (Latin, Latin Extended, Cyrillic).
- Files live with the other self-hosted faces (`frontend/src/theme/fonts`, OFL licences beside them), are declared in
  `appointments.css` only (so the full admin never downloads them) and use `font-display: swap`.
- The full admin's global "mood" heading font and dark form colour scheme keep being neutralised inside
  `[data-appointments]` (as today).

### 4.5 Frame (shell)

- **Side panel** (≥ 1024 px): ink in both themes. Top: a mark (the organisation's initial on the accent), the
  organisation name, "HexaTech Appointments". Middle: Calendar, Clients, Takings and Insights (managers only, as
  today), Setup — the active item has a lighter pill and a small accent dot. Bottom: the theme switch (Light / Dark /
  Auto, a three-part segmented control), Full admin (unless the Appointments plan has none, as today), language, the
  person's name, Sign out, and the collapse toggle.
- **Slim side panel**: 76 px wide, icons only; every item keeps its accessible name and shows a hover/focus label; the
  segmented theme switch stacks vertically. Width animates (300 ms); the toggle says "Collapse menu" / "Expand menu"
  and carries `aria-expanded`.
- **Top bar**: client search (R2 turns it into Find) and New appointment as the accent pill.
- **Below 1024 px**: today's structure (icons in the top bar, menu sheet) in the new look; the theme switch and
  Full admin sit in the menu sheet.

### 4.6 Screens

- **Calendar**: the date as a Fraunces heading with "Week NN"; Today, ‹ ›, Day/Week/List segmented; the person
  filter and "show cancelled" as today. Grid: hour lines plus fainter half-hours, mono times in the gutter, a "now"
  line with a pulsing dot and a time label. Column heads: initials avatar, name, role, bookings count. Cards: surface
  colour with a 1 px border, mono time, service (600), client, status icon + word; done cards on surface-2; no-shows
  struck through; time off hatched. Hover lifts a card 2 px with a soft shadow. The right column (≥ 1280 px) keeps the
  mini month and day overview, restyled. Loading shows a soft placeholder grid instead of "Loading…".
- **Appointment panel**: same contents, forms and actions; slides in (320 ms) beside the calendar, which stays
  usable. Header: status chip, reference, close; client initials avatar, name in Fraunces, phone, loyalty tier.
  Details in bordered rows; a three-step progress bar (Confirmed → In the chair → Completed, from the status;
  no-show/cancelled show none); money block (price, paid, due); actions as accent primary + outlined secondary.
- **Clients** (list, profile), **Takings**, **Insights**, **Setup** (tabs, editors, checklist, conflict dialog):
  same structure; Fraunces figures and headings, mono eyebrow labels, hairline tables, restyled tabs and dialogs.
- **Notices, dialogs, empty states, buttons, fields**: the shared `ui/` primitives restyled once.

### 4.7 Motion

Durations 150–350 ms, ease-out: tiles/cards rise 12 px + fade on first load (staggered ≤ 60 ms), cards lift on hover,
the panel slides in, dialogs scale in from 98 %, theme changes fade colours (300 ms), the now dot pulses (2.4 s).
Everything is disabled under `prefers-reduced-motion: reduce` (the existing rule). No motion carries meaning.

### 4.8 Words

New strings (theme switch, collapse/expand, week label, placeholders) in all five languages (en, de, es, fr, ru).

## 5. Release 2 — faster daily work

### 5.1 Find (Ctrl K / ⌘ K, or "/")

A dialog opened from anywhere in the workspace (and by clicking the top-bar search):

- **Actions**: New appointment, Go to Calendar / Clients / Takings / Insights / Setup, Time off, Switch theme,
  Collapse menu — filtered by what the person may do (`can_manage`, plan).
- **Appointments**: those in the loaded calendar range, matched by client, service or team member; empty query shows
  today's next three.
- **Clients**: the existing client search (`GET …/clients?search=`), from 2 characters, debounced 200 ms.
- Arrow keys move, Enter opens, Esc closes; the result count is announced politely; focus returns to where it was.

### 5.2 Keyboard shortcuts

Only when focus is not in a text field, select or contenteditable, and no dialog is open: **N** new appointment,
**T** today, **← / →** previous / next day (week in week view), **D / W / L** views, **Esc** closes the panel,
**?** opens a shortcuts sheet. The existing arrow-key move of a focused card wins over ← / → (card focus is checked
first). Shortcuts are listed in the sheet and in Find's footer.

### 5.3 Colour per team member

- Database: one additive, nullable column `service_masters.color` (`#rrggbb`). No backfill.
- A 10-colour palette chosen to read as a dot and a ring in both themes and to differ in lightness, not hue alone.
- When a team member has no colour, the server assigns one in the calendar payload: the first palette colour not used
  by an active team member with a lower id (stable, no writes). Managers can pick one in Setup → Team (palette
  swatches; saved through the existing team update endpoint, validated against the palette).
- Shown as: the dot on cards, the ring on the column-head avatar, the team chips. Never used for status.
- The full admin ignores the column.

### 5.4 Today strip and team chips

Above the grid in the Day view, for the chosen date:

- **Appointments**: count; "N done · N no-show".
- **Next up** (today only; other days show the first appointment): time, service, client, team member.
- **Takings so far** (managers): taken vs expected, from the Takings day endpoint (same figures as the Takings
  screen). **Needs attention** (everyone else): the existing `dayOverview()` count.
- **Team today**: avatars, and who is off (from the masters' days in the payload).

The day overview's counts move into the strip; the right column keeps the mini month and the status key.
Under the strip, **team chips** show / hide people in the Day view (`hiddenMasters`, per device; at least one stays
visible). The Week view keeps its one-person picker.

### 5.5 Hover preview

Pointer rest of ~300 ms (or keyboard focus) on a card shows a small card: client, loyalty tier and points (when the
programme is on), service, time and length, team member, price and paid state. Not shown while dragging, nor on touch
(tap opens the panel as today). It is `role="tooltip"` linked by `aria-describedby`, flips left near the right edge
and upward in the lower part of the day.

## 6. Quality bar and tests

- Contrast: both token sets and the accent derivation (4.1, 4.2) by test.
- `tokens.test.ts` (no raw colours) stays green; new files are covered automatically.
- Unit tests: prefs parsing (theme, rail, hiddenMasters), theme resolution (auto + change), accent module, team colour
  assignment (server and client), Find ranking/filtering and permissions, shortcut guard (inputs, dialogs, card
  focus), Today strip figures, hover-preview placement.
- PHP: bootstrap `accent` (valid, invalid, missing); `service_masters.color` migration; team update validates the
  palette; calendar payload carries the assigned colour; scoped suites `tests/Feature/Appointments/`,
  `tests/Unit/Appointments/` and the Settings suite.
- Browser: Playwright at 1440 and 390, light and dark, every screen, against the mock; keyboard-only pass; reduced
  motion; axe in the page. Local checks never save through the UI unless the row is cleaned up afterwards.
- Frontend: `npx tsc -b && npx vitest run` (only the 3 known plannerMeta failures; the stayBook clock fixture is
  fixed in R1).

## 7. Rollout

- R1: PHP (bootstrap `accent`) + frontend; no migration. Deployed with the source-patch recipe from a worktree cut
  from `origin/main`, scoped PHP suites on the artifact, verified by content on app.hexa-tech.uk.
- R2: one additive migration (`service_masters.color`) + PHP + frontend; same recipe; the deploy apply step allows
  exactly that migration.
- Both releases reach every organisation at once (no flag); the theme defaults to Light, so the first sight is the
  new light look.

## 8. Risks

- **Pale or very dark brand colours**: handled by the derivation and its 28-colour test; pale brands get an edge.
- **Cyrillic headings**: Source Serif 4 covers them; checked in the browser in Russian.
- **Font weight on slow connections**: ~4 woff2 files per script, loaded only in the workspace, `swap`.
- **Shortcuts colliding with typing or the card move keys**: the guard and its tests (5.2).
- **Hover preview noise**: delay, not while dragging, not on touch.
