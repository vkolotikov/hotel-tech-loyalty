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

The final source/artifact gates, full language matrix, exact manifest, production content checks and CI results will
be appended after rollout. Private screenshots/fixtures are outside Git at
`C:/wamp64/tmp/loyalty-admin-ux-rehearsal-20261110`; passwords and tokens are never printed or committed.
