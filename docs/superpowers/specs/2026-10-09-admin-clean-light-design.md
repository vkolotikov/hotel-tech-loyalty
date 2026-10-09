# Admin style, Part 2: Clean light (design)

Status: released to every organisation, 2026-10-09 (the owner approved it). Builds on `2026-10-08-admin-glass-style-design.md` (Part 1, live).

## 1. What we are building

A third admin style, **Clean light**: bright paper, quiet lines, the brand colour as the accent. It is chosen per
organisation in Settings → Branding → Style, next to Glass (default) and Classic, exactly like the other two. The
look is the "Clean light" option of the owner-approved style study (artifact NG9ntDVTGSDymSuRFbC8UL, 2026-10-08).

Unchanged by this work: Glass and Classic (pixel-identical, test-guarded), the login page, the member portal, the
Appointments workspace, public landing pages, e-mail and widget previews (they show their own designs).

## 2. Decisions

Binding from Part 1 (owner, 2026-10-08): Glass stays the default for everyone; styles are per organisation; left
sidebar; Clean light ships only when every admin screen is converted.

Proposed here (owner to confirm when approving this spec):

| # | Decision | Why |
|---|---|---|
| D1 | **Light sidebar** (`#ECEFF3`, white active pill), as in the study. | The study's Clean light; a dark sidebar would be a fourth look. |
| D2 | **Convert by redefining "white" inside the light scope** (§4), not by hand-editing every screen. | 96 % of the 2,209 `text-white` uses and all 896 translucent-white overlays mean "the foreground colour". One variable converts them; ~120 places that must stay truly white get a token. |
| D3 | Brand **fills** keep the brand colour; brand **text** uses a deeper shade of it (gold `#8A6A1F`, Royal blue `#1F5BD8`, computed per brand). Button text keeps the 2026-10-09 rule: white while white reads at 3:1, dark ink below. | Same structure as Glass's lifted text, mirrored. |
| D4 | Headings in **Geist**, body in Inter, figures in Geist Mono, all self-hosted under HX names (no Google requests). | The study's type; Part 1 self-hosts for privacy and speed. |
| D5 | **Owner preview before release**: on the Clean light card, a super admin can "Preview on this device" (local only, nothing saved) on real production data. The card opens to everyone after the owner's go. | The owner sees every real screen in light before any customer can pick it. |

## 3. The look (tokens)

Values from the study; the contrast tests (§6) are authoritative and may nudge a value by a step.

| Token | Clean light | Used for |
|---|---|---|
| canvas (`dark-bg`, `well`) | `#F4F6F8` | page, inputs on cards, wells |
| surface (`dark-surface`, `panel`) | `#FFFFFF` | cards, drawers, menus, modals |
| surface-2 (`dark-surface2`, `dark-card`, `panel-dim`) | `#F7F9FB` | nested cards, table heads |
| hover (`dark-surface3`, `dark-hover`, `panel-raised`) | `#EEF2F5` | hover rows, chips |
| surface-4 (`dark-surface4`) | `#E6EBEF` | pressed, raised chips |
| line (`dark-border`) / line-2 (`dark-border2`) | `#DDE3E8` / `#CBD3DA` | borders, dividers |
| text (`t-primary`, flipped `white`) | `#1B2A34` | headings, body |
| soft / secondary / muted | `#3A4853` / `#54626E` / `#54626E` | secondary text (6.1:1 on white) |
| grey text 300 / 400 / 500 / 600 | `#2E3C47` / `#3D4B56` / `#4A5863` / `#54626E` | keeps the order: 300 most prominent |
| coloured text (red-400, emerald-300 …) | the hue's 700, or 800 for yellow, amber, lime | ≥ 4.5:1 on white and on the hue's own tint |
| status text ok / warn / bad / info | `#17643B` / `#8A4B00` / `#A3243B` / `#1D4FA8` | |
| sidebar / text / text-2 / active | `#ECEFF3` / `#1B2A34` / `#55636F` / `#FFFFFF` | docked, not floating |
| header | `rgb(244 246 248 / .82)` + blur | the only blur in this style |
| card shadow | `0 1px 2px rgb(14 26 36/.05), 0 8px 24px rgb(14 26 36/.06)` | cards and popovers |
| corners card / control | 14 px / 10 px | |
| chart grid / ticks / tooltip | `#E5EAEF` / `#54626E` / white card | |

`color-scheme: light` inside the style, so native selects, date pickers and scrollbars turn light.

## 4. How it works

Same structure as Glass: the theme code sets `data-style="light"` on `<html>`; the admin Layout sets
`data-shell="admin"`; every light rule is scoped to `:root[data-style="light"][data-shell="admin"]`, so nothing outside
the signed-in admin can change.

1. **Token layer.** `lightTokens.ts` holds every value in §3; the existing Tailwind plugin writes them as `--style-*` /
   `--tc-*` variables in the light scope (the same mechanism Glass uses). Grey and coloured text classes already read
   variables, so they convert with no source edits.
2. **"White" becomes the foreground.** Tailwind's `white` colour reads `--hx-white` (255 255 255 everywhere, so Glass,
   Classic, portal and Appointments are untouched). In the light scope it is the ink `27 42 52`. Effect in light:
   `text-white` → ink text, `bg-white/[0.04]` → a 4 % ink tint, `border-white/10` → a 10 % ink line,
   `hover:bg-white/5` → an ink hover. These are exactly the light-scheme meanings.
3. **White that must stay white** gets a fixed token, `on-fill` (`text-on-fill`, `bg-on-fill`): text on red, violet,
   emerald and other solid fills (74 class strings + 6 inline backgrounds), toggle knobs and white chips (37 `bg-white`),
   QR and card previews. A guard test (like `brandFills.test.ts`) fails on any solid coloured fill paired with
   `text-white`. Brand fills already use `text-on-primary`.
4. **Black stays black.** Scrims (`bg-black/60`) stay dark; small black-tint chips read as grey on paper; `text-black`
   (on accent and amber fills) stays.
5. **The leftovers are converted by hand, per screen group** (§5): 310 raw hex classes, ~320 inline colour literals,
   98 uses of the old `--legacy-*` surface variables (they get light values in one place, `legacySurfaces.css`), chart
   colours (one shared constant per file reads CSS variables), 15 dark inline shadows, 12 `colorScheme: 'dark'` styles.
6. **Brand text** (`text-primary-*`): darkened in 2 % lightness steps until it reads 4.6:1 on a 10 % brand tint over
   white (the mirror of Glass's lift), then the ten shades are generated from it.
7. **Settings and server.** `theme_style` accepts `light`; `readThemeStyle` learns it; the Style card turns on; the
   device preview (D5) is a local flag read by the theme code, ignored for everyone who is not a super admin.

## 5. Screen groups and order

From the 2026-10-09 census (lines holding hard-coded colours in brackets). Each group ships on its own: conversion,
a group sweep test, light screenshots at 1440 and 390 of every screen in the group, and Glass/Classic screenshots
unchanged. Until the card opens nobody can see light, so groups can deploy as they finish.

1. Foundation: tokens, the white variable, `on-fill` + its guard, shell (Layout, header, sidebar), contrast tests.
2. Shell & dashboard, AI chat, global search, shared `ui/*` (382).
3. CRM: leads, deals, inquiries, customers, drawers (1,167).
4. Members & loyalty (483).
5. Bookings & venues (944).
6. Services (375).
7. Chat & engagement, chatbot (608).
8. Marketing, campaigns, reviews (455).
9. Planner & content planner (973).
10. Analytics, reports, AI insights, charts (458).
11. Settings, billing, admin panels (749).
12. Landing-page editor chrome (54).
13. Owner preview on production (D5), fixes from it, then the card opens.

## 6. Testing

- `lightContrast.test.ts`, the mirror of the Glass gate: every text token ≥ 4.5:1 on canvas, surface, surface-2 and
  hover; brand text for all 28 tested brand colours; status and coloured text on white and on their own tints;
  button text keeps the 3:1 rule.
- Guards: `on-fill` (no coloured fill with `text-white`), a light ratchet on raw hex / inline literals / legacy
  variables that only goes down, and a per-group sweep that the group has none left.
- Glass and Classic: the existing tests stay green, and the white variable resolves to exactly `255 255 255` outside the
  light scope (unit test on the generated CSS).
- Eyes first: each group's screens at 1440 and 390 in light, Chrome plus Firefox and WebKit builds; the owner checks
  real Safari on the iPad in the preview phase.

## 7. Risks

| Risk | Answer |
|---|---|
| A white that must stay white is missed and turns dark in light only. | Guard test for fills; group screenshots; owner preview before release. |
| Coloured text tuned for dark (1,785 uses at shade ≤ 400) reads weak on paper. | Already variables; light maps them to 700/800 with a test per hue. |
| Charts and inline styles keep dark colours. | Group sweep tests; charts read shared CSS variables. |
| Glass or Classic change by accident. | The white variable defaults to white; existing Glass/Classic tests and screenshots per group. |

## 9. Refinements found while planning (2026-10-09)

None changes an owner decision; each comes from measuring or reading the code.

| Refinement | Why |
|---|---|
| Hard-coded colour classes become `hx` classes (`text-hx-888888`) whose fallback is the exact old colour; Clean light derives its value by rule (greys keep prominence, dark surfaces become paper, coloured text is deepened, coloured fills stay). | Mapping them to existing tokens would shift Classic greys; this keeps Glass and Classic byte-identical in colour. |
| Coloured text uses each hue's 700, but 800 for orange, amber, yellow, lime and green; sidebar accents use 800. | 700 measured 4.08-4.58:1 for those. |
| Brand text is deepened to 4.8:1 on its tint (gold `#7F6726`-ish, Royal blue `#0A5BDF`), not the study's hand-picked values. | Keeps every fixture brand at 4.5:1 or better on hover rows too. |
| The 12 screen groups run as 7 tasks; the device preview lands with the owner's review, not with the foundation. | After the global steps only ~65 files keep inline colours. |

## 8. Out of scope

Login, member portal, Appointments workspace, public landing pages, e-mail and widget preview canvases, mobile apps.
A light version of the login page can follow if the owner wants it.
