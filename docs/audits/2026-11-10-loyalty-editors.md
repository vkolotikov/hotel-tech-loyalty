# Loyalty settings editor polish — 10 November 2026

Reference: Figma `d6IGmk3hOoMw0V5rONbI1A`, page `392:8135` (01D · Staff settings editors).
Feature branch: `feature/loyalty-editor-dialogs-20261110`.
Previous deployed source baseline: `f6146efee`; production main at task start: `a5fb150ce`.

## Implementation

The fourteen reference states now share native compact (558 px) and wide (984 px) dialogs: add/edit level,
qualification, place, earning-method chooser, purchase rule, expiry, welcome/referral bonuses, timed boost,
points reward, perk, assignment and offer. Original Figma vectors are local assets with their original roots
and proportions. Headers, field groups, controls, previews, optional sections and save footers share one
scoped implementation. Body scrolling keeps header and footer available on phones. Both themes and all five
locale bundles are covered.

Routed editors retain their addresses and render the catalogue underneath. Selection stays on the record
being edited. Native modality provides background inertness, Escape, focus containment and focus return.
Cancellation protects changed drafts; nested assignment/removal dialogs keep their parent draft mounted.
The earning chooser configures the server's available inactive methods and creates no invented rule model.

Existing permissions, validation, writers, option lists, venue wall times, picture endpoints and refreshes
remain canonical. Reward eligibility is the actual all-member rule; offers and places retain their actual tier
choices. No schema, backend, dependency, provider or native API changes. No customer records or messages.

## Verified release gates

- Release artifact: TypeScript and **6,916 frontend tests /469 files** passed. Lint regression check passed
  with **1,383 existing diagnostics**, without baseline expansion.
- Required scoped artifact PHP suites passed: Support **214/1590 assertions**, Unit Landing **118/1763**,
  Feature Landing **1735/9552**: **2,067 tests** total. Physical vendor copy, no vendor junction.
- The compiled real-backend administration journey passed 88 checks across eight screens, both themes,
  mobile/desktop, five languages, canonical purchase saves and assignment navigation.
- Dedicated editor acceptance recorded **105 passing assertions across rehearsal phases**: 69 initial
  layout/draft/save checks, 16 final tablet/phone checks, 7 final nested-draft and canonical-save checks, and
  13 final translated-mobile/runtime checks. All fourteen types at 1440/390 in both themes; representative
  final layouts at 768/390; actual Russian/German/French/Spanish purchase/referral/offer controls.
- The initial offer create attempt exposed its canonical required description inside Advanced. It is now
  visible, and invalid submission focuses and reveals the first problem. Its successful save was verified.
  New offers show their canonical enabled status as read-only; existing offers retain their status control.
- Nested assignment removal Keep preserves its draft, cancelling the child preserves the parent level draft,
  and closing nested native dialogs restores page scrolling regardless of React cleanup order.
- The final header-clearance CSS passed **535 focused token/locale tests** and the translated mobile checks.
- Whole-source parity passed outside only the three generated paths. Source manifest has **53 paths**,
  SHA256 `3EE030B93F1B7135BA824B0681A881F0C66CD04E920B5F3BEAC6F8205D4AAB52`.
  Fresh release build passed, followed by 17 local content/authentication/landing checks and four compiled
  artifact browser probes. Final artifact header/reward/token/locale checks passed **546 tests**.

Private evidence: `C:/wamp64/tmp/loyalty-editors-rehearsal-20261110`.
Task-owned cluster: `C:/wamp64/tmp/loyalty-editors-pg-20261110`, loopback port 55459.
The prior layout release's CI run 42836406359 completed successfully (all eight jobs).

## Live release

Production main **da75a17f564331ad80e822b072a761e8fb0b11f6**, from source through
**2696a39c21f1ee5aa09646ec2fb4611d96ab37b4**. **Next source-patch baseline: 2696a39c2**;
subsequent evidence documentation is not new product code.

Both `loyalty.hotel-tech.ai` and `app.hexa-tech.uk` passed **32 live checks** at **15:41:10 UTC /
17:41:10 Europe/Riga**. Native editor structure, compact/wide scrolling layouts, translated messages,
the previous member search clearance and catalogue layout, authenticated endpoints and the Academy author
stylesheet were verified by content. No `rp-` markers in the author stylesheet. Production checks only read;
all record creates/saves used the isolated PostgreSQL demo.

Cloud assets: `index-DwmWPp35.js`, `LoyaltyApp-B7cT8umh.js`, `EarningPage-DCA8vGSY.js`,
`ManagementUI-CM1tfNh2.js`, `ProgramPage-BrrJUjz4.js`, `RewardsPage-CoaOC3aK.js`, `OverviewUI-DrvWgfWP.js`.
Evidence: `C:/wamp64/tmp/loyalty-editors-production-20261110.json`.

[CI 42846286071](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42846286071) is still running.
Both Node builds, dependency audit, Larastan and SQLite shards 1/2 passed; PostgreSQL and shard 3 are pending.
All required local artifact gates and live verification passed.

The task-owned loopback services and PostgreSQL cluster are stopped. The clean deployment worktree was
removed after verifying its absolute path, branch and commit, physical vendor, and dependency junction target.
Shared dependencies, owner files, private evidence and the earlier cleanup remnant remain untouched.
