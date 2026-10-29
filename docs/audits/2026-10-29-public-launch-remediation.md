# Public-launch remediation — 29 October 2026

Implemented and verified the code corrections A01–A24 from the approved [launch audit](2026-10-29-public-launch-audit.md), including the additional defects found during independent review and production-schema testing. External provider, device and operational acceptance remains required before public launch; local tests alone do not close those gates.

## Changes

| Audit findings | Implemented behavior |
|---|---|
| A01, A04 | Tenant/type-bound login and activation; recovery codes bind an immutable user and purpose, consume once and revoke old sessions. Trial signup cannot promote a member identity into an owner. |
| A02 | Smoobu credentials stay within the verified tenant and approved provider origin. No caller-controlled destination or platform-key fallback. |
| A03 | Inviting an existing staff member preserves authority; owner changes serialize on the organization and retain an active owner. |
| A05 | The browser reads token and identity from one persisted envelope. Cross-tab changes clear old screens; stale responses, SSO completions and logout callbacks cannot overwrite the next session. Brand state and query caches reset with identity. |
| A06, A07, A11–A13 | Reward ledger reversals and cancellations cannot refund the same debit twice. Organization-wide actions use explicit tenant predicates consistently across brands. Point retries compare immutable request facts before balance checks and avoid duplicate notifications. |
| A08, A09 | Durable refund operations survive booking transaction rollback. Pending/unknown outcomes remain unresolved; exact retries retain provider identity, changed requests are refused, signed callbacks reconcile current provider state. A status lookup failure never proves refund failure. Aged unknown outcomes fail closed instead of blindly reissuing money. |
| A10 | Generic settings writes use registered permissions and shared program validation. Twilio tokens are encrypted and masked. Production access gates enforce permissions. Operator privilege requires staff identity and verified mailbox or the explicit legacy grant migration, not an email match alone. |
| A14 | Tier recovery processes every unhandled expired override, including older missed runs. |
| A15, A16 | Campaign cancellation survives a finishing worker. Shared-cache reservations enforce both send budgets across workers and allow partial batches. Results distinguish unconfirmed delivery outcomes from confirmed failures/skips. |
| A17–A21 | Checkout totals include the correct gross total; arrival-time cancellation respects venue time; saved currencies flow through booking displays and separate dashboard totals; service quotes pin staff and price; public failures return safe codes/references. |
| A22–A24 | Industry-banner and engagement hook ordering is stable; CRM links use the existing guest route. Settings toggles and wallet file inputs keep stable component identities during edits. |

Additional recovery records persist visit-effect intent before completion commits. Scheduled replay reuses idempotent writers, handles refund supersession and follows member merge/erasure. Content locks now use the configured shared cache rather than a replica-local default.

Independent review also closed retry and concurrency gaps: legacy notification campaigns claim each recipient before transport, bulk campaign pushes respect the offers preference, recovery invalidates sibling claim/reset grants, and reward cancellation uses the same reward-before-member lock order as redemption. Transactional account messages retain their existing exemption. The currency backfill locks and re-reads each row so a concurrent provider update is preserved; rollback guidance retains the durable financial and loyalty journals.

Refund amounts must be representable in their currency before any journal, desk ledger or provider write; fractional JPY amounts are refused rather than rounded to a different repayment. Insights reads historical stay currency snapshots and counts other currencies separately. Both card/theme editors use the same canonical setting metadata, independent of another tenant's rows.

## Verification and release tooling

- PHP dependencies and frontend/build dependencies were updated. Composer and npm advisory scans both report zero advisories.
- The combined build/test toolchain supports Node 22.12+ within Node 22, Node 24, or Node 26+; verified with Node 24.15.0. Vitest 5 excludes Node 23/25. Existing browser compilation targets and compatible translation library versions are retained.
- Loyalty pages load separately. The final main JavaScript bundle is 318.34 KB / 96.94 KB gzip (previously approximately 1,054 KB / 344 KB); shared Loyalty is 1,356.86 KB / 361.29 KB gzip (previously 2,208 KB / 653 KB). Overview is 28.03 KB and scanner 49.31 KB. These are bundle sizes, not measured production latency.
- [Maintained browser runner](../../frontend/e2e/README.md) uses local fixtures and can exercise the built SPA. Every state script starts with a fresh fixture. Viewport screenshots avoid the installed capture tool's transient 1×1 resize, which otherwise changes responsive UI state.
- `npm run lint` rejects new diagnostics relative to recorded legacy debt; correctness findings were triaged. `npm run lint:all` still exposes the entire backlog. The baseline does not permit parse errors, missing lint rules or hook-order violations; this is not a claim that all legacy lint debt has been removed.

| Final artifact verification | Result |
|---|---|
| PHP feature/unit suites, 76 nonoverlapping scopes | **7,212 passed, 46,371 assertions; zero failures, errors or skips** |
| Full frontend Vitest | **5,761 passed / 398 files** |
| TypeScript and fresh production Vite/postbuild | Passed |
| Built-SPA browser suite | **737 named checks / 28 scripts**, zero failures/runtime errors |
| Fresh PostgreSQL 18 database | **227 migrations** passed |
| Real independent-process checks | Recovery/owner races, refund journal visibility/rollback/retry, reward cancellation versus redemption passed; shared-cache campaign budget contention also verified |
| Lint regression gate | Passed; **1,393 recorded legacy diagnostics** remain visible in `lint:all` |
| Dependency advisories | Composer **0**, npm **0** |

The backend total comprises general/legacy features (3,861), platform/security/connectors (442), Booking/Appointments/Portal/Stripe/Widget (1,629), and Loyalty/Mail/member endpoints (1,280). This is complete existing-suite coverage plus new regressions, not a claim of 100% code or manual-button coverage. All seven original PostgreSQL-only skips were exercised successfully; new independent-process cases also ran on PostgreSQL.

Strict-schema runs exposed invalid test fixtures and global audit-count assumptions. Fixtures now retain production constraints, use explicit tenant audit predicates and realistic required fields; assertions were not simply dropped. Cold artifact startup exceeded one process test's former 15-second cap; it now allows startup time while enforcing tighter database lock/statement deadlines. Initial failed runs remain in the private evidence, followed by clean scoped reruns.

Final [Overview desktop](2026-10-29-public-launch-remediation-evidence/overview-desktop.png), [compact Insights](2026-10-29-public-launch-remediation-evidence/insights-desktop.png) and [320px mobile](2026-10-29-public-launch-remediation-evidence/mobile-home-320.png) renders were visually inspected. The layout and existing routes remain intact. Machine-readable totals and per-scope evidence are in [verification JSON](2026-10-29-public-launch-remediation-verification.json). Full logs/screenshots are private under `E:/Hexa-Tech-hardening-20261029/`.

Deployed as **`6cee65865f61635e08bba65432c0dceb854e889c`**; live content verified **29 October 2026, 15:08 Europe/Riga**. The isolated patch used production parent `16788ad8cad9ecf0886c28c2ecd0997f40a725d9`, prior source baseline `e4f43246f5ec0195cbb36c50c861afe744437790`, and 412 explicitly checked source paths. **Next source-patch baseline: `a3896179c27f1205bc3139b14f2b9952f347ba94`**, not the later handoff/evidence commits. Generated asset replacements/deletions were built and committed only in the deploy checkout. No unrelated user files are included.

[Live verification](2026-10-29-public-launch-remediation-evidence/live-verification.json) confirms the new atomic session guard, separate Overview/Campaign/Scan/Settings chunks, mobile and compact Insights styles, five protected APIs returning 401 without credentials, application health 200, the unchanged landing kit and retired stylesheet 404. Cloud rebuilt the SPA; content was checked rather than expecting local build hashes. This is read-only live verification, not an authenticated provider transaction test.

## Boundaries for public launch

Code and fixture tests do not certify live provider configuration. The remaining operational acceptance includes provider sandbox journeys and callback delivery, sender/domain readiness, physical camera/NFC/wallet/push checks, production queue/scheduler/shared-cache topology, restore rehearsal and monitoring. No live customer messages, refunds or bookings were created during these tests.

Historical currency records without a verified original provider currency are marked as fallback snapshots, not converted. Historical provider/currency inconsistencies and uncertain financial outcomes require read-only inspection and reconciliation before any data repair. This work does not silently rewrite financial history.
