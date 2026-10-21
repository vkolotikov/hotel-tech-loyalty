# HexaTech Content — Release 7: the new look (design)

**Date:** 2026-10-21 · **Status:** for the owner's review · **Workspace:** HexaTech Content (`/content`), feature branch
`feature/content-workspace` in `../Hexa-Tech-content`.

**The request.** The owner designed how Content could look (Figma file "Online Bike Shopping App (Community)", node 1-4;
not readable from here — no Figma connection; a full-resolution screenshot of the "Plan · FDS Cards" frame was given).
This release makes Content look and lay out like that frame: a dark navy workspace with a blue accent, card-like side
buttons, the brand as a breadcrumb chip, channel filter chips, a grouped Generate/Month/Week/List control, a month grid
of coloured post cards, and the post panel as a right-hand column with tabs and a Save draft / Open editor footer.

## Decisions

| # | Question | The owner's answer |
|---|---|---|
| D1 | Which screens | **A** — Content only: the frame, Plan and the post panel first; Ideas, Posts, Promote, Strategy and Brand take the new frame, colours and page header with their own layouts unchanged; Appointments stays exactly as it is. |
| D2 | Light version | **A** — keep Light / Dark / Auto: the mockup is Dark; Light has the same layout in light tones. |
| D3 | Accent colour | **A** — the organisation's brand colour as today (blue when none is set). |
| D4 | Post panel placement | **A** — a column beside the calendar while a post is open (the grid narrows; ✕ gives the width back); it slides over the calendar under 1280 px and fills the screen on phones. |
| D5 | Open editor | **A** — a full-screen writing view with a preview of the post on its platform and character counts. |
| D6 | Text toolbar | **A** — emoji, link, snippet and hashtag group; no bold or italic look-alike letters. |
| D7 | Figures, Status filter, Unscheduled tray | **A** — all kept in the mockup's style: a numbers line under the title, a Status chip and an "Unscheduled (n)" chip. |
| D8 | Side panel bottom | **A** — Settings (Light/Dark/Auto, language, Full admin), Help & resources (shortcuts list, Find), the person row (Sign out, Collapse menu). |
| D9 | Releases | Approved in the design talk: **7a** the frame, Plan and panel; **7b** the writing view. |
| D10 | "Owner" field | Kept as **Who posts it** (our wording since release 5a): "Owner" is an account role. |
| D11 | The mockup's "Draft only. This post will not be published." | Left out: HexaTech never publishes to the networks, so the sentence would be wrong for approved posts too. The footer's line carries the save message instead. |

## 1. Goal and success

The Plan at 1440 × 900 in Dark, for a brand whose colour is blue, looks like the owner's frame: the same regions in the
same places, the same proportions, the same kinds of controls, the navy tones taken from the screenshot. Nothing Content
does today is lost: every action, field, filter and figure is still there, moved into the new places this spec gives.
Appointments looks exactly as it does today (46 screens, 0 px different).

## 2. Scope

**Release 7a — the new look:** Content's frame (§4), the page header on every Content page (§5), the Plan (§6), the post
panel (§7), the look (§3), one additive bootstrap field (§9).

**Release 7b — the writing view:** Open editor (§8).

**Not in this release:** new layouts for Ideas, Posts, Promote, Strategy and Brand (they get the frame, colours and the
page header only); any change to Appointments; any new database column; publishing to networks.

## 3. The look

### 3.1 Tokens

Content keeps the Atelier token names (`--a-canvas`, `--a-surface`, `--a-surface-2`, `--a-border`, `--a-text`,
`--a-text-2`, `--a-side`, `--a-side-2`, `--a-side-text`, `--a-side-text-2`, …) and sets its own values under
`[data-content]` in `content/theme/content.css`, so every shared component takes them and Appointments, which never
carries `data-content`, keeps the Atelier values. Values are RGB triplets.

**Dark (from the owner's screenshot):**

| Token | Value | Where it shows |
|---|---|---|
| `--a-side` | 28 35 44 (#1c232c) | side panel |
| `--a-side-2` | 35 44 58 (#232c3a) | side buttons at rest |
| `--a-canvas` | 32 40 54 (#202836) | page, top bar, post panel |
| `--a-surface` | 36 44 58 (#242c3a) | calendar head row, chips, fields |
| `--a-surface-2` | 41 48 63 (#29303f) | calendar cells, text boxes |
| `--a-border` | 51 62 78 (#333e4e) | grid lines, borders |
| `--a-text` | 232 238 244 | text |
| `--a-text-2` | 150 165 185 (#96a5b9) — 5.27:1 on surface-2, 5.60 on surface, 5.91 on canvas | secondary text |
| `--a-side-text` / `--a-side-text-2` | 232 238 244 / 150 165 185 — 5.61:1 on side-2, 6.32 on side | side panel text |

**Light:** the same structure in light tones — canvas 244 246 249, surface 255 255 255, surface-2 238 242 247, border
221 227 234, text 27 36 48, text-2 84 98 114 (each pair pinned ≥ 4.5:1). The side panel stays navy (28 35 44) in Light,
as the Atelier side panel stays ink today.

**Content-only tokens:**
- `--c-card`: a post card's fill — the accent mixed 18 % into `--a-surface-2` in Dark, 10 % into `--a-surface` in Light,
  worked out with the other accent tokens (§3.2) and set inline beside them, so a blue brand gives about the mockup's
  #2e4460 (44 63 96) and a gold brand a warm card.
  Its text is `--a-text` (9.0:1 on the blue card); its secondary text (time, status word) is `--c-card-text-2`: 170 184
  202 in Dark (5.3:1 on the blue card — `--a-text-2` would be 4.22:1 there), `--a-text-2` in Light. A test pins both at
  ≥ 4.5:1 for the fallback blue and for the darkest and lightest accents the accent tests already use; where an accent
  would fall short, the mix is lowered until it holds.
- `--c-ai`: 109 93 214 (#6d5dd6) with white ink (5.0:1) — Generate and every AI action, and the key-date chip's tint; the
  same in both themes and for every brand.

### 3.2 Accent

`accentTokens(hex, theme)` gains an optional surfaces argument. Content passes its own surfaces (the table above), so the
accent text, rail mark and outline rules hold on navy exactly as they hold on the Atelier palette today; Appointments
passes nothing and gets today's result. With Content's surfaces it also returns the card fill (`--c-card`, §3.1), lowering
the mix in 2-point steps while `--a-text` or `--c-card-text-2` would read under 4.5:1 on it. The open post's card and the current side button are filled with the accent,
with `--a-accent-ink` text; a soft gradient from `--a-accent` to `--a-accent-deep` on those two fills.

### 3.3 Shape and type

Radius 10 px for cards, side buttons and fields, 8 px for chips, full for the Today circle and avatars. Fonts stay the
Atelier ones (the serif display for "Plan", the month title, the post hook and section titles; the sans for the rest).

## 4. The frame (release 7a)

The shared `WorkspaceShell` gains options, all off by default (Appointments passes none):

- `variant: 'cards'` — the side buttons as cards and the "WORKSPACE" label above them;
- `footer` — a replacement for the side panel's bottom area;
- `crumbs` — a breadcrumb for the top bar's left side.

### 4.1 Side panel (240 px)

- **Top:** the organisation's mark and name, "HexaTech Content" under it (as today).
- **"WORKSPACE"** (small caps, `--a-side-text-2`), then Plan, Ideas, Posts, Promote, Strategy, Brand as cards (44 px tall,
  10 px radius, `--a-side-2`, a 1 px border); the current one filled with the accent; keyboard focus ring as today.
- **Bottom (D8):**
  - **Settings** — a menu: Light / Dark / Auto (the existing switch), Language, Full admin (managers; where there is
    none, the row is left out).
  - **Help & resources** — a menu: Keyboard shortcuts (the existing list), Find (opens Find).
  - **The person row** — avatar letter, name, and their role underneath (Owner / Manager / Staff from `staff.role`), with
    ⌃⌄; it opens a menu: Collapse menu (or Expand), Sign out (through the unsaved-changes guard as today).
- Menus open upward, close on Esc and outside clicks, return the focus to their row, and use the existing menu focus
  rules (`ui/menuFocus.ts`).
- **Collapsed (icons only):** Settings, Help and the person keep their icons and menus. **Phones:** the side panel folds
  into the menu button as today, with the same three rows at its foot.

### 4.2 Top bar

- **Left — the breadcrumb:** the brand chip (28 px, 8 px radius: the brand's logo when it has one, else its initials on
  the accent), the brand's name and ▾ when the organisation has more than one brand (a menu of the brands, replacing
  today's select; choosing one switches as today), then "/" and the page's name (Plan, Ideas, Posts, Promote, Strategy,
  Brand, or "Write" in 7b).
- **Right:** Find (the wide box with the Ctrl K / ⌘K hint, as today) and the bell.
- **New post** leaves the top bar for the page header (§5).
- **Phones:** brand chip, page name and the bell; Find and New post as today's phone controls.

## 5. The page header (every Content page)

`ui/PageHeader` becomes: the page's title in the display serif (40 px), a line beside or under it in `--a-text-2`, and
the page's actions on the right — **New post** (accent, with +) on Plan, Ideas and Posts, which today rely on the top
bar's button; Promote, Strategy and Brand keep their own actions. The lines:

- Plan — "A clear view of what comes next." and the numbers line (§6.1);
- Ideas, Posts, Promote, Strategy, Brand — their current intro sentence (no new words).

## 6. The Plan (release 7a)

### 6.1 Header

"Plan", the line "A clear view of what comes next.", and under it the numbers line from today's figures: "Planned: 12 ·
Ready: 3 · Published: 5 · Empty slots: 2" (counts after a colon). The four figure cards are retired. New post on the right.

### 6.2 Filter row

- A chip per channel the brand uses: its platform mark, its name, ✓ while shown; pressing it hides or shows that
  channel's posts (today's channel filter, same preference).
- **Status** — a chip that opens the list of statuses (today's single choice, "All statuses" first); the chip shows the
  choice when one is set.
- **Unscheduled (n)** — opens the list of posts without a day under the chip (today's tray): each opens in the post
  panel; dragging one onto a day schedules it as today; the list stays open while dragging and closes on Esc or outside
  clicks. The week view's tray column is retired.
- **Key dates** with its switch on the right (today's switch).

### 6.3 Calendar bar

The period in the display serif ("October 2026"; the week's range in Week), ‹ › and Today; on the right one grouped
control: **Generate** (`--c-ai` fill, sparkle icon; today's Generate) then **Month · Week · List** as a segmented
switch (the chosen one filled with the accent). Today's goals line and the generating line stay, under this bar.

### 6.4 Month grid

- Head row MON … SUN (small caps). Cells at least 105 px tall, `--a-surface-2`, 1 px `--a-border` lines.
- The day number top left; days of the next or previous month dimmed with their month ("28 Sep", "1 Nov"); weekend
  numbers dimmed.
- Today: the number in a filled accent circle, "Today" beside it.
- "+" at the top right of a day on hover and on keyboard focus (today's add button), adding a post on that day.
- **Post cards:** `--c-card` fill, 10 px radius, the platform mark, the time, the status word at the right
  (`--a-text-2`), then up to four lines of the hook (or title, or topic). The open post's card is filled with the accent
  and its day cell gets a 1 px accent outline. Flags today's cards carry (versions, who posts it, comments, clicks)
  stay, in the card's foot.
- Empty slots (a channel's day with no post) keep today's quiet "+ platform" row, restyled.
- **Key dates:** a chip at the bottom of their day (sparkle icon, the name, `--c-ai` tint), as today's key-date chips.
- Drag and drop between days, and between days and the Unscheduled list, as today.

### 6.5 Week and List

Week: seven columns with the same cards (taller: the hook up to six lines). List: rows by day with the same card
content in one line each. Both keep their behaviour.

### 6.6 Under the grid

A legend on the left — "Draft" (pencil) · "Key date" (sparkle) — and, while no post is open, "Select a post to review
its details" on the right.

## 7. The post panel (release 7a)

### 7.1 Placement (D4)

- **1280 px and wider:** a 400 px column at the right of the page, under the top bar; the page reserves its width while
  a post is open (the grid narrows), and gets it back when the panel closes.
- **640–1279 px:** the panel slides over the page from the right (400 px), as today.
- **Under 640 px:** it fills the screen.

### 7.2 Header

"Post details", the post's day under it ("Friday, 23 October 2026"; "No day yet" without one), ⋯ and ✕. A post not
created yet says "New post". The ⋯ menu holds today's actions that are not about the post's progress: Duplicate, Copy
text, Copy link, Save as template, Delete (with their confirmations and "Copied" notes as today).

### 7.3 Tabs

**Content · AI tools · Activity** (a tab list: one tab stop, arrow keys, Home/End). AI tools holds today's AI section;
Activity today's timeline and comments, with the number of comments on the tab when there are any ("Activity (3)").
Before a post is created, AI tools and Activity say "Create the post first to use this." The panel remembers the open
tab per device.

### 7.4 Content tab, top to bottom

1. The platform mark and name · the brand's name, the status chip at the right.
2. When they apply: the approval bar (Send for approval, Approve, Send back), "You post this one" with Mark published,
   the Promotes line — as today.
3. **POST HOOK** (small caps label) and the hook in the display serif (26 px), edited in place (a borderless text box
   that grows; placeholder "Write the first line people see").
4. Date · Time (with today's suggested times) — Status · Who posts it.
5. **Post text** — the label, the expand button ⤢ (opens the writing view in 7b; hidden in 7a), the toolbar, the box.
6. **Call to action** — the field and, under it, "Add destination URL" (opens the Link field in place) or, once there is
   a link, the short link with Copy and its clicks (today's short-link line).
7. **Folding sections** (closed at first; each remembers per device whether it is open):
   - **Targeting & language** — platform, pillar, audience, language, topic and Template;
   - **Link & hashtags** — the link (when not opened above), the short link's figures, hashtags with Insert;
   - **Versions & repeat** — today's Versions and Repeat sections.
8. Today's progress actions sit in a row right under Status · Who posts it: **Mark ready** and **Mark published** (with
   its published-address step and confirmation), and, on a published post, "Published on …" with Open. Nothing of
   today's panel is dropped: every action is either here, in the ⋯ menu (§7.2), or in its tab.

### 7.5 The toolbar (D6)

Above the post text: **Emoji** (a picker with a search box and recent ones; it puts the emoji at the cursor), **Link**
(puts the post's short link at the cursor, or, when there is none, opens a box for an address and puts that), **Snippet**
and **Hashtag group** (today's insert menus). Buttons have names for screen readers and keyboard shortcuts stay out of
the box's own keys.

### 7.6 Footer

**Save draft** while the post is a draft (Save for any other status, Create post for a new one) and, in 7b, **Open
editor** beside it; under them one line with the save message ("Saved", or what went wrong). The unsaved-changes guard
stays as it is.

## 8. The writing view (release 7b)

- **Address:** `/content/write/<post>` (and `/content/write/new` for a post not created yet), so Back and reload work;
  the top bar's breadcrumb says "/ Write". Opened from Open editor and ⤢; Back, Esc or the breadcrumb return to where it
  was opened, the panel open on the same post.
- **One draft:** the writing view and the panel edit the same unsaved draft (today's panel state and its kept copy), so
  nothing is lost either way; Save saves it as the panel would.
- **Layout at 1440:**
  - left (about 55 %): the hook, the post text and the call to action, large, with the toolbar and a live count;
  - right: the **preview** — the brand's logo or initials and name, the post as Copy text composes it (`lib/postText`),
    cut where the platform shows "…see more" (LinkedIn after 210 characters, Instagram after 125) with "…see more", and
    the picture when the post has one; drawn in Content's look with the platform's mark, not as a copy of the network's
    screens;
  - a slim column: date, time, status, channel, Save and Back.
- **Limits** (characters of the composed text): X 280, Instagram 2,200, TikTok 2,200, LinkedIn 3,000, YouTube 5,000,
  Facebook 63,206; blog and email none. The count shows "1,240 / 3,000"; over the limit it turns red and says "Over the
  limit by 40: the network will cut or refuse it." Saving is not blocked.
- **Phones:** two tabs, Write and Preview, with the same slim column folded under the text.

## 9. Data and server

One additive field: the bootstrap's `brand` and `brands[]` entries gain `logo_url` (the brand's logo, or null). No
migration, no other server change.

## 10. Words

New words in all five bundles (`en, ru, de, fr, es`), counts only after a colon or in brackets: the side panel's
"WORKSPACE", Settings, Help & resources and their menus; the breadcrumb's names; the Plan's line and numbers line, the
Status and Unscheduled chips, the legend and "Select a post to review its details"; the panel's "Post details", "No day
yet", the tabs, "POST HOOK" and its placeholder, the toolbar's names, the three folding sections, "Add destination URL",
"Save draft", "Create the post first to use this."; in 7b "Write", "Open editor", the preview's "…see more", the count
and the over-the-limit sentence, Write / Preview.

## 11. Accessibility

Every control has a visible focus ring and a name; the panel's tabs and the Plan's segmented switch are proper tab lists
or radio groups with arrow keys; the menus are menus (one tab stop, arrows, Esc returns the focus); the filter chips
are toggle buttons (`aria-pressed`); the docked panel is a complementary region labelled "Post details", the sliding
and full-screen ones keep today's dialog behaviour; every text and line meets the contrast tests (≥ 4.5:1 text,
≥ 3:1 lines and marks); motion respects reduced motion.

## 12. Tests and release checks

- vitest (node, `renderToStaticMarkup`) for each new piece, with the logic in `*Math.ts` helpers: the frame's options
  (Appointments' markup unchanged), the bottom menus, the breadcrumb and brand menu, the page header, the numbers line,
  the chips, the grouped control, the month grid (dimmed days, today, "+", cards, key dates, legend), the panel's
  placement rule, tabs, hook, toolbar inserts, folding sections, footer labels; in 7b the preview cut, counts and limits.
  Existing tests change only where the markup moves, never loosened.
- Token tests: the Content palette's pairs at their contrast in both themes; `accentTokens` with Content's surfaces.
- PHP: the bootstrap's `logo_url` (a feature test).
- Release checks for each release: every PHP folder by path, `tsc -b`, the whole vitest run (3 `plannerMeta` known),
  the lint baseline, a build check; the Appointments pixel comparison (46 screens, 0 differ); Lighthouse accessibility
  100 on Plan, the panel, Brand (and the writing view in 7b); one browser pass on a temporary brand in local org 16 —
  month, week, list, the chips, the brand menu, the bottom menus by mouse and keyboard, the panel docked at 1440 and
  sliding at 1024, phones at 390, Russian, Light and Dark (and the writing view in 7b); eyes: the Plan at 1440 beside the
  owner's frame.
- A fresh review of each release on the most capable model, Critical and Important fixed test first.

## 13. Rollout

Each release deploys by the source-patch recipe under the owner's standing go (change list since the last deployed
feature tip, path guard, tests on the artifact, build, push, verify by content). Rolling back is the portal build only
(the bootstrap field is additive and unused by the old portal).
