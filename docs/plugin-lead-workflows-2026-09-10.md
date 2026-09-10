# Plugin lead workflows, 10 September 2026

The connection previously exposed lead summaries but no enquiry detail, activity history, chatbot messages or status writes. This release provides the context needed to explain customer interests and draft a tailored proposal in ChatGPT, plus an explicit CRM status action.

## Delivered behavior

- `list_leads` accepts `period: yesterday` or `today`, resolved in the workspace timezone. Explicit date ranges remain supported; mixing the two modes is rejected.
- `get_lead` returns requirements, safe contact/brand data, configured inquiry fields, recorded amounts/currency, attachment metadata, available stages and a revision.
- `list_lead_activities` reads paginated notes, recorded proposal/email text and status history. A manually logged email is not proof of delivery.
- `list_lead_conversations` and `get_lead_conversation` read directly linked chats and unassigned legacy customer history within the same tenant and brand. Conversations explicitly linked to another lead are excluded. System messages and technical metadata are omitted; messages are not marked read. Pagination and text truncation are explicit.
- `update_lead_status` accepts a user-selected configured stage and the last read revision. Status, pipeline stage, lost reason, timeline and staff audit commit atomically. UUID retries return the original operation without repeating it. A later edit or stage-configuration change rejects stale requests. Replays distinguish the original operation from the current status.
- Unassigned leads can use one unambiguous brand/workspace default pipeline, assigned only on a requested write. Production metadata found five of eight recent leads without a pipeline and one default Sales pipeline; no backfill ran.
- OAuth consent, portal copy, MCP instructions, the ChatGPT description and packaged skill explain the expanded workflow. The scope remains `mcp:use`; tenant binding, active staff, subscription and brand checks remain enforced. The status tool is marked Write/Destructive, consistent with [OpenAI's tool annotation reference](https://developers.openai.com/plugins/reference#annotations).

## Boundaries

Email proposals are drafts in the chat, not saved CRM emails or sent messages. Customer requests must be distinguished from chatbot suggestions. Missing pricing, stock, dates or requirements must not be invented. A prepared draft does not justify a sent/contacted status.

PDF/image/document contents are not extracted; filenames and notes are metadata only. Existing proposal text in activities is readable. Missing linked conversations must be reported honestly.

Lost requires an active workspace reason; won uses the CRM's `Confirmed` legacy status. Property-linked won conversion stays in the portal for reservation review. The plugin does not change bookings, payments or fulfillment, or send messages.

## Release evidence

Feature source: `946d9680c`. Selective deployment source: `f41d9ae7c`, based on fresh production `dbf0a1eb3`. Built release: `94098e1475d2b4b7573c16df3351423d7323287b`. Only the explicit 20-file source list and fresh generated SPA artifacts were applied. No migration, dependency or infrastructure setting changed.

- **404 backend tests / 2112 assertions passed** on the release artifact: all plugin suites and neighboring CRM/task suites. New tests cover MCP HTTP serialization, cross-tenant/brand access, direct/legacy links, bounded history, stale revisions, lost reasons, default pipelines, retries, later manual edits and audit rollback.
- TypeScript and production build passed. **829 frontend tests passed**, with the same three documented pre-existing `plannerMeta` failures. Connection-panel tests passed.
- Route caching, plugin manifest and skill validation passed. The ZIP contains all four package files, including hidden manifests, with portable forward-slash paths.

Cloud deployment `depl-a2b5fb1e-fdec-4f58-be42-c0637bcc9cd3` succeeded for `94098e1475d2b4b7573c16df3351423d7323287b`.

Read-only production checks:

- `comm-a2b5fc51-d088-4323-9dce-d67db4e811f0`: all **12 runtime hashes matched**; yesterday returned **two leads for 2026-09-09, UTC**. Neither had an accessible linked chat; both returned eight stage options.
- `comm-a2b5fc98-39aa-44b0-9846-6b75dcc7a079`: September 1–10 returned eight leads, three with linked history, five conversations and **70 messages retrieved** across bounded responses. These probes printed counts and flags, not customer text or credentials.
- `chatgpt:status` passed in `comm-a2b5fc99-0d2d-48b4-bb5d-a3d2c986940a`.
- Live SPA entry `/spa/assets/index-CVWlLcGG.js` loaded; the connection panel contains the new requirements/conversations/draft copy. Previous CRM guards, voice GA and partial-calendar behavior remained present. Unauthenticated subscription GET returned 401; malformed widget GET returned 404.
- The sampled 07:23:00–07:25:30 UTC Cloud window had 99 entries and **zero error entries**. This is a sampled check, not a guarantee of no future errors.
- ChatGPT Refresh discovered all **12 tools**. The registered connection and default host approval policy were retained. No production status, note, booking, payment or customer message was written during verification.

An authenticated [ChatGPT workflow check](https://chatgpt.com/c/6aa25bc3-4560-83eb-b4d7-23b57bc32fc9) then completed through the refreshed plugin. It listed the two September 9 leads, stated the effective UTC date, explained their interests from enquiry fields and prepared a tailored email draft asking for missing requirements. It correctly reported that neither lead had linked chat/activity history, and that a recorded Proposal Sent status alone did not establish what had been emailed. No email was sent and no CRM data was changed. Chatbot message retrieval was verified separately against the older linked leads described above.

Package **0.3.0** is installed and enabled as `hexatech@personal`, cache version `0.3.0+codex.20260910072358`. Start a new Codex thread to load it. Distribution ZIP: `hexatech-plugin-0.3.0.zip`, SHA-256 `343d516599c102ea7e5f97fc2bb83128caf23570bebe082c212ae03438d08964`. App ID, OAuth client and callback are unchanged.

## Suggested workflow

Start a new ChatGPT chat with Hexa-Tech: "Show yesterday's leads and what they are interested in. Read their enquiry details and linked chatbot conversations, then prepare response email proposals for my review."

After reviewing, request a specific lead and target CRM stage. Choose from the configured stages if the target is ambiguous. Send any final email through the normal approved email workflow; this plugin cannot send it.
