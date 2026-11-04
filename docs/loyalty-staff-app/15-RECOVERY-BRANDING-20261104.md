# Staff recovery and emblem — 4 November 2026

## Scope

The owner approved the font-change navigation fix, interrupted-operation recovery, QR and NFC on the same member, login border lighting, and replacing the old Home/login wordmark with the supplied gold emblem. Existing Eclipse backgrounds, tier materials, startup behaviour and border animation timing are retained. This is an Android preview, not a new store submission.

## Behaviour

- Navigation uses the component-scoped Expo Router hook. The global imperative bridge could become unbound when Android recreated the Activity after a system font-size change.
- Scan attempts are stored in SecureStore before sending, scoped to staff member and organisation. Original code, desk/place/event, key and timestamp survive a restart. A pending scan pauses the readers. Retry keeps the original payload; it never starts a fresh attempt silently.
- The client permits retry for nine minutes against the server's existing ten-minute replay cache. An older or still-unanswered scan requires reviewing workspace history and explicitly dismissing the notice. Dismissal neither reverses an entry nor claims that the original scan failed. Replay is not a permanent receipt.
- Interrupted points awards, redemptions, purchases and check-ins expose **Check result**. This performs a read-only server lookup with the original operator, organisation, member, action, key and exact payload. Only a complete positive receipt clears the encrypted journal; unknown, malformed and failed checks leave it intact. Reversed operations and unfinished visit effects are shown explicitly.
- A member's app/printed QR and linked NFC cards coexist. Linking or disabling an NFC card does not replace the member QR. The Cards page explains this briefly.
- The gold hexagonal H replaces the separate Home and sign-in brand copy and is used for the splash and launcher icon. The installed app name remains HexaTech Staff to distinguish the two apps. Sign-in uses the approved border-only lighting on its form and primary button, respecting reduced motion and solid surfaces.
- All new interface text is supplied in English, Russian, German, French and Spanish (usted).

## Source and deployment

Native runtime source: `f05d6e5a2`, following `7aa20242d`, on `feature/staff-recovery-branding-20261104` in `C:\wamp64\www\hexatech-apps`. Native mirror commits `364dc37ec` and `c1cfb4103` are pushed to `feature/loyalty-staff-app`. A subsequent web-only input sizing correction is `4283b0d36` / mirror `11c496b33`; it does not change native layout. All 200 tracked Staff app files match the mirror.

Server source: `2cd0371e0` on `feature/staff-operation-recovery-20261104`, based on `ea998baf2`. Eleven explicit source paths were applied to a fresh deployment worktree, with full source parity verified. Deployment `a8b45e629` is live as Laravel Cloud deployment 1126. There are no migrations or SPA source changes. Never merge native branch history into Laravel main.

Android EAS preview: `9050d533-3dbe-4381-94a1-9df9cc4a9cd9`, version **1.0.1 (3)**, completed 17:43:21 UTC. Build page: https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/builds/9050d533-3dbe-4381-94a1-9df9cc4a9cd9 . Local APK: `C:\Users\user6399\Downloads\HexaTech-Staff-Recovery-1.0.1.apk`.

## Verification

- App TypeScript, changed-file ESLint and all 45 unit tests pass. Coverage includes scan restart/payload retention, scope isolation, concurrent starts, corrupted/failed storage, expiry/backwards clocks, keyed cleanup and rejecting incomplete receipts.
- Artifact PHP checks: LoyaltyWorkspace 637 passed / 1 skipped; AdminAccess 78; Unit/Support 189; Unit/Landing 118; Feature/Landing 1735. Scoped PHPStan passes. Windows PHP 8.5 requires `OPENSSL_CONF` pointing to its `extras/ssl/openssl.cnf` for wallet fixtures; rerunning with that correct environment passed.
- Fresh deployment frontend install, TypeScript, all 5845 tests (404 files) and build pass.
- Browser Home/sign-in checked at 393px; sign-in also checked at 320px. Normal sign-in border positions change over time; reduced-motion positions remain fixed. The narrow web password control stays within its form.
- Twenty-five existing live member/Staff API reads passed. New live checks at 17:43:49 UTC confirmed an existing demo award and check-in, rejected a different amount, and returned the identical keyed desk QR response. Demo organisation 49 / member 549 stayed at 210 points. No real customer transaction was created.
- Server tests prove v2 QR, legacy QR and NFC resolve the same member, and QR still resolves after NFC is disabled. An emulator cannot validate physical NFC radio behaviour.

Native Pixel 8 API 35 acceptance passed on the finished APK:

- Font size changed 1x → 2x → 1x while running. Requests/Approved, Members/member Details remained navigable without a cold restart.
- Wi-Fi and mobile data were disabled for a typed desk scan of the isolated demo member. The unanswered notice appeared and new scans were blocked. After force-stop, connectivity restoration and restart, the pending scan and desk context returned. Retry opened the correct member at 210 points; returning to Scan showed that the notice had cleared.
- Sign-out and fresh sign-in succeeded using the isolated review account, with its password read and entered privately. The native login shows the emblem and aligned controls. Two native captures prove that form/button border pixels change while the field interior stays still. The launcher shows the new emblem.
- No JS/native error lines in the final app process. Staff is left signed in on Home; font scale and transition animation scale are 1.0, Wi-Fi and mobile data are enabled, as before the test.

APK: 121,248,095 bytes; SHA-256 `707F9ED8E5418E18F62EAD895ECC0438767B12EF87079FBB71CA2CD57C1D945C`. Direct download: https://expo.dev/artifacts/eas/HBvNwzofgRKzXKcns2eVDrA93iiLu4_Va3qbig5tZSc.apk . Screenshots are in `recovery-branding-20261104/` beside this report.

The production admin shell and academy HTML respond with their current assets. A separate command-line request for the academy CSS was challenged by Cloudflare, so that CSS content check is not claimed; the changed recovery endpoint was verified by its actual authenticated results. GitHub CI jobs were queued when inspected; the required local artifact suites above passed.

Private captures, logs and test helpers are under `C:\Users\user6399\HexaTech-release-private\staff-design`; never print credential files, bearer tokens or full EAS JSON/signed logs. Physical NFC radio testing and an iOS build were not performed in this Android preview task.
