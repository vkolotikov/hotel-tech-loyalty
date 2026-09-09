# SES and content calendar review, 9 September 2026

Reviewed production base `f9dbfcef7` in the isolated `feature/nightwatch-fixes-20260909` worktree. The initial review findings below describe that base; the final section records the bounded calendar changes and verification. No schema, mail workflow, dependency, or production configuration changes are included. No webhook confirmations, emails, paid AI generations, or other production writes were performed.

## SES missing-controller issue #31

The reported six `POST /api/v1/webhooks/ses` failures on August 21 are historical. Commit `9622715d7a897821472ddcffc854f54bb79deb3e`, committed **August 21 at 20:33:59 UTC**, removed the prematurely deployed route and added `tests/Feature/RouteControllersExistTest.php`. That commit is an ancestor of the reviewed production base.

Current `routes/api.php:197` explicitly documents the withdrawn route. A local `artisan route:list --path=api/v1/webhooks/ses` found no matching route. With PHP 8.4.20, the existing route/controller regression test completed with **1 passed (1 assertion)**.

This resolves the missing-controller 500 mechanism; it does **not** provide a working SES feedback receiver. Current source has no handler for this path, no `EmailSuppression` model/table, and no enforcement of provider bounce/complaint suppressions. Do not describe the historical fix as successful SES notification processing.

The earlier unshipped implementation in `feature/landing-phase-3c`, introduced by `0da3a92aa`, must not be copied into this cleanup:

- `SesWebhookController::verified()` compares `TopicArn` but never verifies the SNS signature, despite its comment claiming signed-message verification.
- Subscription confirmation fetches a caller-provided URL based only on an `https://sns.` prefix.
- Incoming recipient addresses are suppressed platform-wide, with no correlation to a sent message or tenant.
- It requires an unshipped suppression migration, model, and outbound enforcement changes. The current campaign model does not retain an SES message identifier for tenant correlation.

A future SES feature needs verified SNS signatures and strict certificate/topic handling, explicit tenant/message binding, idempotent event storage, and correctly scoped outbound enforcement. Restoring only the route, acknowledging without processing, or importing the unreleased email feature would not be a safe fix for this historical Nightwatch issue. No SES source changes are included here.

## Content calendar generation

The [historical Nightwatch request](https://nightwatch.laravel.com/eu/environments/a1ce8e86-f15a-4fbb-a11f-a12795bce8d8/requests/routes/af4646829671de6f1fe638e4b5ade46d/b6002d3e-a41c-46b7-9434-f187421e61fb) ran on **August 25, 10:40:06 to 10:49:10 UTC**, for brand 42 on deployed commit `b2403576`, and ended in 500. Request ID: `b6002d3e-a41c-46b7-9434-f187421e61fb`. Its logged failure was:

> Content calendar chunk failed (2026-08-24 to 2026-08-30): AI returned invalid JSON for 'calendar' generation. Please try again.

Nightwatch recorded 26 database queries taking 384.71 ms and 28 total events, with no outgoing events because the SDK transport was not instrumented. This establishes an invalid-JSON generation failure after approximately nine minutes; it does not establish how that time was divided between individual upstream requests, SDK retries, or other processing. Inspection of `b2403576:app/Services/ContentPlanner/AiClient.php` confirmed that the existing JSON parser and its one repair call were already present in that deployment. The following findings describe the reviewed production base, before this fix.

| Finding | Evidence | Consequence and bounded follow-up |
| --- | --- | --- |
| No effective outbound deadline, with sequential repeated generation | `ContentPlannerCalendarController.php:65` allows 600 seconds; `frontend/src/components/ContentPlanner/lib.ts:307` waits 600 seconds. `AiClient.php:29,86` constructs the SDK with no configured transport timeout. `ContentCalendarGenerationService.php:107,151` invokes it for every weekly chunk. | A slow provider can occupy the request for minutes. Supply a transport that actually enforces connect/total timeouts, cap retries and the overall generation budget, and stop repeated chunks after a systemic provider failure. A larger asynchronous generation workflow would be a separate change. |
| Partial provider failures are reported as success without failed dates | The service catches each AI failure and continues at lines 151–162. At lines 286–293, errors cause an exception only when no posts were created; otherwise they are discarded. | If one week fails and another succeeds, the caller receives 200 and a success message with no record of the failed week. Preserve failed windows and return an explicit partial outcome so retry does not look like a completed calendar. |
| Invalid date ranges become server errors | Service lines 49–54 throw `InvalidArgumentException` for reversed or excessive ranges. Controller lines 89–93 convert every exception to 500. | Reject these inputs with 422 before generation. This can create Nightwatch 500s but does not explain a nine-minute duration. |

The installed `anthropic-ai/sdk` is `v0.36.0`, locked to `a731fd19d9a11e865cdad6363e8545ead1f0658d`; the plugin dependency change did not alter that version/reference. Its request options default to two retries, and its timeout option is explicitly advisory: timeout enforcement belongs to the supplied HTTP transport. The [exact upstream source](https://raw.githubusercontent.com/anthropics/anthropic-sdk-php/a731fd19d9a11e865cdad6363e8545ead1f0658d/src/RequestOptions.php) confirms this behavior. An autoload-only local probe discovered `GuzzleHttp\Client` with both `timeout` and `connect_timeout` unset; it made no network or database request.

The base had no end-to-end calendar service regression coverage. Existing application logs use `ContentPlanner AiClient API error (calendar)` and `Content calendar chunk failed`; `content_planner_ai_generations` also records error status/message by profile. Historical upstream timings are unavailable from the captured request, so the timeout defects are source-confirmed contributors to unbounded waiting, without claiming an exact explanation of all nine minutes.

## Bounded calendar changes and verification

Calendar requests now use an enforced HTTP timeout of at most 90 seconds per attempt, a connect timeout of at most five seconds, and no SDK or transport retries. A shared 240-second deadline starts before context preparation and applies to every outbound calendar request, including the existing single JSON repair call and subsequent weekly chunks. Each request receives at most the remaining budget. This bounds upstream AI waiting; it is not a hard wall-clock limit on local database operations or final serialization. The existing 600-second frontend timeout remains unchanged. Non-calendar AI workflows retain their previous transport and retry behavior.

The generator stops after a terminal provider error, exhausted budget, unrepaired malformed JSON, or invalid generated rows. Its response identifies the incomplete current window and later windows that were not attempted. Successfully saved drafts remain visible. The UI shows the partial result and affected dates, keeps the generation dialog open, and defaults the next attempt to filling empty slots. If generation fails before saving any new posts, it returns a retryable 503 with the same window information. An ordinary completed request that skips occupied slots remains successful. Reversed or excessive date ranges return 422 before any AI call. Local database failures retain a reported 500 and a safe message acknowledging that earlier saved drafts may remain.

A regression first reproduced a post remaining in the database after its visual insert failed. Each individual post and its optional visual now use one transaction, preventing that unreported partial write while preserving drafts committed earlier in the request. No whole-calendar rollback, schema changes, or email changes are included.

Verification used PHP 8.4.20, an isolated in-memory SQLite test database, real SDK request construction, and Laravel's fake HTTP transport with stray requests forbidden:

- `artisan test tests/Feature/ContentCalendar/CalendarGenerationTest.php`: **14 passed (82 assertions)**. Covers normal drafts/visuals, enforced transport options, connection and provider errors without retries or later chunk calls, shared deadline, JSON repair success/failure/budget, explicit partial windows, invalid ranges, malformed rows, empty-slot retry, local database error classification, and atomic post/visual writes.
- `npx vitest run src/components/ContentPlanner/CalendarView.generation.test.tsx`: **5 passed**. Covers partial and failed responses, retained saved drafts, date-window display, normal completion, escaped messages, and retry labeling when the empty-slot option changes.
- `npx tsc -b`: passed with the new UI test included.
- `git diff --check`: passed.
- Independent read-only review of the final runtime/UI/test changes found no remaining P1/P2 blocker.

The fixed source and these checks do not prove production provider latency or successful live generation; no paid generation was performed. Deployment and artifact verification remain the parent task's responsibility.
