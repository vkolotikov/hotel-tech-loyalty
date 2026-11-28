# Compact staff Events

The Loyalty workspace has one Events sidebar destination. Upcoming, Past and Drafts are filters inside the
directory, alongside search, location, level and ordering. The compact rows have date tiles, aligned signup
counts and server-derived state badges. The selected event shows its schedule, eligibility, capacity and
attendance reward. The banner, separate promotion panel and secondary header action have been removed.

Creation and editing use the same native popup and fixed footer as Program and Rewards, with grouped schedule,
location/signup and attendance reward fields plus a live member preview. Existing editor URLs remain valid.
Changed drafts are guarded; saving and review/publish retain the existing API and idempotency behavior.
The attendance page groups its filters with its list and uses compact icon summary tiles and matching rows.
Ten attendees fit per page; scan, door mode, by-name check-in and lifecycle actions remain available.

Figma file `d6IGmk3hOoMw0V5rONbI1A`: EV-B01 `312:11225`, EV-B02 `312:11495`, EV-B03 `312:11781`.
All three high-fidelity contexts and screenshots were inspected. Layout adapts their compact hierarchy to the
shared 01B staff components; the requested single sidebar button replaces the reference's submenus.
Original calendar SVG matches the existing export by SHA256. Five additional original vectors are local,
unmodified SVGs; their intrinsic dimensions are retained. Shared navigation, badge dots, chevrons, form fields
and Button composition reuse existing components. No temporary Figma URLs ship.

All new copy is translated in English, German, Spanish, French and Russian. Only Loyalty source is changed;
the full admin, APIs, schema, notifications, access decisions and financial writers are unchanged.
Figma's sample reward-pending state is not invented: historical awards remain the server's ledger facts.

Feature checks: 571 focused frontend checks and 58 scoped Events PHP tests / 510 assertions passed.
The real-API journey is `frontend/e2e/loyalty-events-compact.mjs`, restricted to the isolated loopback PostgreSQL
demo. Its private report and desktop/phone screenshots are under
`C:/wamp64/tmp/loyalty-events-rehearsal-20261110/events/`. No production customer writes or messages are used.

Release artifact verification: TypeScript/fresh build, 6,931 frontend tests / 470 files and the lint regression
check pass (1,381 legacy diagnostics). The final CSS refinements additionally pass all 571 focused checks.
Required scoped PHP tests pass: Support 214 / 1,590 assertions, Unit Landing 118 / 1,763, Feature Landing
1,735 / 9,552, Events 58 / 510. Total: 2,125 PHP tests / 13,415 assertions.

Compiled browser acceptance: 61 real-API journey checks; 57 final responsive, language, popup and selection
checks after the final CSS refinement; 20 further heading/overflow/44px filter-target cases across five
languages, both themes and 320/390px. All pass, with no runtime errors. The native editor's first invalid
field, changed-draft protection, draft save, review/publish and original check-in ledger award are exercised.
Closing an editor returns to its selected event. Cancelled registrations have an explicit presentation test.

The long German heading and narrow French directory regressions were reproduced and corrected. Desktop
1440px and phone 390px renders were visually reviewed, plus German at 320px. The weakest decorative pieces
(banner and separate promotion panel) are removed. Browser-computed text contrast is at least 4.642:1 in Light
and 4.840:1 in Dark for the checked Events labels/badges/date blocks. Six visible original Event vectors are
non-empty; callsites and intrinsic render geometry pass. No screenshots are used as product assets.

Source patch: 25 guarded paths from baseline `7798337c7` through `88fdf4adb9badade6ae9d4a719501c12a4a1d411`.
Whole-source parity excluding only `frontend/dist`, `public/spa` and `resources/spa-shell` passes before and
after fresh builds. Manifest row SHA256: `f4becd0727b0625eae197c9f2da04cd545f6ba7f36b9ce0a105fde270e178d12`.
The layout release `c372c113ee5d22afec0022bb1701354359d400e0` was followed by the final search-focus correction
`eb8047a2389953e09b274e6238b936ae5a19da1b`, verified live on both production domains at
**2026-11-10 20:24:36 UTC / 22:24:36 Europe/Riga**.
Fifteen final local bundle/authentication checks pass. Private supplementary evidence:
`C:/wamp64/tmp/loyalty-events-header-final-20261110.json`, `loyalty-events-contrast-20261110.json`,
`loyalty-events-assets-20261110.json`, `loyalty-events-source-manifest-20261110.json` in the same temp root.

Character-by-character typing exposed a focus regression after moving the filters inside their data panels:
the old build retained only `C` / `J` for `Coffee` / `Jamie`. Both queries now use the existing
`keepPreviousData` pattern, so filter controls remain mounted during refresh. The final compiled build
retains both complete values and focus. The 19-check functional journey, including both typing cases,
draft/publish and the real ledger award, passes again, along with all 6,931 frontend tests, lint and fresh build.
Before/after evidence: `C:/wamp64/tmp/loyalty-events-typing-before-20261110.json` and
`loyalty-events-typing-after-20261110.json`; final journey: `events/functional-report.json` under the rehearsal root.

[CI 42894087414](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42894087414) is in progress.
The preceding layout CI passed both Node jobs, audit, Larastan and all three SQLite shards; its pending
PostgreSQL job was cancelled when this final commit superseded it.
Task-owned loopback backend/proxy and the verified PostgreSQL cluster are stopped; private evidence remains.

All **32 final live content/authentication/landing checks** pass, including the focus-preserving query options
in both Events route chunks. Cloud assets: `index-Dsr1JbKk.js`, `LoyaltyApp-0JkzOCxX.js`,
`EventsPage-DZt8sGDA.js`, `EventPage-CObXsH-2.js`, `EventEditorPage-C1QO-SUN.js`.
Evidence: `C:/wamp64/tmp/loyalty-events-production-20261110.json`.
Next source-patch code baseline: **88fdf4adb**; later evidence documentation is not new product code.

The clean deployment worktree was removed after checking its exact resolved path, branch, final release,
physical PHP dependencies and dependency-junction target. The junction was removed separately and the shared
TypeScript dependency remains. Owner assets, unrelated worktrees and all private evidence remain untouched.
