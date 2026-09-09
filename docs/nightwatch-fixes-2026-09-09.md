# Nightwatch investigation and fixes, 9 September 2026

This follow-up starts from production `f9dbfcef75d1b250d35cad5c6586abd8d829bb1d` on isolated branch `feature/nightwatch-fixes-20260909`. The screenshot route window ends September 9 at 08:00 UTC, before the CRM/plugin fixes deployed later that day. Historical counts are not a count of current failures.

## Findings and attribution

| Issue or route | Evidence | Disposition |
| --- | --- | --- |
| #19, missing `login` route | September 9 06:15:27, unauthenticated `GET /api/v1/auth/subscription`; first seen 91 days earlier. | Fixed in the preceding CRM release: API authentication failures return JSON 401. This predates the plugin. |
| #23, brand advisory-lock integer overflow | `crc32('brand_store')` produced unsigned 2762903904 for PostgreSQL's two-int lock. | Fixed in the preceding release using the signed namespace. Existing transaction and plan checks retained. This predates the plugin. |
| #32/#33, inquiry/guest update ID TypeErrors | September 9 14:59:21 malformed CRM record IDs. | Preceding release adds narrow route validation and frontend original-record/stale-selection guards. These are existing CRM endpoints rather than MCP tool routes; the particular client or browser action that triggered the historical requests is unproven. |
| #30, headers already sent | Latest Nightwatch occurrence September 4 11:22:23. Cloud logs for 11:22:22 and 11:22:23 show `Target class [staff.can] does not exist` first in the request pipeline and again in `Kernel::terminate`, followed by the header fatal error. | The underlying middleware and alias already shipped September 7 in `f39437d74b328cbc9f21532b5e7ed77d7a6623e1`. Production read-only command `comm-a2b4e0e2-f979-444a-acdd-1928e3952002` confirms the alias, existing class, and successful container resolution. A new deployment guard verifies every routed middleware alias resolves to an existing handler. No framework/vendor or response-suppression change is needed. |
| #27, `POST /api/v1/admin/tasks` | August 28 failures: a title allowed up to 200 characters was copied into `inquiries.next_task_type`, a varchar(50). The task could remain saved despite the 500. | This patch visibly shortens only the legacy display summary, preserves the full title and description, and makes task/activity/inquiry updates atomic. The adjacent task outcome validator is aligned with its existing varchar(60) column. |
| #31, missing SES webhook controller | August 21 requests to an orphan route. | Route removed in `9622715d7a897821472ddcffc854f54bb79deb3e`; production confirms zero routes at this path. The missing-controller mechanism is gone, but SES feedback processing is still unavailable. A secure receiver is a separate unfinished email feature; the unshipped implementation is unsuitable for selective deployment. See the SES review. |
| Widget configuration, invalid UUID | Existing `resolveWidget` UUID guard shipped August 19 in `3bcd171cf`. | Regression verification confirms malformed keys return 404. No new runtime change needed. |
| Widget Realtime 502 | August 28 12:22:18 request `01383ba0-401c-4f28-b558-7d0de324cf1e`: OpenAI returned 404, `Invalid URL (POST /v1/realtime/sessions)`. | This patch replaces the retired Beta endpoint/payload and browser exchange with GA, maps retired supported model names, handles malformed upstream responses, and cleans up cancelled or failed connection attempts. No live microphone or paid session was opened during verification. |
| Content calendar, 9 minutes 4 seconds / 500 | August 25 10:40:06 request `b6002d3e-a41c-46b7-9434-f187421e61fb`, deployed `b2403576`; at 10:49:10, its one weekly chunk failed because the AI response was invalid JSON. DB queries accounted for 384.71ms. Nightwatch recorded no SDK outgoing spans, so exact provider/retry timing is unavailable. | Calendar-only 90-second request limits and shared 240-second upstream budget, no automatic transport retries, explicit incomplete date windows, and proper validation responses. One JSON repair shares the same budget. Already-saved drafts stay visible when a later chunk fails; each new draft and visual save is atomic. Local database work and serialization can add elapsed time after the upstream budget. |

The sampled header-error sequence establishes the cause of those occurrences, not an assertion that every historical header failure must have that cause. The widget request and planner request have their own confirmed failures and predate the plugin. No evidence attributes them to the new ChatGPT connection.

## Scope and verification

No migrations, dependencies, production settings, tenant permissions, or mail delivery workflows are changed. Source is selectively deployed from fresh production main; the unrelated website-chat analytics receipt work in `911c5de89` remains intact.

Tests use isolated databases and fake AI transports. The task fixture enforces PostgreSQL's relevant string-width boundary because SQLite ordinarily ignores varchar lengths. Rollback tests force mirror failures. Browser harnesses cover voice connection and cancellation while preserving the existing lead analytics checks. Full release verification and the deployment receipt will be recorded after completion.

Focused implementation checks passed: task and related model tests **67 / 229 assertions**, widget Realtime **12 / 90**, neighboring widget **36 / 127**, middleware and controller guards **14 / 58**, calendar **14 / 82**, calendar UI **5**, and voice browser harness **7**. Existing widget lead analytics checks and TypeScript also passed. These development counts will not be added to the later artifact run as if they were disjoint tests.

Nightwatch issues **19, 23, 29, 30, 32 and 33** were marked resolved after confirming their deployed fixes; the open count changed from 31 to 25. Issue 27 remains open until this release is deployed. Issue 31 remains open as the reminder that SES feedback processing is unavailable. Other old issue groups are not bulk-closed.

A production metadata-only check confirmed all six saved voice configurations use `gpt-4o-realtime-preview`, including the enabled organization 19 configuration. The compatibility mapping covers them without changing saved settings. Newly created configurations and the settings menu use documented GA choices; an existing saved value remains visible until the user changes it.

## References

- [Nightwatch header issue 30](https://nightwatch.laravel.com/eu/environments/a1ce8e86-f15a-4fbb-a11f-a12795bce8d8/issues/30).
- [Recorded widget request](https://nightwatch.laravel.com/eu/environments/a1ce8e86-f15a-4fbb-a11f-a12795bce8d8/requests/routes/1526b837252f5a77ac18c62ef13860d5/01383ba0-401c-4f28-b558-7d0de324cf1e).
- [Recorded calendar request](https://nightwatch.laravel.com/eu/environments/a1ce8e86-f15a-4fbb-a11f-a12795bce8d8/requests/routes/af4646829671de6f1fe638e4b5ade46d/b6002d3e-a41c-46b7-9434-f187421e61fb).
- [OpenAI Realtime deprecations](https://developers.openai.com/api/docs/deprecations) and [GA WebRTC flow](https://developers.openai.com/api/docs/guides/realtime-webrtc).
- [SES and calendar source review](nightwatch-ses-planner-review-2026-09-09.md).
