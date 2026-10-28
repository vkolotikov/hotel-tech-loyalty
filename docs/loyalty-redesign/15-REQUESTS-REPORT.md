# Requests milestone — implementation record

Status: implemented; release artifact verification in progress alongside Insights.

Figma file `d6IGmk3hOoMw0V5rONbI1A`: RQ-01 `172:7674` benefit review, RQ-02 `172:7675` reward fulfilment, RQ-03 `172:7676` referral overlay. Full design contexts and screenshots inspected through the connected plugin. The supplied SDS snippets have no project imports; compose the existing Overview controls and native dialog. Existing shell SVG exports are checked against the 17 supplied assets.

## Implementation map

- Unified list/search/type/view/sort/page → a bounded, tenant-scoped read model over BenefitEntitlement, RewardRedemption and Referral. No copied records or new lifecycle.
- Benefit actions → existing RequestQueue and approve/done/decline endpoints; every active staff member, required private decline reason retained.
- Reward actions → existing RedemptionActions endpoints and can_redeem_points; cancellation confirmation explains the existing points/stock refund.
- Referral overlay → recorded referrer/referee awards and dates, member profiles and existing referral rules; no manual payout.
- Layout → OverviewShell, OverviewButton, OverviewDialog, scoped Requests CSS and all five locales.
- Compatibility → existing benefit tab/request bookmarks and Rewards redemptions/referrals remain available. Shared member/scanner RequestRow remains intact.

## Data adaptations

Open combines pending/eligible/approved benefits, pending redemptions and pending/qualified referrals. The list labels each native status and source. A pending referral is not necessarily a staff task. Membership is the member's current level. The benefit schema has no quantity field, so the page describes one request without promising one physical item. Activity shows only recorded timestamps and current state; approval time is not invented. Rewards use historical points_spent and the real pickup code. Referral amounts are recorded awards, never the current configured bonus.

## Verification

New inbox PHP tests: 5 passed, 50 assertions. TypeScript and Loyalty ESLint passed before the final visual refinements; the release artifact reruns both. Focused inbox math and five-language consistency tests passed. Browser: 30 interaction checks and 50 state/responsive checks passed, covering confirmation/decline/refund/fulfilment, errors and stale state, read-only referrals, permission loss, six widths, modal focus restoration, light theme and all five languages. No runtime errors. All 17 static Figma assets match local hashes. Desktop benefit/reward/referral and mobile renders inspected against their references. Final release totals and production verification follow in the deployment record. Browser mutations use local intercepted fixtures only.

Previous deployed feature source: `27baa2935820dd2e70b4e63c337d8f5a5cc0c0bb`; production parent: `ab5f25bdd0dd1e8993728f95423a2ea519ba67f4`.
