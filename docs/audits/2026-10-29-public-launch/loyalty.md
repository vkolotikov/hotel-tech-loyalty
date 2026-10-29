# Loyalty backend launch audit — 29 October 2026

Published appendix to the [consolidated launch audit](../2026-10-29-public-launch-audit.md). Original logs and private harnesses remain in `E:/Hexa-Tech-audit-20261029/loyalty/`; references below to adjacent logs refer to that original directory. Reproduction source copies are now available under [probes/](probes/README.md).

Read-only audit of C:/wamp64/www/Hexa-Tech. No product files were changed, no deployment was made, and no live member data, campaigns, messages or provider accounts were used. Source review was informed by CLAUDE.md, the 2026-10-27 handoff and docs/loyalty-workspace.md. All reproductions below use the repository's isolated test environment; campaign messages use Laravel's in-memory array transport.

## Conclusion

Do not sign off Loyalty as launch-ready yet. Eight distinct defects were reproduced, including two that inflate loyalty qualification balances. The existing broad test suites pass; they do not cover these cross-action, replay, brand and interrupted-workflow cases. Fixes are recommendations only, as requested by the owner.

## Verification

| Existing suite | Result | Assertions |
| --- | ---: | ---: |
| tests/Feature/LoyaltyWorkspace/ | 595 passed | 5,878 |
| tests/Feature/Loyalty/ | 382 passed | 1,582 |
| tests/Unit/Loyalty/ | 90 passed | 1,044 |
| Total existing tests | **1,067 passed, zero failed** | **8,504** |

Commands used the pinned PHP 8.4.20 executable, XDEBUG_MODE=off, OPENSSL_CONF=C:/wamp64/bin/php/php8.4.20/extras/ssl/openssl.cnf, `-d max_execution_time=0`, explicit suite paths and `--compact --colors=never`. The three suite logs are beside this report. No bare test command was run.

Private regression files, outside the repository:

- AuditLoyaltyFlowsTest.php: six tests: separate refund current-balance and lifetime invariants; deduction retry; notification replay; brand history reversal; brand cancellation.
- AuditTierScheduleTest.php: one test for an old expired tier hold.
- AuditCampaignTest.php: two tests for cancellation and partial hourly budget.
- audit-probes.log: **7 failed / 21 assertions**. audit-campaign-probes.log: **2 failed / 2 assertions**. These are deliberately failing desired-invariant tests proving the findings, not failures of the existing suites. Total **9 regression probes / 23 assertions / 8 distinct defects**.

The probes use the existing suite setup and real application controllers/services; no implementation is patched or mocked to manufacture a defect. The email tests use a transport event to interleave a cancellation while the real job is running. Provider traffic is never sent. SQLite does not prove PostgreSQL lock behavior or production schema parity; no new PostgreSQL execution was performed in this sub-audit. These defects are sequential logic/state defects rather than SQLite-only concurrency artifacts.

## Confirmed defects

### L1 — High / P1: reversing a reward debit and then cancelling the reward refunds it twice

**Sources:** app/Services/Loyalty/MemberLedger.php:64-85,116; app/Services/Loyalty/RedemptionActions.php:80-95; app/Services/LoyaltyService.php:74-78,101.

**Preconditions and reproduction:** A member has 1,500 current/lifetime/qualifying points. Redeem a 500-point catalog reward, leaving current balance 1,000. A manager opens member history and reverses that debit; current balance becomes 1,500. Staff then cancels the still-pending redemption through the normal redemptions endpoint.

**Expected:** All three counters remain 1,500; cancellation only closes the redemption and restores stock. **Observed:** current, lifetime and qualifying points all become **2,000**. Both operations succeed. Two independent regression probes prove current balance and lifetime/qualification effects.

**Cause:** Member history permits standalone reversal of the redemption debit. Cancellation searches only unreversed debits; an existing reversed debit is mistaken for a legacy redemption with no debit. Its fallback calls awardPoints(type=adjust), which creates another 500 points, increases lifetime/qualifying totals and creates an expiry bucket. The redemption remains pending after the first reversal; fulfilment also does not consult the debit, so the workflow lacks coordination between the ledger and the owning redemption.

**Schema considerations:** The original ledger type is `redeem`, with reason_code `catalog_redeem`; reversal uses `reverse`, fallback `adjust`. These are valid ordinary string types in the migrations. The fallback generates a fresh UUID key; a uniqueness constraint would not prevent it. Source ledger migration indexes idempotency_key but does not make it unique. No production SQL or data was touched.

**Recommendation:** Coordinate reward-backed reversals with redemption state, or disallow standalone reversal and direct staff to cancellation. Distinguish an already-reversed debit from genuinely missing legacy history. Ensure any legacy credit preserves earned/qualifying totals. Test reverse→cancel, reverse→fulfil, normal cancel and repeated cancel.

### L2 — High / P1 for multi-brand operations: brand-restricted cancellation raises qualification totals and loses reward stock

**Sources:** app/Services/Loyalty/RedemptionActions.php:75,82-95; app/Scopes/BrandScope.php:35-49; app/Http/Middleware/BrandMiddleware.php:76-82,126-134; frontend/src/loyalty/lib/api.ts:15-23.

**Preconditions and reproduction:** Two brands in one organisation. The reward/debit belongs to brand A. A staff user assigned only to brand B acts on the organisation-wide redemption using the exact workspace URL `?brand_id=all`. The middleware correctly binds brand B for that restricted user. Cancel the pending 500-point reward.

**Expected:** current/lifetime/qualifying balances 1,500 / 1,500 / 1,500; stock restored from 3 to 4. **Observed:** endpoint returns 200; counters **1,500 / 2,000 / 2,000**; stock remains **3**. Probe uses a real brand_user assignment, not an artificial application container binding.

**Cause:** The redemption query is organisation-wide, but its reward relationship and debit lookup remain filtered to the user's brand. The actual debit and reward disappear from those reads. The writer incorrectly takes its legacy award fallback and omits stock restoration.

**Recommendation:** Decide whether this organisation-wide action is allowed for brand-restricted staff. If allowed, load the owning debit/reward under explicit organisation constraints without presentation brand filtering; if prohibited, reject the action before any mutation. Never let a display filter change refund economics.

### L3 — Medium / P2: a successful deduction is reported as failed when retried after its response is lost

**Sources:** app/Http/Controllers/Api/V1/Admin/Loyalty/PointsController.php:57-69; app/Services/LoyaltyService.php:156-168,181-193; frontend/src/loyalty/lib/api.ts:110-119.

**Reproduction:** Start at 200 points, POST deduct 150 with one idempotency key, then replay the identical request. **Observed:** first 200 response and balance 50; retry returns **422 not_enough_points**, although the first deduction committed and no second deduction should occur.

**Cause:** Both controller and service validate the current balance before looking up the idempotency result. The service's correct check under lock comes too late. Fixing only the controller is insufficient.

**Impact:** Network recovery on mobile can falsely tell staff that a committed deduction failed, creating uncertainty and incorrect manual compensation.

**Recommendation:** Resolve a scoped, payload-validated replay before new-operation validation; retain authoritative balance checks under the member lock for a genuinely new deduction. Test lost responses when remaining balance falls below the amount and when the member state has changed since commitment.

### L4 — Medium / P2: replaying an award duplicates member notifications

**Sources:** app/Http/Controllers/Api/V1/Admin/Loyalty/PointsController.php:32-48; app/Services/NotificationService.php:18-25,149-170,218-237.

**Reproduction:** Start at 200 points. POST award 100 twice with the same key. **Observed:** both return 200, balance correctly stays 300, but **two** points_earned inbox records are inserted. The probe uses the real notification service and a full PushSchema; HTTP is faked and the member has no push token.

**Cause:** awardPoints returns the existing ledger transaction on replay, but the controller unconditionally emits a notification and realtime event. NotificationService::keep inserts every call, with no transaction-based deduplication. A member with a usable push token can also receive duplicate device notifications. Changed-payload reuse can describe the new requested amount although no new award occurred; the concrete probe establishes identical replay duplication.

**Recommendation:** Emit effects only for a newly committed award, using a durable effect/idempotency identifier if delivery recovery is required; describe the committed ledger amount, not an untrusted replay body.

### L5 — Medium / P2: history offers Reverse for an entry that the same user cannot reverse

**Sources:** app/Services/Loyalty/MemberLedger.php:64-85,116,128; app/Services/LoyaltyService.php:357; app/Http/Middleware/BrandMiddleware.php:76-82,126-134.

**Preconditions and reproduction:** A manager is assigned only to brand B; a member has a brand A ledger line. With the normal workspace `?brand_id=all`, history returns that line with `can_reverse=true`. POST Reverse for it returns **404**.

**Cause:** MemberLedger intentionally bypasses BrandScope for the member's organisation-wide ledger, but reverseTransaction reacquires the same row through a new brand-scoped query.

**Recommendation:** Make display capability and writer policy agree, and keep tenant constraints explicit when bypassing a presentation scope. Cover brand-restricted managers and imported/legacy attribution.

### L6 — Medium / P2: an expired tier hold can remain forever after more than three missed days

**Sources:** app/Console/Commands/AssessTiers.php:31-32,73-77; docs/loyalty-workspace.md:769-774.

**Preconditions and reproduction:** Lifetime qualification programme, active member held on Platinum, only enough points for Silver, no grace deadline, tier_override_until four days in the past. Run `loyalty:assess-tiers`, including manually without the venue-hour restriction. **Observed:** command succeeds but member remains **Platinum**.

**Cause:** Candidate selection excludes overrides older than three days. Such a member is never selected by later scheduled runs unless another qualifying event/activity happens or a separate grace deadline exists. This is particularly relevant after an outage, restoring older data or activating the feature for existing members.

**Recommendation:** Select every unprocessed expired hold, clear/mark it after evaluation, or provide a full reconciliation mode independent of the narrow window. The runbook documents the three-day window but does not turn the resulting permanent stale tier into a safe recovery path.

### L7 — Medium / P2: cancellation during the final email chunk is overwritten as Sent

**Sources:** app/Jobs/SendEmailCampaignChunk.php:74-78,218-226; app/Http/Controllers/Api/V1/Admin/EmailCampaignController.php:269-289.

**Reproduction:** Run a two-recipient campaign in the real job using array mail. At the MessageSending event, persist status cancelled (the state the cancellation endpoint writes). Allow the current chunk to finish. **Observed:** final status becomes **sent**, not cancelled.

**Cause:** Cancellation is checked only at job start; final completion saves Sent unconditionally from a stale model. Allowing the already-started chunk to finish is documented behavior; overwriting the cancellation is the defect.

**Impact:** Staff's confirmed stop disappears from campaign state/history and reset/recovery behavior becomes inconsistent.

**Recommendation:** Complete only through a conditional `WHERE status=sending` transition, preserve cancellation and make counters independent of state. Add a test for cancellation while the last chunk is in progress, not only before a queued chunk starts.

### L8 — Medium / P2: email campaigns ignore a partially remaining hourly budget

**Sources:** app/Jobs/SendEmailCampaignChunk.php:43,98-110,129,213; app/Services/CampaignRateLimiter.php:82-89,94-103.

**Reproduction:** Configure per-organisation hourly limit 1, global limit 6,000, and run one two-recipient chunk. **Observed:** **2** messages are sent and counted although allowance is 1. Array transport only; no real messages.

**Cause:** The job only checks whether allowance is below one, then sends the entire fixed-size slice. It does not restrict the slice to the positive allowance returned by the limiter. A 100-recipient chunk can exceed the remaining limit by up to 99 with a single worker; this is separate from the limiter's documented concurrent-worker approximation.

**Recommendation:** Consume only the available allowance and reschedule the remaining recipients with correct progress accounting. Define whether provider limits require atomic reservations across workers. Test zero, partial and full allowance, multiple campaigns and deferred continuation.

## Existing limitations and unverified launch dependencies

These are not claimed as newly observed production incidents or additional reproduced regressions:

- **Campaign pending deliveries:** the documented at-most-once policy skips a pending recipient after a worker crash (SendEmailCampaignChunk.php:129-136; corresponding push/SMS jobs). A campaign can finish with unresolved pending recipients. A delivery reconciliation/review queue would make the limitation visible; blindly retrying can duplicate external messages. Live scheduler/worker health was not established by this sub-audit.
- **Twilio token storage:** docs/loyalty-workspace.md:728-731 and HotelSetting.php:32-54 confirm the token is outside ENCRYPTED_KEYS and stored in plaintext; cachedMapFor excludes only encrypted keys. Encrypt and migrate it safely if SMS is enabled. No actual token was read or printed. Twilio acceptance is not handset delivery; no status callbacks exist.
- **Visit effects after event check-in:** EventCheckIn.php:168-172 invokes visit effects after attendance commit; replayed() at201-215 does not retry those effects. VisitRecorder.php:59-85 logs/audits and absorbs effect failures. Thus a transient stamp/tier-counter failure needs operational repair; there is no demonstrated automatic replay repair for the event path. This was source-reviewed, not injected/reproduced in this audit.
- **Physical/native delivery:** real NFC, USB readers, camera permissions, sound, wallet installation/signatures and actual push/SMS/email delivery remain device/provider checks. The runbook still lists native compiled bundles without stamps/credit and incorrect progress labels for visit/spend programmes (lines755-767). Those source bundles are not available here.
- **Existing configuration/data cleanup:** legacy boost times need confirmation; deleted tiers can be accepted by stale full-admin forms; currency changes relabel historical balances rather than convert them; deactivated members retain event reservations. These are documented owner/legacy behaviors and should be understood before configuring a venue, not silently treated as newly introduced defects.
- **Scale:** duplicate discovery may load poorly formatted phone numbers into PHP; normalized scan lookup lacks an index (runbook747-752). No production-scale performance benchmark was run, so no latency claim is made.
- **PostgreSQL:** full migration/constraint/lock verification needs the disposable PostgreSQL test setup and documented baseline exceptions. Green hand-built SQLite suites are not that evidence.

## Coverage and remaining scope

The 1,067-test baseline covers programme options, tier calculation, points, offers/rewards, stamp cards, credit, referrals, member profile/enrolment/import/duplicates/merge/validity, QR/NFC lookup, access decisions, events/sign-ups/check-in, request state transitions, insights/overview calculations, app look/wallet configuration, campaigns/segments/push/SMS/send-later and related migrations. Targeted manual source tracing focused on domain writers, side effects, replay behavior, brand/tenant interaction and scheduler selection. Requests' normal transitions, event capacity locks, NFC relinking compare-and-update and validity changes have dedicated existing tests that passed; passing tests are bounded evidence, not a claim that every possible state or device has been exercised.

The parent audit owns browser button/layout/mobile checks, broader application security/booking/payment review, build verification, current deployment parity and the consolidated recommendation. This sub-audit does not assert launch readiness for those areas.
