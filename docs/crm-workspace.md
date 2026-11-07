# HexaTech CRM — runbook

HexaTech CRM (`/crm`) is the website's AI chat and the CRM in one staff workspace, beside the full admin: the chat
widget with its AI assistant, the live inbox and visitors, leads, the pipeline, contacts and tasks. The owner
(2026-11-07): "We make separate portals for loyalty, booking and content planner. Now I want to make a separate portal
for AI chat widget + CRM; it will be one portal which combines these 2 features, and will also be sold separately as a
module … with all existing features and maybe additional new features."

It is a new shell over the same records as the full admin's Engagement, Chat inbox, Chatbot, Leads, Deals and Customers
pages: `chat_conversations`, `chat_messages`, `visitors`, `knowledge_*`, `chatbot_behavior_configs`,
`chat_widget_configs`, `inquiries`, `pipelines`, `guests`, `tasks`. Nothing is copied or synchronised.

## Who has it, and the ways in

- **Every organisation has it** by default (`Organization::WORKSPACE_DEFAULTS['crm']`); signing in still opens the full
  admin. The full admin's menu shows **HexaTech CRM** in "CRM & Marketing" to staff of every organisation that has it
  (`showsWorkspaceLink(user, 'crm')`). "Full admin" in the workspace opens the Engagement hub (`/engagement`).
- **Sold on its own** as the `crm` module (`docs/plan-modules.md`): Lite / Standard / Pro at 49 / 85 / 149 € a month,
  15 % less a month paid yearly, from `/crm/register` (sign-in `/crm/login`). An organisation on modules lands on
  `/crm`, has no full admin, and reaches the account pages (Team, Plan & products) from the workspace's Settings menu.
- **Switching** (an operator, in the application's environment):

  | To | Run |
  |---|---|
  | See the setting | `php artisan workspace:crm <organisation id> --status` |
  | Switch it off for one organisation | `php artisan workspace:crm <organisation id> --off` |
  | Switch it on, staff landing there after sign-in | `php artisan workspace:crm <organisation id> --on --landing` |
  | List the organisations that differ from the default | `php artisan workspace:crm --list` |

  Off deletes nothing: `admin/crm/*` answers 403 `workspace_disabled` and `/crm` says so with a way back. Off hides only
  the workspace — the full admin's own inbox, chatbot and CRM pages stay as they are. An organisation that bought CRM
  on its own cannot be switched off (its plan is the workspace); one on modules without CRM cannot be switched on.

## How it reaches the server

The workspace's own reads live under `/api/v1/admin/crm/`, behind the admin chain and `workspace:crm`:

| Endpoint | What | Who |
|---|---|---|
| `GET bootstrap` | organisation, venue zone/today/currency, the plan's `chatbot`/`engagement` switches, the month's AI allowance (`status`, `percent`), the person and their rights (`CrmAccess::forBootstrap`), the widget's key, the counts beside Inbox/Leads/Tasks, setup progress | staff |
| `GET today` | what needs a person now (`App\Services\Crm\CrmToday`) | staff |
| `GET start` | the six setup steps, each done by the data (`CrmSetupProgress`) | staff |
| `GET bot-gaps` | the assistant's answers rated wrong and not yet taught (`BotGaps`) | staff (AccessMap product `chat`) |
| `POST conversations/{id}/draft` (`instruction?`) | an AI reply for a person to edit and send (`ReplyDrafter`); `feature:chatbot`, 20 a minute in its own bucket (`crm-draft`) | staff |

Everything else the workspace shows is the **full admin's own chat and CRM endpoints**, under their own rules
(`AccessMap`: `admin/chat-inbox*`, `admin/visitors`, `admin/engagement`, `admin/chatbot*`, `admin/knowledge`,
`admin/popup-rules`, `admin/widget-config`, `admin/inquiries*`, `admin/deals`, `admin/pipelines`, `admin/guests`,
`admin/tasks`…). An organisation on the `crm` module reaches the `crm` and `chat` products for that reason
(`AccessMap::MODULE_PRODUCTS`). The frontend may call only the areas listed in `frontend/src/crm/lib/api.ts` (`AREAS`),
always with `brand_id=all` (the CRM is the organisation's); `crm/tokens.test.ts` refuses any other path.

### Today's definitions (the full admin's own)

- a chat **waits** while its status is `waiting` (the visitor wrote while the assistant was paused for that chat);
  **open** chats are `active`/`waiting` with a message in the last 24 h;
- a lead is **open** while its status is neither `Confirmed` nor `Lost`; its follow-up is **due** on `next_task_due`
  (the venue's day, `VenueClock::today`) while `next_task_completed` is false, **overdue** before;
- **new leads** came in during the last 24 hours;
- **your tasks**: assigned to you, not completed, due by the end of the venue's day;
- the week: conversations a visitor wrote in, those the assistant closed with nobody assigned, those that left a lead.

### Setup steps (`GET start`)

`widget` (a visitor was seen or a chat started), `assistant` (behaviour saved), `knowledge` (5 active answers or a
processed document), `reply` (a person answered a chat), `pipeline` (a pipeline with stages), `team` (two active staff).

## The areas

| Area | Address | What it does (the full admin's endpoints it uses) |
|---|---|---|
| Today | `/crm` | `crm/today`: chats waiting, follow-ups, your tasks, new leads, the open pipeline, the week |
| Get started | `/crm/start` | `crm/start`: the six setup steps |
| Inbox | `/crm/inbox` (`?c=<conversation>`, `?status=waiting`) | `chat-inbox*`, `engagement/*`: list with the server's counts, the thread (polled), take over / hand back, resolve / archive / reopen, assign, capture as lead, contact, rate an AI answer and teach the right one, translate, the AI brief, canned replies, upload, dictation, transcript, **Draft a reply with AI** |
| Visitors | `/crm/visitors` (`?v=<visitor>`) | `visitors*`: on the site now, everyone, away, leads; a visitor's pages and chats; start a chat; delete |
| Leads | `/crm/leads`, `/crm/leads/:id` (`?new=1`, `?due=1`, `?guest=<contact>`) | `inquiries*`, `guests`, `tasks`: list with follow-up tabs, filters, bulk actions, CSV; create; a lead's stage, won / lost with a reason, details, next step, timeline, AI brief and proposal draft, tasks, files, its chat, custom fields, delete with what goes |
| Pipeline | `/crm/pipeline` (`?p=<pipeline>`, `?tab=won`) | `inquiries`, `pipelines`, `deals/*`: the board (Move to on every card, drag on wide screens), won deals with fulfilment and payment |
| Contacts | `/crm/contacts`, `/crm/contacts/:id` (`?tab=companies|duplicates`) | `guests*`, `corporate-accounts`: people with filters, saved views, bulk changes, CSV; a contact edited in place with tags, leads and timeline; companies; duplicates and merge |
| Tasks | `/crm/tasks` | `tasks*`: mine / everyone; overdue / today / upcoming / done by the venue's day; add, edit, complete, reopen, delete |
| AI assistant | `/crm/assistant` (`?tab=behaviour|knowledge|teach|try|popups`) | `chatbot-config/*`, `chatbot-onboarding`, `knowledge/*`, `popup-rules`, `crm/bot-gaps` |
| Chat widget | `/crm/widget` (`?tab=look|behaviour|install`) | `widget-config*`: the look with a live preview, behaviour, the embed code |
| Insights | `/crm/insights` (`?days=7|30|90`) | `chatbot/analytics`, `inquiries/*`, `pipelines`, `deals/analytics`: the website chat and the pipeline |
| Settings | `/crm/settings` (`?tab=canned|pipelines|forms|fields|account`) | `chat-inbox-canned`, `pipelines`, `pipeline-stages`, `inquiry-lost-reasons*`, `lead-forms`, `custom-fields`; Team and Plan & products |

Left out on purpose (the full admin keeps them for a full customer): the AI model choice, chatbot fine-tuning
(Training: no code reads the model it makes), the voice agent, AI capture of a contact (`crm-ai`), a contact's room
reservations, `.xlsx` exports (CSV is offered), bulk won / lost (the bulk path writes no stage, reason or timeline),
bulk tagging (no endpoint), the full admin's field-layout manager and custom-field presets.

## New in HexaTech CRM (beyond the full admin)

- **Today**: one page of what needs a person — chats waiting, follow-ups due, your tasks, new leads, the open
  pipeline's value, and how the website chat went this week (share closed by the AI, leads from chat).
- **Get started**: six steps, each ticked by the data, each linking to where it is done.
- **Draft a reply with AI** in the inbox: written as the venue's assistant is set up (name, tone, length, rules), from
  the venue's knowledge (read without counting a use), never sent by itself; an optional instruction ("shorter",
  "offer Friday"). Refusals in our words: `ai_budget_used_up`, `model_not_allowed`, `nothing_to_answer`, `ai_failed`
  (the provider's text goes to the log only), 402 `feature_locked` without the plan's chatbot. Spend is recorded as
  feature `crm_draft` in `ai_usage_logs`.
- **Teach the assistant**: the answers a person rated wrong in the inbox and nobody corrected yet, with the visitor's
  question; a manager writes the right answer, saved through the inbox's own feedback endpoint
  (`chat-inbox/messages/{id}/feedback`, `apply_to_training`), the one writer of the "AI Corrections" knowledge. An answer
  leaves the list once any person's feedback on it was applied to training. A staff member's correction is not taught:
  the server keeps it as a suggestion (`suggested_answer`, `suggested_by`) for the manager's form (2026-11-08).
- **The AI allowance in view**: from 80 % of the month's allowance the frame says so; at 100 % it says the assistant
  hands every chat to the team and drafts stop.

## Rules the code keeps (and the tests that keep them)

- **One product of its own.** CRM's billing product is `crm_chat`; the full suite's `crm`/`chat` never make a module
  customer (`tests/Feature/AdminAccess/CrmModuleAccessTest.php`, `tests/Unit/Support/PlanModulesTest.php`).
- **The gate.** Every `admin/crm/*` route carries `workspace:crm` (`tests/Feature/CrmWorkspace/GateTest.php`).
- **Reads write nothing**; the draft writes only its spend (`DraftReplyTest`: no message, no knowledge use count).
- **The AI allowance stops before the provider is asked** (`DraftReplyTest`), as the widget does.
- **Another organisation's chats, leads, answers and tasks never show** (`TodayTest`, `BotGapsTest`, `DraftReplyTest`).
- **Days are the venue's** (`TodayTest`: a lead due today in Riga; a task due at 23:30 Riga is today's).
- **Frontend**: only `a-*` and `crm-*` classes, only the listed areas, nothing from another workspace
  (`crm/tokens.test.ts`); every word in five languages, one file per area (`crm/i18n/crmLocales.test.ts`).

## Server issues found while building it

Fixed in the first release: the full admin's Chat inbox "Transfer to agent" sent `agent_id` where the server takes
`user_id`, so every transfer answered 422 (`ChatInbox.tsx`).

Fixed on 2026-11-08 (each in the shared controller or service, so the full admin has the fix too; tests in
`tests/Feature/CrmWorkspace/`):

- **Teaching the assistant is a manager's.** `chat-inbox/messages/{id}/feedback`: a manager's (or platform admin's,
  `CrmAccess::isManager`) `apply_to_training` + `corrected_answer` teaches the "AI Corrections" knowledge; a staff
  member's is kept on their feedback row (`chat_message_feedback.suggested_answer`, migration
  `2026_11_08_100000`) and answered `applied_to_training: false, suggested: true`; a resend without `comment` keeps the
  comment. `bot-gaps` items carry `rated_by_id`, `suggested_answer`, `suggested_by` (`TeachTheAssistantTest`,
  `BotGapsTest`).
- **The public widget key can be rotated**: `POST widget-config/rotate-widget-key` (manager, `admin/widget-config`)
  gives the config a new uuid `widget_key`, forgets the old key's cached config and answers the config as
  `GET widget-config` does; `regenerate-key` (the private `api_key`) is unchanged (`WidgetKeyRotationTest`).
- **The AI helpers keep the allowance**: `chatbot-config/test-chat`, `suggest-keywords` and `knowledge/extract-faqs`
  answer 403 `ai_budget_used_up` before the provider is asked, record their spend (`chatbot_test`,
  `knowledge_keywords`, `knowledge_faqs`) and say a provider failure as 502 `ai_failed`, its text in the log only
  (`App\Exceptions\AiHelperRefused`; `ChatbotHelpersTest`).
- **Knowledge documents take no `.doc`** (no extractor): PDF, DOCX and TXT remain (`ChatbotHelpersTest`).
- **Task times are instants**: `TaskController` converts a `due_at` with an offset to UTC (one without keeps its
  digits); a lead's `next_task_due` is the venue's day of its next task, and `tasks?status=due_today` the venue's day.
  The full admin's task drawer (`TaskDrawer.tsx`) now sends the person's local date and time as an ISO instant
  (`TaskDueInstantTest`).
- **Leads**: `inquiries` sorts only by real columns (`total_value` and `ai_win_probability` added, the three missing
  ones gone); bulk `set_status` / `mark_won` / `mark_lost` move `pipeline_stage_id` too (one rule,
  `InquiryController::stageForStatus`, which `update`, `markWon` and `markLost` use); `POST inquiries` puts a new lead
  in the default pipeline at its status's stage, else the first open stage; the `task_due` filters, `kpis` and `today`
  use the venue's day (`LeadsAndDealsTest`).
- **Deals**: `deals/kpis` `total` counts deals only (`LeadsAndDealsTest`).
- **Guest tags**: a name is unique within the organisation (validation and the index: migration `2026_11_08_100100`
  replaces `guest_tags_name_unique` with `guest_tags_org_name_unique` on PostgreSQL), and `tag_ids.*` must be this
  organisation's (`ContactsTest`).
- **Contacts**: `PUT guests/{id}` clears a field sent as JSON `null` (columns that may be empty only; not `member_id`
  or `custom_data`), an empty string is still ignored; `guests` sorts by `full_name`, `last_activity_at`,
  `total_revenue` (and reads `stays_count` / `last_check_in` as `total_stays` / `last_stay_date`); `delete-impact`
  says the truth from the foreign keys — leads, reservations and timeline go with the contact (and the leads' tasks),
  the leads' chats stay unlinked, the member stays, a venue booking blocks the delete (`blocked`) (`ContactsTest`).
- **Chatbot analytics** count days, hours and weekdays on the venue's clock (`AT TIME ZONE`, `VenueClock::zone`);
  PostgreSQL SQL, so `ChatbotAnalyticsTest` runs there only (skipped on SQLite).
- **The inbox's figures match its list**: `chat-inbox/stats` counts only the chats `chat-inbox` lists by default
  (`ChatConversation::shownInInbox`, which CRM Today's chat figures use too); `resolved_today` is the venue's day
  (`ChatInboxTest`, `TodayTest`).
- **Transcripts** sign each team message with its own sender (`sender_user_id`) (`ChatInboxTest`).
- **Codes**: `chat-inbox/transcribe` 503 is `transcription_unavailable`; a failed brief carries `code: 'ai_failed'`
  beside its `error` sentence; guest-merge refusals carry `error` (`not_found`, `same_guest`,
  `different_organizations`, `different_members`, `merge_failed`) (`ChatInboxTest`, `ContactsTest`).
- The full admin's Corporate page read its paging from `data.meta`; it now reads the paginator's own `current_page`,
  `last_page`, `total` (`Corporate.tsx`).

- **Another organisation's ids are refused** wherever the CRM links records (`OwnRows::rule`): a lead's contact,
  company and property; a task's lead, contact and company; a contact's member; the lost reason on a lost lead; bulk
  and merge contact ids; an email template's member; a lead form's default property (`ForeignIdsTest`).
- The full admin's chatbot test page and inbox dictation toast the server's sentence (`message`), not its code.
- Deals' "overdue" is by the venue's day (`LeadsAndDealsTest`).

Still open (found, not changed):

- After a rotation the website's own snippet must be replaced (that is the point). Landing pages on our domain read
  the key per request (browsers may hold a page for `landing.cache_ttl`). Production's cache is each container's own
  files, so another container may answer the old key's config read for up to 60 s; every chat request looks the key
  up in the database and is refused at once.
- Tasks the full admin saved before 2026-11-08 hold local digits stored as UTC and keep showing shifted by the
  offset; nothing in a row says which ones they are.
- Bulk `mark_won` does not create the draft reservation `markWon` creates for a property-linked lead.
- Loyalty and booking writes outside the CRM still name ids with a bare `exists:<table>,id` (another organisation's
  row passes validation): `MemberAdminController` (`member_ids.*`, `member_id`), `EmailCampaignController`
  (`member_ids.*`), `BenefitAdminController` and `EarnRateEventController` (`property_id`). The CRM's are scoped
  (below); these are for a loyalty/booking pass with their own tests.

## Known limits

- The knowledge search the draft uses (`KnowledgeService::searchRelevantItems`) is PostgreSQL SQL (`ILIKE`), as the
  widget's is; the SQLite test stands in for it, `scripts/test-pg.sh` runs the real one.
- Chatbot analytics (`ChatbotAnalyticsController`) is PostgreSQL SQL too (production's database); its test
  (`ChatbotAnalyticsTest`) runs under `scripts/test-pg.sh` only.
- Multi-brand organisations: the CRM works on all brands at once (`brand_id=all`); the chatbot's behaviour and the
  widget's look are the default brand's, as in the full admin without a brand chosen.
