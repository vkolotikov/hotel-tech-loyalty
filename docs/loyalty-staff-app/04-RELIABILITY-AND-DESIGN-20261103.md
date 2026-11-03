# Staff reliability fixes and design concept — 3 November 2026

Owner accepted the product review's suggested improvements. This first delivery fixes confirmed reliability defects in the current app and prepares the visual redesign for review. New operational features and the redesigned screens are not represented as shipped.

## Editable design

- [Figma review board](https://www.figma.com/design/HQV6zF7ArPVd7rpdf1UUPr?node-id=4-186).
- [Linked prototype, starting at Today](https://www.figma.com/proto/HQV6zF7ArPVd7rpdf1UUPr?node-id=4-851&starting-point-node-id=4%3A851).
- Four main screens: Today, Scan result, Member, Requests. Three additional states: check-in, reward handover and an unconfirmed transaction.
- Native editable text, vectors, auto layout, instances and colour variables. No flattened UI images. Shared request rows and navigation; buttons use the Simple Design System component with brand overrides. Fonts checked: Inter and Cormorant Garamond. Icons from the installed Lucide library (ISC).
- Both complete screen groups were visually inspected. Main board: 606 descendants, including 163 text nodes and 28 instances. Seven additional top-level frames support prototype navigation. The prototype demonstrates navigation; purchase, points, card management and final submission controls are design proposals, not live transactions.
- Fictional venue/member data. Review screenshots in `design-20261103/` are **concepts**, not installed-app screenshots.

The direction keeps navy/gold, reduces glow and competing colours, reserves serif for brand/editorial material, and uses Inter for operational tasks. It separates available points from tier progress. Proposed check-in and purchase flows are distinct. Compact requests lead to identity/code confirmation before handover. Controls need sufficient touch area and usable large-text layouts; see [Apple's button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons).

## Implemented in Staff source

1. Strict whole-point parsing: `1.5`, `1,5`, `-10`, scientific notation and text suffixes are rejected. Explicit thousands grouping remains accepted. Purchase input distinguishes blank from invalid, rejects non-positive/over-precise values and never silently rounds or converts malformed input into an amountless visit. An amount is required when check-in is disabled. Server validation remains authoritative.
2. Durable points/check-in attempts: persist operator/organisation/member/action-scoped key and exact payload in SecureStore **before** writing. Restore the unanswered payload when reopening; prevent editing it; retain it for unknown outcomes, timeouts, 5xx and in-progress responses. Reuse the same server idempotency key. Storage failure prevents a write. A confirmed refusal clears a fresh attempt; a previously uncertain attempt stays pending until confirmed. Logout preserves the scoped retry journal.
3. Requests: both lists paginate; Done includes fulfilled/cancelled reward history. Unique rows across pages. Home and tab badges share a total of waiting benefits + approved benefits + pending rewards. Totals represent the team's queue; read-only staff can see rewards but cannot hand them over. Loading/errors are explicit, and partial failures never show “nothing waiting”.
4. Reward handover: full code/member number is visible and a confirmation shows identity and code. Capability gating for handover/check-in, and manager-only web shortcuts. Existing server permissions still decide every write.
5. Central session cleanup: abort/cancel reads, clear query cache, reset scan result/location on logout and token expiry. Ignore old-session responses and never retry them under a new account. Protected routes remove member/form screens after logout. Login validates staff bootstrap before adopting the session. Persisted token writes are serialized.
6. Device lock: enabled saved sessions lock on cold launch and after two minutes away; background/inactive privacy cover; prevent concurrent biometric prompts and offer sign-out. Native foreground focus refreshes stale queries. Device registration cleanup cannot erase a newer local registration identifier.
7. Explicit errors/retry for metrics, activity, cards, history, typed member search and place/event choices. Today’s events load all server pages. NFC pauses while choosing a location.
8. Tier progress uses the programme's points/visits/spend unit, including currency formatting for spend. No tier rules are recalculated on the device.
9. Brighter secondary text, labelled inputs/search, and a 48-point close target. These are small accessibility corrections to the current visual design.
10. All new/changed copy is present in English, Russian, German, French and Spanish (usted). Unknown errors no longer assert that nothing changed.

No backend endpoint, loyalty rule, account permission or real customer's balance was changed. No store submission was replaced in this source pass.

## Validation

- TypeScript: passed.
- Vitest: 38 passed across four files, including strict input, totals/pagination de-duplication, durable retry restoration/storage failure/concurrent starts, late completion after reopening a form, cold-start/timeout decisions and delayed account responses. Navigation is held while a points/check-in request is sending; unresolved attempts may be closed safely and restored.
- Expo SDK dependency check: up to date.
- Expo export: Android, iOS and web bundles compiled. Native preview runtime acceptance is recorded in the handoff after the test build.
- Existing source/store tests retained. No bare PHP tests or backend deployment required.

These checks do not certify physical NFC/QR, Apple biometric prompt behaviour, push delivery, screen readers or large-font layouts. Those need device acceptance before a store update. The preview has the current UI plus reliability fixes; the Figma redesign is a separate approval step.

## Next after design confirmation

Implement the compact layout and request detail/search flow, then card disable/replace, basic enrolment/editing and permission-controlled corrections. Add stamps/credit views only when enabled by the server. Keep campaigns, imports/merge, advanced reports and setup on the web. Review the member app next using the same approach.

Remaining engineering follow-ups: durable scan recovery across process restarts (the existing ten-minute same-code rule remains), exact notification deep links, transaction reconciliation when a previously uncertain request can no longer be retried because access/programme settings changed, and complete accessibility/device acceptance. Pending points/check-in attempts are retained in that case; staff must check history/with a manager rather than create a fresh transaction.
