# HexaTech handoff — 16 November 2026 (Content launch)

Previous state: [14 November, Time Planner](2026-11-14-hexatech-handoff.md) and [13 November, booking and Content](2026-11-13-hexatech-handoff.md). Their booking, promotion, payment, Time Planner and security rules remain in force. This release preserves all incoming production work.

## What is live

The accepted Content launch audit repairs F01–F17, the shared panel/full composer and retained drafts, queued AI with reconnect/progress/cancel/retry, current model compatibility and allowance checks, media upload/reuse/ordered attachments, complete-post approval, structured Brand/Strategy, planning zone and purchased locations, searchable Guide, own-brand mentions/media comments, personal off-default collaboration emails, campaigns and filtered CSV/ICS. Publishing remains manual: Copy/Open channel/obtain media, then explicitly Save and mark published or Mark published.

The final loading follow-up fixes the real1024px live issue: Content rail stays within the viewport, navigation scrolls independently and footer menus remain unclipped; platform filters reserve a scrollable strip and figures have their own row. Shared-frame navScroll is opt-in, false by default for siblings.

## Source and deployment

Reviewed original feature8bd8f162 (baseline99e004ee); all7 whole-branch findings closed by one fix wave/scoped re-review. Task11 initial93e2fb27 was supplemented by the independently reviewed count fix d3430ab8c633264b41c54c0bc0b541ab48fcf0b3; no open Critical/Important findings remain. Production source patch1c95c79e onto013d05e7, initial build2b4ed33a; final follow-up source351b3c1dd2a018fec2b5d176e6406ba861775f9d, build00e4de78e4e472b55340c5eaef7cb9ac38685537. Main is deployed through the separate-worktree source-patch recipe, never a feature merge. Cloud rebuilds assets: verify content.

The original235-path patch had233 exact feature blobs and two preserved-main compositions. The unchanged booking helper was renamed to avoid Windows casing ambiguity, with exactly two import updates. Each follow-up14-path patch has13 exact blobs and a composed historical handoff; backend/dependency blobs unchanged. The final four-path desktop correction has three exact blobs and the same historical-handoff composition. Latest source-patch baseline for Content:d3430ab8c633264b41c54c0bc0b541ab48fcf0b3 (later source-branch changes are documentation).

## Verification

Exact final artifact: TypeScript forced build, 491 Vitest files/7273 tests; lint regression passes with1381 inherited diagnostics; npm audit0;260 canonical and 290 large-count assertions/60 cases (five locales, both themes,390/1024/1440, keyboard/touch and600px/slim rails), original110 browser checks; three required Landing SQLite scopes2069 tests/12909 assertions. Fresh production build passed asset parity/no QA markers/no public admin shell or stats.

The first integrated release also passed seven full scoped backend gates on SQLite and fresh migrated PostgreSQL18 with UTC sessions, all71 changed PHP app paths on PHPStan, locked Composer install/audit0, and all8 CI jobs. Those backend/dependency trees remain unchanged by the layout follow-up. Read the report for per-gate counts, documented skips and retained failed/interrupted attempts.

Live content: /spa/assets/index-_xYuyRgF.js → /spa/assets/ContentApp-OmO6Ta2S.js. All six cold Plan runs pass (same tenant, DPR1;1440/1024/390 twice each),0 browser/API errors/document overflow; footer remains reachable. This is a small lab sample. Bootstrap/settings/media/locations/campaigns/inbox/plan succeed; unauthenticated routes401; absent work ID404 demonstrates migrated table read. Landing kit exact64577bytes/0rp-markers, retired/private files404, sibling entry routes200.

## Operating notes

- The checked account has unnamedUTC planning time. A manager chooses the correct zone in Content settings; saving is explicit and shared venue consequences are explained. No zone was inferred or changed during live checks.
- Live media capability is20971520bytes (20MiB), not20,000,000. Collaboration emails remain off until each person opts in.
- No paid provider/output-quality call, real external email, production upload/post write or automatic network publication was performed. Local real-controller/database/queue/log-mail tests cover those paths with provider transport faked. Cloud worker-console health was unavailable; do not describe this as a live queue-delivery smoke test.
- Reload existing Content/admin tabs after deployment before saving. Manual publishing, at-most-once email attempts, best-effort ledger insertion and non-destructive orphan-image retention are deliberate limits.
- Final loading matrices pass fully: canonical260 and large-count290,30runs each. Desktop and phone filters reserve stable rows; the Ruling22 deferral was revoked and repaired under Ruling23. Conditional wheel checks do not run when the wider desktop strip fits all platforms; native Tab visibility checks remain. No assertion was weakened.
- Detailed report, F01–F17 coverage and all23 rulings: [launch report](../audits/2026-11-16-content-launch.md). Runbook: [Content](../content-workspace.md). Local private evidence: E:/Hexa-Tech-content-launch-evidence-20261113; never publish local-session.json or environment files.
- The original C:/wamp64/www/Hexa-Tech working files and branch were left untouched. The named Content source branch is retained; only this plan’s verified temporary release worktrees/helpers/SDD directory are cleaned after archiving.

## Final code CI

All eight jobs on code release00e4de78 passed: PostgreSQL18 (only documented known failures allowed), three SQLite
shards, Larastan, Node24/26 and the dependency audit. [Pipeline](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/43848030732).
Later handoff/report commits are documentation only; application and generated-asset trees remain identical to00e4de78.
