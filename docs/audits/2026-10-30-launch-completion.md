# Launch completion: wallets, media monitoring and reader preview

Owner instruction: complete all feasible improvements. Production release **f0c30c7398fa73c33fa3b2ef6d971664ef51d2aa**,
Laravel Cloud **1098**, deployed 30 October 2026. Source commits **de040e96c**, **b32aefe5a** on
`feature/launch-completion-20261030`. Next source-patch baseline is **b32aefe5a** (not a later documentation commit).

## Shipped

- Stable wallet identities, encrypted device credentials, Apple registration/change/download endpoints and APNs
  notifications; scheduled Google updates for saved cards. Current balances, tiers and inactive membership state
  come from the existing data/services. Removed/merged members never transfer installed wallet credentials.
- Certificate identity/expiry/signature checks, approved-class gate, shared-cache one-time Apple links, bounded
  provider retries and timeouts, fixed external origins, no sensitive provider errors in logs. Replacing a
  protected P12 with an unprotected P12 clears the old password correctly.
- Apple artwork at normal/retina dimensions using owned logos with a visible fallback, replacing one-pixel images.
- Tenant wallet-update status and platform media-versioning observations in System status. Failures stay in the
  application, as requested. Missing observations do not become false success.
- Read-only media checks and an explicit exact-version rehearsal command: private temporary copy, SHA-256 compare,
  exact-version cleanup and a durable unresolved-copy marker. No bucket policy was changed.
- Portable Windows ACR122U/PCSC UID helper and translated Scan guidance. Manual read/copy/paste, no local listener,
  background injection, credentials or card writes. Existing HID/camera flows remain.

Runbook: [wallet-and-media-operations.md](../wallet-and-media-operations.md).

## Validation

The isolated deployment worktree was built from the prior production commit with an explicit file allowlist.
Staged and full application-source parity passed. Vendor was physically copied; the frontend build was fresh.

- Scoped artifact PHP suite: **145 passed, 3,876 assertions**.
- Fully migrated private PostgreSQL: **30 passed, 234 assertions** for wallets, workspace configuration and
  operations isolation. The unrelated application on port 55439 was untouched.
- Frontend: **5,766 passed / 399 files**, TypeScript, lint regression gate and production build passed.
  Existing **1,393 lint diagnostics**, font/CSS/chunk build warnings and a PHPUnit docblock deprecation remain.
  The changed readiness copy required updating its old text assertion; the complete rerun passed.
- Built browser fixtures: **133 card/scan checks**, plus operations refresh, error recovery, destinations and
  responsive renders. Card controls checked 1440/1280/1024/768/390/320px and all five locales. No runtime errors.
  Desktop/mobile status and 390px reader guidance were visually inspected.
- Reader protocol self-tests pass; the workstation detected **zero physical readers**. This is an unsigned preview.
- Real existing certificates: Apple manifest hashes and signature verified to Apple's public root; Google JWT
  signature, issuer, sample points and QR verified on unsaved synthetic models. No member/provider objects created.
  This cryptographic check exercises the legacy stateless generator; new stateful web-service behaviour is covered
  separately by the authenticated protocol tests. Neither proves installation on a phone.
- Live content check **18:49:56 UTC**: new status/readiness/reader code served, helper checksum matched, Apple pass
  endpoint rejected unauthenticated access, health 200/member API 401, room cancellation copy remained removed,
  booking actions and landing kit remained present, retired CSS 404.
- Live runtime **18:55:12 UTC**: actual database `hotel_loyalty`, **228 migrations**, zero wallet passes/device
  registrations, FDS wallets off, Apple strict preflight passed, Google class approved, wallet command exit 0,
  media observation correctly attention, **zero queued/failed jobs**, heartbeat **18:55:04 UTC**.
- Automatic `loyalty:sync-wallets` cycles succeeded at **18:50:17** and **18:55:15 UTC**. At 18:55:46,
  there were **zero latest failed scheduled tasks**. Production console exited after inspection.

## External account state

At **18:40:41 UTC**, submitted only the dedicated FDS loyalty class
`3388000000023129907.hexatech_fds_cards_uk_loyalty` for review. Google returned **approved**. The existing Card
Builder generic class was byte-for-byte unchanged; no member objects were created. The signed-in Google Pay &
Wallet Console independently showed FDS Cards LTD issuer publishing access **In review**, with production issuance
not yet allowed. Do not confuse class approval with issuer publishing access. FDS wallets remain **OFF**.

The existing Apple certificate passes the strict preflight. Real iPhone/Android save, artwork inspection,
update delivery and QR scans remain required before enabling. Google programme-logo rendering also needs that
device check; class acceptance alone does not prove image rendering.

At **18:44:58 UTC**, production object storage had **208 current objects / 201,923,289 bytes** (about 193 MiB),
with versioning **Disabled**. Inventory completed. Lifecycle inspection returned **AccessDenied** with the current
application credentials. No media copy, bucket policy, retention change or new storage subscription was made.
An authorised storage administrator must enable an agreed versioning/retention policy before a live rehearsal.
Database restore acceptance from earlier today remains complete and is documented separately.

Public DNS still contains two DMARC TXT records for each of `hexa-tech.uk` and `fds-cards.co.uk`. The actual
outbound sender remains `hotel-tech.ai`; its previously verified DNS is separate. SiteGround is signed out in
the accessible Chrome profile; the owner was asked to sign in. No DNS deletion/change was attempted. The controlled
production email remains confirmed received; it was not present in connected Gmail, so received authentication
headers and hosting campaign quotas/feedback remain unverified. No test resend or customer campaign occurred.

Evidence: [live content](2026-10-30-launch-completion-evidence/live-content.json),
[Google class](2026-10-30-launch-completion-evidence/google-class.json),
[desktop status](2026-10-30-launch-completion-evidence/operations-desktop.png),
[mobile status](2026-10-30-launch-completion-evidence/operations-mobile.png),
[reader guidance](2026-10-30-launch-completion-evidence/reader-mobile.png).

Remaining acceptance: Google issuer approval; actual iOS/Android and ACR122U tests; media permissions,
retention/cost agreement and version recovery; DNS cleanup and received mail authentication/quotas. Native apps,
payments and SMS remain deferred. This release is not a claim that all physical/provider acceptance is complete.
