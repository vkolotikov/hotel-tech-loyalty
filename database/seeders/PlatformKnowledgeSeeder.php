<?php

namespace Database\Seeders;

use App\Models\KnowledgeCategory;
use App\Models\KnowledgeItem;
use Illuminate\Database\Seeder;

/**
 * Seeds the Knowledge Base with platform documentation.
 * Run: php artisan db:seed --class=PlatformKnowledgeSeeder
 *
 * Safe to re-run — updates existing items by question match.
 */
class PlatformKnowledgeSeeder extends Seeder
{
    public function run(): void
    {
        $orgId = 1; // Default org

        $categories = [
            'getting_started' => [
                'name' => 'Getting Started',
                'description' => 'Platform overview, first steps, and quick-start guides',
                'priority' => 10,
                'items' => [
                    ['question' => 'What is Hotel Tech Platform?', 'answer' => 'Hotel Tech is a unified hotel management platform combining CRM (guest profiles, sales pipeline), Loyalty Program (tiers, points, benefits), Booking Engine (PMS sync, calendar, payments), AI Assistant (chat, insights, automation), Venue/Event management, and Campaign notifications — all in one admin panel.', 'keywords' => ['overview', 'about', 'what is', 'platform']],
                    ['question' => 'How do I get started with the platform?', 'answer' => "Quick start: 1) Configure Settings (appearance, API keys) → 2) Add your Properties → 3) Set up Loyalty Tiers → 4) Import or create Guest profiles → 5) Start managing inquiries and reservations → 6) Use the AI assistant (bottom-right chat button) for help at any step.", 'keywords' => ['start', 'setup', 'begin', 'first steps']],
                    ['question' => 'What are the main modules?', 'answer' => "Main modules: CRM (guests, inquiries, reservations, corporate accounts), Loyalty (members, tiers, points, offers, benefits, NFC/QR), Booking Engine (PMS bookings, calendar, payments), AI Chat & Insights, Venues & Events, Campaigns & Notifications, and Settings.", 'keywords' => ['modules', 'features', 'sections']],
                ],
            ],
            'crm_guide' => [
                'name' => 'CRM & Guest Management',
                'description' => 'Managing guests, inquiries, reservations, and corporate accounts',
                'priority' => 9,
                'items' => [
                    ['question' => 'How do I add a new guest?', 'answer' => "Go to Guests page → Click 'New Guest' → Fill in name, email, phone, company, VIP level → Save. Or use the AI: paste an email/WhatsApp message into the AI chat and say 'extract this lead' — AI will automatically extract guest details.", 'keywords' => ['add guest', 'create guest', 'new guest']],
                    ['question' => 'How do inquiries/sales pipeline work?', 'answer' => "Inquiries track leads from initial contact to booking. Flow: New → Proposal Sent → Negotiating → Confirmed/Lost. Each inquiry links to a guest and property. Set priority, assign team members, add follow-up tasks. Use the AI to auto-create follow-ups for stale inquiries.", 'keywords' => ['inquiry', 'pipeline', 'leads', 'sales']],
                    ['question' => 'How do reservations differ from PMS bookings?', 'answer' => "CRM Reservations are created manually by your team for direct bookings. PMS Bookings (Booking Engine) are synced automatically from Smoobu and external channels (Booking.com, Airbnb etc). Both coexist — use CRM reservations for direct, PMS for channel bookings.", 'keywords' => ['reservation', 'booking', 'difference', 'pms']],
                    ['question' => 'How do I check in or check out a guest?', 'answer' => "For CRM reservations: Open the reservation → Click 'Check In' or 'Check Out' button. This updates the status, timestamps, and guest statistics (total stays, revenue). For PMS bookings: Update the internal status field.", 'keywords' => ['check in', 'check out', 'arrival', 'departure']],
                    ['question' => 'How do corporate accounts work?', 'answer' => "Corporate accounts manage B2B clients with negotiated rates. Track: company info, contact person, contract dates, negotiated rate, discount percentage, room night targets, credit limits, payment terms. Link to inquiries and reservations for revenue tracking.", 'keywords' => ['corporate', 'b2b', 'company', 'account']],
                ],
            ],
            'loyalty_guide' => [
                'name' => 'Loyalty Program',
                'description' => 'Tiers, points, members, offers, and benefits management',
                'priority' => 9,
                'items' => [
                    ['question' => 'How does the tier system work?', 'answer' => "5 tiers: Bronze (0pts, 1x earn) → Silver (1,000pts, 1.25x) → Gold (5,000pts, 1.5x) → Platinum (15,000pts, 2x) → Diamond (50,000pts, 3x). Higher tiers earn points faster. Tier assessment uses qualification windows (calendar year, anniversary, or rolling 12 months).", 'keywords' => ['tier', 'level', 'bronze', 'silver', 'gold', 'platinum', 'diamond']],
                    ['question' => 'How do I award or redeem points?', 'answer' => "Via admin: Members page → Open member → Award/Redeem buttons. Via AI chat: Say 'award 500 points to member #1 for birthday bonus'. Points are tracked in a double-entry ledger. Types: earn, redeem, reverse, expire, adjust, bonus. Never delete transactions — use 'reverse' to undo.", 'keywords' => ['award', 'redeem', 'points', 'earn']],
                    ['question' => 'How do I create a special offer?', 'answer' => "Offers page → New Offer → Set title, description, type (discount/bonus/upgrade), value, date range, and target tiers. AI can also generate personalized offers: use AI chat or the AI Insights page to get offer suggestions for specific members.", 'keywords' => ['offer', 'promotion', 'deal', 'discount']],
                    ['question' => 'What are benefits and how to configure them?', 'answer' => "Benefits are tier-specific perks: late checkout, room upgrade, welcome amenity, lounge access, etc. Configure in Benefits page: create benefit definitions → assign to tiers. Members automatically get benefits based on their current tier.", 'keywords' => ['benefit', 'perk', 'privilege']],
                    ['question' => 'How do NFC and QR cards work?', 'answer' => "QR: Each member gets a unique QR code. Staff scan it via the Scan page (camera). NFC: Issue NFC cards linked to members. Tap to scan. Both identify the member instantly for check-in, point earning, or benefit redemption.", 'keywords' => ['nfc', 'qr', 'card', 'scan']],
                ],
            ],
            'booking_guide' => [
                'name' => 'Booking Engine',
                'description' => 'PMS bookings, calendar, payments, and public booking widget',
                'priority' => 8,
                'items' => [
                    ['question' => 'How does PMS sync work?', 'answer' => "Bookings sync from Smoobu via API. Click 'Sync PMS' button for manual sync, or it auto-syncs on webhook events. Data includes: guest info, dates, pricing, payment status, channel source. Synced bookings appear in the Booking Engine section.", 'keywords' => ['sync', 'pms', 'smoobu', 'channel']],
                    ['question' => 'How do I track payments and unpaid bookings?', 'answer' => "Booking dashboard shows balance due KPI. Payments page lists all bookings with payment status. Filter by: paid, pending, open, invoice waiting, channel managed. Each booking shows total, paid, and balance. Update payment amounts in booking detail.", 'keywords' => ['payment', 'unpaid', 'balance', 'invoice']],
                    ['question' => 'How do I set up the public booking widget?', 'answer' => "Settings → Booking tab: 1) Add your rooms/units with photos, capacity, and base price. 2) Add extras/add-ons. 3) Set policies (cancellation, check-in/out times). 4) Copy the embed code (Script, Iframe, or API). 5) Paste on your website.", 'keywords' => ['widget', 'embed', 'public', 'website', 'booking engine']],
                    ['question' => 'What is the booking calendar?', 'answer' => "Visual calendar showing all PMS bookings across units/apartments. Navigate months, see occupancy at a glance. Click bookings to view details. Great for front-desk operations and availability checking.", 'keywords' => ['calendar', 'availability', 'schedule']],
                ],
            ],
            'ai_guide' => [
                'name' => 'AI & Automation',
                'description' => 'AI assistant, insights, chatbot configuration, and knowledge base',
                'priority' => 8,
                'items' => [
                    ['question' => 'What can the AI assistant do?', 'answer' => "The AI (bottom-right chat) can: search any data across all modules, create/update records (guests, bookings, inquiries, tasks), analyze loyalty members (churn risk, offers, upsell), generate reports, detect anomalies, forecast occupancy, auto-create follow-up tasks, view/update settings, and provide guidance on using the platform.", 'keywords' => ['ai', 'assistant', 'chat', 'capabilities']],
                    ['question' => 'How do I use AI for lead capture?', 'answer' => "Paste raw text (email, WhatsApp, phone notes) into the AI chat and say 'extract this lead' or use the CRM → AI Capture button. AI extracts: guest name, email, phone, dates, room type, special requests, and creates the inquiry automatically.", 'keywords' => ['lead', 'capture', 'extract', 'email']],
                    ['question' => 'How do I configure the AI chatbot for my website?', 'answer' => "AI Chat → Chatbot Config: Set personality (name, tone, sales style, reply length, rules), choose AI model/provider. AI Chat → Knowledge Base: Add FAQ items and upload documents for the chatbot to reference. AI Chat → Widget Builder: Configure appearance and get embed code.", 'keywords' => ['chatbot', 'configure', 'website', 'widget']],
                    ['question' => 'How does churn prediction work?', 'answer' => "AI analyzes member data: days since last stay, total stays, recent activity, redemption ratio, tier level. Returns a risk score (0-100%) with reasoning and recommended action. Access via: AI Insights page (per member) or AI chat ('analyze churn risk for member #X').", 'keywords' => ['churn', 'prediction', 'risk', 'retention']],
                    ['question' => 'What AI reports can I generate?', 'answer' => "Weekly performance report: covers guests, members, inquiries, reservations, revenue, loyalty points, top earners — with week-over-week comparison. Ask AI: 'generate weekly report' or 'generate and email report to manager@hotel.com'. Also: anomaly detection, occupancy forecast, stale inquiry analysis.", 'keywords' => ['report', 'weekly', 'analytics', 'performance']],
                ],
            ],
            'operations_guide' => [
                'name' => 'Operations & Best Practices',
                'description' => 'Daily routines, workflows, and optimization tips',
                'priority' => 7,
                'items' => [
                    ['question' => 'What should I do every morning?', 'answer' => "Daily routine: 1) Check arrivals today (AI: 'How many arrivals today?'), 2) Review unpaid bookings dashboard, 3) Check planner tasks, 4) Review new inquiries, 5) Use AI to detect anomalies. Takes 5-10 minutes.", 'keywords' => ['morning', 'daily', 'routine', 'checklist']],
                    ['question' => 'What should I do weekly?', 'answer' => "Weekly routine: 1) Generate AI weekly report, 2) Review churn risks for high-value members, 3) Run 'analyze stale inquiries' to auto-create follow-ups, 4) Check 14-day occupancy forecast, 5) Review/adjust active offers and campaigns.", 'keywords' => ['weekly', 'routine', 'review']],
                    ['question' => 'How do I optimize revenue?', 'answer' => "Tips: 1) Monitor payment mix — follow up on 'open'/'pending' payments immediately, 2) Use AI occupancy forecast for pricing decisions, 3) Create tier-specific offers to boost loyalty engagement, 4) Track corporate account targets vs actuals, 5) Use anomaly detection to catch revenue outliers.", 'keywords' => ['revenue', 'optimize', 'money', 'income']],
                    ['question' => 'How do I prevent guest churn?', 'answer' => "1) Use AI churn prediction regularly for high-tier members, 2) Send personalized offers to at-risk members (AI generates these), 3) Create re-engagement campaigns for inactive segments, 4) Monitor 'inactive VIP' anomalies weekly, 5) Ensure loyalty benefits are clearly communicated and delivered.", 'keywords' => ['churn', 'prevent', 'retention', 'engagement']],
                ],
            ],
        ];

        foreach ($categories as $key => $catData) {
            $cat = KnowledgeCategory::updateOrCreate(
                ['organization_id' => $orgId, 'name' => $catData['name']],
                [
                    'description' => $catData['description'],
                    'priority' => $catData['priority'],
                    'sort_order' => $catData['priority'],
                    'is_active' => true,
                ]
            );

            foreach ($catData['items'] as $itemData) {
                KnowledgeItem::updateOrCreate(
                    ['organization_id' => $orgId, 'question' => $itemData['question']],
                    [
                        'category_id' => $cat->id,
                        'answer' => $itemData['answer'],
                        'keywords' => $itemData['keywords'],
                        'priority' => 5,
                        'is_active' => true,
                    ]
                );
            }
        }
    }
}
