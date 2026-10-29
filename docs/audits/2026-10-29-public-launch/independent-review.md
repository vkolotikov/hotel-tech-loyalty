# Additional scoped tests and independent risk-list review

29 October 2026. Read-only follow-up requested by the root audit agent. No additional implementation scope or fixes.

## Additional tests

All 19 explicitly selected directories completed successfully using the pinned PHP 8.4.20 executable, Xdebug disabled, configured OpenSSL and directory-scoped artisan commands. Logs are beside this report. ChatGPT suites were excluded because another agent owns them.

| Suite | Passed | Assertions |
| --- | ---: | ---: |
| Feature/Admin | 105 | 1,095 |
| Feature/Ai | 38 | 82 |
| Feature/Console | 14 | 88 |
| Feature/ContentCalendar | 12 | 59 |
| Feature/Documentation | 18 | 964 |
| Feature/Internal | 13 | 26 |
| Feature/Knowledge | 24 | 52 |
| Feature/Models | 7 | 19 |
| Feature/Smoobu | 10 | 21 |
| Feature/Visitor | 14 | 27 |
| Feature/WidgetRealtime | 12 | 90 |
| Unit/Channels | 12 | 14 |
| Unit/Chatbot | 58 | 897 |
| Unit/Content | 139 | 789 |
| Unit/Enums | 16 | 85 |
| Unit/IndustryPrompts | 55 | 551 |
| Unit/Models | 12 | 15 |
| Unit/Services | 111 | 188 |
| Unit/Stripe | 23 | 29 |
| **Additional total** | **693 passed; zero failed/skipped** | **5,091** |

Together with this agent's earlier three Loyalty suites: **1,760 existing tests passed, 13,595 assertions**. Private defect probes remain a separate count: nine intentionally failing desired-invariant tests, 23 assertions, eight distinct defects. Do not add those to the ordinary baseline failure count or call them repaired regressions.

## Independent quality review of the risk list

Reviewed the platform and booking audit reports and re-read the relevant primary source for their strongest issues, alongside the Loyalty reproductions. No false-positive removal is required for the core findings. The following qualifications keep the public launch report accurate:

1. **Security severity is justified for the tenant identity collision and owner-demotion cases.** AuthController.php:416 selects by email alone,430 rewrites that user's password,431 preserves an existing organisation, and441-449 attaches the other organisation's staff membership. TeamController.php:224-243 applies an invitation payload to existing staff without the normal last-owner guard. Describe the identity case as a valid SaaS identity mapped into the wrong local tenant, not arbitrary takeover by typing any email.

2. **Smoobu's destination/key finding is an implementation security defect, with conditional credential exposure.** SettingsController.php:724-729 supplies the environment fallback;776 accepts the configurable base;783-787 constructs a request with its API-key header. The private transport mock proves construction and authorised reachability, not successful access to a particular internal service or a leaked live credential. Retain P1, but say platform-key exposure requires that fallback key to be configured. Do not claim actual exfiltration.

3. **Missing-setting authorization is a separate reproducible policy gap.** SettingsController.php:334 protects only an existing integrations row,356-366 creates absent keys without that integration-group check. It can help reach the Smoobu issue, but the two should not be counted as two independently observed compromises. One is write-policy bypass, one is unsafe outbound destination/credential handling.

4. **Password recovery does not revoke existing sessions.** AuthController.php:2458-2475 changes credentials and consumes the code without deleting tokens; the platform probe exercises the retained token. This is an account-recovery weakness, not evidence that the system exposes or manufactures tokens. Priority depends on the launch session policy; high priority is reasonable because a compromised token can survive recovery indefinitely under current defaults.

5. **Refund lifecycle and unknown-outcome cases are distinct.** AppointmentMoney.php:165-176 records any returned refund as money returned, without reading status; this supports the failed/pending lifecycle defect. The catch at167-168 calls every exception a failure and the key at164 changes with amount, supporting the second-operation risk after a lost response. Keep the latter's provider movement explicitly conditional/simulated: same-amount retries are idempotent, and changing the amount is what creates a different operation. No live double refund was made or observed.

6. **Reward reversal/cancellation is a strong P1 economic-integrity defect.** It needs authorised staff actions but no unusual race; both spendable and tier qualification balances increase incorrectly. The source and private tests agree. The separate brand cancellation case is conditional on multiple brands and a brand-restricted staff assignment; normal unrestricted workspace requests use all brands. The probes now use the same `brand_id=all` URL as the frontend with a real brand_user pivot, so reachability is established. Do not imply every cancellation is affected.

7. **Email cancellation merits narrower wording and possibly P3.** SendEmailCampaignChunk intentionally permits an already-started chunk to finish. Continued sending within that chunk is documented behavior, not a new defect. The proved issue is the final chunk overwriting a confirmed Cancelled state with Sent at222-226. P2/P3 workflow/audit inconsistency is defensible; it is not a public-launch blocker by itself, and the report must not claim that Cancel allows the entire queued campaign to keep sending.

8. **The partial email rate limit defect is independent of concurrency.** The job's `<1` test ignores a positive allowance smaller than the fixed slice. Existing code explicitly accepts a small cross-worker approximation, but that does not explain the reproduced one-worker overrun. Keep P2 and distinguish up to99 extra recipients in a100-person chunk from an unbounded send-rate claim.

9. **Expired tier holds are a recovery gap.** AssessTiers.php:73-77 omits old expired overrides on non-windowed programmes. Do not describe ordinary daily tier assessment as universally broken. Four or more missed days, restored historical data or similarly old holds plus no other qualifying event are the relevant conditions. The runbook already documents the narrow lookback; the audit adds executable evidence of its persistent consequence.

10. **Booking presentation/configuration findings should retain their bounds.** The widget reads `q.total` at1046 while the authoritative quote uses gross_total, proving sidebar mismatch; the report correctly says server pricing itself is not shown wrong. The arrival-day normalizer sets checked-in by date at BookingEngineService.php:1549-1555, while CancellationPolicy.php:73-86 rejects that state before its time deadline. These are valid P2 issues. Non-EUR display and any-staff repricing are source-confirmed cases; they have less runtime evidence than the executed refund/quote/cancellation probes and should be labelled accordingly.

11. **Operational and dependency gates must remain distinct from confirmed product defects.** ADMIN_ACCESS_MODE/APP_DEBUG/cache topology, worker health, provider callbacks, wallet/NFC/device compatibility and PostgreSQL concurrency were not established from production in these sub-audits. A dependency advisory is not automatically a reachable exploit. The untracked Alexa static-directory reservation failure is a local artifact collision, not a confirmed production regression.

12. **Passing browser fixtures cannot prove real backend integration.** The root audit should clearly separate browser interactions backed by fixtures, real controller tests, simulated-provider tests and any read-only production checks. Likewise, the existing green suite counts do not cancel the newly demonstrated failures: current tests omit those interleavings and cross-action invariants.

No further test expansion was performed after the requested directories completed.
