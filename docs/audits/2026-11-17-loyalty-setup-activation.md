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
explanation. Both received failing regressions and implementation corrections; re-review closed both with no
Critical/Important findings remaining. Saved reward availability is rechecked on Apply and ordinary option saves.

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

The first artifact backend pass exposed seven Windows certificate-fixture failures without `OPENSSL_CONF` and
one old stamp-card fixture that selected an already exhausted reward. With the workstation's bundled OpenSSL
configuration, the certificate cases pass. The stamp test now configures an obtainable reward and exhausts stock
after the first stamp; its original fallback points/redemption/audit assertions remain. Focused32/343 and the
full corrected LoyaltyWorkspace745/6838 pass. The first artifact frontend pass hit a cold source scan's15000ms
runner deadline; the full rerun and the final post-adjustment suite pass, without editing the scanner assertions.

Compiled source browser acceptance passed196 checks with zero runtime errors:170 setup/reward cases across
1440/390px, both themes and five locales;11 hosted claim cases, including staff-created member, real local queued
mail, wrong code, successful activation of the original identity and a fresh-session sign-in;15 unavailable reward
cases across both themes/sizes, with native disabled option property/markup and backend422 refusal. Screenshots
were visually reviewed. The validation-error correction test found and fixed Advanced settings collapsing while
the user continued editing. Test data, credentials, codes and tokens remain private.

## Final release candidate

Application source and tests: `a38bd0b5df1f6a020d43c8dab3a3eae524546a7e`; isolated release worktree
`E:/Hexa-Tech-loyalty-release-20261117`, source patch from production `cfc08ce6e`,65 explicit source paths and no
source deletions. Whole-source parity excludes only generated `frontend/dist`, `public/spa` and `resources/spa-shell`.
Physical vendor and a fresh production build are used; final built candidate `476b323a34133cf8a9266532e7ca77b520981059`.

Artifact gates pass:4272 PHP tests/33891 assertions across11 scoped SQLite directories, seven existing skips;
fully migrated PostgreSQL18,110 tests/860 assertions across setup/auth/appointment and stamp-card scopes;
forced TypeScript,492 Vitest files/7290 tests, lint regression with1381 inherited diagnostics, Larastan on all11
changed application paths, and fresh production build. All515 published asset hashes match the build, the shell
matches its private resource copy, no shell/stats are in the docroot, and no browser-fixture markers are bundled.
An off-rate control regression additionally keeps quick rate buttons disabled with the input, so a switched-off
rule cannot display unsaved rate edits. Its final-build browser supplement passed49 checks with zero runtime
errors across both themes and1440/390px, covering off/on input and presets, zero preview, saved rate and retention
after reload. Combined browser acceptance is245 checks.57 main artifact screenshots and12 supplement screenshots
were saved; key desktop/mobile states were visually reviewed.

## Production receipt

Code release `12a038b70e9e4f71d9270009f52c8af1f4959022` deployed through the verified source-patch branch.
Live verification passed37 checks on17 November at11:39 Europe/Riga: entry `/spa/assets/index-DNvgSQ17.js`,
setup `SetupWizard-Cawwfwaz.js`, earning `EarningPage-CUwnIM9s.js`, rewards `RewardsPage-DV7OvCbF.js` and hosted
claim `Claim-BYzLfUKl.js`. Published content contains the spending switch, template reference, programme-rule
markup, unified Advanced settings and availability checks; Claim requests purpose-bound proof. A request with
both invalid email and invalid purpose confirms backend validation before issuance, without sending mail or
changing an account. Protected member/admin APIs remain401, private shell/stats remain404, the landing host
refuses the activation shell, and Academy's original kit stylesheet is retained with the retired sheet absent.

CI: [run44056903877](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/44056903877), on the exact code
release. All eight jobs passed, including the full PostgreSQL18 regression under its existing known-failure
allowance, all three SQLite shards, Node24/26, dependency audit and Larastan. The user can reopen the Android activation
page and request a fresh code; no store update is needed for the documented current release.

The original C: checkout remains on `audit/content-prelaunch-20261113` at `175ea36d7` with no tracked changes.
The source feature branch and private receipts/screenshots are retained. Both owned local PostgreSQL clusters,
fixture backends and proxies are stopped. This final receipt changes documentation only; application and
generated-asset trees remain identical to code release `12a038b70`.
