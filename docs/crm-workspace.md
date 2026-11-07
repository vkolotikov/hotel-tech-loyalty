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
| `POST conversations/{id}/draft` (`instruction?`) | an AI reply for a person to edit and send (`ReplyDrafter`); `feature:chatbot`, 20 a minute | staff |

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
  leaves the list once any person's feedback on it was applied to training.
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

## Known limits

- The knowledge search the draft uses (`KnowledgeService::searchRelevantItems`) is PostgreSQL SQL (`ILIKE`), as the
  widget's is; the SQLite test stands in for it, `scripts/test-pg.sh` runs the real one.
- Chatbot analytics (`ChatbotAnalyticsController`) is PostgreSQL SQL too (production's database).
- Multi-brand organisations: the CRM works on all brands at once (`brand_id=all`); the chatbot's behaviour and the
  widget's look are the default brand's, as in the full admin without a brand chosen.
