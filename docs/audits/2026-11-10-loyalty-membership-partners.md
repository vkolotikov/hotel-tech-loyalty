# Manual memberships and partner scanning — 10 November 2026

Owner clarification: manual package/level assignment only; no payment connection or payment record.
[Customer guide](../loyalty-memberships-and-partners.md) · [API contracts](../api/loyalty-membership-partners.md).

## Source behavior

Inclusive venue-day start/end dates, scheduled status, imports and coherent merges. Managers assign one active own
level with its real benefits and dates atomically; the level resists automatic upgrades/downgrades. Returning to
earned progression preserves unchanged dates and does not renew access. Future replacement of current access
requires confirmation. Points balances are unchanged.

Partner access under Settings uses the canonical Team invitation/activation writer. Accounts are scan-only at
their selected active places; default-deny also applies in access report mode. Minimal responses exclude contacts,
balances, history and directory/edit controls. Place revocation is rechecked before operator-scoped scan retries.
The separate phone-friendly scanner reuses PlaceScan, CameraScanner and Web NFC. Team screens retain and identify
the restriction. Physical-card QR SVG follows the card ID through existing switch-off/relink, never transfers a
personal QR, wallet or login. A visible persisted collapse/expand button is added. Guidance is in five languages.

Four additive migrations introduce start dates, assignment mode, partner grants and preserved bounded-term intent.
The internal period flag defaults false for legacy compatibility. Assigned/start-dated terms keep it when returning
to earned or clearing the start. A legacy earned→earned save does not set it. Tier-restricted offers, level earning
privileges and queued benefit approval/fulfillment use the current term. Unrestricted promotions, base earning and
existing points/credit entitlements retain their rules.

## Review and source checks

Fresh read-only review found five P2 issues, no P0/P1. Regressions reproduced connected-merge loss of current access,
late queued-benefit consumption, premature level offers, expired form preservation and missing start text when
points were off. All fixed. Follow-up found a legacy no-op flag issue; reproduced and fixed in4da1e6f32.
Final follow-up verdict: **Approve**. Fourteen assignment tests /62 assertions pass.

- TypeScript, lint baseline (1,383 unchanged legacy diagnostics), **6,857 frontend tests /465 files** passed.
- Authentication/member portal: **325 PHP tests /2,808 assertions**. Changed coupon/offer/earning consumers78 /270;
  subsequent final offer scopes18 /117. Period/assignment/merge82 /577. These overlap and are not a summed total.
- Four migrations applied on isolated PostgreSQL18; membership/partner/card/date scopes **68 tests /406 assertions**
  before the final legacy-only regression (which passed on SQLite). Final artifact evidence follows below.
- **68 compiled real-backend browser checks**: actual package benefits/dates, future confirmation, invitation and
  password activation, scheduled denial/active check-in, direct API refusals, all five actual locales and both
  themes on phones, physical-card/QR reuse, deactivation and persisted menu collapse. External requests blocked,
  local mail capture only. Screenshots inspected. This found/fixed Activate's stale router callback after the
  identity boundary remount. Evidence: C:/wamp64/tmp/loyalty-launch-20261109/memberships.
- Native compatibility: current portal modules copied into a separate detached e5b778788 workspace. Member-app
  TypeScript and **41 tests** passed; the owner's native checkout was untouched. This is no store/device release.

## Release gate

Feature branch feature/loyalty-membership-partners-20261110; source commits3b1d28c44,171ce9ecb,cbbbd711d,4da1e6f32.
Next source-patch baseline remains **b1f5082d2**, production main **1d159b7e6** until the artifact gates pass.
Deployment/content evidence will be appended. Native partner-app release, physical NFC/camera acceptance and actual
push delivery remain separate checks. No live customer invitations/campaigns, provider keys or wallet issuer changes.
