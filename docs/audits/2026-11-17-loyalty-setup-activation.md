# Loyalty setup and member activation — 17 November 2026

Owner requested optional earning choices, correct suggestions after changing business, a spending-points off
switch, coherent reward Terms/Advanced settings, and investigation of staff-created members activating on Android.
Source: `feature/loyalty-setup-activation-20261117`, isolated from production `cfc08ce6e`. The original C: checkout
and owner assets remain untouched. Release receipts follow below after artifact verification.

## Changes and causes

- Earn rate previously had no switch, despite being presented as a ticked recommendation. The new typed
  `spend_points_enabled` option defaults true and gates the one `LoyaltyService::pointsForSpend` formula. Switching
  off preserves the saved positive rate and all historical balances. Desk/booking visits, stamp cards, cashback
  and non-spending bonuses retain their own behavior. Effective member rates and staff illustrations report zero.
  Paid appointments report that booking points are off, rather than claiming nothing was charged.
- Tier progression is an actual programme rule. Setup presents it without a disabled earning checkbox.
- Existing-programme setup intentionally preserves tiers and catalogue history. The defect was presenting those
  old saved rewards as the new business's choices and retaining its selected reward id. Server presets now expose
  indexed suggestions; changing template clears the selection, preview separates suggestions from saved catalogue,
  and Apply transactionally creates/reuses just the chosen trusted reward for an existing programme. General option
  updates cannot submit a template reference. Repeated Apply uses the existing organization lock and replay key.
- Reuse requires the model's redeemability check. Expired/exhausted matching rows remain intact, are labelled
  unavailable, and cannot hide a fresh template suggestion. A new programme keeps the existing full-preset flow.
- Reward details use one initially open Advanced settings disclosure with Terms first. Key conditions stay visible.
  The editor groups terms, availability/limits, description/media and management fields in one disclosure, which
  opens when any contained field fails validation. Existing payloads and permissions are retained.
- Portal Claim requested signup-purpose verification while `auth/claim` required an account-bound claim grant.
  Claim now explicitly requests `purpose=claim`; missing purpose preserves legacy signup verification. Signup
  verification still cannot set an existing member's password. Resends reuse unexpired codes without extending
  their original expiry, and atomic shared send throttles apply to known/unknown addresses alike. Verification
  success clears the shared attempt counter rather than a container-local cache key.

## Android evidence and limits

The owner reports the latest Android app. The official Play listing and native release records identify
HexaTech Loyalty 2.1.0/build31, published 12 November. The exact retained release runtime
`90ab7db2b6e713f7cdba2ee33cfe8b3d78b466d6` opens `https://app.hexa-tech.uk/portal/claim` for existing-account
activation. Its production build profile uses that URL. This release fixes the hosted flow; no native build is
required for that documented release. The user's actual installed build was not read from their device. The
public version endpoint's configured 2.0.0 guidance is not evidence of the latest store binary.

No production member, password, campaign, payment or reservation was changed for verification. Local tests use
only disposable accounts, array/log mail and blocked external provider requests. Live email delivery and the
user's physical phone remain unverified.

## Review and verification

Independent review found two Important issues: unavailable matching reward reuse and an incorrect paid-appointment
explanation. Both received failing regressions and implementation corrections before release review.

Initial focused evidence: 34 backend tests/301 assertions for corrected setup/options/appointment cases, 96
frontend earning/setup cases, 470 reward-focused tests, Auth69/376 with six existing PostgreSQL-only skips.
Fully migrated isolated PostgreSQL18 initially passed82/717 across eight setup/activation files; the final artifact
rerun includes the subsequent review regressions. Forced TypeScript and lint regression passed; the inherited
lint count remains1381. Private evidence uses `C:/wamp64/tmp/loyalty-setup-*`.

Initial full source Vitest passed7287 tests in490 files; the remaining source-scanning test exceeded its5000ms
runner limit, including a focused rerun. No assertion failed. The first combined PHP command hit WAMP's300s process
limit; final artifact gates run separate directory scopes. Failed/interrupted logs are retained. The complete
rerun passed492 frontend files/7290 tests with a15000ms runner budget for source scans; assertions and test source
were not edited. Final artifact gates and deployment counts are recorded below when complete.
