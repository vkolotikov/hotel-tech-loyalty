# Production log triage, 9 September 2026

Status: investigation only. No application fix, migration, dependency change, or deployment was made for this report. The precise client/session responsible for the malformed CRM requests is still unknown.

The screenshot errors come from existing application paths. The ChatGPT plugin source had not been committed, pushed, or deployed when these logs were inspected. Work on the live environment for the plugin had consisted of read-only inspection and OAuth secrets/environment configuration; the integration remained disabled. No CRM PUT requests were issued as part of that work. The plugin's tool transport is `/mcp`, and it does not implement brand creation or these CRM update endpoints.

## Confirmed evidence

Times below are UTC, as shown in the logs. The detailed September 9 paths/statuses were confirmed by a selective Laravel Cloud log lookup; request bodies, credentials, and session headers were not collected.

| Time | Observed request/error | Finding |
| --- | --- | --- |
| September 3, 23:29:15; September 9, 06:15:27 | GET `/api/v1/...`; `Route [login] not defined` | Existing authentication redirect fallback tries to generate a named server-side login route that this SPA does not define. An error log alone does not establish a 500 response: the existing API exception renderer converts this exception to 401. |
| September 4, 10:47:51 and 10:48 | POST; `pg_advisory_xact_lock(2762903904, 1)`; numeric value out of range | Exact match to the existing brand-creation lock. Its first key exceeds PostgreSQL's signed 32-bit integer range. The second key is the organization ID used by that controller. |
| September 9, 14:59:21 | PUT `/api/v1/admin/inquiries/null?brand_id=22`, 500 | Literal `null` is not a valid integer route ID. |
| September 9, 14:59:21 | PUT `/api/v1/admin/guests/undefined?brand_id=22`, 500 | Literal `undefined` is not a valid integer route ID. |
| September 9, 14:59:21 | PUT `/api/v1/admin/inquiries/267` and `/api/v1/admin/guests/379`, both 200 | Valid numeric IDs were accepted in the same second. The evidence does not support a general failure of these update endpoints. |

`Unhandled API exception` can be a second log entry for the same failure: Laravel reports the exception before rendering it, and `bootstrap/app.php:142` also logs contextual details while rendering a 500. Count requests/statuses rather than assuming each adjacent error entry is a separate incident.

## Existing code and history

The following source files were identical between the working tree and the inspected `origin/main` snapshot (`ef466665b`). None was changed by the plugin implementation.

| Area | Existing source | History / impact |
| --- | --- | --- |
| Login fallback | `bootstrap/app.php:73-79`; Laravel `ApplicationBuilder.php:280`, `Authenticate.php:104-106` | API 401 rendering was added in `76848fd03` on April 1. It handles the response after the missing-route exception has already been reported. No explicit API-aware guest redirect prevents the original exception. |
| Brand lock | `app/Http/Controllers/Api/V1/Admin/BrandController.php:141-148` | Added in `6f636b33d` on June 7. When the organization lacks the `brands` feature, the failing lock runs before the brand count and insert, including for a first brand. The transaction aborts before brand creation. |
| Inquiry update | `app/Http/Controllers/Api/V1/Admin/InquiryController.php:259`; `routes/api.php:1021` | The `int $id` signature was introduced in `4a66344f0` on May 15. The route accepts an unconstrained path segment, so invalid strings reach PHP argument checking and become 500s. |
| Guest update | `app/Http/Controllers/Api/V1/Admin/GuestController.php:221`; `routes/api.php:993` | The `int $id` signature was introduced in `7e2a6c126a` on April 7. It has the same unconstrained-route problem. |

The brand lock uses `crc32('brand_store')`, which PHP 8.4 on this machine evaluates to `2762903904`. PostgreSQL's two-argument advisory lock takes two `integer` values, whose maximum is `2147483647`; the single-argument overload takes a `bigint`. This is an application lock-key error, not evidence of database corruption or a plugin migration problem. See the official [advisory-lock signatures](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) and [numeric type ranges](https://www.postgresql.org/docs/current/datatype-numeric.html).

The missing-login-route log also has an existing explanation. Laravel's default guest redirect calls `route('login')` when an unauthenticated request does not expect JSON. `AuthenticationException` is normally excluded from reporting, but the earlier `RouteNotFoundException` is not. `bootstrap/app.php` then renders it as a 401 for `/api/*`. The access-log response status and exact endpoint would establish the effect of each individual screenshot entry.

## Frontend caller candidates, not attribution

A broad search of `frontend/src` found these existing PUT callers. These files also matched the inspected `origin/main` snapshot. TypeScript annotations do not validate IDs at runtime.

| Candidate | Why inspect it |
| --- | --- |
| `frontend/src/components/InquiryDrawer.tsx:149,202,219` | Strongest static match to the pair of paths: `inquiryId = inq?.id ?? null`, followed by an inquiry PUT using that value; the guest PUT interpolates `inq?.guest?.id`. Neither mutation function validates its ID. |
| `frontend/src/pages/Inquiries.tsx:2044-2047` | The open drawer receives a row through `allInquiries.find(...)`. A row disappearing from the current filtered/paginated response can make its `inquiry` prop undefined while the drawer ID remains selected. This is a state transition to investigate, not a demonstrated cause of the logged writes. |
| `frontend/src/components/CustomerDrawer.tsx:340-342` | Guest update interpolates its nullable `guestId` prop. Its GET query has an ID guard; the mutation function does not. Ordinary parent state uses `null`, so this is a weaker match for the specific `/undefined` request. |
| `frontend/src/pages/Inquiries.tsx:289,338,359,384,948-1007,1081-1209` | Task/status/priority mutations and inline fields interpolate IDs from mutation arguments or list rows. An invalid runtime row/argument is not rejected at the mutation boundary. |
| `frontend/src/pages/Customers.tsx:228-230` | Guest update interpolates the mutation argument's ID without runtime validation. |
| `frontend/src/pages/GuestDetail.tsx:76`; `frontend/src/pages/InquiryDetail.tsx:178,529` | Detail-page updates interpolate a URL parameter or returned record ID. These are additional callers, not evidence that these pages originated the incident. |

There are relevant protections: the inquiry drawer renders lead fields only when `inq` exists and guest fields only when `guest.id` exists (`InquiryDrawer.tsx:441,604`). Therefore, finding the nullable mutation closures is not enough to claim that ordinary editing necessarily sends an invalid ID. The exact browser interaction, an external client, or another session remains unresolved.

`EditableField.tsx:132-198` commits changes on Enter or blur and delegates the save to its caller. Reproduction should cover an edit while a drawer closes, its selected row changes, or its list refetch removes the row. The API request interceptor (`frontend/src/lib/api.ts:45-54`) appends the selected `brand_id`; this explains why ordinary SPA traffic may have that query parameter but does not identify the initiating client.

## Safe local verification performed

An isolated PHP 8.4.20 probe loaded only Composer autoloading, without bootstrapping the application, reading `.env`, or configuring/connecting a database:

- Evaluated the exact `brand_store` CRC32 and confirmed it exceeds the PostgreSQL integer maximum.
- Invoked the actual inquiry and guest controllers through Laravel's `callAction` with numeric string `123`: argument checking succeeded and execution entered the controller body, then stopped because no application/database was configured.
- Repeated with `null`, `undefined`, and an oversized numeric string: both controllers produced the exact logged `Argument #2 ($id) must be of type int, string given` exception at Laravel `Controller.php:54`.
- Used an unauthenticated mock guard and empty route collection: `Accept: text/html` reproduced `Route [login] not defined`; `Accept: application/json` produced the normal `AuthenticationException`.

No production mutation or live PostgreSQL reproduction was necessary. The brand error was verified by the exact failing value, source, and documented function signature; no database lock was acquired locally or remotely.

## Separate follow-up, not part of the plugin release

1. Reproduce and identify the CRM caller with browser network initiator information, using local/mock data and the drawer/list transitions above. Preserve record IDs with each save intent; reject missing/invalid IDs before issuing mutations. Do not attribute the September 9 requests to a particular session without evidence.
2. Reject invalid route IDs with a controlled 4xx response before controller invocation. Cover valid IDs, `null`, `undefined`, and numeric overflow; a digits-only route pattern alone does not address overflow.
3. Replace the brand lock key with a documented valid PostgreSQL key scheme while preserving the transaction around both the entitlement/count check and insert. Verify concurrency against PostgreSQL; SQLite cannot prove advisory-lock behavior.
4. Make unauthenticated API requests produce their intended 401 without attempting the missing named login route. Preserve the SPA's login route and test requests with and without JSON Accept headers.

These are existing issues to handle as a separate, reviewed change. This investigation does not claim their runtime fixes are implemented or deployed, nor that the plugin release is complete.
