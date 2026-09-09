# CRM and ChatGPT plugin fixes — 9 September 2026

This follow-up addresses the application's error-log screenshot and the pilot's failed request, "tell me today leads from crm". It preserves the existing tenant, staff, brand and subscription checks. The approved pilot remains the connected business staff account across its permitted workspace brands.

## Findings and changes

| Observed failure | Cause and correction |
| --- | --- |
| `Route [login] not defined` | API guest authentication tried to resolve a missing named server login route. Configure the existing SPA `/login` destination before authentication fails, and render API authentication failures as 401. |
| PostgreSQL integer overflow during brand creation | The unsigned CRC32 advisory-lock namespace exceeded PostgreSQL's signed 32-bit two-key argument. Convert the same namespace to signed 32-bit; retain the transaction and per-organization brand-limit lock. |
| Inquiry/customer update argument type errors | Logs show PUT URLs containing `null` and `undefined`. Reject malformed or overflowing IDs with 404 before controller execution. Drawer mutations retain their original record IDs, cancel stale selections, and update the original cache after delayed responses. The particular browser action that caused the historic requests is unproven. |
| No function for today's CRM leads | Add `list_leads` over CRM inquiries. Omitted dates mean today in the organization timezone; report authorized total counts, a bounded page, status, brand and basic customer identity. Keep business and assigned-brand restrictions. Lead edits remain unsupported. |
| ChatGPT customer search reported an internal error | Two `/mcp` requests returned 503 at 16:49:49 UTC. The subscription service-token check reproduced a timeout beyond its former three-second deadline; a subsequent check returned an active subscription. Use bounded five-second attempts, one retry for transient failures, and share concurrent refresh results. A remaining temporary failure becomes a clear MCP tool error without running the tool or using expired access. |

The login, brand-lock and malformed CRM route defects were existing application paths, not the new lead tool. The billing timeout belongs to the integration. A screenshot alone cannot identify which browser or client initiated the historical API errors.

## Release boundary

Source changes are reviewed on `feature/crm-plugin-fixes-20260909`. Production delivery uses a separate worktree from the latest `origin/main`, with an explicit list of changed files and deletions. It preserves the independently deployed website chat analytics changes. This release requires no new migrations, application dependencies, production configuration, signing keys, or customer-record writes.

The package is version 0.2.0 and keeps the existing registered app. After deployment, refresh the ChatGPT connection and start a new conversation to load `list_leads`; reload the portal to load the drawer fixes. Other businesses still require their own eligible staff account and OAuth approval, and remain subject to the configured rollout policy.

## Verification record

Focused development checks passed for timezone and daylight-saving boundaries, actual populated MCP results, tenant and brand isolation, malformed IDs, delayed drawer saves, subscription retries, concurrent refreshes, backoff and continued denial when verification fails. The PostgreSQL lock correction also passed an isolated local PostgreSQL concurrency check with no application data.

The isolated release artifact passed **459 backend tests, 2,049 assertions**: 114 plugin/authentication/brand-creation tests, 98 existing authentication/tenant/middleware/security/brand tests, and 247 CRM tests. These groups are disjoint. The unrelated 20-test `InquiryAiServiceTest` file was excluded from the artifact run because some existing cases lack upstream mocks and can make external AI calls; its earlier development run passed. TypeScript and the production build passed. Full Vitest reported **824 passed and the same three documented pre-existing `plannerMeta` failures**. Route caching, plugin manifest validation and skill validation passed. Dependency manifests and lockfiles are unchanged; existing npm audit and build warnings remain.

Production deployment `depl-a2b4cfa7-0d38-4a66-a20e-f87e3b407706` succeeded at commit `f9dbfcef75d1b250d35cad5c6586abd8d829bb1d` (source patch `5507f3f6d`, based on production `911c5de89`). Live asset content includes the safe-integer/selection guards and the updated lead connection description. A public unauthenticated API read returned 401 with `Unauthenticated`, without a missing-login-route error. Production `chatgpt:status` passed, and the portal still shows the approved connection and disconnect control.

ChatGPT refreshed all **seven tools**, including `list_leads`. In a [fresh test conversation](https://chatgpt.com/c/6aa196e6-9f38-83eb-bc7a-0229d05052ac), the original prompt returned **two leads for 9 September 2026**, one under FDS Cards and one under Hexa Academy, with their current statuses. The separate production count was also two using the organization's configured UTC timezone. ChatGPT presented timestamps in Riga time and checked the adjoining date; the server's calendar filters remain in the organization timezone. No customer-record writes were performed in the live checks.

The regenerated `hexatech-plugin.zip` contains all four intended package files, including hidden `.app.json` and `.codex-plugin/plugin.json`, and no duplicate `.mcp.json`. Its base version is **0.2.0**, SHA-256 `939CB91968F9CA2213948E97B164B6AB2436C1DBDCFA6C6C607DACB241BEA2BE`. The personal Codex installation is enabled at `0.2.0+codex.20260909172130`; start a new Codex thread to load it. ChatGPT's connection description was updated and the refreshed tool catalog is already available to new chats.

A second live prompt searched by the name of a customer returned in the lead list. ChatGPT's expanded activity showed **"Searched customer records"** and successfully confirmed the matching name and company. This verifies a populated customer search, beyond the earlier empty-result smoke tests. The existing OAuth connection refreshed successfully without replacing signing keys or broadening access.

The earlier [pilot status](chatgpt-pilot-status-2026-09-09.md), [log triage](chatgpt-log-triage-2026-09-09.md) and [initial review](chatgpt-plugin-review-2026-09-09.md) preserve historical evidence and predate these fixes.
