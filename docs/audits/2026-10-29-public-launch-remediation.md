# Public-launch remediation — 29 October 2026

Implementation follows the approved [launch audit](2026-10-29-public-launch-audit.md). This report is being finalized with the consolidated verification and deployment evidence; it is not yet a public-launch sign-off.

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

## Verification and release tooling

- PHP dependencies and frontend/build dependencies were updated; final advisory reports are recorded with the release evidence.
- Vite 8/Vitest 5 require Node 22.12 or newer. Existing browser compilation targets are retained. The translation libraries keep their previous compatible versions.
- Loyalty pages load separately. The first measured main JavaScript bundle fell from approximately 1,054 KB to 318 KB; the shared Loyalty bundle fell from 2,208 KB to 1,357 KB before further final changes. These are bundle sizes, not a measured production latency claim.
- [Maintained browser runner](../../../frontend/e2e/README.md) uses local fixtures and can exercise the built SPA. Every state script starts with a fresh fixture. Viewport screenshots avoid the installed capture tool's transient 1×1 resize, which otherwise changes responsive UI state.
- `npm run lint` rejects new diagnostics relative to recorded legacy debt; correctness findings were triaged. `npm run lint:all` still exposes the entire backlog. The baseline does not permit parse errors, missing lint rules or hook-order violations; this is not a claim that all legacy lint debt has been removed.

Consolidated counts, source/artifact commits, final screenshots and live content verification will be added after the final regression pass. Private working evidence is under `E:/Hexa-Tech-hardening-20261029/`.

## Boundaries for public launch

Code and fixture tests do not certify live provider configuration. The remaining operational acceptance includes provider sandbox journeys and callback delivery, sender/domain readiness, physical camera/NFC/wallet/push checks, production queue/scheduler/shared-cache topology, restore rehearsal and monitoring. No live customer messages, refunds or bookings were created during these tests.

Historical currency records without a verified original provider currency are marked as fallback snapshots, not converted. Historical provider/currency inconsistencies and uncertain financial outcomes require read-only inspection and reconciliation before any data repair. This work does not silently rewrite financial history.
