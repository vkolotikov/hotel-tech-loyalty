# HexaTech Loyalty — release 10: easy to run, from the owner's Figma

Owner, 2026-10-26: "use my project from Figma … combine mine ideas with your ideas, my design with your design, to make
it really easy to manage and use in all these sections for non-experienced users … users could go inside the app
without any knowledge and they could manage and easy use all the tools and understand all the configuration … sections
are maybe bit contrast one to another, maybe some colors."

Source: Figma file `5MtOVFZKvXk5x0mJ8Trm6g` ("Online Bike Shopping App (Community)"), page Prototype (`1:4`). The
owner's loyalty drafts there: `163:88` Tiers overview, `163:166` Edit Silver tier, `163:244` Benefit library,
`163:322` Locations, `163:400` Points boosts, `171:401` Section navigation components, `163:17` shared components,
`131:4480` Program, `131:4770` Rewards, `131:3945` Members, `131:4258` a member (Emma Brown); `119:5265`, `127:8796`,
`103:638` are FDS Cards drafts (a dashboard with "Needs attention").

## What the drafts say (kept)

1. **Sections are cards, each in its own colour** (`171:401`): an icon tile in the section's colour, a title, one line
   of what it is for; the chosen card filled with its colour and outlined in it. Program's are Tiers (blue), Benefits
   (violet), Locations (teal), Points boosts (gold).
2. **A page says what it is for** under its title, and its state at the right ("Changes saved", "Not configured",
   "No scheduled boosts").
3. **Figures first, the thing to look at in colour** (`163:88`): a count tile, an amber tile for what needs a look, a
   violet tile that leads on.
4. **An empty section teaches** (`163:322`, `163:400`): a panel in the section's colour — "Get started", a heading, three
   numbered steps — beside the form or the button that starts it; an example in figures ("100 → 200 points").
5. **A form explains each field** and shows the member's side (`163:166`: "100 base points become 125 points", a member
   preview, "Review before you save").
6. **What does not fit is said with its fix** (`163:88`: "Several tiers share the same starting points … Review rules").
7. **The owner's navy** (variables of `163:88`): canvas `#182231`, surface `#29384b`, border `#45576e`, side `#111b29`,
   text `#f5f7fb`, secondary text `#b8c7dc`; violet `#cfb7ff`, teal `#88e0d3`, gold `#f3d18c`, green `#74d9aa`,
   blue `#93c5ff`. The cards stand clearly off the canvas — the "contrast one to another".

## What stays ours

- The tier ladder (numbered steps with chips, benefits as chips) rather than the drafts' table: it reads as a journey.
- Light theme stays; the colour families work in both (each tone 4.5:1 on the surfaces and over its tint).
- Every decision about the programme stays the server's (checks, setup progress); the workspace only shows it.

## Part A — the frame (deployed first)

- **Palette.** Loyalty's dark theme takes the owner's navy: `LOYALTY_SURFACES` in `workspace/theme/accent.ts` (Content
  keeps `NAVY_SURFACES`); the shell, the door and tier chips compute their accent against it.
  `loyaltyContrast.test.ts` proves the tokens equal `LOYALTY_SURFACES` and every pair still reads.
- **Two more colour families**: `tier` (blue) and `place` (teal), beside earn, bonus, rule, gift, offer.
- **`SectionCards`** (`loyalty/ui/SectionCards.tsx`): the drafts' section navigation as a tab list (one tab stop, the
  arrow keys, Home and End), on Program, Ways to earn, Rewards, Campaigns and Card & app; the section stays in the address.
- **Program in sections** (`?tab=tiers|benefits|places|boosts`), each with a line of what it is for; Tiers opens with the
  figures (tiers, members in them, the next step).
- **`GetStarted`** (`loyalty/ui/GetStarted.tsx`): an empty section's panel — chip, heading, three steps, the action
  (or, for staff who cannot act, who can) and, where it helps, an example in figures. On benefits, places, boosts,
  rewards, offers, email campaigns, segments, push messages and events.
- **Members' figures** as tiles (active members, joined this month, average points), as the drafts draw them.
- `PageHeader` takes `stacked` (the line under the title); without it every workspace's header stays as it is.

## Part B — guidance (deployed second)

- **Start here** (`/loyalty/start`): the setup steps — how the programme works, tiers, ways to earn without warnings,
  rewards, the card's look, the first member, the first scan — each done or not, with the page that does it. Decided
  by `App\Services\Loyalty\Setup\SetupProgress` (reads only) behind `GET /v1/admin/loyalty/start`; Members shows
  "n of 7 done" until all are done; Help & resources and Find open it.
- **Tier checks** on the program answer (`App\Services\Loyalty\Programme\TierAdvice`, reads only):
  `tiers_share_threshold` (two or more tiers start at the same figure) and `benefit_unused` (a benefit no tier gives),
  shown as the amber tile and a banner with the tier or benefit to open.
- **The tier form** shows the member's side: a preview (the tier, its earn rate in words, its benefits) and the earn
  rate's example ("100 base points become 125 points"); a boost's multiplier says what it does in figures.

## Rules

- Strings in all five locales; only `a-*`/`l-*` classes; no `#…` links; nothing computed in the workspace that the
  server decides.
- The full admin, the member portal and the public widget do not change.
