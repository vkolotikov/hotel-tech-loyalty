# Personal offers, attachments and delivery

User requested individual member recipients and designed PDF/image vouchers; email and member portal were confirmed on 11 November. The existing staff navy editor and member reward cards are retained, with five-language controls.

Private offers use an explicit audience and tenant-owned recipient pivot. Empty private selections are refused. Claims, coupon resolution, desk usage, bonus payment, multipliers and file downloads check current eligibility. Merge deduplicates recipient rows; erasure cannot turn a private offer public. Files use actual MIME/size/dimension validation, safe download headers, database bytes and metadata-only catalogue reads.

An explicit preview confirms current saved content and channel counts. A transaction records the idempotent outbox, immutable body/subject/file, email draft and once-only portal messages before `CampaignStart` queues mail. The shared worker maintains consent, suppression, sender identity, rate limiting and delivery deduplication, and rechecks recipient access. Original files survive replacement for already queued mail. Ordinary campaign mutation/reset/start is blocked for offer-backed source campaigns; independent duplicates drop the source pointer.

Review: one independent whole-change reviewer identified long-name PostgreSQL limits, desk/bonus recipient gaps, metadata byte loading, duplicate pointers, stale confirmation metadata, venue expiry consistency and search Enter behavior. These were corrected and regression coverage added. Browser inspection also corrected member-search padding and hidden-file-input overflow.

Source validation: 6,940 frontend tests in 470 files, TypeScript, lint regression check (1,381 legacy diagnostics), and PHPStan pass. The final personal-offer suite has 11 tests/88 assertions. An earlier focused SQLite run passed 79 tests/647 assertions; merge plus personal-offer rerun passed 67/554 before the last lifecycle test. Final artifact checks and live release evidence will be appended below.

Compiled real-backend acceptance is `frontend/e2e/loyalty-personal-offers.mjs`. Private files/screenshots/report are under `C:/wamp64/tmp/personal-offers-rehearsal-20261111/personal-offers`. Email is captured, never sent to a provider; all accounts/data are disposable. A separate `personal_offers_test` database is used for PHPUnit PostgreSQL checks. Native app sources are absent from this checkout, so native checks are unavailable. No production customers are contacted during acceptance.

Final compiled acceptance: 70 checks pass, including real save/upload/send/download, two separate member sessions, exact PDF bytes, nonrecipient404, member Rewards/Inbox and true five-language controls in both themes at 390/1440px. Search padding and document overflow are explicitly asserted. Clean PostgreSQL focused eligibility/merge run: 47 tests/265 assertions before the final raster case.

## Release receipt

Deployed main **0d3e82cf6728aa8b09e8c3155f53e47a4b0783e6**, source **efb56e7bc**, verified **2026-11-11 09:00:40 UTC / 11:00:40 Riga**. Both `loyalty.hotel-tech.ai` and `app.hexa-tech.uk` pass all **30 live checks**, covering the new recipient controls, attachment and send wiring, five translated bundles, member Rewards/Inbox downloads, styling, unauthenticated API refusal and the academy stylesheet. Cloud rebuilt assets as expected: index `index-4xNXpa8z.js`, staff `LoyaltyApp-CZrKS0DQ.js` / `RewardsPage-Cti-Pibp.js`, portal `PortalApp-B7qI34Bh.js`.

The clean artifact's checks all pass: Support 214/1,590; Unit/Landing 118/1,763; Feature/Landing 1,735/9,552; loyalty/messaging/access/coupon/OwnIds 1,336/14,106 (one existing SQLite concurrency skip); PostgreSQL 48/270; frontend 6,940 tests/470 files; TypeScript, lint regression and PHPStan. The real log-transport email was inspected for the named PDF MIME part and original base64 bytes. No external provider send or production member write was used for acceptance. Native checks are unavailable as recorded above.

The guarded 54-path manifest and whole-source parity passed before the generated 491-path build commit. Private evidence: `C:/wamp64/tmp/personal-offers-source-manifest-20261111.json`, `personal-offers-release-gates-20261111.json`, `personal-offers-production-20261111.json`, `personal-offers-captured-email-20261111.json` and artifact logs. [CI 42990736847](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42990736847) is in progress; six jobs have passed at the last check. Prior Events CI 42894087414 is successful.

Task-owned servers/PostgreSQL are stopped. The clean release checkout was removed after verifying its exact path, branch, released commit, physical vendor and junction target; shared dependencies, owner files and private evidence remain intact. Next source-patch code baseline: **efb56e7bc**.
