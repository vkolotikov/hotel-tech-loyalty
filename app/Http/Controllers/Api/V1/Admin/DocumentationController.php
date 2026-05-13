<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class DocumentationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'sections' => self::getAllSections(),
            'faq'      => self::getFaq(),
        ]);
    }

    public function section(string $slug): JsonResponse
    {
        $all = collect(self::getAllSections());
        $section = $all->firstWhere('slug', $slug);
        if (!$section) {
            return response()->json(['error' => 'Section not found'], 404);
        }
        return response()->json($section);
    }

    /**
     * Returns full documentation as plain text — used by CrmAiService.
     */
    public static function getDocumentationText(string $topic = 'all'): string
    {
        $sections = self::getAllSections();
        $faq = self::getFaq();

        if ($topic !== 'all') {
            $match = collect($sections)->firstWhere('slug', $topic);
            if ($match) {
                $sections = [$match];
                $faq = [];
            }
        }

        $text = "# Hotel Tech Platform — System Documentation\n\n";

        foreach ($sections as $section) {
            $text .= "## {$section['title']}\n";
            $text .= "{$section['description']}\n\n";
            foreach ($section['articles'] as $article) {
                $text .= "### {$article['title']}\n";
                $text .= "{$article['content']}\n\n";
            }
        }

        if ($faq) {
            $text .= "## Frequently Asked Questions\n\n";
            foreach ($faq as $item) {
                $text .= "**Q: {$item['question']}**\n{$item['answer']}\n\n";
            }
        }

        return $text;
    }

    public static function getAllSections(): array
    {
        return [
            [
                'slug' => 'overview',
                'title' => 'Platform Overview',
                'icon' => 'Globe',
                'description' => 'Hotel Tech Platform is a unified hotel management system combining CRM, Loyalty Program, Booking Engine, AI Assistant, Events & Venues, and Campaign management into one admin panel.',
                'articles' => [
                    [
                        'title' => 'What is Hotel Tech Platform?',
                        'content' => "Hotel Tech Platform is an all-in-one hotel management solution designed for modern hospitality operations. It unifies guest relationship management, loyalty programs, booking management, AI-powered insights, event planning, and marketing campaigns into a single, powerful admin dashboard.\n\nThe platform is built for hotel staff — from front desk receptionists to revenue managers and general managers — to streamline daily operations and make data-driven decisions.",
                    ],
                    [
                        'title' => 'Core Modules',
                        'content' => "**CRM & Guest Management** — Centralized guest profiles, sales pipeline (inquiries), reservations, corporate accounts, daily task planner, and audit log.\n\n**Loyalty Program** — Tiered membership system (Bronze → Diamond) with points earning/redemption, special offers, benefits, QR/NFC member cards, member duplicate detection + merge tooling, and a mobile app for members.\n\n**Booking Engine** — PMS integration via Smoobu, calendar view, payment tracking, room/extras catalog, public booking widget for your website, and booking submission logs.\n\n**Live Chat & Website Chatbot** — Embeddable chat widget for the customer's website, persistent visitor identity tracking (online/offline + page-view journey), live agent inbox with canned replies + file attachments, AI chatbot config, knowledge base, popup automation rules, and an OpenAI fine-tuning trainer.\n\n**AI Assistant** — Two separate AI systems: (1) Admin AI Chat powered by Anthropic Claude for CRM operations, data analysis, voice mode, and platform guidance. (2) Website Chatbot powered by OpenAI for guest-facing conversations on the customer site.\n\n**Venues & Events** — Venue management with capacity/pricing, event bookings linked to guest profiles.\n\n**Reviews & Feedback** — Two form types (Basic star+comment with threshold-redirect to Google/TripAdvisor/Trustpilot, and Custom admin-built questionnaires), per-org embed keys, iframe-embeddable public URLs, manual invitations by email (member/guest/ad-hoc) and automatic post-stay sweep at configurable day delay, with a funnel dashboard (sent → opened → submitted → redirected).\n\n**Campaigns & Notifications** — Push notification campaigns + email templates with audience segmentation by tier, activity, and demographics.\n\n**Analytics & Reporting** — 10+ analytics views covering points, revenue, member growth, engagement, booking metrics, audit history, and AI-powered forecasting.",
                    ],
                    [
                        'title' => 'Getting Started',
                        'content' => "1. **Configure Settings** — Set up your hotel branding (colors, logo), integrations (API keys for Smoobu, OpenAI, Anthropic), and booking engine.\n2. **Add Properties** — Create your hotel properties with rooms, outlets, and contact info.\n3. **Set Up Loyalty Tiers** — Configure tier thresholds, earn rates, and benefits.\n4. **Import Guests** — Add guest profiles manually or use AI to extract from emails/messages.\n5. **Configure Chat Widget** — Set up the website chatbot with your hotel's knowledge base.\n6. **Start Operations** — Manage inquiries, reservations, loyalty members, and use AI for insights.",
                    ],
                ],
            ],
            [
                'slug' => 'brands',
                'title' => 'Brands (Multi-brand portfolio)',
                'icon' => 'Briefcase',
                'description' => 'A brand is a marketing/operational sub-division inside an organization. Each brand owns its own AI chatbot, knowledge base, chat widget, booking engine and theme. CRM (guests, inquiries, reservations) and the loyalty program (members, points, tiers) stay unified at the organization level.',
                'articles' => [
                    [
                        'title' => 'When to use brands',
                        'content' => "Most hotels run as a single brand and never need this feature — the platform auto-creates one default brand per organization and the brand switcher stays hidden.\n\nThe brand layer is for hotel groups that operate **multiple sub-brands** under one corporate parent — think Marriott Bonvoy with Westin, St. Regis, W. Each brand has its own website, marketing voice, booking inventory, and AI chatbot persona, but the parent group keeps a single guest CRM and one unified loyalty program across all brands.\n\nCreate a second brand when you need to:\n- Run a separate AI chatbot voice / knowledge base for a different brand\n- Issue a different chat widget embed token for a different domain\n- Configure a separate Smoobu PMS account per brand\n- Show different theme colours / logo per booking widget",
                    ],
                    [
                        'title' => 'What stays unified vs scoped',
                        'content' => "**Brand-scoped** (each brand has its own):\n- AI chatbot behaviour + model config\n- Knowledge base (categories, items, documents)\n- Chat widget appearance + embed token\n- Popup rules\n- Booking engine (rooms, extras, services, properties, PMS credentials)\n- Theme overrides + email templates\n\n**Org-level (shared across all brands)**:\n- Guests / member profiles — one record per person, regardless of which brand they interacted with\n- Loyalty members / points / tiers — unified card, balance and tier ladder\n- Corporate accounts\n- Staff users (with optional per-brand permissions)\n- Audit log\n\n**Org-level with brand attribution** (rows are stamped with `brand_id` for reporting but not isolated):\n- Inquiries — which brand drove the lead\n- Reservations — which brand the stay was at\n- Points transactions — which brand earned the points\n- Special offers + notification campaigns — `brand_id IS NULL` means \"applies to all brands\"\n- Email templates",
                    ],
                    [
                        'title' => 'Managing brands',
                        'content' => "Settings → Brands lists every brand in your organization. From there an admin can:\n- Create a new brand (uploads a logo, picks a primary colour)\n- Set a brand as the default (used as the fallback for legacy URLs and unscoped queries)\n- Edit a brand's name, slug, description, colour, or logo\n- Configure per-brand Smoobu PMS credentials\n- Delete a brand (the default brand is protected — designate another default first)\n\nThe top-bar **brand switcher** appears once you have 2+ brands. Switching changes the context for chatbot config, knowledge base, booking config and widget pages. Org-level pages (Guests, Members, Inquiries, Reservations) keep showing everything in 'All brands' mode and apply a brand filter when a specific brand is selected.\n\nPublic widget URLs use each brand's `widget_token` — `/widget/{token}`, `/book/{token}`, `/services/{token}`, `/chat-widget/{token}` all work for any brand. Legacy organization-level tokens redirect to the default brand for backward compat.",
                    ],
                ],
            ],
            [
                'slug' => 'crm',
                'title' => 'CRM & Guest Management',
                'icon' => 'Users',
                'description' => 'Manage guest profiles, sales pipeline, reservations, corporate accounts, and daily operations.',
                'articles' => [
                    [
                        'title' => 'Guest Profiles',
                        'content' => "Every guest interaction starts with a profile. Guest profiles store:\n- Contact information (name, email, phone, company)\n- Demographics (nationality, VIP level, guest type)\n- Preferences (room type, dietary needs, special requests)\n- History (total stays, total revenue, last visit)\n- Linked loyalty member (if enrolled)\n\n**Creating Guests:** Manually via the Guests page, or use AI to extract from emails/WhatsApp messages. Paste any text into the AI chat and say \"extract this lead\" — the AI will parse contact details and create the guest profile.\n\n**VIP Levels:** Regular, Silver VIP, Gold VIP, Platinum VIP. VIP level affects service priority and is visible across all modules.",
                    ],
                    [
                        'title' => 'Sales Pipeline (Inquiries)',
                        'content' => "The inquiry system is your sales CRM. Click any row to open the **Lead Detail** page — three columns: Profile · Activity Timeline · AI Smart Panel + Open Tasks.\n\n**Default stages (Hotel preset):** New → Responded → Site Visit → Proposal Sent → Negotiating → Tentative → Confirmed → Lost. Other industries get a different starter set — see Settings → Pipelines → Quick setup by industry.\n\n**Each inquiry tracks:**\n- Guest, property, optional corporate-account link\n- Inquiry type, source, dates, room/pax requirements, rate, total value\n- Priority (Low/Medium/High) — inline-editable on the list (click the priority chip)\n- Status — inline-editable too, drag-and-drop on the Kanban view\n- Pipeline stage with kind = open/won/lost (drives flow logic)\n- Activity timeline — every note, call, email, meeting, chat conversation, status change is logged automatically\n- Open tasks (first-class entity, not just a column on the row)\n- AI Smart Panel — gpt-4o-mini brief + intent + win-probability + going-cold risk + suggested next action, cached on the row\n- Won → auto-creates a draft Reservation when stay details are present\n- Lost → required reason picker (with optional AI \"Suggest from timeline\" guess)\n\n**Bulk actions** appear when you tick rows on the list view: change stage, reassign owner, mark won, mark lost. **Saved views** let each user pin filter combinations to a chip strip above the table.\n\n**Pipeline Insights** highlight Going Cold (no contact 7d+), High Value, Unassigned, and Stuck deals daily. The Going Cold panel has a one-click \"Re-engage all\" that queues a follow-up task on each cold lead.\n\n**Best Practice:** Set a follow-up task on every open inquiry. Use the AI Smart Panel's win-probability + suggested action to prioritise outreach.",
                    ],
                    [
                        'title' => 'Lead Detail page (deep dive)',
                        'content' => "`/inquiries/:id` is where deal work actually happens. Three columns:\n\n**Profile column (left)** — guest contact, stay details, special requests, property/priority/source, linked reservation chips when one exists, custom fields with an Edit pencil. Click \"Open guest profile →\" to jump to the full Guest Detail.\n\n**Activity Timeline (centre)** — chronological log of every touch on this lead. Sub-tab filters: All / Notes / Calls / Emails / Meetings / Chat / Status changes / Task completions. The composer at the bottom switches between Note / Call / Email / Meeting tabs with type-specific inputs (call → duration, email → subject). ⌘/Ctrl+Enter sends. **Press-to-talk mic** uses Whisper for voice notes — multiple dictation segments append.\n\n**Smart Panel + Open Tasks (right)** — AI brief auto-loads (or click Generate). Refresh button regenerates. Shows intent badge, going-cold risk chip, gradient win-probability bar, suggested next action. Below: Open Tasks panel with one-click complete + a Plus button that opens the Task drawer pre-scoped to this inquiry.\n\n**Header actions:**\n- **Stage changer dropdown** — picking a Won-kind stage opens the Won modal (auto-creates draft reservation); picking a Lost-kind stage opens the Lost modal (required reason picker).\n- **Draft proposal button** — purple AI button. Opens a modal with a gpt-4o-mini-drafted email subject + body grounded in the stay details + special requests. Edit, regenerate, or click \"Use as email draft\" to load it into the activity composer.",
                    ],
                    [
                        'title' => 'Reservations',
                        'content' => "CRM reservations are manually created by your team for direct bookings (separate from PMS bookings synced via Smoobu).\n\n**Statuses:** Confirmed → Checked In → Checked Out → Cancelled → No Show\n\n**Features:**\n- Link to guest profile and property\n- Room assignment, meal plan, rate per night\n- Payment status tracking\n- Special requests and notes\n- Auto-updates guest statistics on check-out (total stays, revenue)\n\nWon inquiries auto-create draft reservations when the inquiry has property + check-in + check-out set. Idempotent — clicking Won twice doesn't double-create.",
                    ],
                    [
                        'title' => 'Corporate Accounts',
                        'content' => "Manage B2B hotel clients with:\n- Company profile (industry, size, billing info, tax ID)\n- Negotiated rates and discount percentages\n- Contract dates and payment terms (Net 30, etc.)\n- Credit limits and annual room night targets — the expand panel shows a credit-utilization meter (amber@75%, red@90%) computed from confirmed-but-not-checked-out reservations\n- Contact person details\n- Performance tracking (actual vs target room nights)\n- **Linked deals tab** — every inquiry attached to this company, click-through to lead detail\n- **Renewal soon chip** — surfaces when contract_end is within 60 days\n\nUse the AI to extract corporate details from contracts or emails — paste the text and say \"extract corporate account\".",
                    ],
                    [
                        'title' => 'Tasks (first-class)',
                        'content' => "The Tasks page (`/tasks`) is your personal to-do inbox for the CRM. Status filter chips (Open / Overdue / Today / Soon / Completed / All), grouped by due-day buckets (Overdue · Today · Tomorrow · This week · Later · No due date).\n\n**Task drawer** opens from any Plus button (Tasks page, lead-detail Open Tasks panel). Type picker grid: Call · Email · Meeting · Send proposal · Follow-up · Site visit · Custom. Quick-due presets: \"In 1h\", \"Today 5pm\", \"Tomorrow 9am\", \"In 1 week\".\n\n**Browser-notification reminders** fire 5 minutes before a task's due time and again at the due moment, on every tab where the admin SPA is open. Permission opt-in via the Engagement Hub's notification banner. Marking complete writes a `task_completed` activity to the linked inquiry's timeline so the audit trail stays in sync.",
                    ],
                    [
                        'title' => 'Reports & forecasting',
                        'content' => "`/reports` is the read-only sales reporting page. Six panels:\n\n1. **Pipeline funnel** — stage-by-stage drop-off + win rate + average days to close.\n2. **Revenue forecast** — probability × value of every open deal, bucketed by month. Probability comes from the Smart Panel's `ai_win_probability` if set, otherwise the stage's `default_win_probability`, otherwise 25%.\n3. **Lost reasons** — donut chart + count/value table. Tells you where deals are leaking.\n4. **Source attribution** — per-source total / won / lost / win-rate / won-value table.\n5. **Owner scoreboard** — per-rep activities + tasks done + open / won / lost.\n6. **Top companies** — corporate accounts ranked by lifetime confirmed revenue, with credit-usage indicators.\n\nWindow selector at the top (3m / 6m / 12m). All panels recompute on selection.",
                    ],
                    [
                        'title' => 'Pipeline customization',
                        'content' => "Settings → Pipelines is the central CRM config page. Four sections:\n\n**Quick setup by industry** — One click reshapes the whole CRM (pipeline stages + lost reasons + form fields + custom fields) for your vertical. 8 presets: Hotel, Beauty/Spa, Medical/Healthcare, Legal, Real Estate, Education, Fitness, Restaurant. Switching is safe — existing inquiries migrate to the matching new stage by kind, lost-reason history is preserved.\n\n**Pipelines** — Multi-pipeline support. Each pipeline is a named sequence of stages. Most orgs need one (\"Sales\"); hotel groups running MICE / corporate sales add a second. Per-stage editor: rename, recolor, change kind (open/won/lost), set default win-probability. Move up/down arrows for reordering. Server enforces \"always one open / won / lost stage\" so the won/lost flow always has a target.\n\n**Lost reasons** — Taxonomy used by the Lost modal's reason picker. In-use reasons soft-deactivate instead of hard-deleting so the funnel report keeps historical labels.\n\n**Pipeline layout** — Toggle which fields appear on the Add Inquiry form (Check-in/out, Rooms, Inquiry type + 9 advanced fields) and which columns show in the leads list table (Stay, Value, Owner, Touches, Next task, Bulk-select). Bulk-select is hidden by default.\n\n**Custom fields** — Define your own fields per entity (Leads, Guests, Companies, Tasks). 10 field types: text, multi-line, number, date, select, multi-select, checkbox, email, phone, URL. Quick-add chips (Birthday, Allergies, Tags…) and a visual type picker with examples make it easy for non-technical users. Custom fields can be promoted to extra columns in the leads list via the \"List?\" toggle on each field row.",
                    ],
                    [
                        'title' => 'Daily Planner — overview',
                        'content' => "The Planner (`/planner`) is the org-wide ops board for daily shift work — separate from the CRM's Tasks page (`/tasks`), which is your personal sales inbox.\n\nFour views from the top tab row:\n- **Day** — timeline + task list for one date. Best for working through what's on your plate right now.\n- **Schedule** — week grid of employees × days. Best for shift planning. Tasks color by their group.\n- **Month** — calendar overview. Best for spotting workload gaps.\n- **Stats** — completion / priority / owner breakdowns over a date range.\n\nNext to the view tabs:\n- **Team filter** — show one employee's work only, or All Team.\n- **Date navigator** — ‹ / Today / › step through the active view's window.\n- **+ Add** — open the New Task drawer.\n\nUnder the view tabs, the **group filter tab bar** lets you isolate one task group (Housekeeping, Front Desk, F&B, etc.) with one click. Each tab shows the live count in the current scope.",
                    ],
                    [
                        'title' => 'Drag-and-drop scheduling',
                        'content' => "Both Schedule and Month views support drag-and-drop:\n\n**Schedule view** — grab any task chip and drop it on any other day×employee cell to reschedule + reassign in one motion. Drop on the Unassigned row at the bottom to unassign. Target cells highlight as you drag over them.\n\n**Month view** — drag tasks between day cells to move them to a different date. The destination cell glows so you see exactly where you'll land.\n\nAll moves are **optimistic** — the task jumps to the new cell instantly, no network wait. If the server rejects (e.g. server-side validation failure), the task springs back to its old place and a toast explains why.\n\nDay view is single-date so there's nothing to drag across.",
                    ],
                    [
                        'title' => 'Quick-add and the task popover',
                        'content' => "For one-off tasks you don't need the big drawer:\n\n**Inline quick-add** — hover any empty Schedule cell or click the `+` on a Month cell. A small inline input appears in place. Type the title, hit Enter, done. Fields default to that cell's date + employee. Escape or click away to cancel.\n\n**Task popover** — click any task chip in Schedule or Month and a small floating popover anchors to it. From there you can:\n- Rename (auto-saves when you blur the input)\n- Cycle priority Low → Normal → High (one click)\n- Mark done\n- Open the full edit drawer\n- Delete (with scope picker for recurring tasks)\n\nThe popover flips above the chip if it would otherwise clip off the bottom of the screen. Escape or click outside to dismiss.",
                    ],
                    [
                        'title' => 'New Task drawer',
                        'content' => "The full editor opens as a right-side drawer (same pattern as the CRM Tasks drawer). Top to bottom:\n\n**Type** — 3-column icon grid. Pick the group (Housekeeping, Front Desk, Maintenance, F&B, Events, Sales, Management, Custom). Each tile fills with its accent color when active.\n\n**Use a template** — collapsed by default. Expand to pick from the org-wide template library; tap a chip to pre-fill the whole form. Templates are configured in Settings → Planner (see separate article).\n\n**Title** — what the task is called.\n\n**Assign to** — dropdown of staff, plus Unassigned.\n\n**Priority** — three colored chips: Low (gray) / Normal (blue) / High (red).\n\n**Date** — date picker + quick chips: Today / Tomorrow / In 2 days / Next week.\n\n**Start time** — scrollable grid of 30-minute slots from 06:00 to 22:00. One tap, no fiddly time picker. Auto-fills end_time when a duration is chosen.\n\n**Duration** — quick chips for 15m / 30m / 45m / 1h / 1.5h / 2h / 4h. Picking a duration auto-fills end_time relative to the chosen start.\n\n**Repeat** — chips for No repeat / Daily / Weekly / Monthly. When you pick a repeat, a \"Repeat until\" date appears (optional — open-ended series cap at 90 instances).\n\n**Notes** — free-text description, optional.\n\nThe Status row only appears in edit mode (new tasks default to To Do).",
                    ],
                    [
                        'title' => 'Recurring tasks',
                        'content' => "Pick a Repeat option (Daily / Weekly / Monthly) on a new task and the server expands the whole series in a single save — up to 90 instances. Each child task carries a recurring badge (purple chip with a refresh icon) so you can spot a series at a glance.\n\n**Deleting a recurring task** prompts for scope:\n1. **Just this** — only the one occurrence.\n2. **All future** — this occurrence + every later one in the series.\n3. **Whole series** — every instance, past and future.\n\nStandalone tasks (not part of a series) skip the prompt.\n\nThere's no built-in \"edit all future\" yet — to bulk-edit a series, delete `all future` and create a fresh series with the new shape.",
                    ],
                    [
                        'title' => 'Settings → Planner',
                        'content' => "Settings → Planner is where you configure how the Planner shapes itself for your business. Three sections:\n\n**Quick setup by industry** — One click seeds the right task groups + a starter template library tuned to your industry. 8 presets:\n- **Hotel** — 7 groups (Front Desk, Housekeeping, F&B, Maintenance, Sales, Events, Management) + 8 starter templates (Morning briefing, Check-in prep, Room inspection, Turndown service, etc.)\n- **Beauty / Spa** — 5 groups + 6 templates (Station setup, Sterilize tools, Confirm appointments, Retail inventory, …)\n- **Medical / Healthcare** — 5 groups + 7 templates (Morning huddle, Room turnover, Patient confirmations, Lab review, Insurance claims, …)\n- **Legal / Law firm** — 5 groups + 7 templates (Client intake call, Conflict check, Case file review, Draft motion, Court filing, …)\n- **Real estate** — 5 groups + 7 templates (New listing prep, MLS update, Showing prep, Offer review, …)\n- **Education / Tutoring** — 5 groups + 7 templates (Lesson plan, Materials prep, Parent call, Grade assignments, …)\n- **Fitness / Wellness** — 5 groups + 6 templates (Equipment check, Class setup, PT session prep, Member check-in calls, …)\n- **Restaurant** — 5 groups + 7 templates (Opening checklist, Prep list, Pre-shift meeting, Bar setup, Deep clean, …)\n\nSwitching presets is **safe**. Existing tasks keep their `task_group` value even if the new preset doesn't list that group — the group just stops showing in the tab row until you re-add it. Templates with the same name as a starter are **skipped, not overwritten**, so any custom templates you've authored survive.\n\n**Task groups editor** — Add / rename / reorder / delete the groups shown as the icon-tab row in Schedule / Day / Month views. Use the up/down arrows to reorder. Renaming an in-use group renames it everywhere (existing tasks keep pointing to the same group label).\n\n**Task templates editor** — Full CRUD over the org-wide template library used in the New Task drawer's \"Use a template\" picker. Each template has: name (picker label), task title (pre-filled on the task), category (UX grouping in the picker), group, priority, default duration, description. Templates created here are immediately visible to every user in the org.",
                    ],
                    [
                        'title' => 'Daily routine',
                        'content' => "**Morning:**\n1. Open the Planner → Day view for today.\n2. Use the group filter tabs to focus on your area (Housekeeping / Front Desk / …).\n3. Mark off completed handover tasks from the night shift.\n4. Drag tomorrow's tasks into place on Schedule view if you're prepping the next day.\n\n**During shift:**\n- Mark done as you go (click the circle on any task chip, or use the popover).\n- Add ad-hoc tasks with inline quick-add from any Schedule cell.\n- Reassign by dragging a task to another employee's row.\n\n**End of shift:**\n- Review the Day view → anything not done?\n- Drag unfinished tasks forward to tomorrow.\n- Set tomorrow's priorities using High-priority pin in the popover.\n\n**Weekly:**\n- Use Schedule view to balance workload across the team — color clustering shows who's heavy in each area.\n- Check Stats view for completion rates by owner and group.",
                    ],
                ],
            ],
            [
                'slug' => 'lead-forms',
                'title' => 'Lead-Capture Forms',
                'icon' => 'FilePlus2',
                'description' => 'Build forms for your website that send submissions straight into the CRM as new inquiries. Embed via iframe — no website changes beyond a single snippet.',
                'articles' => [
                    [
                        'title' => 'What it is',
                        'content' => "An admin-built form generator that creates **public-facing lead-capture forms** (Contact us, Request a quote, Wedding inquiry, Get in touch — whatever your business needs). Each form gets a unique embed key. You paste an `<iframe>` snippet into your website. When a visitor submits, the system creates a Guest + Inquiry in your CRM automatically and fires a real-time hot-lead notification on every open admin tab.\n\n**Where to find it:** sidebar → CRM & Marketing → **Lead forms**.",
                    ],
                    [
                        'title' => 'Creating a form',
                        'content' => "1. Click **+ New form** → name it (e.g. \"Contact us\", \"Wedding inquiry\", \"Spa booking\") → confirm.\n2. The editor opens as a side drawer with three tabs: **Fields**, **Design**, **Embed**.\n\n**Fields tab:**\n- Toggle which built-in fields appear: Name, Email, Phone, Inquiry type, Date, Until, Party size, Message.\n- Per-field overrides: required flag, label, placeholder, help text.\n- **Add custom field** — your own field with any of 10 types (text, multi-line, number, date, dropdown, tag picker, yes/no, email, phone, URL). Useful for industry-specific intake (e.g. dietary preferences for a restaurant, party size for events).\n- Move up/down arrows reorder fields. Saves automatically as you toggle.\n\n**Design tab:**\n- Form title, intro paragraph, submit button text.\n- Success title + message shown after submit.\n- Primary color (native color picker) — drives the button + focus ring.\n- Theme: light or dark.\n- Corners: rounded or sharp.\n- Privacy footer toggle.\n- Defaults applied to created leads: source label, default inquiry type — auto-tags every submission so e.g. a \"Wedding inquiry\" form pre-classifies leads.\n\n**Embed tab:**\n- Direct link to share in emails, social, or SMS.\n- iframe snippet (copy button) to paste anywhere on your website's HTML.\n- Regenerate-key control if a form is being spammed (existing iframes break after regenerating — that's the point).\n- Recent submissions log with click-through to the created inquiry.",
                    ],
                    [
                        'title' => 'How submissions become leads',
                        'content' => "When a visitor fills out the form on your site:\n\n1. The browser POSTs to `/api/v1/public/lead-forms/{embed_key}/submit` (no auth required — the embed key is the gate).\n2. The server validates against the form's enabled fields (required, type, options). 422 errors render inline next to the failing field.\n3. **Find-or-create Guest:** matched by email first, then phone. Same person submitting twice doesn't create a duplicate guest.\n4. **Create Inquiry** on the org's default pipeline at the first open stage. Source = the form's default_source. Inquiry type = the form's default_inquiry_type if set, otherwise whatever the visitor picked, otherwise \"General\".\n5. **Custom fields** posted on the form go through the standard CRM custom-field validator and are stored on `inquiries.custom_data`.\n6. **Realtime hot-lead event** fires — every open admin tab gets a toast + browser notification (\"New lead: {name} via {form name}\").\n7. The form's submission counter and last_submitted_at are updated.\n\nThe new inquiry appears in `/inquiries` as a regular lead with the form's name as the source. Re-engage, qualify, win/lose it like any other.",
                    ],
                    [
                        'title' => 'Embedding on your website',
                        'content' => "**Iframe (recommended for most sites):** copy the snippet from the Embed tab and paste it anywhere in your site's HTML. The snippet looks like:\n\n```\n<iframe src=\"https://loyalty.hotel-tech.ai/form/abc123…\" width=\"100%\" height=\"700\" frameborder=\"0\" style=\"border: 0; max-width: 600px;\"></iframe>\n```\n\nWorks on plain HTML, WordPress, Webflow, Squarespace, Wix, and most landing-page builders. The iframe is responsive (max-width 600px) and inherits its container width.\n\n**Direct link:** if you'd rather link from a button or email, the public URL (`https://loyalty.hotel-tech.ai/form/{key}`) works as a standalone form page — themed, mobile-friendly, no admin chrome.\n\n**Frame-ancestors:** the form page sets `Content-Security-Policy: frame-ancestors *` so it can be embedded from any domain. No site-specific allowlist required.\n\n**Multiple forms on one site?** Yes — create as many as you want (Contact, Wedding inquiry, Spa booking, Job application). Each has its own embed URL and its own field schema.",
                    ],
                    [
                        'title' => 'Security + spam control',
                        'content' => "Forms are public — the embed key is what gates them. If a form is being spammed:\n\n1. Open the form's editor → Embed tab → **Regenerate key**. The old embed URL stops working immediately. You'll need to update any iframes to use the new key.\n2. Or click the **Power** button on the form card to disable it entirely (visitors see a \"This form is no longer accepting submissions\" message).\n\n**Built-in throttling:** 5 submissions per minute per IP. The list/config endpoint allows 200/min. Both enforced at the route level.\n\n**Submission audit trail:** every submission (including failed ones with `status=error`) is logged to `lead_form_submissions` with the raw payload, IP, user-agent, and referrer. Admins can inspect from the Embed tab's recent-submissions list.\n\n**Deferred to a future drop:** GDPR/consent checkbox enforcement, file upload, ReCaptcha integration, conditional fields (\"show X only when Y is checked\"). The schema already supports adding these without breaking existing forms.",
                    ],
                ],
            ],
            [
                'slug' => 'loyalty',
                'title' => 'Loyalty Program',
                'icon' => 'Star',
                'description' => 'Tiered membership system with points, offers, benefits, and member engagement tools.',
                'articles' => [
                    [
                        'title' => 'Tier System',
                        'content' => "Five tiers with increasing benefits:\n\n| Tier | Points Threshold | Earn Multiplier |\n|------|-----------------|----------------|\n| Bronze | 0 | 1x |\n| Silver | 1,000 | 1.25x |\n| Gold | 5,000 | 1.5x |\n| Platinum | 15,000 | 2x |\n| Diamond | 50,000 | 3x |\n\nTier thresholds, multipliers, and benefits are fully configurable in Settings > Loyalty.\n\n**Qualification Windows:** Calendar year, anniversary year, or rolling 12 months. Members are assessed for tier upgrades/downgrades based on the chosen window.",
                    ],
                    [
                        'title' => 'Points System',
                        'content' => "Points are tracked in a double-entry ledger (never deleted, only reversed).\n\n**Transaction Types:**\n- **Earn** — From stays, purchases, promotions\n- **Redeem** — Spending points on rewards\n- **Bonus** — Promotional awards, sign-up bonuses\n- **Adjust** — Manual corrections by admin\n- **Reverse** — Undo a previous transaction\n- **Expire** — Automatic expiry based on rules\n\n**Awarding Points via AI:** Tell the AI chat \"award 500 points to [member name] for [reason]\" — it will find the member and process the transaction.\n\n**Important:** Never delete point transactions. Use the reverse type to undo errors.",
                    ],
                    [
                        'title' => 'Special Offers & Benefits',
                        'content' => "**Special Offers:**\n- Create promotional offers targeting specific tiers\n- Set date ranges for availability\n- Points cost for redemption\n- AI can generate personalized offers based on member behavior\n\n**Tier Benefits:**\n- Define benefits per tier (late checkout, room upgrade, welcome amenity, lounge access, etc.)\n- Benefits are automatically assigned when members reach a tier\n- Track entitlement usage\n\n**AI-Generated Offers:** On the AI Insights page, select a member and click \"Generate Offer\" — the AI analyzes their spending patterns and creates a tailored promotion.",
                    ],
                    [
                        'title' => 'Member Cards (QR & NFC)',
                        'content' => "Members can be identified via:\n\n**QR Codes** — Generated automatically for each member. Scan from the Scan page using the device camera.\n\n**NFC Cards** — Physical cards linked to member profiles. Issue cards from the NFC management page, then tap to scan.\n\n**Mobile App** — Members can view their QR code, points balance, tier status, and available offers in the mobile app (React Native / Expo).",
                    ],
                    [
                        'title' => 'Enrolling Members (Welcome Email Flow)',
                        'content' => "When you create a member from the admin (Members → Add Member), you no longer set a password for them. Instead:\n\n1. Enter name, email, phone and tier. No password field.\n2. On save, the backend generates a random password the admin never sees, creates a 6-digit setup code valid 48h, and emails the member a branded welcome email with their member number + setup code.\n3. The member downloads the app, taps **Forgot password**, enters their email and the code, and sets their own password.\n4. Welcome bonus points (default 500, configurable in Settings) are awarded inside the creation transaction — if the award fails the whole creation is rolled back so you never get a 0-point ghost member.\n\n**If the email didn't arrive:** open the member's detail page and click **Resend Welcome Email** (admin only). Generates a fresh 48h code and re-sends.\n\n**Security note:** Admins cannot log in as members. The random temp password is never returned in any API response.",
                    ],
                    [
                        'title' => 'Member Duplicates & Merge',
                        'content' => "Over time the same person can end up with multiple member records — collected via different channels (web form, mobile app, manual entry, chatbot lead capture). The Duplicates page surfaces likely matches and lets staff merge them safely.\n\n**How matching works:**\n- Email match (case-insensitive)\n- Normalized phone match (digits-only)\n- Fuzzy name + DOB match\n- Each candidate pair gets a confidence score\n\n**Merge workflow:**\n1. Open Members → Duplicates\n2. Click \"Review & Merge\" on a pair\n3. Side-by-side preview of both profiles + merge target\n4. Choose which fields to keep from each side\n5. Confirm — points ledger entries, bookings, inquiries, loyalty history all reattach to the surviving record. The losing record is soft-deleted with an audit log entry.\n\n**Best practice:** Run the duplicates check weekly. Always merge into the older record (more history) unless the newer one has materially better data.",
                    ],
                    [
                        'title' => 'Sidebar consolidation — 11 pages → 4 hubs',
                        'content' => "**As of May 2026** the Members & Loyalty section of the sidebar collapsed from 11 entries into 4 tabbed hubs. Less overwhelming, same features.\n\n**The 4 hubs and what's inside each:**\n\n- **Members** — List · Duplicates · Segments\n- **Program** — Tiers · Benefits · Boost events (earn-rate)\n- **Rewards** — Catalog · Offers · Referrals\n- **Campaigns** — Email · Send history\n\nEach hub uses URL `?tab=` for deep links, so bookmarking `/program?tab=benefits` lands you back on that exact tab. Legacy URLs (`/tiers`, `/offers`, `/segments`, `/email-campaigns`, etc.) redirect to the right hub + tab automatically — old bookmarks still work.\n\n**Wallet passes** (Apple + Google) was removed from the sidebar — it's now accessed from Settings → Loyalty as a manage-page link.",
                    ],
                    [
                        'title' => 'Members list — KPIs, tier pills, hover actions',
                        'content' => "**As of May 2026** the Members list is a KPI-first layout with modern filtering and inline actions.\n\n**KPI strip (top):**\n- Active members (X of total)\n- New this month\n- Average points balance\n- Top tier % (proportion of members in the highest tier)\n\n**Filters below KPIs:**\n- **Tier pills** with live counts (replaces the old Tier dropdown). Click \"All tiers\" to clear.\n- **Status segmented toggle** (All / Active / Inactive) instead of a dropdown.\n- **Sort dropdown** — Recently joined / Points high → low / Name A→Z / Last activity. Sort + filters persist in the URL.\n\n**Per-row hover actions** appear on the right of each row:\n- **Gift icon** — quick award modal. +100/+250/+500/+1000 chips for fast amounts, optional reason. Posts to the standard award endpoint. No need to open the detail page for routine point gifts.\n- **Message icon** — selects just that member and opens the bulk-message flow (so it's a 1-of-1 send).\n\nBulk actions (page checkbox + multi-select) and the floating bulk-action bar are unchanged.",
                    ],
                    [
                        'title' => 'Member detail — tabs, kebab menu, unified points',
                        'content' => "**As of May 2026** the Member detail page (`/members/{id}`) has a compact hero header and tabbed content.\n\n**Hero:** avatar + name + tier badge + active/inactive pill + email · member# + contact actions on top; a primary-gold **Current Points** number as the headline stat with Lifetime / Stays / Total spent / Member since beneath.\n\n**Header actions (right):** Request review · AI Analysis · `⋯` kebab menu. The kebab hides destructive actions until needed:\n- Edit info (opens the Settings tab in edit mode)\n- Resend welcome email\n- Deactivate / Reactivate\n- Delete permanently\n\n**Tabs (deep-linkable via `?tab=`):**\n- **Overview** — Recent activity (top 5 transactions) + AI Insights panel (when triggered). Right column: QR code + Unified Adjust Points panel.\n- **Transactions** — full points ledger\n- **Journey** — chronological merge of CRM activities, inquiries, reservations, and stays (only shows when a linked CRM guest exists)\n- **CRM Profile** — full linked-guest detail (only shows when linked)\n- **Settings** — Edit form (avatar, name, contact, tier, tier-override-until, active toggle) + Danger zone (Delete permanently)\n\n**Unified Adjust Points panel** replaces the old two Award + Redeem cards. One form with an Award/Redeem segmented toggle and quick-amount chips (+100/+250/+500/+1000). Reason is optional.",
                    ],
                ],
            ],
            [
                'slug' => 'live-chat',
                'title' => 'Live Chat & Visitor Tracking',
                'icon' => 'MessageCircle',
                'description' => 'Embeddable website chat widget, persistent visitor identity tracking, live agent inbox, canned replies, popup rules, knowledge base, and AI fine-tuning.',
                'articles' => [
                    [
                        'title' => 'Chat Widget on Customer Website',
                        'content' => "The chat widget is a single-script embed that customers paste into their website to get an AI chatbot + live agent escalation in one place.\n\n**Setup:**\n1. Settings > Chat Widget — configure appearance (colors, position, launcher shape, icon), welcome message, and lead capture fields.\n2. Copy the embed snippet and paste it into the customer website's HTML before `</body>`.\n3. The widget loads asynchronously and authenticates via a per-organization widget key.\n\n**Important:** All asset URLs (avatar, brand logo) returned to the widget are absolute. The widget runs on the customer's domain, so relative paths would 404 against their site instead of the loyalty backend.\n\n**Voice mode:** Optional voice-to-voice agent powered by OpenAI Realtime API. Toggle in Settings > Chat Widget > Voice Agent.\n\n**Booking Integration:** The chatbot automatically detects when visitors ask about rooms, availability, or pricing. It injects the room catalog and live availability data into the AI context, enabling the chatbot to:\n- Recommend specific rooms with visual cards (image, price, amenities, Book Now button)\n- Show live availability for requested dates\n- Generate booking links that open the booking widget with pre-filled dates and room selection\n\nThe widget also exposes public endpoints for rooms catalog (`GET /v1/widget/{key}/rooms`), availability checks (`GET /v1/widget/{key}/availability`), and calendar pricing (`GET /v1/widget/{key}/calendar-prices`). Set `booking_widget_url` in Hotel Settings to configure where Book Now buttons link to.",
                    ],
                    [
                        'title' => 'Live Visitors (now in the Engagement Hub)',
                        'content' => "**As of 2026-05-10, the Live Visitors page lives inside the Engagement Hub at `/engagement`.** The old `/visitors` URL still works (it aliases to Engagement). The unified page replaces the old split between Inbox and Visitors with a single feed sorted by smart priority.\n\nPersistent visitor identity is unchanged — each browser still gets a `visitor_id` cookie on first chat-widget load and the visitor record persists across sessions, IP changes, and devices. Each row stores display name, online/offline state, email/phone (when captured), IP/country/city, current page + page-view history, visit/page-view/message counts, and the linked guest profile + lead status.\n\nUse the \"Online\" filter chip on `/engagement` to see who's on the site right now. The smart-priority default already surfaces online visitors above offline ones, so you usually don't need to filter at all.\n\nSee the **Engagement Hub** section in this documentation for the full feature surface — drawer with Profile/Chat/AI brief/Journey/Notes tabs, hot-lead detection, intent classification, daily summary email, and the live-wall fullscreen mode.",
                    ],
                    [
                        'title' => 'Chat Inbox (now in the Engagement Hub)',
                        'content' => "**As of 2026-05-10, the Chat Inbox lives inside the Engagement Hub at `/engagement`.** The old `/inbox` URL still works (it aliases to Engagement). The legacy two-pane inbox is preserved at `/chat-inbox` only as an escape hatch for power users; new work flows through the Engagement Hub drawer.\n\nVisitor dedup, AI auto-reply when unassigned, agent take-over, file attachments, canned replies, and inquiry conversion all still work — they're now driven from the slide-in drawer that opens when you click any row in `/engagement`. The drawer's Conversation tab is the new single message-thread surface.\n\n**Quick-action buttons in the drawer footer:**\n- Take over from AI ↔ Re-enable AI\n- Resolve ↔ Reopen\n- Add to CRM (capture lead — only when contact is known and no guest is linked yet)\n- Start chat (for online visitors who don't have a conversation yet)\n- Open full inbox (escape-hatch link to `/chat-inbox` for legacy two-pane workflow)\n\nSee the **Engagement Hub** documentation section for the full feature set.",
                    ],
                    [
                        'title' => 'Knowledge Base',
                        'content' => "The chatbot answers customer questions using a knowledge base scoped to the organization.\n\n**Three content types:**\n1. **FAQ items** — Question/answer pairs organized in categories. Each item has a priority and use-count metric.\n2. **Categories** — Grouping for FAQ items (e.g. Rooms, Booking, Amenities, Cancellation Policy).\n3. **Documents** — Upload PDF/DOCX/TXT files. The system extracts text and chunks it for semantic context injection.\n\n**How it's used:** On every chatbot turn, the KnowledgeService runs an ILIKE search over questions, answers, keywords, and document chunks. The top results are injected into the system prompt as context before the LLM call.\n\n**Best practice:** Keep FAQ items short and specific. Long documents should be broken up. Mark frequently-used answers as high priority so they win ranking ties.",
                    ],
                    [
                        'title' => 'Chatbot Config & Behavior',
                        'content' => "Two configuration scopes per organization:\n\n**Behavior Config (AI Chat > Chatbot Config > Behavior tab):**\n- Assistant name + avatar\n- Identity/persona (\"You are Anna, the friendly concierge for...\")\n- Goal (booking, lead capture, support, info)\n- Sales style (consultative, soft-sell, hard-sell, info-only)\n- Tone (friendly, formal, playful, professional)\n- Reply length (short / medium / long)\n- Language (en/de/es/fr/it/...)\n- Core rules — array of \"always do this, never do that\" rules injected into the system prompt\n- Escalation policy — when to hand off to a human\n- Fallback message — shown when the AI can't answer\n- Custom instructions\n\n**Model Config (Model Settings tab):**\n- Provider (openai / anthropic / google)\n- Model name\n- Temperature, top_p, max_tokens\n- Frequency + presence penalties\n- Stop sequences\n\n**Chatbot Setup wizard:** A guided multi-step setup for new orgs that walks through avatar upload, behavior, knowledge base seeding, and embed code.",
                    ],
                    [
                        'title' => 'Popup Automation Rules',
                        'content' => "Popup rules let you proactively engage visitors based on their behavior. Each rule is a trigger + message + audience filter.\n\n**Trigger types:**\n- Time on page (e.g. show after 30s)\n- Scroll depth (e.g. show after 50%)\n- Exit intent (mouse leaves toward browser chrome)\n- Specific URL match (only on /pricing)\n- Returning visitor\n\n**Example uses:**\n- \"Need help choosing a room?\" after 30s on rooms page\n- \"Wait! Get 10% off if you book now\" on exit intent on the booking page\n- \"Welcome back! Your last quote is still valid.\" for returning visitors\n\n**Best practice:** Don't fire more than one popup per session. Test on a staging URL before going live.",
                    ],
                    [
                        'title' => 'Training (Fine-Tuning)',
                        'content' => "The Training page lets you fine-tune an OpenAI model on the organization's own conversation history and FAQ data, producing a model that responds in the hotel's voice and knows its specifics out of the box.\n\n**Workflow:**\n1. Select source conversations (graded high-quality only) and FAQ items\n2. The system generates a JSONL training file in the OpenAI fine-tune format\n3. Upload to OpenAI and start a fine-tune job\n4. Monitor job status (queued → running → succeeded/failed)\n5. On success, the new model ID is saved and can be selected in Chatbot Config > Model Settings\n\n**Cost:** Fine-tuning is billed per token by OpenAI. Start with a small dataset (50-200 examples).\n\n**When to use:** Only after you've exhausted prompt engineering + knowledge base. Fine-tuning is for tone/style, not for facts (use the knowledge base for facts).",
                    ],
                    [
                        'title' => 'Canned Replies',
                        'content' => "Canned replies are pre-written messages agents can insert into the chat thread with one click. Stored per organization.\n\n**Each canned reply has:**\n- Title (what the agent searches for)\n- Body (the actual message, supports placeholders like `{guest_name}`)\n- Category tag\n\n**Use in Chat Inbox:** Type `/` in the message box to open the canned-reply picker, or click the ⚡ icon.\n\n**Best practice:** Build a library covering greetings, common policy answers, booking confirmations, and escalation hand-offs. Update them when policies change.",
                    ],
                ],
            ],
            [
                'slug' => 'engagement-hub',
                'title' => 'Engagement Hub',
                'icon' => 'Sparkles',
                'description' => 'Unified replacement for the old Inbox + Visitors split. One feed, smart-priority sorted, with hot-lead detection, AI brief, intent tagging, browser-push alerts, fullscreen live-wall mode and an opt-in daily summary email.',
                'articles' => [
                    [
                        'title' => 'What changed and why',
                        'content' => "Before 2026-05, agents had two separate pages: **Inbox** (chat conversations) and **Visitors** (online/offline visitor list). With 500+ rows in either one, the agent had no way to spot the few rows that needed attention right now — anonymous offline browsers and a hot lead actively typing on the booking page looked identical in the list.\n\nThe Engagement Hub at `/engagement` collapses both pages into one feed and adds a smart-priority sort that surfaces the rows that matter at the top automatically. Agents never have to scroll or pick filters to find what's important.\n\n**The smart-priority signal weights:**\n- Online + unread visitor message — score 1000\n- Online + active AI chat — score 700\n- Online + has captured contact — score 500\n- Has captured contact + last seen ≤ 1h — score 300\n- Online + anonymous — score 100\n- +200 boost when a conversation has been waiting > 5 min for a human reply\n- +250 boost on hot leads (so hot leads always rise above ordinary leads)\n- +50 lift for any 24h activity\n\nThe smart-priority filter (default) hides pure-anonymous offline browsers — they're still reachable via the \"Anonymous\" filter chip. Single-brand orgs and orgs with low chat volume see no friction.\n\nThe old `/inbox` and `/visitors` URLs alias to `/engagement` so bookmarks survive. The legacy two-pane Chat Inbox lives on at `/chat-inbox` for power users who prefer it.",
                    ],
                    [
                        'title' => 'KPI cards + filter chips',
                        'content' => "Four KPI cards across the top of `/engagement`, each clickable to filter the feed:\n\n- **Online now** — visitors with last_seen_at in the last 90 seconds. Detail line shows active chat count.\n- **Leads** — total captured contacts (email or phone). Detail line shows leads in the last hour.\n- **Unanswered** — active conversations with no agent assigned and AI off. Detail: \"awaiting human reply\".\n- **AI handled today** — conversations resolved without a human (status=resolved, ai_enabled=true, assigned_to is null). Detail: AI resolution rate %.\n\nUnder the cards, two rows of filter chips:\n\n- Row 1 (state): **Priority** (default) / Online / Has contact / Active chat / Hot leads / Anonymous / Resolved\n- Row 2 (intent — only shown after AI tagging starts kicking in): **Booking inquiry** / Info / Complaint / Cancellation / Support\n\nSearch box accepts name, email, phone, IP, city, or current page.\n\nKPI cards refresh every 15s, the feed every 5s. Both auto-pause when the browser tab is hidden so quota stays flat for unfocused tabs.",
                    ],
                    [
                        'title' => 'Hot-lead detection',
                        'content' => "A **hot lead** is a row with captured contact AND at least one strong buying signal:\n\n- Currently online, OR\n- Viewing `/book*`, `/rooms*`, or `/services*`, OR\n- Has an active or waiting conversation, OR\n- Returning visitor (visit_count ≥ 2), OR\n- 3+ messages exchanged, OR\n- Conversation intent_tag = `booking_inquiry`.\n\nHot leads get a pulsing orange \"HOT\" pill on the row, +250 priority boost (so they sit above ordinary leads even when offline), and trigger an arrival alert when they newly cross the threshold.\n\n**Two arrival-alert paths:**\n1. **Page-local** (when you're already on `/engagement`) — diff between feed snapshots detects newly-hot ids, fires an in-app toast + browser notification (when permission granted).\n2. **Cross-page** (when you're on the dashboard, reservations, or anywhere else in admin) — three backend lead-capture flows (admin manual capture, widget lead form, AI auto-extracts email/phone from chat message) dispatch a `hot_lead` realtime event that the global poll picks up and turns into a clickable orange toast + browser notification. Click → /engagement loads with the row visible.\n\nThe rule-based detection has zero OpenAI cost. Tune which signals count by editing `EngagementFeedService::scoreHotLead()`.",
                    ],
                    [
                        'title' => 'Detail drawer (Profile / Chat / AI brief / Journey / Notes)',
                        'content' => "Click any row → slide-in drawer from the right. 600px on desktop, full screen on mobile. Esc or X to close.\n\n**Tabs:**\n- **Profile** — email, phone, country/city, IP, first/last seen, visit/page/message counts, source URL, linked CRM guest card with link.\n- **Chat** — full message thread with visitor/AI/agent/system bubble styling, auto-scroll on new messages. Composer at the bottom (⌘/Ctrl+Enter to send) — disabled while AI is on, with a hint to take over first.\n- **AI brief** *(generated on demand)* — a 2-3 sentence summary aimed at the agent who's about to reply. Shows the intent classification badge (booking_inquiry / info_request / complaint / cancellation / support / spam / other) + a generated/cached timestamp + Regenerate button. Only fires the OpenAI call when the tab is opened (lazy), and caches on the conversation row for 5 min so re-opens are free.\n- **Journey** — numbered timeline of pages the visitor has viewed.\n- **Notes** — agent-private notes textarea with Save button. Stored in `chat_conversations.agent_notes`.\n\n**Quick-action bar at the bottom** (changes based on state):\n- **Take over from AI ↔ Re-enable AI** — flips `ai_enabled` on the conversation\n- **Resolve ↔ Reopen** — flips status\n- **Add to CRM** — captures the lead (creates Guest + Inquiry, links to visitor). Only shown when contact is known + no Guest linked yet.\n- **Start chat** — only for online visitors with no conversation yet. Creates one and re-opens the drawer focused on it.\n- **Open full inbox** — escape-hatch link to `/chat-inbox?id=N` for the legacy detail screen.\n\nThe drawer auto-polls every 5s for the conversation, 8s for the visitor. Mutations invalidate the background feed so the row in the list reflects the new state without a manual refresh.",
                    ],
                    [
                        'title' => 'Intent classification + AI brief',
                        'content' => "When you open the AI brief tab on a conversation that has at least 3 messages, a single OpenAI call (`gpt-4o-mini`, JSON response_format, deterministic temperature 0.2) returns:\n\n1. A **2-3 sentence brief** for the agent — written like \"who is this person, what do they want, what's the suggested next action\". Plain prose, no greetings, no bullet lists.\n2. An **intent tag** — one of: booking_inquiry, info_request, complaint, cancellation, support, spam, other.\n\nBoth are cached on the conversation row (`ai_brief`, `ai_brief_at`, `intent_tag`) for 5 minutes. The intent badge surfaces on the row in the list (small coloured chip with an icon) and powers the intent filter chips below the main filter row.\n\n**Failure mode:** If OpenAI is unreachable, the drawer still loads. The AI brief tab shows \"Could not generate AI brief — try again in a moment\" with the cached intent tag (if any) still visible. Nothing blocks.\n\n**Cost:** ~600 input tokens + ~200 output tokens per call ≈ \$0.0002. 5,000 brief generations cost about \$1. Cached for 5 min so a single conversation costs the same even if 10 agents view it. No auto-classification — only fires when the agent opens the tab.\n\nIntent values that don't match the canonical seven are normalised to `other` before persistence. The single source of truth for the labels + colours + icons is `frontend/src/lib/intentMeta.ts`.",
                    ],
                    [
                        'title' => 'Browser notifications + the alerts banner',
                        'content' => "On first visit to `/engagement`, an amber banner above the KPI strip asks for browser-notification permission. Click \"Enable\" → the browser prompt appears → click Allow. After granting, the banner is replaced by a small green \"Alerts on\" chip in the page header.\n\n**What triggers a browser notification:**\n- A visitor newly crosses the hot-lead threshold while you're on `/engagement` (page-local diff detection)\n- A `hot_lead` realtime event fires while you're on any admin page (cross-page server-push from the three lead-capture flows)\n\nNotifications use `tag: hot-lead-{visitor_id}` so duplicate alerts collapse rather than stacking. Auto-close after 8s. Click on the OS notification → focuses the tab + navigates to `/engagement`.\n\n**Other event types** (arrival, departure, inquiry, points, member, reservation) only fire in-app toasts, not browser notifications. The set is in `useRealtimeEvents.tsx` → `BROWSER_NOTIFY_TYPES`. Easy to extend if you want a different event type to also escalate.\n\n**If notifications are blocked:** The chip turns red — you'll need to re-enable them in your browser's site settings. Most browsers hide the toggle a few clicks deep (Site Settings → Notifications → loyalty.hotel-tech.ai → Allow).\n\n**Privacy:** No payload data leaves the browser. The Notification API is fired locally from the realtime event the SPA already polled — nothing is sent to a third-party push service.",
                    ],
                    [
                        'title' => 'Live-wall fullscreen mode',
                        'content' => "**Use case:** Cast onto a TV or back-office monitor at the concierge desk so the front-office team gets ambient awareness of who's on the site right now.\n\nClick **\"Live wall\"** in the `/engagement` page header → opens `/engagement/live` in fullscreen mode. The page renders **without** the admin sidebar/header chrome — just big numbers and a grid of online-visitor tiles.\n\n**What's on screen:**\n- 4 big KPI tiles at the top with bigger typography optimised for monitor readability (Online now / Leads / Unanswered / AI handled today)\n- Grid of online-visitor tiles, each showing: avatar, name/IP, country flag, contact icons, lead/hot/intent badges, current page, visit/page/message counts, city\n- Newly-online rows fade in with a gold accent ring + scale bump for ~3s — easy to spot in peripheral vision\n- Auto-refresh every 5s (KPIs every 10s), no manual controls\n\n**Exit:** Press **Esc** or **Q**, or click the small \"Exit\" button top-right. Returns to `/engagement`.\n\n**Display tip:** Open the URL in fullscreen browser mode (F11 in Chrome/Edge/Firefox, Cmd+Ctrl+F in Safari) on the monitor's computer. The dark gradient background blends with most office decor.",
                    ],
                    [
                        'title' => 'Daily summary email',
                        'content' => "An optional morning email at 8am org-local time gives a single pulse on yesterday's engagement performance — useful for GMs and managers who want the headline numbers without opening the dashboard.\n\n**Opt in:** On `/engagement`, click the **\"Daily email\"** chip in the page header. It turns blue when on, outlined when off. Per-user — each staff member chooses independently.\n\n**What's in the email:**\n- Hot leads captured yesterday + total CRM leads\n- Conversations the AI handled (resolved, no human assigned) + AI resolution rate %\n- Currently unanswered count + top 5 by waiting age\n- Booking-page visitors yesterday who left without leaving contact info (\"missed conversions\")\n- CTA back to `/engagement`\n\n**Send timing:** 8am in the org's configured timezone. Hourly cron (`engagement:send-daily-summary`) gates each user on their org's local clock and dedupes via `users.daily_summary_last_sent_at`.\n\n**Test from the server:**\n```bash\nphp artisan engagement:send-daily-summary --force --user=YOUR_USER_ID\n```\nThe `--force` flag bypasses the time + dedupe checks. `--hour=N` overrides the send hour (0-23) for testing alternate timings.\n\n**If you stop receiving emails:** Check the chip is still blue on `/engagement`. Production cron worker must be running (verify with `php artisan schedule:list`).",
                    ],
                ],
            ],
            [
                'slug' => 'booking-engine',
                'title' => 'Booking Engine',
                'icon' => 'Calendar',
                'description' => 'PMS integration, calendar management, payment tracking, and public booking widget.',
                'articles' => [
                    [
                        'title' => 'PMS Integration (Smoobu)',
                        'content' => "The booking engine syncs with Smoobu for real-time booking data:\n- Automatic sync via webhooks (booking created/modified/cancelled)\n- 5-minute backup cron (`bookings:sync-pms`) that pulls a full window — durability backstop in case a webhook is dropped\n- Tracks: guest info, dates, units, pricing, payment status, channel\n\n**Setup:** Add your Smoobu API key in Settings > Integrations. The key is encrypted at rest in the database.\n\n**Webhook URL — must include `?org=` token:**\n\n```\nhttps://your-domain/api/v1/booking/webhooks/smoobu?org={your_widget_token}\n```\n\nYour widget token is in Settings > Booking (it's the same one in your booking-widget embed code). Configure that URL in your Smoobu account's webhook settings. The backend looks up your org from the token, then verifies the webhook signature against YOUR org's `booking_smoobu_webhook_secret` — so each customer's webhook is isolated even though we all hit the same endpoint.\n\nWebhook replay protection: every delivery is deduped by a SHA-256 hash of the canonicalised body — if Smoobu re-sends the same event (their retry, or a malicious replay), the second one is a 200 no-op.\n\n**Two Booking Systems:** PMS Bookings (from Smoobu/channels) and CRM Reservations (manual) are separate. AI knows the difference — specify which one when asking.",
                    ],
                    [
                        'title' => 'PMS Dashboard & Calendar',
                        'content' => "**Dashboard KPIs:**\n- Total bookings, revenue, confirmed/cancelled counts\n- Average stay duration, outstanding balance\n- Payment mix (paid vs pending vs open)\n- Channel distribution, unit performance\n\n**Calendar View:** Visual timeline of all bookings across units. Color-coded by status. Great for occupancy overview.\n\n**Payment Tracking:** Monitor paid vs outstanding. Filter by status. Follow up on unpaid bookings.\n\n**Calendar sold-out indicator (public widget):** The date picker grays out days where every room is sold out per Smoobu's daily-rate data. Days with no Smoobu data fall back to base price + count as available — orgs that haven't fully wired the PMS won't see false sold-outs.",
                    ],
                    [
                        'title' => 'Public Booking Widget',
                        'content' => "Configure a booking widget for your hotel website:\n\n**Settings > Booking:**\n- Define rooms/units with capacity, pricing, images\n- Add extras/add-ons (breakfast, airport transfer, etc.)\n- Set policies (cancellation, check-in/out times)\n- Configure pricing rules\n- Toggle **Online Payment** (Stripe) and **Mock Mode** (test the flow without real charges or emails)\n\nThe widget generates a public booking form that guests can use to submit reservation requests. Submissions are logged and can be reviewed in the admin panel.\n\n**Hold tokens:** When a guest goes through Quote → Payment, we hold the inventory for 10 minutes. The hold auto-extends to 15 minutes when the PaymentIntent is created so slow guests on the Stripe Elements screen don't lose their cart.\n\n**Embed:** Get the embed code from Settings > Booking and add it to your website.",
                    ],
                    [
                        'title' => 'Stripe Payments (per-org configuration)',
                        'content' => "Each customer uses their **own** Stripe account — no platform fallback. Configure in Settings > Integrations:\n- **Stripe Publishable Key** — shown to the guest's browser, used by Payment Element\n- **Stripe Secret Key** — server-side, encrypted at rest in the database\n- **Stripe Webhook Secret** — encrypted at rest, used to verify Stripe webhook signatures\n- **Stripe Currency** — must match your `booking_currency` (the widget refuses to enable payment if they differ to prevent a guest seeing €500 in the widget and getting billed $500)\n\n**Webhook URL:** point Stripe Dashboard → Developers → Webhooks at\n\n```\nhttps://your-domain/api/v1/booking/webhooks/stripe\n```\n\n**Events to subscribe to:**\n- `payment_intent.succeeded`\n- `payment_intent.payment_failed`\n- `charge.refunded` (so refunds issued in Stripe Dashboard sync our payment_status)\n- `charge.dispute.created` (flags the booking as disputed)\n- `charge.dispute.closed` (lost → full refund + points reversal; won → restored)\n\nCopy the webhook signing secret back into Settings > Integrations > Stripe Webhook Secret.\n\n**Testing:** flip **Mock Mode** ON in Settings > Booking to dry-run the full flow without Stripe. Bookings get `payment_method='mock'` and `payment_status='paid'`. No real charge. No emails sent. Easy to spot in the admin booking list with the amber 'Mock' banner on the detail page.",
                    ],
                    [
                        'title' => 'Refunds',
                        'content' => "**Issue a refund** from the booking detail page: open any paid booking → Financial Overview → Stripe payment panel → **Issue refund** button. Choose full or partial amount + an optional reason (Customer request / Duplicate / Fraudulent).\n\n**What happens on a refund:**\n1. Stripe processes the refund (5–10 business days to land on guest's card)\n2. BookingMirror `payment_status` flips to `refunded` or `partially_refunded`\n3. **Loyalty points reversed** — every PointsTransaction this booking earned is reverse-transacted (the member's balance goes back down)\n4. **Smoobu reservation cancelled** automatically (best-effort — if your booking was created via Airbnb / Booking.com etc., Smoobu won't let us cancel via API and the audit log will say 'cancel manually in Smoobu')\n5. **Guest receives a refund confirmation email** with amount + reference + 5–10 business days timeline\n\nMock bookings short-circuit: no Stripe call, just flips status. Refund button still works for testing.\n\n**Disputes (chargebacks):** When a guest disputes a charge with their bank, Stripe sends us `charge.dispute.created`. We flag the booking `payment_status='disputed'` and show a red banner — **DO NOT auto-refund**, reply to the dispute via Stripe Dashboard first. If you lose the dispute, Stripe sends `charge.dispute.closed status=lost` and we auto-process the refund (points reversed, Smoobu cancelled, guest emailed). If you win, the booking goes back to `paid` automatically.\n\n**Why does `paid → pending` get rejected?** The `payment_status` field has a state machine: you can't manually flip a paid booking back to pending — that would silently strand money. The 422 response will tell you to use the Refund button instead.",
                    ],
                ],
            ],
            [
                'slug' => 'reviews',
                'title' => 'Reviews & Feedback',
                'icon' => 'Star',
                'description' => 'Capture guest feedback via basic star ratings or custom questionnaires, funnel happy guests to public review platforms, and automate post-stay invitations.',
                'articles' => [
                    [
                        'title' => 'Form Types',
                        'content' => "Two form types, each with its own use case:\n\n**Basic (rating + comment)** — Single star rating (1–5) plus optional comment. Designed for the *threshold-redirect* mechanic: configure `redirect_threshold` (e.g. 4★) and when a guest rates at or above it, the thank-you screen surfaces buttons linking to your Google / TripAdvisor / Trustpilot review page. Ratings below the threshold stop at the thank-you message — negative feedback stays internal. Redirect URLs are set in Reviews > Integrations.\n\n**Custom (admin-built questionnaire)** — Use the form builder to assemble any mix of: Short text, Long text, Star rating, Scale (1-10), NPS (0-10), Single choice, Multi choice, Yes/No. Drag to reorder. Mark required. Each question carries a `weight` used in overall rating calculations. No threshold-redirect on custom forms — treat them as internal surveys.\n\nEach org can have many forms; one form per type is marked the default (used for auto post-stay invitations unless overridden).",
                    ],
                    [
                        'title' => 'Delivery Channels',
                        'content' => "Every form has a **per-org embed key** (rotatable from the form builder). The public URL is `{app_url}/review/{form_id}?key={embed_key}` — paste the full link anywhere, email it, print it on a card, or wrap it in an iframe on your own site (the backend sets `X-Frame-Options: ALLOWALL` and `frame-ancestors *` so embedding works cross-origin).\n\n**Token invitations** — When you send an invitation, the guest receives a unique one-time link `{app_url}/review/t/{token}`. Token-based links track open and submit events in the invitation funnel. Expire after 30 days by default.\n\n**Rotating the embed key** invalidates every existing shared link (not invitation tokens). Use sparingly — only if a key leaked or the form is being repurposed.",
                    ],
                    [
                        'title' => 'Sending Invitations',
                        'content' => "Three ways to send a review invitation:\n\n**1. One-off from a member/guest/booking** — Member detail, Guest detail, and Booking detail pages each have a *Send review* button. Opens a modal, pick which form, optionally override the subject line. Logged as a manual invitation.\n\n**2. Ad-hoc email address** — From Reviews > Invitations, send to any email (useful for 3rd party contacts without a profile).\n\n**3. Automatic post-stay sweep** — In the form builder, enable *Auto-send after guest checkout* and pick a delay (1, 2, 3, 5, 7, or 14 days). The scheduler (`reviews:send-post-stay`, runs daily at 09:00) finds bookings whose `departure_date` is exactly `delay_days` ago, excludes cancelled bookings, dedups via `metadata.booking_id` on existing invitations, and sends. Runs per-form, so different forms can use different delays.\n\n**Dry-run:** `php artisan reviews:send-post-stay --dry-run` previews what would send without actually sending.",
                    ],
                    [
                        'title' => 'Invitation Funnel & Analytics',
                        'content' => "**Reviews > Invitations** shows the full delivery funnel:\n\n- **Sent** — invitation row created + email dispatched\n- **Opened** — recipient clicked the link (token GET tracked)\n- **Submitted** — guest completed the form\n- **Redirected** — guest clicked through to Google / TripAdvisor / Trustpilot (basic forms over threshold)\n- **Failed** — email send threw an exception (error in `metadata.error`)\n\nFilter by status, form, channel (email/manual), and date range. Click any row to jump to the submission if one exists.\n\n**Reviews > Submissions** lists all responses — for basic forms, sorts by star rating; for custom forms, shows computed overall rating from weighted answers. NPS forms show promoter / passive / detractor split.",
                    ],
                    [
                        'title' => 'Kiosk Mode & iframe Embedding',
                        'content' => "**Kiosk mode** — Append `?mode=kiosk` to any form URL (`/review/{form_id}?key={embed_key}&mode=kiosk`). The form stays fullscreen, auto-resets 12 seconds after submission, and disables back-navigation. Designed for a reception iPad where guests tap once and walk away. Combine with a PWA install on the device for a native feel.\n\n**iframe embedding** — The backend sets `X-Frame-Options: ALLOWALL` and `frame-ancestors *`, so any site can embed the form. When loaded inside an iframe, the form emits `window.postMessage` events to the parent window:\n- `{ source: 'hotel-tech-review', event: 'review-loaded', form_id, form_type }` — fired once on mount\n- `{ source: 'hotel-tech-review', event: 'review-submitted', submission_id, rating }` — fired on successful submit\n- `{ source: 'hotel-tech-review', event: 'review-redirected', submission_id, platform }` — fired when a guest clicks through to Google/TripAdvisor/Trustpilot\n\nParent pages can listen for these (`window.addEventListener('message', ...)`) to trigger their own analytics, thank-you modals, or booking-engine handoffs.\n\n**CSV export** — Reviews > Submissions has an *Export CSV* button that honors all active filters (form, rating, date range, redirected flag). UTF-8 with BOM for Excel compatibility.",
                    ],
                    [
                        'title' => 'Mobile App Review Flow',
                        'content' => "Members with the mobile app installed receive review invitations as **push notifications** that deep-link straight into the app's review screen — no browser round-trip.\n\n**How it works:**\n- When an invitation is sent to a member who has a registered Expo push token, the notification payload is `{ type: 'review_request', token }`.\n- Tapping the notification opens `app/review/[token].tsx` in the mobile app.\n- The screen supports all form types (basic + custom) and all 8 question kinds.\n- For basic forms: if the rating hits the redirect threshold, the thank-you screen surfaces platform buttons that open Google Maps / TripAdvisor / Trustpilot in the system browser (via `Linking.openURL`). A beacon is fired to `/v1/public/reviews/{id}/redirected` so the funnel captures the click.\n\n**Fallback:** Members without the app (or with notifications disabled) still get the email invitation with the public web link — same form, same funnel tracking.",
                    ],
                ],
            ],
            [
                'slug' => 'ai-system',
                'title' => 'AI System',
                'icon' => 'Brain',
                'description' => 'Two AI systems — Admin Assistant (Claude) for operations and Website Chatbot (OpenAI) for guests.',
                'articles' => [
                    [
                        'title' => 'Admin AI Assistant',
                        'content' => "The floating chat button (bottom-right) is your AI-powered admin assistant, powered by Anthropic Claude.\n\n**What it can do:**\n- Search and display data from any module (guests, bookings, members, inquiries)\n- Create and update records (guests, inquiries, reservations, tasks)\n- Award/redeem loyalty points\n- Analyze member behavior (churn risk, personalized offers, upsell scripts)\n- Generate weekly performance reports\n- Detect anomalies (unusual transactions, inactive VIPs, revenue outliers)\n- Forecast occupancy for the next 14 days\n- Auto-create follow-up tasks for stale inquiries\n- View and update system settings\n- Provide platform guidance (\"how do I...\" questions)\n\n**Voice Mode:** Click the phone icon to start a voice conversation with the AI. Uses OpenAI Realtime API with WebRTC for natural voice-to-voice interaction.\n\n**Tips:**\n- Be specific: \"Show me Diamond members who haven't visited in 6 months\" works better than \"show members\"\n- Chain requests: \"Find guest John Smith, then show his booking history and loyalty points\"\n- Ask for actions: \"Create an inquiry for a corporate group of 50 people checking in next month\"",
                    ],
                    [
                        'title' => 'Website Chatbot',
                        'content' => "A separate AI system (OpenAI-powered) for guest-facing conversations on your website.\n\n**Configuration (AI Chat section):**\n- **Chatbot Config** — Set personality (name, tone, sales style), core rules, fallback messages\n- **Model Config** — Choose provider/model, temperature, token limits\n- **Knowledge Base** — Add FAQ items and documents the chatbot uses to answer guest questions\n\n**Embedding on Website (Settings > Chat Widget):**\n- Configure appearance (colors, position, launcher shape)\n- Set welcome message and lead capture fields\n- Get embed code (script tag, iframe, or API)\n- Widget key and API key for authentication\n\n**Voice Agent:** Enable voice-to-voice in Settings > Chat Widget > Voice Agent section. Guests can speak directly with the AI using WebRTC.\n\n**Lead Capture:** The chatbot can collect guest contact info and create inquiries automatically.",
                    ],
                    [
                        'title' => 'AI Insights Page',
                        'content' => "Dedicated page for deep AI analysis:\n\n**Weekly Reports:** Generate comprehensive performance summaries covering occupancy, revenue, loyalty activity, and recommendations. Can be emailed to stakeholders.\n\n**Member Analysis:** Select any loyalty member for:\n- Churn risk assessment (Low/Medium/High with reasoning)\n- Personalized offer generation based on spending patterns\n- Upsell script creation for front desk staff\n\n**Best Practice:** Run weekly reports every Monday for team meetings. Check churn predictions monthly for proactive member engagement.",
                    ],
                    [
                        'title' => 'AI Configuration',
                        'content' => "**API Keys (Settings > Integrations):**\n- OpenAI API key — for website chatbot, insights, and voice agent\n- Anthropic API key — for admin AI assistant (Claude)\n\n**Models (Settings > AI & System):**\n- OpenAI model selection (GPT-4o recommended)\n- Anthropic model selection (Claude Sonnet recommended)\n\n**Website Chatbot Settings (AI Chat > Chatbot Config):**\n- Behavior: assistant name, identity prompt, tone, sales style, reply length\n- Model: provider, model name, temperature, max tokens\n- Knowledge: FAQ items organized by category, uploaded documents\n\n**Voice Agent (Settings > Chat Widget):**\n- Enable/disable voice for website widget\n- Voice selection (11 voices: alloy, echo, fable, etc.)\n- Realtime model and temperature\n- Custom voice instructions",
                    ],
                ],
            ],
            [
                'slug' => 'analytics',
                'title' => 'Analytics & Reporting',
                'icon' => 'Layers',
                'description' => 'Comprehensive analytics covering loyalty, revenue, bookings, and member engagement.',
                'articles' => [
                    [
                        'title' => 'Dashboard',
                        'content' => "The main dashboard provides at-a-glance KPIs:\n- Total members, active members, new sign-ups\n- Points earned/redeemed this month\n- Revenue overview, booking counts\n- Week-over-week comparison\n- AI-generated insights and suggestions\n- Top members leaderboard\n- Tier distribution pie chart\n- Booking trends and member growth charts",
                    ],
                    [
                        'title' => 'Analytics Page',
                        'content' => "10+ analytics views with date filtering:\n\n- **Overview** — Key metrics summary\n- **Points Analytics** — Earn vs redeem trends, transaction volume\n- **Member Growth** — New enrollments, tier migration, retention\n- **Revenue** — Revenue by tier, property, time period\n- **Trends** — Year-over-year comparisons\n- **Engagement** — Active member rate, visit frequency\n- **Distribution** — Tier distribution, demographic breakdowns\n- **Redemption** — Points redemption patterns and popular rewards\n- **Booking Metrics** — Occupancy, ADR, RevPAR\n- **Expiry Forecast** — Points expiring soon, members at risk",
                    ],
                    [
                        'title' => 'AI-Powered Reports',
                        'content' => "**Weekly Reports:** Ask the AI to \"generate a weekly report\" — it compiles occupancy data, revenue trends, loyalty activity, booking patterns, and provides actionable recommendations.\n\n**Anomaly Detection:** Ask the AI to \"detect anomalies\" — it scans for unusual patterns like sudden large point transactions, inactive high-tier members, revenue drops, or cancellation spikes.\n\n**Occupancy Forecasting:** Ask the AI to \"forecast occupancy for next 2 weeks\" — it uses current reservation data to predict occupancy by property.",
                    ],
                ],
            ],
            [
                'slug' => 'campaigns',
                'title' => 'Campaigns (Email + Push)',
                'icon' => 'Bell',
                'description' => 'Block-builder email campaigns, broadcast history, and saved-segment targeting.',
                'articles' => [
                    [
                        'title' => 'Where it lives in the sidebar',
                        'content' => "Campaigns now sits inside the **Campaigns hub** under Members & Loyalty (sidebar consolidation, May 2026). The hub has two tabs:\n\n- **Email campaigns** — compose, save, and send rich emails to a saved segment\n- **Send history** — every broadcast that touched any channel (bulk push, segment push, email campaign) in one read-only timeline, sourced from the audit log\n\nLegacy URLs still work: `/email-campaigns` redirects to `/campaigns?tab=email`.",
                    ],
                    [
                        'title' => 'KPI strip + filter pills',
                        'content' => "Top of the Email campaigns tab shows four at-a-glance KPIs:\n\n- **Sent this month** — total recipient count across all campaigns sent since the 1st\n- **Active drafts** — campaigns still in draft status\n- **Total reached** — lifetime sum of delivered emails\n- **Failed this month** — bounced + permanent failures; turns red when non-zero\n\nBelow the KPI strip is a filter pill bar (All / Drafts / Sent / Failed) with live counts. Powered by `GET /v1/admin/email-campaigns/stats` (cached 30s client-side).",
                    ],
                    [
                        'title' => 'Block-based visual builder',
                        'content' => "The compose form is a **block builder**, not a raw HTML textarea. Six block types:\n\n- **Heading** — H1/H2/H3, color + alignment\n- **Text** — body paragraph with font size, color, alignment\n- **Button** — label, URL, background + text color, alignment\n- **Image** — URL, alt text, width%, optional click-through link\n- **Divider** — horizontal line, color\n- **Spacer** — fixed vertical gap (4–120px)\n\n**Each block expands when clicked** to show its inline editor. Reorder with the ↑/↓ icons on each card; delete with the trash icon.\n\n**Variable chips** — every text/heading/button block has a row of token chips below it: Name · First · Tier · Points · Member #. Clicking a chip pastes that token at the cursor position.\n\n**Templates** load as block stacks: Newsletter / Win-back / Offer spotlight / Tier promotion / Blank. The template populates the block list (and the subject if empty), then you customize from there.\n\n**Visual / Code toggle** at the top-right of the body section lets power users drop into raw HTML edit. Switching to Code detaches the block stack so HTML edits round-trip cleanly; switching back warns before wiping.",
                    ],
                    [
                        'title' => 'Live preview',
                        'content' => "A sandboxed iframe on the right of the compose form renders your email exactly as it will arrive. Variable tokens are substituted with realistic sample values (e.g. `{{member.name}}` → \"Sarah Johnson\") so you see the recipient view, not the template view.\n\nToggle on/off via the \"Hide preview\" link in the form header. On narrow screens the preview drops below the compose pane.",
                    ],
                    [
                        'title' => 'Send a test before broadcasting',
                        'content' => "**Send test to me** in the compose footer mails the rendered email to your own staff account, with `[TEST]` prefixed to the subject. It does NOT touch the campaign's status, recipient count, or send counters — purely for QA.\n\nThe button only appears once the draft has been saved at least once (so the campaign has an ID to test against).\n\nTypical flow: load template → tweak blocks → Save draft → Send test to me → review in your inbox → Send now.",
                    ],
                    [
                        'title' => 'Duplicate a campaign',
                        'content' => "Every row has a kebab `⋯` menu with **Duplicate as draft**. This clones the campaign (works on drafts, sent, or failed) as a fresh draft, appends \"(copy)\" to the name, resets all send-state, and opens it immediately for edit.\n\nUse this when you want to re-run last month's win-back with tweaks, or take a sent campaign as the starting point for a similar audience.",
                    ],
                    [
                        'title' => 'Targeting an audience',
                        'content' => "Set the **Target segment** dropdown on the draft form. The dropdown lists every saved segment from Members → Segments with its current member count.\n\nIf you leave the segment blank, the campaign saves but won't be sendable until you either (a) attach a segment, or (b) provide explicit `member_ids` at send-time via the API.\n\n**Opt-outs are respected automatically.** Members who have toggled off email_notifications are silently skipped — they still count toward `recipient_count` but not `sent_count`. The send response includes both numbers.",
                    ],
                    [
                        'title' => 'Send history (audit-log view)',
                        'content' => "The **Send history** tab on the Campaigns hub is a read-only timeline of every member-broadcast that touched any channel. It's sourced from the `audit_logs` table (no new schema) so the view is \"what did we send\" without per-channel telemetry.\n\nThree actions are surfaced:\n- `members_bulk_message` — Bulk push from the Members list\n- `segment_campaign_sent` — Segment-targeted push\n- `email_campaign_sent` — Email broadcast\n\nLatest 50 across all three, sorted by sent-at. Shows channel, what was sent, recipients, delivered, who sent it, and when.",
                    ],
                    [
                        'title' => 'Email Templates (still separate)',
                        'content' => "The Email Templates page (Settings → Email Templates) is unchanged and remains the home for reusable **transactional** templates — booking confirmation, welcome to loyalty, tier upgrade, points-expiry warning, etc. These are triggered by system events, not broadcast manually.\n\nMarketing broadcasts (one-off and scheduled) live in **Campaigns** instead. The two systems don't overlap: Templates is for emails the platform sends on your behalf, Campaigns is for emails you send to a segment.",
                    ],
                    [
                        'title' => 'Campaign Best Practices',
                        'content' => "- **Personalize by tier** — use the Tier variable chip so Bronze and Diamond don't get the same body\n- **Send test to yourself first** — every time. Inline styles render differently across Gmail, Outlook, Apple Mail\n- **Re-engagement** — target members inactive for 90+ days with a bonus-points incentive (Win-back template is built for this)\n- **Tier promotion** — congratulate members on a tier upgrade with the Tier promo template\n- **Seasonal offers** — duplicate last year's winning campaign as a starting point, then refresh the dates and copy\n- **Audience size sanity check** — the segment dropdown shows current member count next to each segment name; if it says (3 members) you probably picked the wrong segment",
                    ],
                ],
            ],
            [
                'slug' => 'wallet-passes',
                'title' => 'Wallet Passes (Apple + Google)',
                'icon' => 'CreditCard',
                'description' => 'End-to-end Apple Wallet + Google Wallet pass generation for member loyalty cards.',
                'articles' => [
                    [
                        'title' => 'What it is',
                        'content' => "Members can add their loyalty card to **Apple Wallet** (iOS) or **Google Wallet** (Android) from the mobile app. The pass shows their member number, current tier, current points, and a scannable QR code that maps back to their account.\n\nWhen a member's tier changes or points are awarded/redeemed, the pass auto-updates so what's in their wallet always matches what's in the system.\n\nConfigured per organization. Each org has its own Apple Pass Type ID + signing certificate, and its own Google service account — passes are branded as the hotel, not as Hotel Tech.",
                    ],
                    [
                        'title' => 'Initial setup (admin)',
                        'content' => "All credentials are configured in **Settings → Wallet passes**. The page won't issue passes until both sets are uploaded:\n\n**Apple Wallet:**\n1. Apple Developer Account → Pass Type ID (e.g. `pass.com.yourbrand.loyalty`)\n2. Generate a `.p12` signing certificate from that Pass Type ID, set a password\n3. Download Apple's WWDR intermediate certificate (`.cer`, then convert to `.pem`)\n4. Upload the `.p12` (Settings → Wallet passes → Upload Apple cert), enter the password\n5. Upload the WWDR `.pem` to the same screen\n6. Fill in your Apple Team ID and Pass Type ID strings\n\n**Google Wallet:**\n1. Google Pay & Wallet Console → create an Issuer account\n2. Download the service account JSON key\n3. Upload it (Settings → Wallet passes → Upload Google service account)\n4. Enter your Issuer ID\n\nCertificate files are stored on the PRIVATE disk under `storage/app/wallet/{org_id}/` — never publicly accessible. The Apple `.p12` password is Laravel-encrypted at rest.",
                    ],
                    [
                        'title' => 'How members add a pass',
                        'content' => "On the mobile app's Card tab, members see two buttons (one per wallet, whichever is appropriate for their OS):\n\n- **Add to Apple Wallet** — opens a `.pkpass` file in Safari, which iOS auto-routes to Wallet for one-tap add\n- **Add to Google Wallet** — opens `pay.google.com/gp/v/save/{jwt}` in the browser, which Google handles\n\nThe pass shows the member's QR code, member number, tier, and current point balance. Members can re-add the same pass any time — it overwrites the previous one with fresh data.",
                    ],
                    [
                        'title' => 'Troubleshooting',
                        'content' => "**\"Wallet passes aren't configured\" error on the member app** — admin hasn't uploaded credentials yet. Go to Settings → Wallet passes and complete both sets.\n\n**Apple pass fails to open in Safari** — almost always a bad `.p12` password or expired WWDR cert. Apple's WWDR cert rolled in 2023; if you uploaded the old one, the signature won't validate. Download the latest from developer.apple.com.\n\n**Google pass shows \"Sample pass\" branding** — your Issuer ID is set to Google's test issuer (`3388000000022xxxxxx`). Update to your real Issuer ID from the Google Pay & Wallet Console.\n\n**Pass shows wrong points / tier** — the pass embeds a snapshot at the moment it's generated. Members need to tap \"Add to Wallet\" again to refresh, OR (future) we'll wire push-update via Apple's Push Notification Service. Right now manual re-add is the path.",
                    ],
                    [
                        'title' => 'Security notes',
                        'content' => "- Cert files (`.p12`, `.pem`, service account JSON) are **never** stored on the public disk. They live at `storage/app/wallet/{org_id}/` (gitignored, server-only).\n- The Apple cert password is `Crypt`-encrypted on the model via a custom accessor.\n- The Apple Wallet endpoint sits outside `auth:sanctum` (Safari can't carry Authorization headers on navigation). It validates a short-lived Sanctum token from `?token=` via `PersonalAccessToken::findToken()` — token never sent to a third party.\n- Google Wallet uses a stateless JWT signed by the service account; nothing on the Google side is ever sent your private key.",
                    ],
                ],
            ],
            [
                'slug' => 'venues-events',
                'title' => 'Venues & Events',
                'icon' => 'Map',
                'description' => 'Venue management and event booking for MICE and special occasions.',
                'articles' => [
                    [
                        'title' => 'Venue Management',
                        'content' => "Create and manage hotel venues:\n- Name, description, location within property\n- Capacity (min/max guests)\n- Pricing (hourly, half-day, full-day)\n- Available amenities (projector, sound system, catering, etc.)\n- Images and floor plans\n- Availability status",
                    ],
                    [
                        'title' => 'Event Bookings',
                        'content' => "Book venues for events:\n- Link to guest/corporate client\n- Event type (conference, wedding, meeting, etc.)\n- Date, time, duration\n- Guest count and setup style\n- Catering requirements\n- Status tracking (inquiry → confirmed → completed)\n- Revenue tracking",
                    ],
                ],
            ],
            [
                'slug' => 'mobile-app',
                'title' => 'Member Mobile App',
                'icon' => 'Smartphone',
                'description' => 'Expo-based iOS/Android app for loyalty members — cards, offers, bookings, push notifications, review screens.',
                'articles' => [
                    [
                        'title' => 'What Members Can Do',
                        'content' => "The mobile app (React Native + Expo SDK 55) is the member-facing companion to the loyalty program. Features:\n\n- **Digital membership card** with live QR code (front desk scans it to identify the member and award points)\n- **Points balance & tier** — current balance, progress to next tier, lifetime earnings\n- **Points history** — every transaction with description and date\n- **Special offers** — personalized member offers with redemption flow\n- **Bookings** — upcoming reservations, past stays, request new bookings\n- **Referrals** — refer-a-friend screen with shareable link/code\n- **Push notifications** — campaign pushes, offer drops, review invitations\n- **AI chatbot** — talk to the hotel's chatbot from inside the app\n- **Review screen** — tap a review-invitation push to open the form directly in-app\n- **Profile & settings** — update details, manage notification preferences, switch theme\n\nThe app uses the **same branding** as the admin dashboard — colors and logo are loaded per-tenant from `/v1/theme` on login, so each hotel's members see their own branded experience.",
                    ],
                    [
                        'title' => 'Authentication & Organization Binding',
                        'content' => "Members sign in with email + password (separate from staff accounts — `user_type = member`). On login:\n\n1. POST `/v1/member/auth/login` → returns a Sanctum token + user profile\n2. Token is stored in `expo-secure-store`\n3. Every subsequent API call attaches `Authorization: Bearer {token}`\n4. Theme and entitlements are fetched and applied\n\nMembers are **bound to one organization** — the hotel that onboarded them. If a guest stays at multiple properties using different orgs, they need separate accounts per org. This is by design (multi-tenant isolation).\n\n**Push token registration** happens automatically after login: the app calls `POST /v1/auth/push-token` with the device's Expo push token so the org can target them from the Notifications page.",
                    ],
                    [
                        'title' => 'Push Notifications & Deep Links',
                        'content' => "The app subscribes to Expo push notifications. Incoming notifications are handled by `useNotifications.ts` which reads `response.notification.request.content.data` and routes accordingly:\n\n| Payload | Action |\n|---------|--------|\n| `{ type: 'review_request', token }` | Opens `/review/{token}` |\n| `{ type: 'offer', id }` | Opens `/offer/{id}` |\n| (no type / generic) | Falls back to the default landing screen |\n\n**Custom URL scheme:** `hotel-loyalty://` — e.g. `hotel-loyalty://review/abc123` works as a universal link.\n\n**Sending a notification** from the admin: use Notifications > Campaigns, pick a segment (e.g. \"Diamond tier, last seen > 30 days\"), write a title/body, optionally attach a deep-link payload, and send. Delivery uses Expo's push service — no FCM/APNs config needed in-app.",
                    ],
                    [
                        'title' => 'Building & Shipping',
                        'content' => "The mobile app lives in `apps/loyalty/mobile/` as its own git submodule. Builds run on **EAS (Expo Application Services)**:\n\n```bash\ncd apps/loyalty/mobile\nnpx eas-cli build --platform android --profile preview    # installable APK\nnpx eas-cli build --platform ios --profile preview        # simulator build\nnpx eas-cli build --platform android --profile production # AAB for Play Store\nnpx eas-cli build --platform ios --profile production     # signed IPA for App Store\n```\n\n**Profiles** (in `eas.json`):\n- `development` — dev client, internal distribution\n- `preview` — release build, internal APK/simulator\n- `production` — store-ready, auto-increments build numbers\n\nBuilds are tracked at `expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds`. Owner: `hoteltechai`.\n\n**Do not** change the `package.json` main entry — it must stay `\"expo-router/entry\"` for expo-router to pick up screen files under `app/`.",
                    ],
                ],
            ],
            [
                'slug' => 'security',
                'title' => 'Security & Access',
                'icon' => 'Shield',
                'description' => 'Authentication, roles, permissions, and data security practices.',
                'articles' => [
                    [
                        'title' => 'Authentication',
                        'content' => "The platform uses token-based authentication (Laravel Sanctum):\n- Login with email and password\n- Bearer token for API requests\n- Automatic session expiry and refresh\n- Separate auth flows for admin staff and loyalty members\n- Mobile app uses the same token system",
                    ],
                    [
                        'title' => 'Roles & Permissions',
                        'content' => "Built on Spatie Laravel Permission:\n\n**Roles:**\n- **Super Admin** — Full access to all features including system settings, AI configuration, and user management\n- **Admin** — Full operational access (CRM, loyalty, bookings, AI)\n- **Manager** — Property-level access with reporting capabilities\n- **Receptionist** — Front desk operations (scanning, check-in, basic guest management)\n- **Staff** — Limited access based on assigned permissions\n\n**Permission Groups:**\n- Guest management, inquiry management, reservation management\n- Loyalty operations (points, offers, benefits)\n- Booking management, venue management\n- Campaign creation, analytics access\n- Settings and configuration",
                    ],
                    [
                        'title' => 'Multi-Tenant Architecture',
                        'content' => "The platform supports multiple hotel organizations:\n- Each organization has isolated data (guests, members, bookings, etc.)\n- All models use the BelongsToOrganization trait for automatic tenant scoping\n- TenantScope global scope filters queries by current_organization_id\n- API keys, settings, and configurations are per-organization\n- Staff members belong to one organization",
                    ],
                    [
                        'title' => 'Data Security',
                        'content' => "- All API communication over HTTPS\n- Sensitive data (API keys, passwords) stored encrypted\n- API keys in settings are masked in the UI (reveal on click)\n- Points ledger is append-only (no deletions, only reversals)\n- File uploads validated for type and size\n- SQL injection prevention via Eloquent ORM and parameterized queries\n- XSS prevention via React's built-in escaping\n- CORS configured for allowed origins only",
                    ],
                    [
                        'title' => 'Audit Log',
                        'content' => "The Audit Log page records significant administrative actions for compliance and post-incident review.\n\n**What's logged:**\n- Member create / update / delete / merge\n- Points award / redeem / reverse / adjust (the points ledger is the source of truth, but the audit log captures *who* did it from which IP)\n- Settings updates (which key, old value → new value)\n- Inquiry / reservation status changes\n- User logins (success + failure)\n- Visitor deletions\n- Bulk operations\n\n**Each entry stores:**\n- Actor (user ID + name)\n- Action verb\n- Target (model + ID)\n- Before/after diff (where applicable)\n- IP + user-agent\n- Timestamp\n\n**Filters:** by user, action type, model, date range. Free-text search across diffs.\n\n**Retention:** Audit log entries are never auto-purged. Use the Audit Log page to investigate disputes (\"who awarded those 5000 points to member X?\").",
                    ],
                ],
            ],
            [
                'slug' => 'integrations',
                'title' => 'Integrations',
                'icon' => 'Zap',
                'description' => 'Third-party services, API keys, and webhook configuration.',
                'articles' => [
                    [
                        'title' => 'Smoobu (PMS)',
                        'content' => "**Purpose:** Sync bookings from Smoobu channel manager.\n\n**Setup:**\n1. Get API key from Smoobu account\n2. Add to Settings > Integrations > Smoobu API Key\n3. Configure webhook URL in Smoobu: `{your-domain}/api/v1/webhooks/booking`\n4. Click \"Test Connection\" to verify\n5. Use \"Sync PMS\" on the bookings page to pull all data\n\n**Synced Data:** Bookings, guest info, pricing, payment status, channel source, unit/room assignments.",
                    ],
                    [
                        'title' => 'OpenAI',
                        'content' => "**Purpose:** Website chatbot, AI insights, member analysis, voice agent.\n\n**Setup:**\n1. Get API key from platform.openai.com\n2. Add to Settings > Integrations > OpenAI API Key\n3. Select model in Settings > AI & System (GPT-4o recommended)\n\n**Usage:** Chatbot conversations, weekly insights, churn prediction, offer generation, voice-to-voice calls.",
                    ],
                    [
                        'title' => 'Anthropic (Claude)',
                        'content' => "**Purpose:** Admin AI assistant — the floating chat for hotel staff.\n\n**Setup:**\n1. Get API key from console.anthropic.com\n2. Add to Settings > Integrations > Anthropic API Key\n3. Model is auto-selected (Claude Sonnet)\n\n**Usage:** Admin chat for data queries, record creation, analysis, platform guidance.",
                    ],
                    [
                        'title' => 'Stripe (Payments)',
                        'content' => "**Purpose:** Process online payments for bookings and services.\n\n**Setup:**\n1. Get Stripe secret key and webhook secret from dashboard.stripe.com\n2. Add to Settings > Integrations\n3. Configure webhook endpoint for payment confirmations",
                    ],
                    [
                        'title' => 'Expo (Mobile Push)',
                        'content' => "**Purpose:** Send push notifications to the member mobile app.\n\n**Setup:**\n1. Get Expo access token from expo.dev\n2. Add to Settings > Integrations\n3. Create notification campaigns to send pushes to targeted member segments",
                    ],
                    [
                        'title' => 'WhatsApp & Twilio',
                        'content' => "**Purpose:** Send messages to guests via WhatsApp and SMS.\n\n**Setup:**\n1. Configure Twilio account SID and auth token\n2. Set WhatsApp Business access token\n3. Configure verify token for webhook validation\n\n**Usage:** Send booking confirmations, follow-up messages, and marketing communications.",
                    ],
                ],
            ],
            [
                'slug' => 'configuration',
                'title' => 'Configuration Guide',
                'icon' => 'Settings2',
                'description' => 'Step-by-step guide to configuring all platform settings.',
                'articles' => [
                    [
                        'title' => 'General Settings',
                        'content' => "**Company Info:**\n- Hotel name, contact email, phone\n- Default currency symbol\n- Timezone and language\n\n**Account:**\n- Organization details\n- Staff management and role assignments",
                    ],
                    [
                        'title' => 'Branding & Theme',
                        'content' => "**Colors:** Fully customizable dark theme with 11 color variables:\n- Primary, secondary, accent colors\n- Background, surface, text colors\n- Error, warning, info colors\n\n**Presets:** Gold Luxury, Royal Blue, Emerald Resort, Rose Boutique, Ocean Breeze, Midnight Purple.\n\n**Logo:** Upload your hotel logo (displayed in sidebar and mobile app).\n\n**Tip:** Use the preview to see changes before saving. Colors also affect the mobile app and public booking widget.",
                    ],
                    [
                        'title' => 'Loyalty Configuration',
                        'content' => "**Points Settings:**\n- Base earn rate per currency unit spent\n- Points expiry period (months)\n- Qualification window type\n- Minimum redemption threshold\n\n**Tier Configuration:** Each tier has:\n- Name and display order\n- Minimum points threshold\n- Earn rate multiplier\n- Color for badges and charts\n- Active/inactive status",
                    ],
                    [
                        'title' => 'Chat Widget Configuration',
                        'content' => "**Settings > Chat Widget:**\n\n**Appearance:**\n- Company name and welcome message\n- Widget position (bottom-right or bottom-left)\n- Colors (primary, header text, chat background, user/bot bubble)\n- Launcher shape (circle or rounded) and icon (chat, message, help)\n\n**Lead Capture:**\n- Enable/disable lead form\n- Choose required fields (name, email, phone)\n\n**Voice Agent:**\n- Enable voice-to-voice for website chatbot\n- Select voice (alloy, echo, fable, onyx, nova, shimmer, etc.)\n- Configure realtime model and temperature\n- Custom voice instructions\n\n**Embed Code:** Three options:\n1. Script tag (recommended) — paste into website HTML\n2. Iframe — for CMS platforms\n3. API — for custom integrations using widget key and API key",
                    ],
                ],
            ],
            [
                'slug' => 'use-cases',
                'title' => 'Use Cases & Workflows',
                'icon' => 'Zap',
                'description' => 'Common workflows and real-world scenarios for daily hotel operations.',
                'articles' => [
                    [
                        'title' => 'Daily Hotel Operations',
                        'content' => "**Morning Routine:**\n1. Open Dashboard — check today's KPIs and arrivals\n2. Review Planner — see assigned tasks for the day\n3. Check AI for anomalies — \"detect any anomalies today\"\n4. Review new inquiries — assign and prioritize\n\n**Front Desk:**\n1. Guest check-in — scan QR/NFC or search by name\n2. Award stay points — AI or manual through member profile\n3. Handle upgrades — check benefit entitlements by tier\n4. Guest check-out — update reservation status\n\n**End of Day:**\n1. Review unpaid bookings\n2. Update inquiry statuses\n3. Set tomorrow's planner tasks",
                    ],
                    [
                        'title' => 'Handling a New Inquiry',
                        'content' => "**From Email/WhatsApp:**\n1. Copy the message text\n2. Open AI Chat → paste and say \"extract this lead\"\n3. AI creates guest profile + inquiry with all extracted details\n4. Review and assign to team member\n5. Set follow-up task\n\n**From Phone Call:**\n1. Open Inquiries page → New Inquiry\n2. Search existing guest or create new\n3. Fill inquiry details (dates, room type, rate)\n4. Set priority and assign owner\n5. AI will remind you of follow-ups",
                    ],
                    [
                        'title' => 'Loyalty Member Engagement',
                        'content' => "**New Member Onboarding:**\n1. Create member profile (or AI extract from text)\n2. Issue welcome points bonus\n3. Send welcome push notification\n4. Provide QR code / NFC card\n\n**Re-engaging Inactive Members:**\n1. Use AI: \"find Diamond members inactive for 6 months\"\n2. Run AI churn analysis on each\n3. Generate personalized re-engagement offers\n4. Create targeted campaign\n\n**Tier Upgrade Celebration:**\n1. AI detects tier upgrade\n2. Assign new tier benefits\n3. Send congratulations notification\n4. Create special welcome-to-tier offer",
                    ],
                    [
                        'title' => 'Revenue Optimization',
                        'content' => "**Weekly Review:**\n1. Ask AI: \"generate weekly performance report\"\n2. Review occupancy forecast for next 14 days\n3. Analyze booking channel mix\n4. Check corporate account vs target room nights\n\n**Pricing Decisions:**\n1. AI occupancy forecast shows low periods\n2. Create special offers for those dates\n3. Launch targeted campaign to relevant tiers\n4. Monitor booking submissions for conversion\n\n**Payment Follow-up:**\n1. Filter PMS bookings by \"unpaid\" or \"pending\"\n2. Sort by amount due\n3. Use AI to summarize outstanding balances\n4. Create planner tasks for follow-up calls",
                    ],
                    [
                        'title' => 'Corporate Account Management',
                        'content' => "**New Corporate Client:**\n1. AI extracts details from contract/email\n2. Set negotiated rates and discount\n3. Define room night targets\n4. Assign account manager\n5. Track performance monthly\n\n**Quarterly Review:**\n1. Check actual vs target room nights\n2. Review revenue contribution\n3. AI analysis of booking patterns\n4. Prepare renewal or renegotiation proposal",
                    ],
                ],
            ],
        ];
    }

    public static function getFaq(): array
    {
        return [
            [
                'category' => 'General',
                'question' => 'How do I change my hotel\'s branding colors?',
                'answer' => 'Go to Settings > Branding. Choose from preset themes (Gold Luxury, Royal Blue, etc.) or customize individual colors. Changes apply to the admin panel, mobile app, and public widgets.',
            ],
            [
                'category' => 'General',
                'question' => 'Can multiple staff members use the system simultaneously?',
                'answer' => 'Yes. The platform supports unlimited concurrent users. Each staff member has their own login with role-based permissions. Data changes are visible in real-time across all sessions.',
            ],
            [
                'category' => 'CRM',
                'question' => 'What\'s the difference between PMS bookings and CRM reservations?',
                'answer' => 'PMS bookings are automatically synced from Smoobu/OTA channels — these are real-time external data. CRM reservations are manually created by your team for direct bookings. They\'re separate systems. When asking the AI about bookings, specify which type you mean.',
            ],
            [
                'category' => 'CRM',
                'question' => 'How do I capture leads from emails quickly?',
                'answer' => 'Open the AI Chat (bottom-right button), paste the email text, and say "extract this lead" or "capture this inquiry." The AI will parse all guest details, dates, and requirements, then create the guest profile and inquiry automatically.',
            ],
            [
                'category' => 'Loyalty',
                'question' => 'How do I award bonus points to a member?',
                'answer' => 'Three ways: (1) Open member profile > Award Points button. (2) Tell the AI: "award 500 points to John Smith for his birthday." (3) Use the points operations in the Members section. All methods create a transaction in the points ledger.',
            ],
            [
                'category' => 'Loyalty',
                'question' => 'What happens when a member reaches a new tier?',
                'answer' => 'The system automatically upgrades their tier during the next assessment. The member gets access to new tier benefits. You can send a congratulations notification via campaigns. The mobile app shows the updated tier badge.',
            ],
            [
                'category' => 'Loyalty',
                'question' => 'Can I undo a points transaction?',
                'answer' => 'Yes, but never by deleting. Use the "Reverse" transaction type which creates a counterbalancing entry. This maintains a complete audit trail. You can do this from the member profile or by telling the AI.',
            ],
            [
                'category' => 'Bookings',
                'question' => 'How do I sync bookings from Smoobu?',
                'answer' => 'First, add your Smoobu API key in Settings > Integrations. Then either: (1) Click "Sync PMS" on the bookings page for a manual sync, or (2) Set up the webhook URL in Smoobu for automatic real-time sync.',
            ],
            [
                'category' => 'Bookings',
                'question' => 'How do I add the booking widget to my website?',
                'answer' => 'Go to Settings > Booking, configure your rooms, pricing, and policies. Then copy the embed code (script tag, iframe, or API) and paste it into your website HTML. The widget handles availability checking and booking submission.',
            ],
            [
                'category' => 'AI',
                'question' => 'What\'s the difference between the admin AI and the website chatbot?',
                'answer' => 'The admin AI (Anthropic Claude) is for hotel staff — it accesses CRM data, creates records, analyzes members, and manages operations. The website chatbot (OpenAI) is guest-facing — it answers questions about the hotel using the knowledge base you configure. They are completely separate systems with different purposes.',
            ],
            [
                'category' => 'AI',
                'question' => 'How do I set up voice calls with the AI?',
                'answer' => 'For the admin AI: click the phone icon in the chat panel header. For the website chatbot: enable voice in Settings > Chat Widget > Voice Agent section, configure voice and model preferences. Both use OpenAI Realtime API with WebRTC for natural voice-to-voice conversation.',
            ],
            [
                'category' => 'AI',
                'question' => 'The AI says it\'s not configured. What do I do?',
                'answer' => 'Add the required API keys in Settings > Integrations: OpenAI API key for the website chatbot and insights, Anthropic API key for the admin assistant. Use "Test Connection" to verify they\'re working.',
            ],
            [
                'category' => 'Security',
                'question' => 'How are API keys protected?',
                'answer' => 'API keys are stored encrypted in the database. In the Settings UI, they are masked by default and only revealed when you click the eye icon. Keys are never exposed in API responses to non-admin users. The diagnostic endpoint only reports whether a key is set, never the key itself.',
            ],
            [
                'category' => 'Security',
                'question' => 'Can I restrict which staff can access certain features?',
                'answer' => 'Yes. The platform uses Spatie roles and permissions. Assign roles (Super Admin, Admin, Manager, Receptionist, Staff) to control access. Super Admin can access everything including AI system settings. Other roles have progressively restricted access.',
            ],
            [
                'category' => 'Integrations',
                'question' => 'Which PMS systems are supported?',
                'answer' => 'Currently Smoobu is the supported PMS integration. Smoobu acts as a channel manager connecting to Booking.com, Airbnb, Expedia, and 100+ other channels. Additional PMS integrations can be added.',
            ],
            [
                'category' => 'Integrations',
                'question' => 'How do I test if an integration is working?',
                'answer' => 'Go to Settings > AI & System (or Integrations) and click "Test Connection" next to each integration. It will verify the API key is valid and the service is reachable. Results show success/failure with a message.',
            ],
            [
                'category' => 'Live Chat',
                'question' => 'Why does the same visitor appear multiple times in the Chat Inbox?',
                'answer' => 'They shouldn\'t. The inbox dedupes by a cascading identity key: visitor_id (cookie) → email → phone → IP. If you\'re still seeing duplicates, the visitors don\'t share any of those identifiers — usually because they cleared cookies AND have not given an email/phone yet. Use the Visitors page to spot bots/test traffic and delete them.',
            ],
            [
                'category' => 'Live Chat',
                'question' => 'My chatbot avatar shows broken on the customer website. What\'s wrong?',
                'answer' => 'The widget runs on the customer\'s domain, so any asset URL it receives must be absolute. Re-upload the avatar in Chatbot Config — the widget endpoint now wraps avatar URLs through absolutizeUrl() so they always point at the loyalty backend regardless of where the widget is embedded.',
            ],
            [
                'category' => 'Live Chat',
                'question' => 'How do I take over a conversation from the AI?',
                'answer' => 'Open the conversation in Chat Inbox and click "Assign to me" (or assign another agent). Once assigned, the AI auto-reply pauses and the human agent owns the thread. Re-unassign to hand back to the bot.',
            ],
            [
                'category' => 'Live Chat',
                'question' => 'Can I delete bot/test/spam visitors from the Visitors page?',
                'answer' => 'Yes. Hover any visitor row and click the trash icon, or use the Delete button in the visitor detail header. This hard-deletes the visitor + their page views + their chat conversations. Use it freely to keep the live list focused on real people.',
            ],
            [
                'category' => 'Loyalty',
                'question' => 'Two member records look like the same person. How do I merge them?',
                'answer' => 'Go to Members > Duplicates. The system surfaces likely matches by email, phone, or fuzzy name + DOB. Click "Review & Merge", pick which fields to keep, and confirm. Points history, bookings, inquiries all reattach to the surviving record. The losing record is soft-deleted with an audit log entry.',
            ],
            [
                'category' => 'AI',
                'question' => 'When should I fine-tune vs add to the knowledge base?',
                'answer' => 'Knowledge base = facts (room rates, cancellation policy, amenities, dates). Fine-tuning = tone and style (how the brand sounds). 90% of cases are knowledge base. Only fine-tune after you\'ve exhausted prompt engineering and you specifically need the model to mimic a voice that prompts can\'t capture.',
            ],
            [
                'category' => 'Errors',
                'question' => 'I got "An unexpected error occurred" with no detail. How do I see the real error?',
                'answer' => 'Authenticated staff users see the real exception class, message, and file:line in API error responses (anonymous callers get the sanitized message). Open the browser DevTools Network tab, click the failing request, and look at the Response body. Every 500 is also logged to laravel.log with full URL/user/org/trace context.',
            ],
            [
                'category' => 'Errors',
                'question' => 'Where do I check what changed and who changed it?',
                'answer' => 'The Audit Log page records all significant admin actions: member CRUD, points operations, settings changes, status changes, login attempts. Filter by user, action type, or date range. Use it to investigate disputes ("who awarded these points?", "when was this setting changed?").',
            ],
        ];
    }
}
