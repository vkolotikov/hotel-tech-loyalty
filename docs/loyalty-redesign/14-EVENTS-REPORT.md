# Events milestone — implementation record

Status: deployed as `ab5f25bdd0dd1e8993728f95423a2ea519ba67f4`; live content verified 28 October 2026, 14:26 Europe/Riga.

Source: Figma `d6IGmk3hOoMw0V5rONbI1A`, full contexts and screenshots inspected through the connected plugin: EV-01 `115:5501`, EV-02 `115:5502`, EV-03 `115:5503` (1440 × 1080). Reuse the established Overview shell, buttons, dialogs and typography. Figma SDS examples are adapted to the existing React controls. The calendar and Events-frame Program icon are exported SVGs; preserve their native geometry. Other shell assets match existing exports byte for byte.

## Implementation map

- `/loyalty/events`: selectable event list, upcoming/past/drafts, server search/location/eligible-level filters, ordering and pagination, selected event details, guidance and create action.
- `/loyalty/events/new` and `/:id/edit`: full editor, member preview, single/multiple days, venue wall times, place/custom location, all/chosen levels, signup/walk-ins, unlimited/limited capacity, points and visit settings, draft save, review/publish and pending/dirty/error states.
- Existing `/:id`: attendee list and selected attendee, server search/status filters, authoritative summary counts, check-in confirmation, member profile, event details, scan/door/by-name, add/cancel signup, edit/publish/cancel/delete draft.
- Extend read endpoints only. Keep all financial writes, access decisions, notifications and idempotency in existing Events services. Counts exclude walk-ins from registered members still to arrive. Award display reads the original attendance transaction, including reversals; never infers historical awards from the current event reward.
- All five locales; responsive layout and keyboard/focus behavior; existing routes and scanner payloads remain supported.

## Deliberate data adaptations

Figma sample names/counts/dates are browser fixtures only. No production seed data. “Counts as a visit” preserves the existing per-member, per-venue-day qualification rule; a second attendance that day does not promise a second qualifying visit. Points are awarded atomically with check-in, so the illustrative “reward pending” state is not invented. A missing historical ledger entry is shown as unknown, not an award. Publishing does not send invitations; existing published time/place changes and cancellations retain their notification behavior.

## Verification

- Existing Events baseline: 39 PHP tests, 344 assertions, passing.
- Focused Events backend: 42 tests passed; the release artifact additionally covers exact positive place matching and custom-location options.
- Full artifact backend: 7,074 passed, 7 skipped, 45,264 assertions in 75 scoped foreground runs using PHP 8.4.20. Every `Tests:` summary was inspected.
- Frontend artifact: TypeScript and Loyalty ESLint passed; full Vitest run 5,619 passed, zero failures across 389 files. Fresh Vite build and postbuild completed.
- Development and compiled artifact browser: each passed 26 interaction checks and 57 state/responsiveness checks, zero runtime errors. These include exact-body create retries, check-in key reuse, partial publish failure, draft deletion, cancellation, permissions, error recovery, all five languages, light mode, and 320–1440px layouts. Browser writes were intercepted local fixtures. See [compiled verification](evidence/events/verification.json).
- All 18 Figma SVG exports matched local files by SHA-256; native dimensions retained. See [asset audit](evidence/events/asset-audit.json).
- Live content checks passed: Events strings and responsive styles, three local font weights, Events list/detail/people authentication (401), public landing kit and retired stylesheet (404). See [live verification](evidence/events/live-verification.json). This is read-only deployment verification; transactional behavior is verified in backend tests and intercepted compiled browser flows.

## Rendered comparison

All three compiled desktop screens were visually compared to their exact Figma screenshots, with mobile and light-mode renders inspected separately. The shared 232px rail, 32px content inset, 24px column gap, 80px event rows, Poppins typography, gradient cards, cyan selection border, recessed inputs and raised actions are retained. Desktop reference panels align with the design at approximately y=382 (overview), y=228 (editor/stats), and y=450 (attendees).

The implementation retains real fields and actions that the illustrative frames omit: walk-in settings, unlimited capacity, member description in the preview, exact venue dates including year, signup cancellation, door mode and by-name check-in. Longer text and these controls may extend the page vertically. No illustrative demo badge/footer is shown against real data. Mobile layouts stack; tests check actual column rectangles and usable input width, not just document overflow. Light mode uses the shared palette with readable pastel panels; screenshots wait for theme transitions to settle.

- [Overview reference](evidence/events/figma-overview.png) / [render](evidence/events/render-overview.png)
- [Editor reference](evidence/events/figma-editor.png) / [render](evidence/events/render-editor.png) / [mobile](evidence/events/render-editor-mobile.png)
- [Attendees reference](evidence/events/figma-attendees.png) / [render](evidence/events/render-attendees.png) / [mobile](evidence/events/render-attendees-mobile.png)

## Read integration

`GET events` accepts bounded `q`, `place_id`, custom `location`, `tier_id` and `sort=soonest|latest`. Search escapes literal `%`, `_` and `!`; SQL works on SQLite and PostgreSQL. Filters run before count/pagination. Location options are tenant-scoped. Level selection includes events open to all members or that level.

`GET events/{id}/people` accepts `q`, `attendance=all|not_checked_in|checked_in|walk_in|cancelled` and `per_page=5..200` (default 200 preserved for existing clients; new page uses 5). Counts remain event-wide under filters. `counts.not_checked_in` is active registrations without an attendance, not registered minus every check-in. `points_awarded` and `points_reversed` come from the attendance’s matching organization/member/reference ledger entry. No migrations or writer-service changes.

Deploy source baseline: `b7e5e3a5a2986b0e09db8955249aa4f07e7c32a6`; production parent `56ddb2d2b9c260d0c44ee3f5a6668cb02e0c62d5`.

## Release record

Deployed feature source: `27baa2935820dd2e70b4e63c337d8f5a5cc0c0bb` on `feature/loyalty-events-20261028`. The next source delta starts there, not at later documentation commits. Final artifact source patch `6ba19561a`; fresh build `ab5f25bdd`. Whole source parity passed excluding the generated build directories and SPA shell. The explicit change list contains 49 paths; the obsolete intermediate light screenshot was also removed from the artifact. No dependency, migration, financial writer or access-control changes.

Cloud rebuilt entry `index-DPUoSWOd.js`, Loyalty `LoyaltyApp-4CAHf0Ws.js` / `LoyaltyApp-DH-yoI5b.css`. Private test logs and deployment scripts are under `.git/events-*`. Feature commits contain source and evidence only; built assets were committed solely on the isolated deployment branch.
