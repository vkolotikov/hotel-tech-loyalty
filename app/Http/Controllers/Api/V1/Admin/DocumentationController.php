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
                        'content' => "The inquiry system is your sales CRM:\n\n**Statuses:** New → Proposal Sent → Negotiating → Tentative → Confirmed → Lost\n\n**Each inquiry tracks:**\n- Guest and property association\n- Inquiry type (Room, MICE, Corporate, Group, Long Stay, etc.)\n- Dates, room requirements, rate offered, total value\n- Priority (Low, Medium, High), assigned team member\n- Follow-up tasks with due dates\n- Source channel (Direct, Booking.com, Expedia, Email, WhatsApp, etc.)\n\n**Best Practice:** Set a follow-up task on every open inquiry. Use the AI to \"analyze stale inquiries\" weekly — it will identify leads that need attention and create planner tasks automatically.",
                    ],
                    [
                        'title' => 'Reservations',
                        'content' => "CRM reservations are manually created by your team for direct bookings (separate from PMS bookings synced via Smoobu).\n\n**Statuses:** Confirmed → Checked In → Checked Out → Cancelled → No Show\n\n**Features:**\n- Link to guest profile and property\n- Room assignment, meal plan, rate per night\n- Payment status tracking\n- Special requests and notes\n- Auto-updates guest statistics on check-out (total stays, revenue)",
                    ],
                    [
                        'title' => 'Corporate Accounts',
                        'content' => "Manage B2B hotel clients with:\n- Company profile (industry, size, billing info, tax ID)\n- Negotiated rates and discount percentages\n- Contract dates and payment terms (Net 30, etc.)\n- Credit limits and annual room night targets\n- Contact person details\n- Performance tracking (actual vs target room nights)\n\nUse the AI to extract corporate details from contracts or emails — paste the text and say \"extract corporate account\".",
                    ],
                    [
                        'title' => 'Daily Planner & Tasks',
                        'content' => "The planner helps organize team workflows:\n- Create tasks assigned to specific team members\n- Set due dates and priorities\n- Tasks can be linked to inquiries or reservations\n- AI can auto-create follow-up tasks from stale inquiries\n\n**Daily Routine:**\n1. Check today's planner tasks\n2. Review new inquiries and assign owners\n3. Check arrivals and departures\n4. Follow up on pending proposals",
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
                        'title' => 'Live Visitors',
                        'content' => "The Live Visitors page (sidebar > Visitors) shows everyone currently on the customer's website with persistent identity tracking.\n\n**Identity model:** Each browser gets a `visitor_id` cookie on first chat-widget load. The visitor record persists across sessions and IP changes — you see the same person across visits, devices, and networks.\n\n**Each visitor record stores:**\n- Display name (chatbot name capture or auto-generated)\n- Online/offline state (90s heartbeat threshold)\n- Email/phone (when captured by chatbot)\n- IP, country, city (geo-IP)\n- Current page + page-view history (last 200)\n- Visit count, page-view count, message count\n- Linked guest profile + lead status\n\n**Filters:** Online / Offline / All / Leads-only. Search by name, email, phone, IP, current page.\n\n**Actions:**\n- Click any row to see the full page-journey timeline + linked chat conversations\n- Start Chat — opens (or creates) a conversation in chat-inbox so you can message the visitor directly\n- Delete — hard-removes the visitor + their page views + conversations. Use this to scrub bot/test/spam visitors so the live list stays focused on real people.\n\n**Refresh:** Auto-polls every 10s.",
                    ],
                    [
                        'title' => 'Chat Inbox (Live Agent Console)',
                        'content' => "The Chat Inbox is your two-pane live conversation console: list on the left, message thread on the right.\n\n**Features:**\n- Filters: status (active/waiting/closed), assigned-to-me, lead-captured, channel\n- Visitor dedup: cascading identity key (visitor_id → email → phone → IP) collapses repeat sessions from the same person into one row, even across IP changes\n- Session count badge on each row (how many distinct conversations this visitor has had)\n- File attachments (drag-drop or paste)\n- Canned replies (managed in the Canned Replies page) — quick-insert pre-written responses\n- Conversation transcript export\n- Assign conversation to an agent\n- Convert any chat into an inquiry (auto-fills guest profile from captured chat data)\n\n**AI vs human:** When a conversation is unassigned, the AI chatbot replies. Once an agent assigns themselves, the AI stops auto-replying and the human takes over.",
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
                'slug' => 'booking-engine',
                'title' => 'Booking Engine',
                'icon' => 'Calendar',
                'description' => 'PMS integration, calendar management, payment tracking, and public booking widget.',
                'articles' => [
                    [
                        'title' => 'PMS Integration (Smoobu)',
                        'content' => "The booking engine syncs with Smoobu for real-time booking data:\n- Automatic sync via webhooks (booking created/modified/cancelled)\n- Manual sync button on the PMS dashboard\n- Tracks: guest info, dates, units, pricing, payment status, channel\n\n**Setup:** Add your Smoobu API key in Settings > Integrations. Configure the webhook URL in your Smoobu account to point to your hotel's webhook endpoint.\n\n**Two Booking Systems:** PMS Bookings (from Smoobu/channels) and CRM Reservations (manual) are separate. AI knows the difference — specify which one when asking.",
                    ],
                    [
                        'title' => 'PMS Dashboard & Calendar',
                        'content' => "**Dashboard KPIs:**\n- Total bookings, revenue, confirmed/cancelled counts\n- Average stay duration, outstanding balance\n- Payment mix (paid vs pending vs open)\n- Channel distribution, unit performance\n\n**Calendar View:** Visual timeline of all bookings across units. Color-coded by status. Great for occupancy overview.\n\n**Payment Tracking:** Monitor paid vs outstanding. Filter by status. Follow up on unpaid bookings.",
                    ],
                    [
                        'title' => 'Public Booking Widget',
                        'content' => "Configure a booking widget for your hotel website:\n\n**Settings > Booking:**\n- Define rooms/units with capacity, pricing, images\n- Add extras/add-ons (breakfast, airport transfer, etc.)\n- Set policies (cancellation, check-in/out times)\n- Configure pricing rules\n\nThe widget generates a public booking form that guests can use to submit reservation requests. Submissions are logged and can be reviewed in the admin panel.\n\n**Embed:** Get the embed code from Settings > Booking and add it to your website.",
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
                'title' => 'Campaigns & Notifications',
                'icon' => 'Bell',
                'description' => 'Push notification campaigns with audience segmentation.',
                'articles' => [
                    [
                        'title' => 'Creating Campaigns',
                        'content' => "**Steps:**\n1. Define campaign name and message content\n2. Select audience segment (or create new)\n3. Set delivery schedule (immediate or future)\n4. Review and launch\n\n**Segments** filter members by:\n- Tier (Bronze, Silver, Gold, etc.)\n- Points balance range\n- Last activity date\n- Join date range\n- Property association",
                    ],
                    [
                        'title' => 'Campaign Best Practices',
                        'content' => "- **Personalize by tier:** High-tier members expect exclusive messaging\n- **Seasonal offers:** Create campaigns around holidays and peak seasons\n- **Re-engagement:** Target members inactive for 90+ days with special incentives\n- **New member welcome:** Automated campaign for newly enrolled members\n- **Points expiry reminders:** Alert members before their points expire",
                    ],
                    [
                        'title' => 'Email Templates',
                        'content' => "The Email Templates page stores reusable transactional + marketing email templates per organization.\n\n**Each template has:**\n- Name + category (transactional, marketing, system)\n- Subject line (supports placeholders)\n- HTML body + plain-text fallback\n- Available placeholders: `{guest_name}`, `{member_number}`, `{points_balance}`, `{tier}`, `{booking_ref}`, `{check_in}`, `{check_out}`, `{property_name}`, `{hotel_name}`\n\n**System templates** (used internally by the platform):\n- Booking confirmation\n- Booking cancellation\n- Reservation reminder (T-3 days)\n- Welcome to loyalty program\n- Tier upgrade congratulations\n- Points expiry warning\n- Inquiry follow-up\n\n**Best practice:** Always test a template by sending to yourself before assigning it to a campaign or system event. Keep marketing templates short — under 200 words.",
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
