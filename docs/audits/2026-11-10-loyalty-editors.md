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

## Verification underway

- Source TypeScript and focused Loyalty tests passed (1,352 tests before the final hook split).
- Lint regression check passed with 1,383 existing diagnostics and no baseline expansion.
- The compiled real-backend administration journey passed 88 checks across eight screens, both themes,
  mobile/desktop, five languages, canonical purchase saves and assignment navigation.
- The dedicated editor journey is checking all fourteen dialogs in both themes at 1440/390, protected drafts,
  keyboard behavior, validation and canonical creates/saves, using the isolated fully migrated PostgreSQL demo.
- Release artifact, whole-source parity, full frontend/scoped PHP gates and live verification remain pending.

Private evidence: `C:/wamp64/tmp/loyalty-editors-rehearsal-20261110`.
Task-owned cluster: `C:/wamp64/tmp/loyalty-editors-pg-20261110`, loopback port 55459.
The prior layout release's CI run 42836406359 completed successfully (all eight jobs).
