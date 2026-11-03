# Staff app — Eclipse screens

The owner approved extending the Eclipse Home direction to the other Staff pages: “ok, lets now make a designs for other pages.” This pass creates an editable Figma review, not native implementation.

- [Start with the main screens](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2938)
- [Review index](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-3179)
- [Navigation prototype](https://www.figma.com/proto/HQV6zF7ArPVd7rpdf1UUPr?node-id=43-867&starting-point-node-id=43%3A867)
- [Approved Home and element guidelines](06-ECLIPSE-HOME-20261103.md)

## Scope and design

44 editable 393 × 852 screens/states, organised into 11 sections on **Staff / Eclipse screens**. The original Eclipse Home and the earlier Quiet luxury and Obsidian pages are preserved.

The screens extend the approved black/champagne glass direction, with SF Pro, Lucide outline icons, quiet background light, compact rows, large primary controls and the icon-only four-item dock. Member details use Benefits / Activity / Details tabs; Purchase and Check in are distinct actions. Account settings move into Profile. Workspace management links stay in More and show an external-link icon.

Product copy is kept short. Identity, redemption code, amounts, consequences, error recovery and member-facing decline reasons remain visible where they help staff make a decision. Gold indicates emphasis or pending attention; green and red distinguish outcomes alongside explicit text and icons.

## Screen inventory

| Section | Screens and states |
| --- | --- |
| [01 / Everyday](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2938) | Home, Members, member overview, Activity |
| [02 / Identify a member](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2939) | QR scan, NFC scan, member-number lookup, scan location |
| [03 / Results & requests](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2940) | Access granted, access declined, Waiting requests, Approved requests |
| [04 / Resolve a request](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2941) | Reward handover, benefit request, approved benefit fulfilment, decline reason |
| [05 / Desk actions](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2942) | Give points, Use points, Record purchase, Check in |
| [06 / Member detail](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2943) | Member activity, contact details, membership cards, Link a card |
| [07 / Workspace & account](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2944) | More, Profile, Sign in, biometric lock |
| [08 / Outcomes & recovery](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2945) | Points added, uncertain points change, no matching member, Done requests |
| [09 / System & form states](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2946) | Invalid fractional points, failed request refresh, camera permission, empty queue |
| [10 / Transaction receipts](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2947) | Points used, purchase recorded, visit recorded, card linked |
| [11 / Fulfilment & preferences](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=51-2948) | Reward given, benefit given, expired membership, language selection |

Selected exports: [Everyday](design-20261103/screens-01-everyday.png), [Requests](design-20261103/screens-03-requests.png), [Desk actions](design-20261103/screens-05-desk-actions.png). All 11 section exports were inspected during the design pass.

## Mapping to existing behaviour

The existing routes in `apps/loyalty-staff/app/` were inspected before design: the five tabs, member detail, points, check-in, card linking, scan results and sign-in.

- **Permissions and loyalty decisions remain the server's.** Read `staff.can`, member usability, eligibility and server responses. Hide unavailable actions rather than substituting a disabled action for a missing permission. Activity relocates the current permission-gated Home feed; it is a proposed separate destination.
- **Requests retain Waiting / Approved / Done.** Waiting combines pending rewards and benefits; Approved is for benefits; Done includes rewards and benefits. Pagination remains required. Confirm the full member identity and redemption code before reward handover. Approval and provision of a benefit stay separate.
- **Scan context stays explicit.** The specimen selects Spa and shows a server-derived access verdict. Reception is desk lookup; events have their own context. Pause QR/NFC while choosing context. Keep manual lookup and recovery when the camera is unavailable.
- **Points are positive whole numbers.** The displayed before/after balance is a review aid; confirmed balances come from the server. The large amount is an editable numeric control in implementation, with keyboard support and the existing validation.
- **Purchase and Check in are separate presentation flows over the existing desk visit capability.** Purchase records an eligible purchase; it does not take payment. Currency and decimal precision come from the venue. Visit effects, stamps and points are server-derived; the sample £85/+85 and stamp receipt are illustrations, not client-side rules.
- **Uncertain writes preserve the attempt.** Keep the original payload and idempotency key, lock editing while sending and retry the same operation. An unanswered write must not appear as a failure or success. A failed request read must not become an empty queue or a zero badge.
- **Cards retain full identifiers in detail.** NFC linking exists; this pass does not invent native card disabling or member enrolment.
- **More preserves management access.** Programme, Rewards, Events, Campaigns, Insights, Settings and Guide remain authenticated web destinations, with the current capability gates. Profile consolidates language, biometric lock, request alerts, sign-out and version/build.

Sample member names, balances, dates, venue, card identifiers and account fields are fictional design data. No live accounts or transactions were used.

## Components, accessibility and motion

Reusable assets are at node `42:674`: button variants (Gold / Quiet / Danger), row variants, field states, segmented controls, four active dock states, 45 vector icon components, and a styled native iOS switch source. They reuse Eclipse colours, surface/effect styles and semantic tokens, adding success/danger aliases and text styles for rows, fields, buttons and amounts. Text, icons and row values remain editable component properties.

The existing Home guide continues to define the material and future motion. Decorative animation is deferred to code. Retain spoken labels and selected state for the icon-only dock. Wired prototype controls are at least 44 × 44; implementation must also provide full row targets for switches and an accessible password visibility control, with at least 48 dp targets on Android. Support larger text, keyboard avoidance, scrollable content above fixed actions, screen readers and platform-appropriate typography. Reduced Motion removes drift/scale; Reduced Transparency uses solid surfaces. The token modes are a foundation, not proof of full accessibility acceptance.

## Prototype and verification

Figma file `HQV6zF7ArPVd7rpdf1UUPr`, page `40:674`, session `69cf3a38-3417-47ca-a671-eace288fcac3`. Home entry `43:867`; index `51:3179`; reusable assets `42:674`. Sections use actual Figma Section nodes so phone frames remain valid prototype destinations.

- All 44 frames are 393 × 852, with editable nodes, SF Pro text and no image-filled UI.
- Final text-bounds audit found no visible text outside a phone; screenshots were also checked for overlaps. Manual-scan context and the card identifier/status layout were corrected and re-exported.
- 223 navigation actions have valid frame destinations; language choices return to their entry screen with Back. No wired target is smaller than 44 × 44. Reaction data was read back; full interactive prototype playback has not been independently observed.
- The representative paths include Home → scan → result → member, member → desk action → receipt, request → approval/handover → result, and profile/account navigation.
- This is a static design simulation. Inputs, search/filter results, pagination, biometric/NFC/camera permissions, server writes, toggle effects and web destinations are not live. Only representative member/request rows are connected. Each scenario uses fixed sample data; returning from a receipt does not mutate the member specimen's balance or queue counts.
- No native app, backend or store changes were made. App tests were not rerun for Figma/documentation-only work; prior reliability verification is recorded separately in report 04 and the handoff.

Review these screens before applying the layouts. Native implementation then needs large-text and keyboard checks, device rendering/performance, screen-reader acceptance, all five locale bundles, and the physical QR/NFC/biometric/push checks already required by the release plan.
