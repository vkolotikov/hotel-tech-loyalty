# Rewards & benefits simplification — 6 November 2026

Owner: improve Rewards & benefits, continuing the simplified Figma design. Branch `feature/rewards-simplified-20261106`; production baseline `c8c89119f`, source delta from deployed feature source `0b2cff75d`.

## Design and implementation

Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `5c7d2013-eba1-44e6-9b69-b341ecc25030`. High-fidelity context and screenshots inspected for RB-B01 `308:10648` (catalogue), RB-B02 `308:10947` (reward editor), RB-B03 `308:11226` (offers). The old standalone benefits frame `92:3955` no longer exists. The benefits catalogue uses the same inspected list/filter/preview composition, retaining all existing assignment and catalogue operations.

- Reward and benefit catalogues group search/status and supported filters with their rows, align value/assignment/status columns and use original coloured icons. Counts reflect actual availability/assignments. Compact benefits/offers shortcuts replace explanatory hero blocks.
- Reward editor separates member-facing details/image controls from claim settings. The violet preview and cyan code-redemption note match the new hierarchy; typed discounts, booking scope and category/brand controls remain available.
- Offers group search/brand/status in the directory, add amber promotion previews and icon headings, and place Cancel/More/Save in one footer. The offer search suppresses Enter submission inside the form. Financial edits still require Save.
- All copy changes are translated in EN/RU/DE/FR/ES. Native dropdown options have explicit theme colours. Existing `OverviewButton` (workspace Button composition), `FormField`, `NumberControl`, dialogs, writers and unsaved guard are reused. Poppins and the established workspace palette follow the approved Figma treatment.

Fifteen original SVG assets were downloaded verbatim and compared by SHA-256: eight exact existing matches are reused and seven new files are bundled. Native dimensions are retained. Customer reward/offer images stay dynamic. Final screenshot review corrected badge height and preview padding.

## Real-data adaptations and preserved behaviour

Rewards still apply to all members and use member codes. Unsupported delivery/level dropdowns, draft states and sample claim methods are not invented. Typed reward icons follow actual discount data; expired rewards retain their real ended state. Offers keep venue calendar dates, server-reported status, every-brand support and actual types/values/caps/levels. Benefit values/scope remain per-level assignments; membership benefits have one catalogue under Rewards and old Program URLs still redirect.

No PHP/API/database/dependency/earning-engine/Places/member-portal change. Existing status/availability calculation, validation, separate immediate media writes, permissions (`manage_rewards` vs `manage_program`), unsaved drafts, historical activity, redemption/referral routes and deletion previews remain. No production customer writes are used for acceptance.

## Verification and release

Focused frontend tests: 41 passed; development TypeScript and focused lint passed. Initial isolated browser run: 21 interaction + 61 state/responsive checks. Additional checks cover directory grouping, actual availability count and Enter in offer search. The fixture now opens the current mobile header menu, and its selection wait targets the editor rather than the newly grouped search field.

Final development browser run: 22 interactions + 64 state/responsive checks. Ten language/theme combinations across four pages and six widths (320–1440) passed, with native asset geometry and minimum audited text contrast 5.32:1 dark / 4.82:1 light. The long German benefits heading wraps on narrow screens. The release's first checks started before the physical dependency copy finished and were discarded; checks use the completed copy and pinned project binaries. No dependency files changed.

A final open-menu probe reproduced the moved offer More menu extending past the phone's left edge. Its mobile popup is now centered over its trigger; the state fixture checks 390/320px placement and that changing/cancelling the active state remains staged. This final correction changes scoped CSS and browser verification only.

Final artifact, deployment and cleanup evidence will be recorded after completion. Signed-in production browser inspection remains unavailable; interactive checks use local intercepted fixtures.
