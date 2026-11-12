# Loyalty administration UX — 10 November 2026

Owner's eight-screen brief: Figma353:8135. Spec and implementation plan are under `docs/superpowers/` with date
2026-11-10-loyalty-admin-ux. Feature branch `feature/loyalty-admin-ux-20261110`; previous source baseline d12ba343f,
production main e0a466c9c. Standing owner authorization permits the source-patch deployment after verification.

## Result

Canonical two/two/three navigation, old-link redirects, one home for qualification/expiry/setup/readiness, shared
assignment editing/removal, date-derived offer counts, selected-record previews, and real place access/totals.
Original Figma vectors are local and unmodified:51 used slots /49 unique files, with hashes, geometry and consumers
recorded in `28-ADMIN-UX-ASSETS.json`. Responsive stacking, both themes, five locale bundles and reduced motion.

The purchase rate and highest-promotion formula were already correct; no duplicate writer or new rate setting was
added. Regression evidence pins independent booking/desk triggers and max-once promotions with both tier multipliers.
The selected off/unavailable trigger's illustration now gives zero. No payment integration or schema migration.
Places have no separate entrance/hour model; the screen presents actual access rules and counts. Native API shapes
stay compatible. Wallet issuers, provider configuration and physical hardware are outside this web release.

## Source verification and review

- Navigation RED9failed/7passed → GREEN16; original foundation TypeScript, full6883tests/466files and lint passed.
- Missing-threshold check RED1failed/4passed → GREEN5, including entry/inactive/invitation exclusions.
- Preview/filter helpers RED2failed/7passed → GREEN9; unavailable booking example subsequently RED → fixed.
- NFC preference/serial distinction and only-inactive chooser desired regressions failed before their fixes;5 focused
  reader/chooser/setup tests passed. Booking/desk disabled preview also reproduced125 instead of0, then corrected.
- SQLite: **1289 passed,1 skipped /14624 assertions** across Unit Loyalty, Feature Loyalty, LoyaltyWorkspace,
  AdminAccess, BookingPointsService and ServiceBookingPoints. PostgreSQL18 from every migration: **91 /847** in the
  affected program/options/desk/offers/places/access/promotion/booking consumers. Full Larastan: **0 errors**.
- Fresh whole-branch review found three P2s: removal cancellation lost an assignment draft, an inactive-only chooser
  could not proceed, and general NFC replaced personal NDEF records. All accepted and fixed. The compiled cancellation
  regression failed before the fix, then passed3checks including the canonical POST and real saved data. Follow-up
  verdict **Approve**, including the later off-trigger preview correction.
- Compiled real-backend acceptance passed **53 checks**, including all8screens at1440/390 in dark/light, old navigation,
  rate save/inheritance, chosen-tier perk values and shared assignment entrances. Five language loads and no runtime
  errors. An earlier load failure was HTTP429 under the deliberately frozen fixture clock; clearing only the isolated
  demo's counters between batches resolved it. No production throttle changes or external provider sends.

Private screenshots/fixtures are outside Git at
`C:/wamp64/tmp/loyalty-admin-ux-rehearsal-20261110`; passwords and tokens are never printed or committed.

## Release artifact and final acceptance

Final code source: **d443310c1fa5127e2b646b88034e79bbcd8bc097**. Exact source patch from d12ba343f:
**148 paths**, including deletions. Manifest SHA256:
`59D9EBE82E494FA2FAB2976CCE81AEFD881D272A9AC9FD902E4EA10204ED6BDF`.
Physical vendor and whole-source parity passed, excluding only frontend/dist, public/spa and resources/spa-shell.
The deployment artifact was freshly built after the final three-rule setup spacing refinement.

- Source and artifact frontend: **6903 passed /469 files**; TypeScript passed; lint passed with the unchanged1383
  legacy diagnostics. Full source Larastan:0 findings.
- Artifact gates: Support214/1590 assertions, UnitLanding118/1763, FeatureLanding1735/9552, focused loyalty61/540;
  all passed. The larger source SQLite and fully migrated PostgreSQL coverage is recorded above.
- Final compiled real-backend journey: **88 checks**, all8pages ×5actual translated headings,32responsive/theme
  layouts, legacy navigation, canonical save/inheritance, selected-tier values and shared assignment entrances.
  No browser runtime errors. The stronger language check first exposed an early read of the translated loading
  skeleton; the runner now waits for skeletons to disappear rather than matching English loading text.
- Screenshot review removed duplicated status dropdowns in Offers and Tier perks. A final setup screenshot exposed
  a squeezed heading; three scoped CSS rules reserve text width and let the original artwork wrap below on phones.
  Review follow-up: **Approve**. Fresh build and **5 final setup checks** passed (both themes at1440/390 and runtime),
  with actual images inspected. No functional data changes followed the88-check journey.
- Against that final build, **3 assignment cancellation/save checks** passed: Keep retains unsaved wording, Save uses
  the existing endpoint, and the real program answer contains the saved wording. All tests used isolated local data,
  log mail and blocked external browser requests. No customer messages or production record writes.

Production source-patch push: **54d65439ed50bb76b29e00f4ce02c6dbe646d53d**. Live content and CI observation follow below.
Physical NFC/card/camera acceptance still needs supported devices; Wallet issuers and push providers were not changed.

## Live content

**43 public checks passed at13:34:19UTC /15:34:19 Europe/Riga** on loyalty.hotel-tech.ai and app.hexa-tech.uk:
new Program setup routing, actual Program/Earning/Rewards/Setup content, final setup CSS, authentication controls,
six unauthenticated API refusals per host, and the Academy author's unchanged no-rp stylesheet. The private probe's
initial Academy selector incorrectly expected a landing-kits URL; inspection confirmed the documented
`/landing/nocturne_ritual.css`, and the corrected probe checks that exact stylesheet and zero retired markers.
Cloud rebuilt the SPA: observed index-CbIyXBwS.js, LoyaltyApp-DrtebpYw.js, ProgramPage-D_KQSk8R.js,
EarningPage-BFfIA7oC.js, RewardsPage-DR1-LZpf.js, SetupWizard-DWXZ56VA.js and SetupWizard-IY-5OmGT.css.

Hosted [CI42824942684](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42824942684) completed successfully
at **13:51:10 UTC /15:51:10 Europe/Riga** for the exact production SHA: **all eight jobs passed**, including both
Node builds, all three SQLite shards, full PostgreSQL known-failure gate, Larastan and dependency audit. No baseline
was expanded. The PostgreSQL job completed in21m51s; local affected PostgreSQL coverage had already passed.
The GitHub connector returned an empty run list after push; the authenticated gh CLI confirmed the matching SHA
and supplied the final job state. The final CI JSON and live probe evidence are retained privately outside Git.

The task's loopback PHP/preview helpers and verified PostgreSQL cluster are stopped. The clean deployment worktree
was removed after exact path, branch, pushed SHA and dependency-junction checks. Shared dependencies, the owner's
checkout/untracked assets, private evidence and the earlier Cloud-stream cleanup remnant remain untouched.
Final housekeeping exception: automatic approval review rejected removal of the completed temporary ledger at
`.superpowers/sdd/2026-11-10-loyalty-admin-ux`, reporting only "blocked by policy". It remains locally; no product,
deployment, test or permanent evidence work is pending.
