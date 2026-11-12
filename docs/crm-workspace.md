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
| `GET activity` (`type?`, `page`) | round 5: the team's recent CRM activity, who did what to which lead or contact (`Crm\CrmActivityFeed`; a line on a lead follows the lead's brand scope) | staff |
| `GET reports/{funnel,forecast,lost-reasons,sources,owners,companies}` | round 5: the sales reports (`App\Services\Crm\SalesReports`, which the full admin's `admin/reporting/*` and `analytics/inquiry-funnel` now call too); a company's reservation revenue only for an organisation that may reach bookings | the Analytics right (`can_view_analytics`; a manager always) |
| `GET/POST intake-tokens`, `DELETE intake-tokens/{id}` | round 5: lead-intake API tokens (`Crm\IntakeTokens`): the single ability `crm:lead-intake`, accepted by Sanctum only on `POST integrations/leads` (`CrmIntakeTokensServiceProvider`); the plain token answered once | manager |
| `GET/PUT mail-settings` | round 5: the sender name and reply-to template emails use (`Mail\SenderSettings`, the settings `mail_from_name` / `mail_reply_to`) | read staff; change an owner (`SettingRegistry::ownerOnly`, the full admin's rule) |
| `GET ai-usage` | round 5: this month's AI spend by venue day and by feature against the plan's allowance (`AiUsageService::monthByVenueDay()`) | manager |

Everything else the workspace shows is the **full admin's own chat and CRM endpoints**, under their own rules
(`AccessMap`: `admin/chat-inbox*`, `admin/visitors`, `admin/engagement`, `admin/chatbot*`, `admin/knowledge`,
`admin/popup-rules`, `admin/widget-config`, `admin/inquiries*`, `admin/deals`, `admin/pipelines`, `admin/guests`,
`admin/tasks`…). An organisation on the `crm` module reaches the `crm` and `chat` products for that reason
(`AccessMap::MODULE_PRODUCTS`). The frontend may call only the areas listed in `frontend/src/crm/lib/api.ts` (`AREAS`),
always with a `brand_id`: the brand chosen in the header's switcher, or `all` (`crm/lib/brand.ts`, since 2026-11-09);
`crm/tokens.test.ts` refuses any other path.

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
| Today | `/crm` (`?need=chats|followups|tasks`) | `crm/today`, `crm/pulse`, `crm/activity`: the venue's clock (the pulse strip), "Needs you now" in three tabs (chats waiting, follow-ups, your tasks; five rows each, Show all), the team's activity, the figures that are not zero, new leads, the week's chat |
| Get started | `/crm/start` | `crm/start`: the six setup steps |
| Inbox | `/crm/inbox` (`?c=<conversation>`, `?status=waiting`, `?dtab=`) | `chat-inbox*`, `engagement/*`: a full-height list, thread and details; statuses as icons with counts, Priority and the intents (`engagement/feed`, `filter-counts`, with a range), Nobody assigned (`unassigned=1`); the thread (polled), take over / hand back, resolve (E) / archive / reopen, assign, capture as lead, rate an AI answer and teach the right one, translate, the AI brief, canned replies, upload, dictation, transcript, **Draft a reply with AI**; details in tabs (Contact, Lead, AI, Website), folded away on request; J / K move through the list |
| Visitors | `/crm/visitors` (`?v=<visitor>`, `?vtab=`) | `visitors*`, `engagement/feed`: on the site now, everyone, away, leads, hot leads, has contact, missed; a dense list with a live dot; a visitor in a panel (Overview, Chats, Pages); start a chat; delete |
| Leads | `/crm/leads` (`?view=list|board|team`, `?p=<pipeline>`, `?due=…`; the old `?new=1&guest=` still opens the form), a lead in its panel `?lead=<id>&rtab=` on any page, `/crm/leads/:id` | `inquiries*`, `guests`, `guests/facets`, `saved-views`, `crm-settings`, `email-templates*`, `crm-ai/capture-lead`, `tasks`: List, Board (drag or Move to) and Team (by owner); search, filters as chips, follow-up pills with counts, saved views shared with the full admin (page key `inquiries`), team-wide column choices and list custom fields; rows with the stage changed in place, AI signal, next step, owner, touches and a row menu, each opening the lead's panel; bulk stage / owner / priority / follow up / won / lost (each through its own `/won` or `/lost`, one reason, at most 100) / delete; Excel or CSV (`inquiries/export`); A lead from a message (every staff member, `RequireAiCapture`). A lead (round 5: one frame in the panel and on its page): stage, priority and age; Move to, Won, Lost, Send email, email / call / WhatsApp / SMS, AI brief, Proposal; tabs Overview (stage bar, value / owner / priority / next step edited in place, AI brief, contact, details, stay, custom fields), Deal (a won lead's step and payment), Activity (timeline, type filter, call length, voice note), Tasks, Emails (the mail history), Files, Chat; edit, add a task, open the contact, delete with what goes |
| Pipeline | `/crm/pipeline` | redirects: to `/crm/leads?view=board` (keeping `?p=`), `?tab=won` to `/crm/deals` |
| Deals | `/crm/deals` (`?filter=…`, `?deal=`, `?dsort=`, `?dpage=`) | `deals/*`, `crm-settings` (`deal_fields`), `inquiries`, `inquiries/{id}/won`, `crm-ai/capture-lead`: figures that open their step (none that is zero), search, payment and owner filters, step pills with counts (the step's own `payment_pending` figure), the step as one compact menu over a slim bar, Next step, payment with Paid in full, columns, Excel or CSV; a deal opens the lead's panel on its Deal tab; Add a deal by hand or From a message (the lead form in its deal mode: the lead, then the server's own `/won`) |
| Contacts | `/crm/contacts` (`?tab=companies|duplicates`), a contact `?contact=<id>` / a company `?company=<id>` in its panel on any page, `/crm/contacts/:id` | `guests*`, `corporate-accounts`, `custom-fields`: people with filters (company `co`, created dates on the venue's days, has email / phone, type, nationality, VIP, owner and the round 2 ones), saved views, bulk changes, Excel or CSV (`guests/export`); a contact (tabs Overview edited in place, Leads, Activity, Emails, Fields; tags in place; New lead over the contact `?create=lead&guest=`; merge a look-alike; delete); a company (Overview with the full admin's fields, the hotel-only rate fields for hotels; People, Leads, Fields); the organisation's custom fields on contacts and companies; duplicates and merge |
| Tasks | `/crm/tasks` | `tasks*`: mine / everyone; type; All open (by day), Overdue, Today, Upcoming, Done (by the day done) on the venue's days, opening where the work is when no tab is named (`openingTab`); a task opens in its form; add (`?create=task`), edit (with the organisation's task custom fields), complete, reopen, delete |
| AI assistant | `/crm/assistant` (`?tab=behaviour|knowledge|teach|try|popups`, `?part=`) | `chatbot-config/*` (with the model: `model`, `probe-model`; a model outside the plan is marked and cannot be picked), `chatbot-onboarding`, `knowledge/*`, `popup-rules`, `crm/bot-gaps`; long forms in parts (a left list on a wide screen, tabs on a phone) with one save bar |
| Chat widget | `/crm/widget` (`?tab=look|behaviour|install`, `?part=`) | `widget-config*`: the look in six parts with the preview kept in view, behaviour in four, the embed code |
| Insights | `/crm/insights` (`?tab=chat|pipeline|deals|reports`, `?days=7|30|90`, `?months=3|6|12`) | `chatbot/analytics` (with intent, weekday and length), `inquiries/*`, `pipelines`, `deals/analytics` (revenue and new deals by day, steps, payments, cycle time, stuck deals, best customers), `crm/reports/*` (funnel, forecast, lost reasons, sources, owners, companies; the tab only with the Analytics right) |
| Settings | `/crm/settings` (`?tab=canned|pipelines|forms|fields|templates|account`, `?template=<id>|new`) | `chat-inbox-canned`, `pipelines`, `pipeline-stages`, `inquiry-lost-reasons*`, `lead-forms`, `custom-fields` (and `presets`, `apply-preset`), `email-templates*` (the editor: blocks or HTML, merge tags at the cursor, the server's preview; changes a manager's, `staff.can.manage_templates`); Team and Plan & products |
| Integrations | `/crm/integrations` (`?tab=leads|email|ai|channels`) | `crm/intake-tokens`, `crm/mail-settings`, `crm/ai-usage`, `integrations/messenger*`: lead-intake tokens and the guide; the sender name and reply-to; AI usage against the allowance; Messenger pages (connect, check, reconnect, test, disconnect). Staff see Email only (`staff.can.manage_integrations`) |

Left out on purpose (round 5 re-checked each against the full admin): chatbot fine-tuning (Training: no code reads the
model it makes), the voice agent (the widget's realtime session has no plan gate, allowance check or spend record yet —
an owner's decision first), the staff AI copilot (`crm-ai/chat`, behind `feature:admin_ai`, which no CRM package has —
a pricing decision), AI capture of a member, a company or a contact (`crm-ai/capture-member`, `-corporate`, `-guest`),
a contact's room reservations, bulk tagging (no endpoint), the field-layout manager (the CRM reads only the list and deal
columns, which it already switches; ordering exists in neither admin), the Leads property filter and the hotel-only
rate / room type / MICE fields on leads (Deals still shows a room type or an event a lead has), the stage groups (they
read hotel status names), Focus mode, the Planner's team buckets (`planner/*`; Leads has its own Team view), WhatsApp
as an inbox channel (no webhook or sending path exists), and the full admin's reviews, brands editor and global search
(product `admin`).

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

## Round 2: the frame and the pages (2026-11-07)

- **Dark first**: a device that never chose starts Dark (`crm/lib/look.ts` passes `start` to the shared look engine);
  the palette is `CRM_SURFACES`, pinned by `crm/theme/crmContrast.test.ts`. Light stays one press away.
- **Grouped side panel** (`crm/shell/nav.ts`): Today; Conversations (Inbox, Visitors); Sales (Leads, Deals, Contacts,
  Tasks); Reports (Insights); Set up (AI assistant, Chat widget, Settings).
- **One page shape**: a header with the page's one main action, figure tiles (`StatTile`), then `SectionNav` cards
  for the page's main sections (kept in `?tab=`), a `Toolbar` with `FilterChip`s for a list, content in `Card`s with
  a description; `Tabs` pills only filter inside a list. Wide lists are tables with a header row and become cards on a
  phone; every page was checked at 1440, 390 and 360 px, Dark and Light.
- **Decisions in pure functions with tests** (`*Logic.ts`, `listLogic.ts`, `board.ts`, `dealLogic.ts`, `taskLogic.ts`,
  `insightsMath.ts`), because the frontend tests render to a string.

## Round 5: open, don't leave (2026-11-12)

The owner: "improve design, layout, interactions, user journey … implement all features which we have in our main
platform … minimize copy, more icons, nice flow, opening tabs, slides or popups … modern and effective".

- **Records in panels.** A lead, a contact or a company opens over the page it was chosen on, from any list, the board,
  Today, the inbox or Find (`?lead=`, `?contact=`, `?company=`, its tab `?rtab=`; rules `crm/lib/records.ts`, hook
  `useRecords`, host `RecordHost`). Back closes it; `[` and `]` step through the list the page registered
  (`useRecordList`). The panel and the record's own page draw one frame (`ui/RecordPanel`: header, actions, tabs).
- **New, on every page.** The header's New menu and the key N open a lead, a deal, a task, a contact, a company or a
  lead from a message in a panel over the page (`?create=lead|deal|capture|deal_capture|contact|company|task`, with
  `&guest=<id>` for a contact's lead; `CreateHost`, `shell/QuickCreate`); what was made opens in its panel.
- **Less copy, more icons.** A page's header is one row (its icon, the title, an (i) holding its sentence); a card's
  description is an (i) (`hint` keeps a short fact); figures are compact (`StatTile`, none that is zero first); a
  page's sections are one strip of icon tabs (`SectionNav`); icon-only actions are `IconButton` with a tooltip; long
  set-up forms are parts with a left list or tabs (`settings/formKit.tsx`). Visible words per page roughly halved (the
  tour's counts: Today 506 → 193, Deals 211 → 100, a lead 361 → 123, the widget's behaviour 688 → 45).
- **Alerts on every page** (`crm/alerts`): a chat starting to wait or a new hot lead gives a toast with Open, "(n)"
  before the tab's title and a dot on the favicon, and a desktop alert when switched on in the inbox's header. It reads
  `chat-inbox/stats` (and `engagement/kpis`) every 15 s while the tab is visible; nothing on first load.
- **Find** searches contacts, leads, companies and website chats.
- **From the main platform** (see the areas above): the email-template editor, custom-field presets and the AI model
  choice; the organisation's custom fields on contacts, companies and tasks; the full admin's contact filters and
  company fields; Excel exports; the Engagement hub's priority and intents in the inbox and Visitors; Deals analytics;
  the chat by intent, weekday and length; the sales reports; the team's activity; lead-intake tokens, the sender name
  and reply-to, AI usage and Messenger on the new Integrations page.
- **Shared with the full admin (changed for both):** the sales reports are one service (`Crm\SalesReports`; portable
  SQL, `SUM(CASE …)` instead of `FILTER`; `reporting/company-ltv` answers a fixed set of fields, empty sums last); a
  template's preview without a member renders with the member's tags empty (was a 404); a template sent from a lead or
  a contact carries the venue's name and reply-to (`MailIdentityService`; before, the platform's noreply address); a
  switch to a model outside the plan is refused (403 `model_not_allowed`; a model already saved stays savable);
  `guests` filters on the venue's days, "has email / phone" ignore empty values, `guest_type` is a facet, the company
  filter is portable; saving a contact or a company keeps the stored values of fields switched off
  (`CustomFieldService::keepUnlisted()`); AccessMap `admin/integrations` became `admin/integrations/messenger`
  (product `chat`, a manager's) — Messenger's routes were the only ones under it.
- **Fixed along the way:** the leads CSV was always empty (it called the JSON list); "Not assigned" on the board and
  the Team view sent an owner named `_nobody` (now `unassigned=1`).

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
- **A thread shows the reader's own rating** of each AI answer (`chat-inbox/{id}`), else the newest anyone gave; before,
  whichever feedback row came last, so a person could see a colleague's rating as theirs (`ChatInboxTest`).
- **The AI capture keeps the allowance**: `crm-ai/capture-lead`, `-guest`, `-corporate`, `-member` answer 403
  `ai_budget_used_up` before the provider is asked (`ChatbotHelpersTest`). Since 2026-11-08 (owner: "add ai capture in
  leads and deals for any staff member") they are every staff member's wherever the CRM workspace is on, or the plan
  has `admin_ai` (`RequireAiCapture`, route middleware `ai.capture`); the rest of `crm-ai/*` (the staff copilot's chat
  and voice) keeps `feature:admin_ai`. The bootstrap's `features.ai_capture` is the middleware's own answer
  (`AiCaptureTest`, `BootstrapTest`).
- **The leads' created-date filters are the venue's days**: `inquiries?date_from=&date_to=` and the export, from the
  day's start to the next day's start in `VenueClock::zone` (before, UTC days, `date_to` ending 23:59:59); Insights'
  new-leads windows follow (`LeadsAndDealsTest`, `insightsMath.test.ts`).
- **A template sent to someone who is no member carries no member's details**: `email-templates/{id}/send` without
  `member_id` filled the member tags from the first active member it found, so a lead received another person's name,
  email, card number, points and referral code; it now leaves them empty (`EmailTemplate::renderWithoutMember`,
  `SendTemplateTest`). The CRM also refuses a template with member tags for a contact who is no member and names them.
- **Leads without a value or AI score sort last** in either direction, on PostgreSQL and SQLite (`LeadsAndDealsTest`).

Round 4 (2026-11-09; the owner, with a screenshot of the full admin's New task drawer: "improve design, logic and make
it easier to use, more structurized well organized… grids types and tasks… an option to select from which organization
we working and see data"; answered: one form for the CRM and the main app, and the brands inside the organisation):

- **One task form, in four steps**, for HexaTech CRM (`crm/tasks/TaskForm.tsx`) and the full admin's drawer
  (`components/TaskDrawer.tsx`), on one set of rules (`src/lib/taskForm.ts`, icons `src/lib/taskTypeIcons.ts`): What (the
  type grid in four groups — get in touch, meet, close the sale, other —; the title the type suggests, with the lead's
  name in the CRM; priority), When (quick days or the calendar, then a start time by part of the day or any other time,
  then how long, then how often — each on once the one before is set), Who and the lead, Notes; a summary in the footer.
  The CRM's times are the venue's clock, the full admin's the person's, as before (`TaskFormTest`-style render tests:
  `crm/tasks/TaskForm.test.tsx`, `components/TaskDrawer.test.tsx`; the rules: `lib/taskForm.test.ts`).
- **Priority, length and repeat are saved**: `tasks.priority`, `tasks.duration_minutes` (migration
  `2026_11_09_140000`) and `recurring_rule` {freq}, accepted by `TaskController` (a repeat needs a day). The full
  admin's drawer had sent all three inside `custom_data`, which keeps only an organisation's own custom fields
  (`CustomFieldService::validate`), so none was ever stored, and "Repeat" was never built. **Completing a repeating task
  adds the next one** on the venue's clock, one step on and ahead of now, once (`TaskController::nextOccurrence`,
  `TaskPlanTest`). Task rows in both show the end time, high priority and the repeat.
- **The full admin's drawer words exist in all five languages** (most had been English everywhere); the locale sweep
  (`i18n/localeCompleteness.test.ts`) now checks `taskDrawer.*` and `tasks.types.*`.
- **A brand switcher** in the CRM's header, where the organisation's name stood, shown with more than one brand: All
  brands, or one. The bootstrap lists the brands a person may work in (`App\Services\Crm\CrmBrands`, mirroring
  `BrandMiddleware`: a staff member assigned to brands sees only those and is not offered All brands) and the brand the
  request was scoped to (`brand_id`); the choice is kept per device and sent as `brand_id` on every call; a choice that
  is not the person's falls back to what the server allows (`BrandSwitchTest`, `crm/lib/brand.test.ts`).

Round 3 (2026-11-08, the owner: "Do as you suggest"), each with a test:

- **Bulk won closes each lead as `/won` does** (`InquiryController::closeAsWon`): the won stage, "Confirmed", the
  "Marked Won" line on the timeline, and a hotel's draft reservation for a lead with a property and dates; before, the
  bulk action left out the line and the reservation (`LeadsAndDealsTest`).
- **"Not assigned"**: `inquiries?unassigned=1` (and the export) lists the leads nobody owns; the Leads owner filter
  offers it (`LeadsAndDealsTest`, `leadLogic.test.ts`).
- **The Deals "Awaiting payment" pill counts its own step**: `deals/kpis` adds `payment_pending` (the step), beside
  `awaiting_payment` (deals not paid in full, unchanged); the CRM's pill and the full admin's use it
  (`LeadsAndDealsTest`, `dealLogic.test.ts`).
- **A failed capture answers our sentence**: `crm-ai/capture-*` and `extractionFailure` log the provider's text and
  answer `CrmAiController::CAPTURE_FAILED` or the extraction's own sentence (`AiCaptureTest`).
- **Every id a staff request names is this organisation's**: the last bare `exists:<table>,id` rules (members, tiers,
  benefits, segments, points lines, properties, services, masters, extras, review forms, guests, enquiries, companies,
  venues, knowledge categories, email templates) are `OwnRows::rule()`, tiers and benefits with `whereNull('deleted_at')`;
  the merge, a member's tier change and a campaign's recipients have no `exists` rule, because each reads the id again
  under the tenant scope and keeps its own refusal (404, `bad_tier`, `bad_recipients`). `OwnIdsTest` refuses a bare rule
  anywhere under `app/Http`.
- **The widget's cached config is shared**: `widget:config:<key>` lives in `SharedCache` (the database in production),
  so a save or a key rotation forgets it for every container at once, not only the one that took the save
  (`WidgetKeyRotationTest`).

Decided by the owner (2026-11-08):

- Any staff member may write any `crm-settings` key ("Yes it is ok, any can change"); AccessMap `admin/crm-settings`
  stays staff / staff.

Still open:

- Tasks the full admin saved before 2026-11-08 hold local digits stored as UTC and keep showing shifted by the
  offset; nothing in a row says which ones they are, so no migration can tell them from correct ones. Staff correct
  them by hand when they meet one.

## Known limits

- Round 5: alerts pause while the tab is hidden (they catch up when it is shown again); the hot-lead figure counts
  every visitor marked as a lead. `deals/analytics` still counts UTC days, and its cycle time is PostgreSQL SQL.
  Changing the sender name or reply-to is an owner's (the full admin's `SettingRegistry::ownerOnly`). The full
  admin's own API tokens still carry every ability (`*`); Messenger's `list-pages` hands page tokens to the browser
  (the full admin's design). A company has no page of its own (its panel only).
- After a widget key rotation the website's own snippet must be replaced (that is the point). Landing pages on our
  domain read the key per request (browsers may hold a page for `landing.cache_ttl`); every chat request looks the key
  up in the database and is refused at once.
- The knowledge search the draft uses (`KnowledgeService::searchRelevantItems`) is PostgreSQL SQL (`ILIKE`), as the
  widget's is; the SQLite test stands in for it, `scripts/test-pg.sh` runs the real one.
- Chatbot analytics (`ChatbotAnalyticsController`) is PostgreSQL SQL too (production's database); its test
  (`ChatbotAnalyticsTest`) runs under `scripts/test-pg.sh` only.
- Multi-brand organisations: in "All brands" the chatbot's behaviour and the widget's look are the default brand's, as
  in the full admin without a brand chosen; choose the brand in the switcher to set up another brand's assistant and
  widget. A record added while one brand is chosen is that brand's (the models' `BelongsToBrand`).
