# Handoff — 11 November 2026

Personal offers extend staff Offers with individually selected recipients, one PDF/raster voucher file and an explicit email plus member-portal delivery popup. See `docs/audits/2026-11-11-personal-offers.md`, the workspace runbook and `docs/superpowers/plans/2026-11-11-personal-offers.md`.

Branch `feature/loyalty-personal-offers-20261111`; source-patch baseline `88fdf4adb`, production before this task `eb8047a2389953e09b274e6238b936ae5a19da1b`. Release artifact branch `deploy/personal-offers-20261111`, separate checkout `C:/wamp64/www/Hexa-Tech-deploy-personal-offers-20261111`. Release checks and final live evidence are pending and will be appended.

Task-owned PostgreSQL cluster: `C:/wamp64/tmp/personal-offers-pg-20261111/data`, loopback port55459. Browser demo database `loyalty_launch_demo` is seeded; test database `personal_offers_test` is separately migrated. Private rehearsal root `C:/wamp64/tmp/personal-offers-rehearsal-20261111`, compiled build `C:/wamp64/tmp/personal-offers-build-20261111`. Backend/proxy sessions are task-owned; stop them and the verified cluster at completion. Never use demo mail/provider settings against production. Native member app paths mentioned in CLAUDE.md are absent here; no native checks claimed.

Owner untracked PDF/video/logos/plugin ZIPs and `public/alexa-skill-assets/` are unrelated and untouched. Source branch never stages generated SPA artifacts. Production deploy follows the standing auto-deploy authorization and guarded source-patch recipe after all gates pass.
