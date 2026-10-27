# Visual specification and Figma source

File key: `d6IGmk3hOoMw0V5rONbI1A`  
Page: `0:1` / Page 1  
Target: final Overview set, OV-01–OV-34.

The user will connect Figma directly to Codex in VS Code. Inspect the actual selected nodes; do not use text-only descriptions as a substitute for the available design.

## Primary references

| Use | Node | Link |
|---|---|---|
| Main desktop | 29:365 | [OV-01](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-365) |
| First setup | 29:366 | [OV-02](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-366) |
| Setup progress | 29:367 | [OV-03](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-367) |
| All clear | 29:368 | [OV-04](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-368) |
| Issue drawer | 29:370 | [OV-06](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-370) |
| Program details | 29:371 | [OV-07](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-371) |
| Member preview | 29:372 | [OV-08](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-372) |
| Full mobile composition | 29:383 | [OV-19](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-383) |
| Compact desktop | 29:386 | [OV-22](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-386) |
| Mobile viewport | 38:2341 | [OV-24](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=38-2341) |
| Discounts | 44:2997 | [OV-32](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2997) |
| Visits/check-ins | 44:2998 | [OV-33](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2998) |
| Levels/services | 44:2999 | [OV-34](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=44-2999) |
| All 34 states | 29:387 | [Review index](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-387) |
| Behavior | 29:388 | [Logic board](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-388) |
| Controls/recovery | 29:389 | [State board](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=29-389) |

The complete frame inventory is in [03-OVERVIEW-SPEC.md](03-OVERVIEW-SPEC.md).

## Extract, implement, compare

1. Fetch the primary desktop and phone screenshots.
2. Inspect their layout, typography, paints, effects, borders, icons and component properties.
3. Inspect state-specific surfaces as you implement them.
4. Map repeated visual treatments to scoped production tokens/components.
5. Compare your rendered page at matching viewport/data conditions.
6. Fix typography, geometry, hierarchy and surfaces before decorative micro-adjustments.
7. Record the node IDs and comparison evidence in the implementation report.

Nearby earlier concepts and old component defaults can contain rejected styles. Do not infer that every variable or component in the file is approved. The final target instances and the five swatches below are the baseline.

## Palette and treatments

| Role | Value |
|---|---|
| Canvas | #242C3B |
| Raised neutral | #353F54 |
| Recessed/sidebar | #222834 |
| Cyan accent | #37B6E9 |
| Indigo accent | #4B4CED |
| Main text example | #F5F7FB |

Extract secondary/muted/status colors, paint stops and effects from the current target nodes. Use the five brand colors intentionally; do not substitute Tailwind defaults or a flat purple button.

- Main cards use charcoal gradients and subtle borders.
- Raised neutral buttons have a lighter upper surface and controlled dark shadow.
- Inset inputs/notices have recessed depth.
- The member card uses a translucent surface over the diagonal accent.
- The primary action retains a cyan edge with indigo behind the label for readability.
- Decorative accents stay away from working text.
- Success/attention colors are small, labeled semantic cues.

Reference artwork nodes: diagonal gradient `1:508`, gradient action `1:512`, raised control `1:518`, glass surface `1:529`, panel `1:649`, selected tab `1:652`, inset control `1:654`. These explain the visual language. The final Overview nodes take precedence where desktop size/shadow/contrast was refined.

Useful current main-frame nodes: sidebar `31:365`; header `31:488`; content `31:502`; program panel `31:511`; preview card `31:532`; attention action `31:541`; metric `31:554`; queue `31:567`; activity `31:606`.

## Measured main-desktop geometry

These values were read from OV-01 at 1440 × 1080. They are layout targets, not fixed-height CSS for every viewport.

| Element | Reference |
|---|---|
| Sidebar | 232 px; 20 px padding |
| Top bar | 72 px; 32 px horizontal padding |
| Content | 32 px padding; 20 px major vertical gaps |
| Main usable content width | 1144 px at 1440-wide viewport |
| Program panel | 206 px high in sample; 24 px padding; 16 px radius |
| Main neutral/primary buttons | 44 px high; 10 px radius |
| Metrics row | 3 equal cards; 16 px gap |
| Metric card | 132 px sample height; 20 px padding; 12 px radius |
| Lower panels | 2 equal columns; 24 px gap; 24 px padding; 16 px radius |
| Sidebar item | 40 px visual row in reference; 8 px radius |
| Spacing vocabulary | 4, 8, 12, 16, 20, 24, 32, 40 px |

Allow panels to grow with real content and localization. Avoid absolute positioning for content layout. Do not impose Figma's 1080 px artboard height on the page.

## Typography

Poppins throughout. Load actual available font assets and correct weights; prevent an unintended fallback from being mistaken for completion.

| Role | Reference size / line height / weight |
|---|---|
| Page heading | 30 / 40 / 600 |
| Program headline | 26 / 36 / 500 |
| Section heading | 20 / 30 / 600 |
| Main metric | 32 / 42 / 600 |
| Preview balance | 28 / 38 / 600 |
| Body | 14 / 22 / 400 |
| Main button | 14 / 22 / 500 |
| Link | 13 / 22 / 500 |
| Metadata | 12 / 18 / 400 |
| Small illustrative caption | 11 / 18 / 400 in Figma |

Do not shrink essential production guidance to fit. If an accessibility/readability adjustment is required, preserve hierarchy and document the adjustment rather than silently changing the design.

## Responsive behavior

Desktop reference: 1440. Compact reference: 1024. Phone reference: 390 with an 844 px prototype viewport. The full phone design is taller and must scroll.

Choose content-driven breakpoints consistent with the app. On mobile, use a navigation drawer, put the issue/next action first, stack cards and use full-screen detail panels with a reachable close/header. Keep mobile details independently scrollable without trapping the user.

Test intermediate widths, 320 px, landscape and large text. Do not hide required features to make a narrow screen fit. Provide adequate hit areas without changing the reference's visual density unnecessarily.

## Theme and branding integration

The final design covers dark mode. Preserve the existing Light/Dark/Auto preference and existing light theme; do not force dark globally or remove a preference. Map the new semantic components into the existing light tokens where needed and report that no separate new light-mode Figma composition was supplied.

Use the real workspace/brand and existing assets in production. “Northstar Club,” “Demo workspace,” example people and sample numeric balances belong only to review fixtures. Remove demo badges in real production data views. Keep an illustrative customer preview explicitly labeled even in production.

## Fidelity and accessibility

Visual comparison must include typography, spacing, alignment, icon style, panel depth, diagonal accent, preview treatment, states and responsive ordering. Passing a build is not proof of visual fidelity.

Measure actual text/control contrast, keyboard focus, modal behavior, zoom and reduced motion. If these require a small correction, document it. Never claim the entire interface passes accessibility solely from two palette contrast checks.
