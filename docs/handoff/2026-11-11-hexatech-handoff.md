# Handoff — 11 November 2026

Personal offers extend staff Offers with individually selected recipients, one PDF/raster voucher file and an explicit email plus member-portal delivery popup. See `docs/audits/2026-11-11-personal-offers.md`, the workspace runbook and `docs/superpowers/plans/2026-11-11-personal-offers.md`.

Main **`0d3e82cf6728aa8b09e8c3155f53e47a4b0783e6`** is live, verified **2026-11-11 09:00:40 UTC / 11:00:40 Riga** on both production domains. Source through **`efb56e7bc`** is deployed; this is the **next source-patch code baseline**. Later evidence-only commits are not new product code. The release used baseline `88fdf4adb`, a guarded 54-path manifest, complete source parity excluding only the three generated areas, physical PHP dependencies, tests on the artifact and a fresh SPA build.

Release checks: **3,403 SQLite tests / 27,011 assertions** (one existing SQLite concurrency skip), **48 PostgreSQL tests / 270 assertions**, **6,940 frontend tests / 470 files**, TypeScript, lint regression check (1,381 legacy diagnostics) and PHPStan pass. The compiled real-backend journey passes **70 checks**; the captured real email contains the named PDF and original bytes. Both live domains pass **30 total content/authentication/landing checks**. Live assets: `index-4xNXpa8z.js`, `LoyaltyApp-CZrKS0DQ.js`, `RewardsPage-Cti-Pibp.js`, `PortalApp-B7qI34Bh.js`.

[CI 42990736847](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42990736847) is running: both Node jobs, audit, Larastan and SQLite shards 1/2 have passed; shard3 and PostgreSQL remain in progress at the last check. The preceding Events CI 42894087414 completed successfully.

Owned backend/proxy processes and PostgreSQL are stopped. The exact release checkout was verified clean at its released commit, then removed after separately checking/removing its dependency junction; shared dependencies remain intact. Private PostgreSQL data/evidence remain under `C:/wamp64/tmp/personal-offers-pg-20261111`, the rehearsal root `personal-offers-rehearsal-20261111`, and build `personal-offers-build-20261111`. The separate test database was `personal_offers_test`; no checks used a customer database. Native member app paths mentioned in CLAUDE.md are absent here; no native checks claimed.

Private release evidence under `C:/wamp64/tmp/`: `personal-offers-source-manifest-20261111.json`, `personal-offers-release-gates-20261111.json`, `personal-offers-production-20261111.json`, `personal-offers-captured-email-20261111.json` and the per-scope artifact logs. Browser report/screenshots are in the rehearsal root's `personal-offers/` directory.

Owner untracked PDF/video/logos/plugin ZIPs and `public/alexa-skill-assets/` are unrelated and untouched. Source branch never stages generated SPA artifacts. Production was deployed under the standing auto-deploy authorization after all recipe gates passed. No production members were contacted by the agent.
