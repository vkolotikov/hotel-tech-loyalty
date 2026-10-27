# Remaining loyalty improvements — later milestones

This preserves the broader improvement plan. It is **not** permission to invent and implement every remaining screen during the Overview task.

## Implementation order after Overview

| Order | Section | Required design/review work | Key retained capability |
|---|---|---|---|
| 1 | Members | List, search/filter/sort, profile hierarchy, balances/progress, activity, dialogs and responsive states | Add, existing import if supported, award/redeem with reasons, status/tier, consent, NFC, resend/deactivate/delete by permission |
| 2 | Requests | Benefit requests and redemption queues, detail/fulfillment, empty/error/access states | Distinct statuses, source IDs, approvals, completion and audit |
| 3 | Program and Ways to earn | Levels, assignments, earning/bonus/rule editors, setup flow and validation | Points/visits/spend qualification, expiry, bonuses, places and boosts |
| 4 | Rewards & benefits | Points rewards, benefits, offers, eligibility, fulfillment, stock/caps and editors | Existing catalogue and transaction semantics |
| 5 | Events and Campaigns | Events/calendar/form states; email/segments/push/SMS hierarchy | Consent, plan/readiness restrictions, preview/test/send and scheduling |
| 6 | Insights | Prioritized reports, definitions, time windows and useful drill-downs | Existing participation, balances/expiry, usage, tiers, revenue/cohort/at-risk reporting |
| 7 | Card & app / Settings / Scan | Appearance-first controls, preview, wallets/integrations, utility flows | Branding, themes, currency warning, wallet requirements, scanner modes |

The earlier Guided setup and Points rewards Figma concepts are starting directions, not complete state/interaction specifications. Obtain the next section's reviewed design before rebuilding its body.

## Cross-product improvements to carry forward

### Consistent readiness

Share facts across setup, Overview and relevant editors. Separate setup progress, invalid rules and optional integration readiness. Do not use “all set” merely because toggles are enabled.

### Understandable program choices

Describe outcomes in plain language: discounts, points rewards, visits/stamps, levels and service benefits. Support combinations the actual model allows. Avoid presenting every advanced feature as mandatory.

### Clear catalogue and fulfillment

Keep points rewards, membership benefits and offers distinguishable. Explain automatic application, staff approval, booking integration, voucher and request fulfillment using structured configuration. Never derive economics from names/descriptions.

### Balances versus level progress

Expose spendable points and qualification separately with units/window. Verify redemption, expiry and refund effects before proposing any migration.

### Scope clarity

Investigate mixed level names and duplicate thresholds in their actual tenant/brand/program context. Display scope clearly. No automatic cleanup or reassignment from visual inconsistencies.

### Predictable editors

Group essential fields first; reveal advanced choices progressively. Make save/cancel/upload contracts explicit. Preserve existing immediate-upload behavior until deliberately changed.

### Guidance at the point of need

Use short examples and explanations near configuration. Keep a working customer preview. Provide accessible validation, clear error recovery and sensible empty states.

### Consistent shell and themes

Use shared tokens and reusable primitives across later sections after their designs are reviewed. Keep existing language/theme preferences and full navigation available.

## Investigations, not assumed new features

The UI audit does not prove a need for a new multi-program data model, new roles, a dashboard builder, automatic fulfillment engine, recurring entitlements or a financial liability estimator. Verify actual support and business requirements before adding them.

Do not replace established loyalty economics merely to resemble a competitor. Existing features are substantial; the primary improvement is clearer presentation and safer, easier configuration.
