# Public native-app policies — 3 November 2026

Read `2026-11-02-hexatech-handoff.md` for the rest of production. This is a narrow release-policy continuation.

- Source branch `feature/native-app-policy-20261103`, source tip `2f0158565`; source-patch deployment
  `d9117b475` to main from `deploy/native-app-policy-20261103`. No native app source or migration was included.
- Updated `resources/views/privacy.blade.php` and `data-deletion.blade.php`: current app names and canonical
  domain, Stripe billing-address/payment-component handling, push delivery through Expo/APNs/FCM, local QR
  scanning, member More → Profile → Delete account and partial-data request instructions. Existing retention
  and legal-basis commitments remain unchanged. Both pages were rendered and visually reviewed before deploy.
- Windows preflight uncovered case-insensitive resolution of AccountProducts/AccountTeam TSX pages to their
  similarly named TS helpers. Three imports now specify `.tsx`; no runtime behaviour changed.
- Checks on the deployment artifact: TypeScript, **403 frontend files / 5,827 tests**, scoped PHP Support,
  Unit Landing, Feature Landing (**1,735 tests / 9,552 assertions**), API Authentication (**6 / 27**), and fresh
  production build all passed. Source parity across the five changed paths was exact; worktree was clean.
- Content verified live at `https://app.hexa-tech.uk/privacy` and `/data-deletion`: current branding,
  November 3 update date, billing-address wording, Stripe analytics, Expo/APNs/FCM, deletion path and partial
  requests. Live SPA and its account-page chunk references return successfully.
- PHP 8.5.12 NTS CLI installed at `C:\wamp64\bin\php\php8.5.12-nts\php.exe` from the official Windows archive,
  SHA256 verified. WAMP's active server and PATH were not changed. The artifact has its own vendor copy,
  composer dependencies from lock and frontend node_modules; no dependency junction remains.
- Worktrees retained for continuity: `C:\wamp64\www\hexatech-policy-source-20261103` and
  `C:\wamp64\www\hexatech-policy-deploy-20261103`. The owner's primary checkout was untouched.
- Native store audit is on `feature/loyalty-member-app`, in `docs/handoff/2026-11-03-native-apps-release.md`.
  Staff remains in review in both stores. Member public submission awaits owner/device steps; do not infer
  native acceptance from the web/API checks. Apple API calls are paused pending the recorded credential rotation.
