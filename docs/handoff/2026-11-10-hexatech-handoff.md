# HexaTech handoff — 10 November 2026

Read CLAUDE.md and the previous 2026-11-09 handoff for the wider application, media migration and setup/catalogue
release. This continuation covers the blocked logo setup step and direct inspection of the owner's Wallet accounts.

## Prior loyalty release: live verification completed

The previous main commit d69f4041f146d103f78592d85e36f2f6071d9724 is now verified live by content at
2026-11-10 07:53:56 UTC (09:53:56 Europe/Riga). Feature source baseline 330e7f40d remains that release's baseline.
The earlier turn had stopped before rollout confirmation; the complete ten public checks now pass: setup template
metadata, compact offers, safe reward refusal, first steps, desktop/mobile member spacing, native radio exclusion,
login SPA, authentication on reward-state writes and preserved academy landing kit.

Served assets: index-BEfRQXYY.js, LoyaltyApp-C9wBaUYw.js, RewardsPage-D3O1L6td.js, SetupWizard-Dz-X-htw.js,
OverviewPage-Cxr1Zmo0.js, SettingsPage-DFIgOIwH.js and LoyaltyApp-D8RO6mJF.css. Private verification result:
C:/wamp64/tmp/loyalty-polish-production.json. Previous final artifact CI 42691548513 had all eight jobs successful,
6,832 frontend tests and 85 compiled real-backend checks; the prepared final evidence is still in
C:/wamp64/tmp/loyalty-polish-final-evidence.md. Preserve the distinction between those prior checks and today's fix.

## Current logo fix and Wallet inspection

Branch fix/loyalty-logo-setup-20261110. Root cause, implementation, safe provider observations and validation:
[audit](../audits/2026-11-10-loyalty-logo-and-wallet.md).

The uploader is restored independently of the on-hold designers, on the main Card & app page and the existing setup
bookmark. It uses the canonical writer and updates the setup/Overview caches. No backend/API/schema changes. All five
app locales updated. The isolated rehearsal session driver now uses files because there is no database sessions table.

Wallet credentials are already present for the owner's organisation. Apple team/pass identifier match, membership is
active and the Pass Type ID certificate expires 29 September 2027. Google issuer/class and Developer service-account
access exist, but publishing is In review and the issuer remains Demo mode. Wallet issuance stays off pending provider
approval and physical acceptance. No key/certificate/permission change, customer pass or external message was made.
Shared Google issuer onboarding for other organisations is still a separate implementation.

Source checks completed: TypeScript, 6,834 tests in 464 frontend files, lint baseline and ten PHP AppLook/Start tests.
The compiled real-backend logo journey passed 17 checks, including HTTP image delivery, browser decoding and
desktop/mobile inspection. Private evidence: C:/wamp64/tmp/loyalty-launch-20261109/logo. Release artifact preparation
and live verification are pending; do not describe the logo fix as deployed yet.
