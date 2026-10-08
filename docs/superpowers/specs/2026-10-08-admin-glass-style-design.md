# Admin styles — part 1: Glass and the style switch

Status: design approved by the owner in conversation on 2026-10-08 ("yes, good"); spec approved ("approve"). Amended
the same day while writing the implementation plan: technical refinements only, listed in §12. The owner's decisions in
§2 are unchanged.

Roadmap context:
- **Part 1 — Glass as the main admin design, and a Style setting (this spec).**
- Part 2 — Clean light: convert every admin screen to meaning-based tokens, then switch the style on (own spec later).
- Not planned: top-bar or dock navigation (the owner chose the left sidebar).

Reference mock (private artifact): https://claude.ai/artifact/NG9ntDVTGSDymSuRFbC8UL — Dashboard and Leads in Today /
Glass / Clean light. The owner picked Glass, left sidebar, Royal blue.

## 1. Goal

The admin gets a second, modern look: **Glass**. Frosted panels over a deep backdrop tinted by the organisation's
brand colour, its own type and corner shapes, and readable text everywhere. It becomes the default look for every
organisation. Today's look stays available as **Classic**, and a third style, **Clean light**, is announced as coming
next.

The work also sets up the structure that Part 2 builds on: a style is a set of design tokens, chosen per organisation,
applied in one place.

## 2. Owner decisions (2026-10-08)

| Question | Decision |
|---|---|
| Which styles | Glass (main design) and Clean light, plus today's look kept as an option. |
| Navigation | Left sidebar. Top bar and dock are not built. |
| Palette | Royal blue as the default palette. |
| Rollout | **Everyone moves to Glass on release**, including existing organisations; anyone can switch back in Settings → Branding. |
| Staging | **Glass first.** Clean light ships after every screen is converted (Part 2). |
| Who chooses | **Per organisation**, in Settings → Branding, like the theme presets today. |
| Design sections | "Yes, good": choosing a style (§4), what Glass looks like (§5), code changes (§6), testing and release (§9–§11). |

## 3. What exists (verified on main `3f8edcd18`)

**Theme pipeline.**
- `frontend/src/hooks/useTheme.ts`:
  - `DEFAULTS` (`:26`) are the fallback colours (primary `#c9a84c`, gold);
  - `applyThemeToDom()` (`:98`) writes every colour as an inline CSS variable on `<html>` (`root.style.setProperty`)
    and sets `body` background and text colour (`:139-140`); it also sets `data-mood` (`:148`);
  - `persistThemeSnapshot()` (`:198`) caches colours, preset and mood in `localStorage`, and a module-level block
    (`:225`) paints the cached theme before React mounts, so reloads don't flash;
  - `useTheme()` (`:236`) reads `/v1/admin/branding/theme` for staff, `/v1/theme` otherwise.
- Inline variables on `<html>` beat any stylesheet rule, so a style cannot override them from CSS alone (§6.2).
- `frontend/tailwind.config.js` maps `primary-*`, `dark-*` (bg, surface…surface4, card, hover, border, border2),
  `t-primary`, `t-secondary`, `accent`, `error`, `warning` and `info` to those variables as `R G B` triplets with
  `<alpha-value>`. `t-muted` points at a surface colour (`--color-dark-surface4`) and has no users.
- `frontend/src/index.css`:
  - moods (`:53-140`) fork `--theme-font-body`, `--theme-font-display` and three `--theme-radius-*` values;
  - headings use `--theme-font-display` (`:155-157`);
  - Inter and every mood font, including Space Grotesk 500/700 and JetBrains Mono 400/700, are imported from
    Google Fonts (`:8`, `:15`). Both imports follow the Tailwind rules, so the build drops them (vite warns
    "@import must precede all other statements"): none of these fonts has ever loaded in production. Text renders
    in whatever the viewer has installed.

**Settings.**
- `frontend/src/pages/Settings.tsx`:
  - ten theme presets in `PRESETS` (`:85`), each with colours and a mood;
  - `DEFAULT_PRESET = 'Gold Luxury'` (`:245`);
  - applying a preset saves the colours plus `theme_preset_name` and `theme_mood` (`:1165-1170`).
- `SettingsController::inferGroup()` (`:562`) files `theme_preset_name`, `theme_mood` and the colour keys under
  `appearance`. `theme()` (`:157`) and `adminTheme()` (`:200`) return that group. The member mobile app also reads
  `/v1/theme`.
- Organisations created by signup get an industry colour as `primary_color` (`OrganizationSetupService`). Only older
  organisations have no saved palette.

**The admin shell** (`frontend/src/components/Layout.tsx`):
- a full-height flex root `bg-dark-bg` (`:683`), the sidebar `<aside>` (`:702`), a header `bg-dark-surface` (`:980`)
  and a scrolling `<main>` (`:1094`);
- there are no shared Card, Button or Modal components: every screen writes its own classes.

**Hard-coded colours** (232 admin source files, excluding `portal/` and `appointments/`):

| Kind | Uses | Notes |
|---|---|---|
| Through tokens (`bg-dark-*`, `border-dark-*`, `text-t-*`) | about 4,400 | Already follow a theme. |
| `text-white` | 2,359 | Fine on any dark style; Part 2's problem. |
| `text-gray-*` | 1,621 | Mostly 500 (714), 400 (406), 600 (241), 300 (198). |
| Raw hex classes `[#…]` | 1,337 in 76 files | `text-[#636366]` 323, `text-[#a0a0a0]` 309, `bg-[#1e1e1e]` 164, `placeholder-[#636366]` 47, then a long tail. |
| Fixed corners `rounded-*` | 2,898 | Only 34 uses read the mood's radius variables. |

Contrast today, on a `#161616` card:
- `text-[#636366]`: about 3.0:1;
- `text-gray-500`: about 3.8:1;
- `text-gray-600`: about 2.3:1.

All three are below the 4.5:1 floor.

**Precedent.** The member portal (`p-*`) and Appointments (`a-*`) have their own token sets scoped to their own roots.
Each has a contrast test (`portal/theme/contrast.test.ts`, `appointments/theme/contrast.test.ts`). Neither is touched
here.

**Two techniques verified by spike (Tailwind 3.4, Chrome 154).**
1. A colour defined as
   `rgb(var(--color-dark-surface, 22 22 22) / calc(var(--alpha-dark-surface, 1) * <alpha-value>))` compiles to:
   - Classic, unchanged: `rgb(22,22,22)`;
   - Glass: `rgba(255,255,255,0.07)` when the style sets `--color-dark-surface: 255 255 255; --alpha-dark-surface: .07`;
   - with an opacity modifier (`/50`) still applied on top.
2. `borderRadius.xl: 'var(--radius-xl, 0.75rem)'` keeps 12px in Classic and becomes 20px when Glass sets the
   variable. `theme.extend.textColor.gray[500]` / `placeholderColor` can point at a variable without changing
   `bg-gray-*` or `border-gray-*`.

## 4. Choosing a style

### 4.1 The setting

- **Storage.** A new key, `theme_style`, saved per organisation in `hotel_settings` like the other appearance keys.
  - `inferGroup()` files it under `appearance`, so both theme endpoints return it.
  - Part 1 accepts only `glass` and `classic`. Part 2 adds `light`. The settings update rejects any other value with
    a 422 that names the allowed ones.
  - No migration.
- **Default.** No saved `theme_style` means **Glass**. That is how every existing organisation moves to Glass on
  release (owner's decision), with no data change.
- **Default palette.** An organisation that never saved a palette gets **Royal blue** (`#3b82f6`) instead of Gold:
  - `DEFAULTS.primary_color` and `DEFAULT_PRESET` change;
  - saved palettes are untouched, so FDS Cards keeps Forest until someone picks Royal blue.
- **Moods** keep their meaning in Classic. Glass has its own type and corners, so a preset's mood shows only in
  Classic.

### 4.2 Settings → Branding

A **Style** row sits above the theme presets, with three cards: **Glass**, **Classic** and **Clean light**.
- Each card shows a small live sample of the style: a frosted card on the backdrop, today's dark card, a white card on
  paper.
- Clean light is shown but disabled, labelled "Coming next".
- Clicking a card applies the style instantly (same flow as presets): DOM first, then the local cache, then the server
  save. The existing **Undo** returns to the previous style as well as the previous palette.

The preset grid stays. Its heading reads "Palette". In Glass, a preset contributes its brand colour; its surfaces,
text colours and mood apply in Classic only. A one-line note under the grid says so.

Who can change it: the same people who can change presets today. No new permission.

### 4.3 Applying it

- `applyThemeToDom(colors, mood, style)` sets `data-style` on `<html>`.
- The cached snapshot stores the style too, so the very first paint after a reload is already Glass.
- `useTheme()` reads `theme_style` from the theme endpoint, missing meaning `glass`.
- Glass applies only inside the signed-in admin. While `Layout` is mounted it sets `data-shell="admin"` on `<html>`,
  and every Glass rule requires both attributes. The login page, the member portal and the Appointments workspace
  share `<html>` but never get Glass.

## 5. What Glass looks like

From the approved mock, with the left sidebar.

### 5.1 Backdrop

- Deep ink (`#0B1120` → `#0D1426` → `#0A0F1C`) with three soft glows:
  - the brand colour, top left;
  - two companion hues computed from it (its hue rotated by +40° and −60°, same saturation and lightness), top right
    and bottom.
- Fixed behind the whole shell: the sidebar, header and content scroll over it.
- Glow strength is capped (brand glow 18%, companions 16% and 14%), and each glow colour is darkened to a relative
  luminance of at most 0.25. Without that cap a near-white brand colour (the `#f5f5f5` preset) washes the panels out.
  Text contrast is measured at the brightest point (§9.1).

### 5.2 Surfaces

| Token (existing class) | Glass value |
|---|---|
| `dark-surface` (cards, header, menus) | white at 7% |
| `dark-surface2`, `dark-card` | white at 10% |
| `dark-surface3`, `dark-hover` | white at 14% |
| `dark-surface4` | white at 18% |
| `dark-border` | white at 14% |
| `dark-border2` | white at 22% |
| `dark-bg` (inputs, inner wells) | ink `#05080F` at 55% |
| `t-primary` | `#F3F6FB` |
| `t-secondary` | `#C3CCD9` |
| `t-muted` (redefined, §6.3) | `#C3CCD9` |

- **Highlights.** Cards get a 1px inner top highlight and a soft drop shadow, so they read as glass sheets.
- **Blur.** Real blur (`backdrop-filter: blur(22px) saturate(160%)`) only where content passes underneath:
  - the header;
  - the sidebar;
  - dropdown menus and popovers;
  - modals and drawers.

  These overlays use a darker glass (ink at 78%) so their text stays readable over whatever is behind them. Toasts
  keep their current white cards.
- **Cards are translucent without blur.** The backdrop under them is already soft, so blur would cost GPU time and
  add nothing. This keeps long screens (Members, Planner month) fast.

### 5.3 Shell

- **Sidebar.** A floating glass panel: 12px from the window edges, 20px corners, sticky and scrolling inside itself.
- **Header.** A glass bar along the top of the content column.
- **Collapsed and mobile.** The sidebar's collapsed rail and the mobile drawer keep today's behaviour, in glass
  surfaces.

### 5.4 Type and shape

- **Type.**
  - Page titles and big numbers use Space Grotesk 600.
  - The interface stays Inter.
  - Labels, times and codes keep the existing `font-mono` stack.
  - Inter and Space Grotesk are self-hosted for Glass under Glass-only family names (`HX Inter`,
    `HX Space Grotesk`), so Classic, the login page, the member portal and Appointments keep their fonts and no
    third-party request is made. JetBrains Mono is not loaded; `font-mono` renders as before.
- **Corners.** Tailwind's scale routes through variables:

  | Class | Classic (unchanged) | Glass |
  |---|---|---|
  | `rounded-md` | 6px | 8px |
  | `rounded-lg` | 8px | 12px |
  | `rounded-xl` | 12px | 16px |
  | `rounded-2xl` | 16px | 20px |
  | `rounded-3xl` | 24px | 24px |

  `rounded-full` and `rounded-sm` are unchanged.

### 5.5 Colour that adapts to any brand

The rule throughout: **in Glass, text uses of a colour get a lighter variant; fills keep their colour.** Hundreds of
buttons are hard-coded `bg-primary-500 text-white` or `bg-accent text-black`. Lightening their fills would break the
text on them, so fills stay as today and only text changes.

- **Readable brand colour.** Organisations can pick any brand colour, so Glass lifts its text uses:
  - starting from the saved `primary_color`, it raises lightness (HSL) in 2% steps until the colour reaches 4.6:1
    against the worst surface brand text sits on: a 15% brand tint over a 10 % card at the brightest glow;
  - the `text-primary-*` shades are generated from that lifted colour; `bg-primary-*`, borders and rings keep the
    brand's own shades.
  - Royal blue text becomes `#93BAFA`, gold lifts slightly to `#D7BF7B`, pale yellow already passes and stays.
- **Text on new brand buttons.** A `--color-on-primary` token (ink `#03050A` or white, whichever passes on the brand
  colour; the ink is dark enough that one of the two reaches 4.5:1 on any colour) exists for new components such as
  the Style picker. Existing buttons keep their classes.
- **Status colours.** Text uses get light variants: success `#8EF0B6`, warning `#FCD58E`, error `#FFC9D3`, info
  `#C3DEFF` (each ≥ 4.5:1 on its own 12% tint). Fills keep the palette's status colours.
- **Grey text.** Hard-coded grey text keeps its order (300 lightest … 600 dimmest), but every step passes 4.5:1 on glass:
  - `text-gray-300…600`, `text-slate-300…600` and the matching placeholders read variables that only Glass changes,
    to `#E2E8F0`, `#D3DAE5`, `#C8D0DD` and `#C3CCD9`.
- **Coloured text.** The admin uses coloured text 1,381 times (`text-red-400`, `text-emerald-300` …), mostly the 400
  (842) and 300 (450) shades. Over a strong glow some 400 shades fall to about 3:1. In Glass, coloured text in all
  17 hues shows one shade lighter (100→50, 200→100, 300→200, 400→300), and 500 two shades (→300). The worst case
  is then about 4.7:1, on a 10 % card at the brightest glow and on its own 15 % tint.

### 5.6 Preferences and fallbacks

- **Reduce transparency.** `@media (prefers-reduced-transparency: reduce)` gives solid panels (`#1A2233` family) and no
  blur.
- **No blur support.** Browsers without `backdrop-filter` get the same solid panels (`@supports`).
- **Reduced motion.** The existing reduced-motion handling stays. Glass adds no animation beyond the style switch.

## 6. Code changes

### 6.1 Tailwind config

- Every admin colour token reads three layers, first one set wins: a style variable (`--style-*` for the whole
  token, `--tc-*` for text uses only), then the palette's inline `--color-*`, then today's literal. Only a style's
  stylesheet block sets the first layer, and only inside the signed-in admin, so Classic computes as before.
- `dark-*` colours gain the transparency factor:
  `calc(var(--alpha-<name>, 1) * <alpha-value>)`, default 1.
- `t-muted` reads `--style-text-muted` with the Classic default `142 142 147` (the current `t-secondary` grey,
  5.4:1 on `#161616`).
- New fixed tokens for the colour clean-up (§6.3), each with its exact old value in Classic: `t-soft` (#a0a0a0),
  `panel` (#1e1e1e), `panel-dim` (#1a1a1a), `panel-raised` (#333), `well` (#111), `success` (#32d74b), `danger`
  (#ff375f), `notice` (#0a84ff). Unlike `t-secondary`, `dark-*`, `accent`, `error` and `info` they ignore the palette.
- `borderRadius` `md`, `lg`, `xl`, `2xl`, `3xl` read `--radius-*` with today's values as defaults.
- `textColor` extends the brand (`primary`), the four status colours, the 17 coloured hues (100–500) and
  `gray`/`slate` (300–600) with variables that default to today's values. `placeholderColor` does the same for the greys.
- A small Tailwind plugin writes the Glass values for those variables from one shared module,
  `frontend/src/theme/glassTokens.ts`, which the tests read too. A spike confirmed that Tailwind's config can import it.
- Classic computes exactly as today, except the colour clean-up in §6.3.

### 6.2 Theme code (`useTheme.ts`)

- `applyThemeToDom(colors, mood, style)`:
  - **Every style.** As today: inline variables from the palette, body colours, mood. Plus the Glass extras inline:
    the lifted text shades (`--glass-primary-*`), the three glow colours and `--color-on-primary`.
  - **Nothing is removed.** The Tailwind tokens read Glass's stylesheet values before the inline palette (§6.1), so
    the pages outside the admin shell keep the palette exactly as before.
  - **Mood.** The attribute stays; the mood rules in `index.css` exclude the Glass admin, so Glass ignores the mood.
  - **Body.** Keeps the palette's colours; the admin shell paints the Glass backdrop.
  - Sets `data-style`.
- The snapshot cache and the early paint include the style. A missing style in an old cache means Glass.
- Pure helpers, unit-tested:
  - `liftForGlass(hex)`: the lifted colour;
  - `glowsFor(hex)`: the companion hues;
  - `onColor(hex)`: ink or white.

### 6.3 Stylesheet and colour clean-up

- **Stylesheet.** The variable block (tokens, alpha factors, radius, fonts, text variables) is generated by a Tailwind
  plugin from `theme/glassTokens.ts`. The component rules live in `theme/glass.css`: backdrop, shell, blur targets,
  card highlight, legacy surfaces, reduced-transparency and `@supports` fallbacks. Every rule is scoped to
  `:root[data-style="glass"][data-shell="admin"]`.
- **Shell (`Layout.tsx`).** The root, sidebar and header get named hooks (`hx-shell`, `hx-sidebar`, `hx-header`) for
  those rules. The backdrop is a fixed layer behind the shell.
- **Blur targets.** Menus, popovers, modals, drawers and toasts are hand-written per screen. The plan pins the selector
  set from what they already share (fixed or absolute positioning, `bg-dark-surface`, a large shadow, a high
  `z-index`), and checks it on every overlay found in the visual pass.
- **Colour clean-up script** (one mechanical pass, reviewed by diff):
  - `text-[#636366]` and `placeholder-[#636366]` → `text-t-muted` and `placeholder-t-muted`;
  - `text-[#a0a0a0]` → `text-t-soft`;
  - `bg-[#1e1e1e]` → `bg-panel`, `bg-[#1a1a1a]` → `bg-panel-dim`, `bg-[#333]` → `bg-panel-raised`, `bg-[#111]` →
    `bg-well`;
  - `text-` and `bg-[#32d74b]` → `success`, `[#ff375f]` → `danger`, `[#0a84ff]` → `notice` (opacity suffixes such as
    `/15` kept).

  Everything else stays for Part 2. Every new token holds the exact old colour in Classic, so the only visible
  Classic change is muted text moving from `#636366` to `#8E8E93` (3.0:1 → 5.4:1), as agreed. Rehearsed on main:
  953 replacements in 57 files, 384 raw hex classes left.
- **Inline legacy surfaces.** 98 inline `style` values in 25 files (mostly the Booking screens and Settings
  cards) are hard-coded dark green from an older theme (`rgba(22,40,35,0.6)`,
  `linear-gradient(180deg, rgba(18,24,22,0.96), …)` …). Inline styles can't be themed, so each of the 17 distinct
  values becomes a named variable (`var(--legacy-panel-60)` …; a script does 97, one SVG `stroke` attribute moves to
  `style` by hand because attributes can't read variables):
  - in Classic its value is the exact old colour, so Classic stays pixel-identical;
  - in Glass it is a glass tint.
  Part 2 retires these variables.
- **Settings → Branding.** The Brand Colors card no longer lists the bookkeeping keys `theme_style`,
  `theme_preset_name` and `theme_mood` as raw text fields. Typing an invalid style there would otherwise hit the 422.

### 6.4 Settings and server

- **`Settings.tsx`.** The Style row (§4.2), the "Palette" heading and note, `DEFAULT_PRESET = 'Royal Blue'`. Undo
  covers the style.
- **`SettingsController`.** `inferGroup('theme_style')` returns `appearance`, and the update rejects values outside
  `glass` / `classic`.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Organisation with no saved palette | Royal blue on Glass. |
| Organisation with an industry colour from signup (e.g. Services teal) | That colour, lifted if needed, drives the glows and accents. |
| Very light brand colour (pale yellow) | Passes as text already; buttons use dark ink. |
| Very dark brand colour (navy) | Lifted until it reads on glass; buttons keep enough contrast with white or ink. |
| Admin tab open during the deploy | Keeps the old bundle until reload. After reload: Glass. |
| Cached snapshot from before the release | Has no style. Read as Glass, then corrected by the server answer. |
| Org switched back to Classic | Exactly today's look, with the muted-text fix. |
| Screen with remaining raw hex surfaces | Shows a solid grey block on glass. The visual pass lists them; each is fixed by token or left for Part 2 if minor. |
| Stripe Elements and other embedded UI | Already themed dark; checked in the visual pass. |
| Landing editor preview, member portal, Appointments | Separate documents or scoped tokens; unaffected. |
| Member mobile app reading `/v1/theme` | Receives the extra `theme_style` key and ignores it. |
| Phone layout | Same Glass tokens. Bottom navigation and mobile drawer surfaces are glass. |

## 8. Refusals

- **Unknown `theme_style` value.** `422` with "theme_style must be glass or classic". Nothing is saved.
- **No permission.** Same response as for any appearance setting today.

## 9. Testing

### 9.1 Automated

- **Frontend (`vitest`).**
  - `applyThemeToDom`:
    - sets `data-style`;
    - writes the palette identically in both styles, plus the Glass extras;
    - a missing style means Glass, and an answer with only `theme_style` switches the style;
    - the snapshot stores and restores the style.
  - `liftForGlass`, `glowsFor`, `onColor` over a fixed set of brand colours (every preset, plus navy `#1e3a8a`, pale
    yellow `#fde68a` and black): every lifted colour ≥ 4.5:1 on the worst-case glass panel, and button text ≥ 4.5:1.
  - **Glass contrast test** (like the portal's), all ≥ 4.5:1 over the brightest capped glow, for every preset,
    industry and edge-case brand colour:
    - every Glass text token and grey text step on a card (white 10 %), a raised surface (18 %) and a hover row in a
      card (14 % over 7 %);
    - every status colour on its 12 % tint over a card;
    - every shifted coloured-text shade on a card and on its own 15 % tint;
    - the lifted brand shades 300–500 on a 15 % brand tint over a card.

    Not gated, and lower right at a glow's peak: status, coloured and brand text on a hover row or raised surface
    (about 3.5–4.3:1 on a hover row in a card), and every kind of text in deeper stacks such as a hover row inside a
    10 % panel or a chip inside a card (text tokens about 3.8–4.3:1, tinted text down to about 2.9:1). The visual
    pass checks them on real screens; Part 2's tokens address them.
  - **Scope test:** every rule in `glass.css` sits under `:root[data-style="glass"][data-shell="admin"]`, every mood
    rule in `index.css` excludes it, `index.css` imports the Glass stylesheets and no Google Fonts stylesheet ahead
    of its `@tailwind` directives, and `glass.css` self-hosts `HX Inter` and `HX Space Grotesk` from files that exist.
  - **Raw-colour ratchet test:** counts `[#…]` colour classes (baseline 384 after the clean-up) and the old green inline
    surface colours (baseline 0 after §6.3) in admin source, excluding `portal/` and `appointments/`. New code cannot
    add either.
  - The Settings Style row: Clean light disabled; picking Glass or Classic calls the save with `theme_style`.
- **Backend (PHPUnit).** `theme_style` is filed under `appearance`, returned by `adminTheme()` and `theme()`, and an
  invalid value is refused with nothing saved.

### 9.2 Visual pass (before release, real browser)

- **Every main screen in Glass at 1440 and 390:** Dashboard, Members and member detail, Leads and lead drawer, Deals,
  Bookings and the booking calendar, Planner (day / week / month), Chat inbox, Campaigns, Reviews, Settings (Branding,
  Pipelines, Planner), Landing pages editor, Billing.
- **Classic, the same list at 1440,** to confirm it matches today apart from muted text.
- **Every overlay opened once:** menus, modals, drawers, toasts, the Cmd+K search.
- **Performance.** A Chrome performance trace while scrolling Members and the Planner month view in Glass: no long
  frames from blur.
- **Spot checks:** Safari (iPad) and Firefox for Glass rendering and the fallbacks.

## 10. What this part does not do

- **Clean light** (Part 2). The card is visible but disabled.
- **Top-bar or dock navigation.**
- **Per-staff style choice.**
- **The other surfaces:** the login and signup pages, the Appointments workspace, the member portal, the mobile apps
  and tenant landing pages keep their own designs.
- **The rest of the raw colours.** The long tail of raw hex (about 500 uses) and the `text-white` / `text-gray-*`
  semantics are Part 2.
- **Classic's grey-text contrast** (`text-gray-500/600` on dark cards) stays as today. Part 2's conversion fixes it.
- **The setup wizard and the live wall** (`/engagement/live`) render outside the admin Layout, so they keep today's
  look until Part 2.
- **The preset fonts in Classic.** They have never loaded in production (§3). Loading them would change Classic for
  every organisation on a preset, so it waits for the owner's decision.

## 11. Rollout

- **No migration.** The default is code: no saved `theme_style` means Glass.
- **Deploy.** The usual routine (`docs/landing-page-builder.md` §6): a worktree from `origin/main`, tests on the
  artifact, a fresh build, push to `main`.
- **Verify by content.** The live admin bundle contains the Glass style rules, and `/v1/admin/branding/theme` accepts
  `theme_style`.
- **Owner notes.**
  - On release every organisation, FDS Cards included, opens in Glass.
  - To go back: Settings → Branding → Style → Classic.
  - To match the mock: pick the Royal blue palette.
- **Next.** Part 2's spec (Clean light): screen groups, the meaning-based token set (surface, raised, line, text,
  muted, on-accent, status), a sweep test per converted area, then enabling the card.

## 12. Refinements found while planning (2026-10-08)

None of these changes an owner decision. Each comes from reading the code or measuring contrast.

| What changed | Why |
|---|---|
| Glass is scoped to the signed-in admin with `data-shell="admin"` (§4.3). | The theme attributes live on `<html>`, which the login page, member portal and Appointments workspace share. |
| Lifted colours apply to text only; fills keep their colour (§5.5). | Hard-coded `bg-primary-500 text-white` buttons would become unreadable on a lightened fill. |
| Glows are capped at luminance 0.25 (§5.1). | Near-white brand colours otherwise pushed text below 4.5:1. |
| Coloured text shows one shade lighter in Glass (§5.5). | 1,381 coloured-text uses; some 400 shades measured about 3:1 over glows. |
| Error and info text colours are lighter (`#FFC9D3`, `#C3DEFF`). | The first values measured 4.17 and 4.41 over some brand glows. |
| Inline legacy surfaces become named variables (§6.3). | 98 inline dark-green surfaces would show as opaque blocks on glass, and Classic must stay identical. |
| Brand Colors card hides the theme bookkeeping keys (§6.3). | Every appearance setting renders there as a raw text field. |
| Toasts are not frosted (§5.2). | They are the library's white cards, which already read well on glass. |

Found while rehearsing the plan's code on a copy of main (same day):

| What changed | Why |
|---|---|
| Tokens read a style layer first; `applyThemeToDom` removes nothing (§6.1, §6.2). | Removing the inline palette would also strip it from pages outside the admin shell that share `<html>`: the setup wizard and the live wall. |
| Mood rules exclude the Glass admin; `data-mood` stays (§6.2). | Mood rules set font weight, italics and spacing directly on headings, which no variable can undo. Dropping the attribute would also change the login page's fonts. |
| The clean-up maps to fixed tokens (`t-soft`, `panel`, `panel-dim`, `panel-raised`, `well`, `success`, `danger`, `notice`), not to `t-secondary`, `dark-*`, `accent`, `error`, `info` (§6.3). | Those follow the palette, and 13 of 14 presets set their own: Classic's #a0a0a0 text would have turned green or pink, success text violet. |
| Glass's two faces are self-hosted under Glass-only names (§5.4). | The old imports never reached production; a Google import at the top of the entry stylesheet would load app-wide (login, portal, Appointments), change Classic's fonts and add a render-blocking third-party request (final review, 2026-10-08). |
| Royal blue text `#93BAFA`, gold lifted to `#D7BF7B`, on-primary ink `#03050A` (§5.5). | Measured with the final model (15 % brand tint over a 10 % card at the brightest glow). With the first ink, `#0A0F1A`, neither ink nor white reached 4.5:1 on the Services indigo `#4c6ef5`. |
| Contrast is measured over the lightest backdrop ink (`#0D1426`) on a 10 % card, an 18 % raised surface and a hover row in a card, and brand text is lifted against the 10 % card (§5.5, §9.1). | Text sits on cards, hover rows and raised chips, not only on 7 % panels; measured on 7 % only, brand shade 500 fell to 4.25:1 on a card (task review, 2026-10-08). |
| A fresh organisation's seeded palette is Royal blue (`ensureTenantHasDefaultSettings`). | It seeded gold on the first visit to Settings, which would flip a Royal-blue admin to gold. |
| A theme answer carrying only `theme_style` switches the style (§6.2). | An organisation with a saved Classic style but no saved palette would otherwise open in Glass on every new device. |
| Body colours stay the palette's (§6.2). | The body is shared with pages outside the admin shell; the shell paints the backdrop. |
