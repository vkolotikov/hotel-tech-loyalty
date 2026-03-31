<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\EmailTemplate;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Models\PlannerTask;
use App\Models\Property;
use App\Models\Reservation;
use App\Models\SpecialOffer;
use App\Models\CorporateAccount;
use App\Models\VenueBooking;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class CrmAiService
{
    private string $apiKey;
    private string $model;
    private int $maxRounds = 8;

    public function __construct()
    {
        $this->apiKey = config('services.anthropic.api_key', '');
        $this->model  = config('services.anthropic.model', 'claude-sonnet-4-20250514');
    }

    /* ────────── Public API ────────── */

    public function chat(array $userMessages): array
    {
        if (!$this->apiKey) {
            return ['response' => 'AI not configured — add ANTHROPIC_API_KEY to your .env file.', 'actions' => []];
        }

        $system   = $this->buildSystemPrompt();
        $messages = $this->toClaudeMessages($userMessages);
        $tools    = $this->getTools();
        $actions  = [];

        for ($i = 0; $i < $this->maxRounds; $i++) {
            $res = $this->call($system, $messages, $tools);
            if (!isset($res['content'])) return ['response' => 'Failed to reach AI service.', 'actions' => $actions];

            $hasToolUse  = false;
            $toolResults = [];

            foreach ($res['content'] as $block) {
                if (($block['type'] ?? '') === 'tool_use') {
                    $hasToolUse = true;
                    $result     = $this->executeTool($block['name'], $block['input'] ?? []);
                    $actions[]  = ['tool' => $block['name'], 'input' => $block['input'] ?? [], 'success' => $result['success']];
                    $toolResults[] = ['type' => 'tool_result', 'tool_use_id' => $block['id'], 'content' => json_encode($result['data'])];
                }
            }

            if (!$hasToolUse) return ['response' => $this->extractText($res['content']), 'actions' => $actions];

            $messages[] = ['role' => 'assistant', 'content' => $res['content']];
            $messages[] = ['role' => 'user',      'content' => $toolResults];
        }

        return ['response' => 'Reached maximum tool rounds.', 'actions' => $actions];
    }

    public function extractLead(string $text): array
    {
        if (!$this->apiKey) return ['success' => false, 'error' => 'AI not configured — add ANTHROPIC_API_KEY to .env'];

        $settings  = CrmSetting::all()->pluck('value', 'key');
        $roomTypes = ($settings['room_types'] ?? []);
        $sources   = ($settings['lead_sources'] ?? []);
        $inquiryTypes = ($settings['inquiry_types'] ?? []);

        $system = "You extract guest inquiry information from raw text (emails, WhatsApp, phone notes, booking requests). "
            . "This is a hotel CRM. Extract guest and inquiry details. "
            . "Room types: " . implode(', ', $roomTypes) . ". "
            . "Inquiry types: " . implode(', ', $inquiryTypes) . ". "
            . "Sources: " . implode(', ', $sources) . ".";

        $tools = [[
            'name' => 'save_extracted_inquiry',
            'description' => 'Save the extracted guest and inquiry information.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'guest_name'       => ['type' => 'string', 'description' => 'Full name of the guest'],
                    'email'            => ['type' => 'string', 'description' => 'Email if found'],
                    'phone'            => ['type' => 'string', 'description' => 'Phone if found'],
                    'company'          => ['type' => 'string', 'description' => 'Company name'],
                    'nationality'      => ['type' => 'string', 'description' => 'Nationality/country'],
                    'inquiry_type'     => ['type' => 'string', 'description' => 'Type of inquiry'],
                    'check_in'         => ['type' => 'string', 'description' => 'Check-in date YYYY-MM-DD'],
                    'check_out'        => ['type' => 'string', 'description' => 'Check-out date YYYY-MM-DD'],
                    'num_rooms'        => ['type' => 'integer', 'description' => 'Number of rooms'],
                    'num_adults'       => ['type' => 'integer', 'description' => 'Number of adults'],
                    'num_children'     => ['type' => 'integer', 'description' => 'Number of children'],
                    'room_type'        => ['type' => 'string', 'description' => 'Requested room type'],
                    'total_value'      => ['type' => 'number', 'description' => 'Estimated value'],
                    'source'           => ['type' => 'string', 'description' => 'Lead source channel'],
                    'special_requests' => ['type' => 'string', 'description' => 'Any special requests'],
                    'notes'            => ['type' => 'string', 'description' => 'Summary of the inquiry'],
                    'priority'         => ['type' => 'string', 'enum' => ['Low', 'Medium', 'High']],
                    'event_name'       => ['type' => 'string', 'description' => 'Event name if MICE'],
                    'event_pax'        => ['type' => 'integer', 'description' => 'Event attendees if MICE'],
                ],
                'required' => ['guest_name', 'notes'],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract guest inquiry information:\n\n" . $text]];
        $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_extracted_inquiry']);

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && $block['name'] === 'save_extracted_inquiry') {
                return ['success' => true, 'data' => $block['input']];
            }
        }

        return ['success' => false, 'error' => 'Could not extract inquiry from the text.'];
    }

    public function extractMember(string $text): array
    {
        if (!$this->apiKey) return ['success' => false, 'error' => 'AI not configured — add ANTHROPIC_API_KEY to .env'];

        $tiers = LoyaltyTier::where('is_active', true)->orderBy('sort_order')->pluck('name')->toArray();

        $system = "You extract loyalty member information from raw unstructured text (emails, registration forms, business cards, WhatsApp messages, phone notes, CRM notes). "
            . "This is a hotel loyalty program. Extract personal details for member enrollment. "
            . "Available tiers: " . implode(', ', $tiers) . ". Default to Bronze if unclear. "
            . "Generate a secure temporary password if none is mentioned (8+ chars, mixed case, digits).";

        $tools = [[
            'name' => 'save_extracted_member',
            'description' => 'Save the extracted member information for enrollment.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'name'        => ['type' => 'string', 'description' => 'Full name of the person'],
                    'email'       => ['type' => 'string', 'description' => 'Email address'],
                    'phone'       => ['type' => 'string', 'description' => 'Phone number if found'],
                    'password'    => ['type' => 'string', 'description' => 'Generated temporary password (8+ chars)'],
                    'tier'        => ['type' => 'string', 'description' => 'Suggested tier name', 'enum' => array_merge($tiers, ['Bronze'])],
                    'nationality' => ['type' => 'string', 'description' => 'Nationality or country if found'],
                    'language'    => ['type' => 'string', 'description' => 'Preferred language if found'],
                    'notes'       => ['type' => 'string', 'description' => 'Any additional context or notes extracted'],
                ],
                'required' => ['name', 'email', 'password'],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract member enrollment information:\n\n" . $text]];
        $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_extracted_member']);

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && $block['name'] === 'save_extracted_member') {
                return ['success' => true, 'data' => $block['input']];
            }
        }

        return ['success' => false, 'error' => 'Could not extract member information from the text.'];
    }

    public function extractCorporate(string $text): array
    {
        if (!$this->apiKey) return ['success' => false, 'error' => 'AI not configured — add ANTHROPIC_API_KEY to .env'];

        $settings  = CrmSetting::all()->pluck('value', 'key');
        $industries = ($settings['industries'] ?? []);
        $rateTypes  = ($settings['rate_types'] ?? []);
        $managers   = ($settings['account_managers'] ?? []);

        $system = "You extract corporate account information from raw unstructured text (emails, contracts, proposals, business cards, meeting notes). "
            . "This is a hotel CRM for managing corporate clients with negotiated rates. "
            . "Industries: " . implode(', ', $industries ?: ['Technology', 'Finance', 'Healthcare', 'Hospitality', 'Government', 'Education', 'Other']) . ". "
            . "Rate types: " . implode(', ', $rateTypes ?: ['BAR', 'Corporate', 'Government', 'Wholesale']) . ". "
            . "Account managers: " . implode(', ', $managers ?: []) . ".";

        $tools = [[
            'name' => 'save_extracted_corporate',
            'description' => 'Save the extracted corporate account information.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'company_name'              => ['type' => 'string', 'description' => 'Company/organization name'],
                    'industry'                  => ['type' => 'string', 'description' => 'Industry sector'],
                    'contact_person'            => ['type' => 'string', 'description' => 'Primary contact person name'],
                    'contact_email'             => ['type' => 'string', 'description' => 'Contact email'],
                    'contact_phone'             => ['type' => 'string', 'description' => 'Contact phone'],
                    'account_manager'           => ['type' => 'string', 'description' => 'Assigned account manager'],
                    'contract_start'            => ['type' => 'string', 'description' => 'Contract start date YYYY-MM-DD'],
                    'contract_end'              => ['type' => 'string', 'description' => 'Contract end date YYYY-MM-DD'],
                    'negotiated_rate'           => ['type' => 'number', 'description' => 'Negotiated room rate'],
                    'rate_type'                 => ['type' => 'string', 'description' => 'Rate type'],
                    'discount_percentage'       => ['type' => 'number', 'description' => 'Discount percentage'],
                    'annual_room_nights_target' => ['type' => 'integer', 'description' => 'Target annual room nights'],
                    'payment_terms'             => ['type' => 'string', 'description' => 'Payment terms (e.g. Net 30)'],
                    'credit_limit'              => ['type' => 'number', 'description' => 'Credit limit amount'],
                    'billing_address'           => ['type' => 'string', 'description' => 'Billing address'],
                    'billing_email'             => ['type' => 'string', 'description' => 'Billing/invoicing email'],
                    'tax_id'                    => ['type' => 'string', 'description' => 'Tax ID / VAT number'],
                    'notes'                     => ['type' => 'string', 'description' => 'Additional notes or context'],
                ],
                'required' => ['company_name'],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract corporate account information:\n\n" . $text]];
        $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_extracted_corporate']);

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && $block['name'] === 'save_extracted_corporate') {
                return ['success' => true, 'data' => $block['input']];
            }
        }

        return ['success' => false, 'error' => 'Could not extract corporate information from the text.'];
    }

    /* ────────── Claude HTTP ────────── */

    private function call(string $system, array $messages, array $tools, ?array $toolChoice = null): array
    {
        $body = ['model' => $this->model, 'max_tokens' => 4096, 'system' => $system, 'messages' => $messages];
        if ($tools)      $body['tools']       = $tools;
        if ($toolChoice) $body['tool_choice']  = $toolChoice;

        $response = Http::timeout(90)->withHeaders([
            'x-api-key' => $this->apiKey, 'anthropic-version' => '2023-06-01', 'content-type' => 'application/json',
        ])->post('https://api.anthropic.com/v1/messages', $body);

        if (!$response->successful()) {
            return ['content' => [['type' => 'text', 'text' => 'API error: ' . $response->status()]]];
        }
        return $response->json();
    }

    /* ────────── Helpers ────────── */

    private function toClaudeMessages(array $msgs): array
    {
        return array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $msgs);
    }

    private function extractText(array $content): string
    {
        $parts = [];
        foreach ($content as $b) { if (($b['type'] ?? '') === 'text') $parts[] = $b['text']; }
        return implode("\n", $parts) ?: 'No response generated.';
    }

    private function buildSystemPrompt(): string
    {
        $settings = CrmSetting::all()->pluck('value', 'key');
        $roomTypes  = implode(', ', ($settings['room_types'] ?? []));
        $inqTypes   = implode(', ', ($settings['inquiry_types'] ?? []));
        $inqStatuses= implode(', ', ($settings['inquiry_statuses'] ?? []));
        $resStatuses= implode(', ', ($settings['reservation_statuses'] ?? []));
        $employees  = implode(', ', ($settings['employees'] ?? []));
        $currency   = ($settings['currency_symbol'] ?? '€');
        $mealPlans  = implode(', ', ($settings['meal_plans'] ?? []));

        $properties = Property::where('is_active', true)->get(['id', 'name', 'code'])->map(fn($p) => "{$p->name} ({$p->code}, ID:{$p->id})")->implode(', ');

        $guestCount   = Guest::count();
        $memberCount  = LoyaltyMember::count();
        $activeInq    = Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->count();
        $pipelineVal  = (float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value');
        $inHouse      = Reservation::where('status', 'Checked In')->count();
        $arrivalsToday= Reservation::where('check_in', now()->toDateString())->where('status', 'Confirmed')->count();
        $today        = now()->toDateString();

        // Loyalty context
        $tiers        = LoyaltyTier::where('is_active', true)->orderBy('min_points')->get(['name', 'min_points', 'earn_rate'])->map(fn($t) => "{$t->name} ({$t->min_points}+ pts, {$t->earn_rate}x)")->implode(', ');
        $activeOffers = SpecialOffer::active()->count();
        $totalPoints  = LoyaltyMember::sum('current_points');

        return <<<PROMPT
You are an AI assistant for a unified Hotel CRM & Loyalty platform. You help manage guest profiles, inquiries (sales pipeline), reservations, properties, loyalty members, points, tiers, offers, planner tasks, venue bookings, and more.

Hotel snapshot ({$today}):
- {$guestCount} guests, {$memberCount} loyalty members, {$activeInq} active inquiries ({$currency}{$pipelineVal} pipeline)
- {$inHouse} in-house guests, {$arrivalsToday} arrivals today
- Loyalty: {$totalPoints} total points in circulation, {$activeOffers} active offers

Properties: {$properties}
Tier ladder: {$tiers}
Room types: {$roomTypes}
Inquiry types: {$inqTypes}
Inquiry statuses: {$inqStatuses}
Reservation statuses: {$resStatuses}
Meal plans: {$mealPlans}
Team: {$employees}
Currency: {$currency}

Capabilities:
- CRM: Search/create/update guests, inquiries, reservations. View hotel stats.
- Loyalty: Search members, view full profiles with points history, award/redeem points, view tiers and offers.
- Planning: View planner tasks, create tasks, view venue bookings.
- AI Analysis: Analyze member churn risk, generate personalized offers, create upsell scripts (powered by GPT-4o).
- Weekly Reports: Generate weekly performance reports with KPIs, comparisons, and top earners. Optionally email them.
- Anomaly Detection: Detect unusual patterns — large point transactions, inactive VIPs, booking revenue outliers, redemption spikes, cancellation surges.
- Occupancy Forecasting: Predict occupancy for the next 14 days based on confirmed reservations vs property capacity.
- Inquiry Follow-ups: Analyze stale/overdue inquiries and auto-create planner tasks for follow-up.

Rules:
- Always use tools for real data — never invent IDs, names, or numbers.
- When creating/updating records, state what you did with IDs.
- Be concise. Use bullet points for lists. Format numbers with locale separators.
- Monetary values use {$currency}. Points have no currency symbol.
- If ambiguous, ask a clarifying question.
- For loyalty member analysis (churn, offers, upsell), use the analyze_member tool.
PROMPT;
    }

    /* ────────── Tool Definitions ────────── */

    private function getTools(): array
    {
        return [
            $this->tool('search_guests', 'Search guests by name, email, phone, company, or nationality.', [
                'query' => ['type' => 'string', 'description' => 'Search term'],
                'limit' => ['type' => 'integer', 'description' => 'Max results (default 5)'],
            ], ['query']),

            $this->tool('get_guest', 'Get full guest profile with inquiries and reservations.', [
                'id' => ['type' => 'integer', 'description' => 'Guest ID'],
            ], ['id']),

            $this->tool('search_inquiries', 'Search inquiries/sales pipeline.', [
                'search'       => ['type' => 'string', 'description' => 'Search text'],
                'status'       => ['type' => 'string', 'description' => 'Status filter'],
                'inquiry_type' => ['type' => 'string', 'description' => 'Type filter'],
                'property_id'  => ['type' => 'integer', 'description' => 'Property ID filter'],
                'limit'        => ['type' => 'integer', 'description' => 'Max results (default 10)'],
            ], []),

            $this->tool('search_reservations', 'Search reservations.', [
                'search'        => ['type' => 'string', 'description' => 'Search text or confirmation no'],
                'status'        => ['type' => 'string', 'description' => 'Status filter'],
                'property_id'   => ['type' => 'integer', 'description' => 'Property ID filter'],
                'check_in_from' => ['type' => 'string', 'description' => 'Check-in from YYYY-MM-DD'],
                'check_in_to'   => ['type' => 'string', 'description' => 'Check-in to YYYY-MM-DD'],
                'limit'         => ['type' => 'integer', 'description' => 'Max results (default 10)'],
            ], []),

            $this->tool('get_hotel_stats', 'Get hotel KPIs: arrivals, departures, in-house, revenue, pipeline, loyalty members.', [], []),

            $this->tool('list_properties', 'List all hotel properties.', [], []),

            $this->tool('get_planner_tasks', 'Get planner tasks for a date/range/employee.', [
                'date'       => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'week_start' => ['type' => 'string', 'description' => 'Week start YYYY-MM-DD'],
                'employee'   => ['type' => 'string', 'description' => 'Employee name'],
            ], []),

            $this->tool('create_guest', 'Create a new guest profile.', [
                'full_name'  => ['type' => 'string', 'description' => 'Full name (required)'],
                'salutation' => ['type' => 'string', 'description' => 'Mr., Mrs., etc.'],
                'email'      => ['type' => 'string'], 'phone' => ['type' => 'string'],
                'company'    => ['type' => 'string'], 'nationality' => ['type' => 'string'],
                'country'    => ['type' => 'string'], 'guest_type' => ['type' => 'string'],
                'vip_level'  => ['type' => 'string'], 'lead_source' => ['type' => 'string'],
                'notes'      => ['type' => 'string'],
            ], ['full_name']),

            $this->tool('update_guest', 'Update a guest by ID.', [
                'id'         => ['type' => 'integer', 'description' => 'Guest ID (required)'],
                'full_name'  => ['type' => 'string'], 'email' => ['type' => 'string'],
                'phone'      => ['type' => 'string'], 'vip_level' => ['type' => 'string'],
                'nationality'=> ['type' => 'string'], 'notes' => ['type' => 'string'],
                'preferred_room_type' => ['type' => 'string'], 'dietary_preferences' => ['type' => 'string'],
            ], ['id']),

            $this->tool('create_inquiry', 'Create a new inquiry (sales lead).', [
                'guest_id'           => ['type' => 'integer', 'description' => 'Guest ID (required)'],
                'property_id'        => ['type' => 'integer', 'description' => 'Property ID'],
                'inquiry_type'       => ['type' => 'string'], 'source' => ['type' => 'string'],
                'check_in'           => ['type' => 'string'], 'check_out' => ['type' => 'string'],
                'num_rooms'          => ['type' => 'integer'], 'room_type_requested' => ['type' => 'string'],
                'rate_offered'       => ['type' => 'number'], 'total_value' => ['type' => 'number'],
                'status'             => ['type' => 'string'], 'priority' => ['type' => 'string'],
                'assigned_to'        => ['type' => 'string'], 'special_requests' => ['type' => 'string'],
                'event_name'         => ['type' => 'string'], 'event_pax' => ['type' => 'integer'],
                'notes'              => ['type' => 'string'],
            ], ['guest_id']),

            $this->tool('update_inquiry', 'Update an inquiry by ID.', [
                'id'             => ['type' => 'integer', 'description' => 'Inquiry ID (required)'],
                'status'         => ['type' => 'string'], 'priority' => ['type' => 'string'],
                'total_value'    => ['type' => 'number'], 'assigned_to' => ['type' => 'string'],
                'rate_offered'   => ['type' => 'number'],
                'next_task_type' => ['type' => 'string'], 'next_task_due' => ['type' => 'string'],
                'notes'          => ['type' => 'string'],
            ], ['id']),

            $this->tool('create_reservation', 'Create a new reservation.', [
                'guest_id'       => ['type' => 'integer', 'description' => 'Guest ID (required)'],
                'property_id'    => ['type' => 'integer', 'description' => 'Property ID (required)'],
                'check_in'       => ['type' => 'string', 'description' => 'YYYY-MM-DD (required)'],
                'check_out'      => ['type' => 'string', 'description' => 'YYYY-MM-DD (required)'],
                'num_rooms'      => ['type' => 'integer'], 'room_type' => ['type' => 'string'],
                'rate_per_night' => ['type' => 'number'], 'total_amount' => ['type' => 'number'],
                'meal_plan'      => ['type' => 'string'], 'booking_channel' => ['type' => 'string'],
                'special_requests' => ['type' => 'string'], 'notes' => ['type' => 'string'],
            ], ['guest_id', 'property_id', 'check_in', 'check_out']),

            $this->tool('update_reservation', 'Update a reservation by ID.', [
                'id'             => ['type' => 'integer', 'description' => 'Reservation ID (required)'],
                'status'         => ['type' => 'string'], 'room_number' => ['type' => 'string'],
                'room_type'      => ['type' => 'string'], 'rate_per_night' => ['type' => 'number'],
                'total_amount'   => ['type' => 'number'], 'meal_plan' => ['type' => 'string'],
                'payment_status' => ['type' => 'string'], 'notes' => ['type' => 'string'],
            ], ['id']),

            $this->tool('search_loyalty_members', 'Search loyalty program members by name, email, member number, or tier.', [
                'query' => ['type' => 'string', 'description' => 'Search term'],
                'tier'  => ['type' => 'string', 'description' => 'Tier name filter'],
                'limit' => ['type' => 'integer', 'description' => 'Max results (default 5)'],
            ], []),

            $this->tool('get_loyalty_member', 'Get full loyalty member profile with points history, tier progress, and recent transactions.', [
                'id' => ['type' => 'integer', 'description' => 'Loyalty member ID (required)'],
            ], ['id']),

            $this->tool('award_points', 'Award loyalty points to a member. Use for bonuses, promotions, or manual adjustments.', [
                'member_id'   => ['type' => 'integer', 'description' => 'Loyalty member ID (required)'],
                'points'      => ['type' => 'integer', 'description' => 'Points to award (1-100000, required)'],
                'description' => ['type' => 'string', 'description' => 'Reason for award (required)'],
                'type'        => ['type' => 'string', 'description' => 'Transaction type: earn, bonus, adjust (default: bonus)'],
            ], ['member_id', 'points', 'description']),

            $this->tool('redeem_points', 'Redeem loyalty points from a member balance.', [
                'member_id'   => ['type' => 'integer', 'description' => 'Loyalty member ID (required)'],
                'points'      => ['type' => 'integer', 'description' => 'Points to redeem (required)'],
                'description' => ['type' => 'string', 'description' => 'Reason for redemption (required)'],
            ], ['member_id', 'points', 'description']),

            $this->tool('get_tier_info', 'Get all loyalty tiers with their thresholds, earn rates, and benefits.', [], []),

            $this->tool('search_offers', 'Search active special offers and promotions.', [
                'search'  => ['type' => 'string', 'description' => 'Search in title/description'],
                'active'  => ['type' => 'boolean', 'description' => 'Only active offers (default true)'],
                'limit'   => ['type' => 'integer', 'description' => 'Max results (default 10)'],
            ], []),

            $this->tool('analyze_member', 'Run AI analysis on a loyalty member: churn risk prediction, personalized offer suggestion, and upsell script. Uses GPT-4o.', [
                'member_id' => ['type' => 'integer', 'description' => 'Loyalty member ID (required)'],
            ], ['member_id']),

            $this->tool('create_planner_task', 'Create a new planner task for team assignment.', [
                'title'         => ['type' => 'string', 'description' => 'Task title (required)'],
                'task_date'     => ['type' => 'string', 'description' => 'Date YYYY-MM-DD (required)'],
                'employee_name' => ['type' => 'string', 'description' => 'Assigned employee'],
                'priority'      => ['type' => 'string', 'description' => 'Low, Normal, or High (default Normal)'],
                'task_group'    => ['type' => 'string', 'description' => 'Group category'],
                'start_time'    => ['type' => 'string', 'description' => 'HH:MM'],
                'description'   => ['type' => 'string', 'description' => 'Task details'],
            ], ['title', 'task_date']),

            $this->tool('search_venue_bookings', 'Search venue/event bookings by date, venue, or status.', [
                'date_from' => ['type' => 'string', 'description' => 'From date YYYY-MM-DD'],
                'date_to'   => ['type' => 'string', 'description' => 'To date YYYY-MM-DD'],
                'status'    => ['type' => 'string', 'description' => 'Booking status filter'],
                'limit'     => ['type' => 'integer', 'description' => 'Max results (default 10)'],
            ], []),

            $this->tool('generate_weekly_report', 'Generate and optionally email a weekly performance report covering KPIs, bookings, loyalty, pipeline, and highlights. Returns the report text.', [
                'email_to' => ['type' => 'string', 'description' => 'Email address to send the report to (optional — omit to just display)'],
            ], []),

            $this->tool('detect_anomalies', 'Detect unusual patterns: abnormal point transactions, spending spikes, booking anomalies, and inactive high-value members. Returns flagged items.', [], []),

            $this->tool('forecast_occupancy', 'Predict occupancy for the next 14 days based on confirmed reservations vs property capacity. Returns daily forecast with occupancy percentages.', [
                'property_id' => ['type' => 'integer', 'description' => 'Property ID (optional — omit for all properties combined)'],
            ], []),

            $this->tool('analyze_inquiries_create_followups', 'Analyze open inquiries that need follow-up (no task set, stale, or overdue) and auto-create planner tasks for each. Returns created tasks.', [
                'days_stale' => ['type' => 'integer', 'description' => 'Days without activity to consider stale (default 3)'],
                'assign_to'  => ['type' => 'string', 'description' => 'Employee name to assign tasks to (optional)'],
            ], []),
        ];
    }

    private function tool(string $name, string $desc, array $props, array $required): array
    {
        $schema = ['type' => 'object', 'properties' => (object) $props];
        if ($required) $schema['required'] = $required;
        return ['name' => $name, 'description' => $desc, 'input_schema' => $schema];
    }

    /* ────────── Tool Execution ────────── */

    private function executeTool(string $name, array $in): array
    {
        try {
            return match ($name) {
                'search_guests'          => $this->toolSearchGuests($in),
                'get_guest'              => $this->toolGetGuest($in),
                'search_inquiries'       => $this->toolSearchInquiries($in),
                'search_reservations'    => $this->toolSearchReservations($in),
                'get_hotel_stats'        => $this->toolGetStats(),
                'list_properties'        => $this->toolListProperties(),
                'get_planner_tasks'      => $this->toolGetPlannerTasks($in),
                'create_guest'           => $this->toolCreateGuest($in),
                'update_guest'           => $this->toolUpdateGuest($in),
                'create_inquiry'         => $this->toolCreateInquiry($in),
                'update_inquiry'         => $this->toolUpdateInquiry($in),
                'create_reservation'     => $this->toolCreateReservation($in),
                'update_reservation'     => $this->toolUpdateReservation($in),
                'search_loyalty_members' => $this->toolSearchLoyaltyMembers($in),
                'get_loyalty_member'     => $this->toolGetLoyaltyMember($in),
                'award_points'           => $this->toolAwardPoints($in),
                'redeem_points'          => $this->toolRedeemPoints($in),
                'get_tier_info'          => $this->toolGetTierInfo(),
                'search_offers'          => $this->toolSearchOffers($in),
                'analyze_member'         => $this->toolAnalyzeMember($in),
                'create_planner_task'    => $this->toolCreatePlannerTask($in),
                'search_venue_bookings'  => $this->toolSearchVenueBookings($in),
                'generate_weekly_report' => $this->toolGenerateWeeklyReport($in),
                'detect_anomalies'       => $this->toolDetectAnomalies(),
                'forecast_occupancy'     => $this->toolForecastOccupancy($in),
                'analyze_inquiries_create_followups' => $this->toolAnalyzeInquiriesCreateFollowups($in),
                default                  => ['success' => false, 'data' => ['error' => "Unknown tool: $name"]],
            };
        } catch (\Throwable $e) {
            return ['success' => false, 'data' => ['error' => $e->getMessage()]];
        }
    }

    private function toolSearchGuests(array $in): array
    {
        $q = $in['query']; $limit = min($in['limit'] ?? 5, 20);
        $rows = Guest::where('full_name', 'ilike', "%$q%")
            ->orWhere('email', 'ilike', "%$q%")->orWhere('company', 'ilike', "%$q%")
            ->orWhere('phone', 'ilike', "%$q%")->orWhere('nationality', 'ilike', "%$q%")
            ->limit($limit)->get(['id','full_name','email','phone','company','nationality','vip_level','guest_type','total_stays','total_revenue','member_id','created_at']);
        return ['success' => true, 'data' => $rows->toArray()];
    }

    private function toolGetGuest(array $in): array
    {
        $g = Guest::with([
            'inquiries' => fn($q) => $q->latest()->limit(10),
            'reservations' => fn($q) => $q->latest('check_in')->limit(10),
            'member.tier',
        ])->find($in['id']);
        if (!$g) return ['success' => false, 'data' => ['error' => 'Guest not found']];
        return ['success' => true, 'data' => $g->toArray()];
    }

    private function toolSearchInquiries(array $in): array
    {
        $limit = min($in['limit'] ?? 10, 30);
        $q = Inquiry::with(['guest:id,full_name,company', 'property:id,name,code']);
        if (!empty($in['search'])) {
            $s = $in['search'];
            $q->where(function ($query) use ($s) {
                $query->where('event_name', 'ilike', "%$s%")->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%"));
            });
        }
        if (!empty($in['status'])) $q->where('status', $in['status']);
        if (!empty($in['inquiry_type'])) $q->where('inquiry_type', $in['inquiry_type']);
        if (!empty($in['property_id'])) $q->where('property_id', $in['property_id']);
        return ['success' => true, 'data' => $q->latest()->limit($limit)->get()->toArray()];
    }

    private function toolSearchReservations(array $in): array
    {
        $limit = min($in['limit'] ?? 10, 30);
        $q = Reservation::with(['guest:id,full_name,company,vip_level', 'property:id,name,code']);
        if (!empty($in['search'])) {
            $s = $in['search'];
            $q->where(function ($query) use ($s) {
                $query->where('confirmation_no', 'ilike', "%$s%")->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%"));
            });
        }
        if (!empty($in['status'])) $q->where('status', $in['status']);
        if (!empty($in['property_id'])) $q->where('property_id', $in['property_id']);
        if (!empty($in['check_in_from'])) $q->where('check_in', '>=', $in['check_in_from']);
        if (!empty($in['check_in_to'])) $q->where('check_in', '<=', $in['check_in_to']);
        return ['success' => true, 'data' => $q->latest('check_in')->limit($limit)->get()->toArray()];
    }

    private function toolGetStats(): array
    {
        $today = now()->toDateString();
        return ['success' => true, 'data' => [
            'total_guests'      => Guest::count(),
            'loyalty_members'   => LoyaltyMember::count(),
            'active_inquiries'  => Inquiry::whereNotIn('status', ['Confirmed','Lost'])->count(),
            'pipeline_value'    => (float) Inquiry::whereNotIn('status', ['Confirmed','Lost'])->sum('total_value'),
            'arrivals_today'    => Reservation::where('check_in', $today)->where('status', 'Confirmed')->count(),
            'departures_today'  => Reservation::where('check_out', $today)->where('status', 'Checked In')->count(),
            'in_house'          => Reservation::where('status', 'Checked In')->count(),
            'open_reservations' => Reservation::whereIn('status', ['Confirmed', 'Checked In'])->count(),
        ]];
    }

    private function toolListProperties(): array
    {
        return ['success' => true, 'data' => Property::where('is_active', true)->get(['id','name','code','city','country','room_count'])->toArray()];
    }

    private function toolGetPlannerTasks(array $in): array
    {
        $q = PlannerTask::with('subtasks');
        if (!empty($in['date'])) $q->where('task_date', $in['date']);
        if (!empty($in['week_start'])) $q->whereBetween('task_date', [$in['week_start'], date('Y-m-d', strtotime($in['week_start'] . ' +6 days'))]);
        if (!empty($in['employee'])) $q->where('employee_name', $in['employee']);
        return ['success' => true, 'data' => $q->orderBy('task_date')->orderBy('start_time')->limit(50)->get()->toArray()];
    }

    private function toolCreateGuest(array $in): array
    {
        $g = Guest::create(array_filter([
            'full_name' => $in['full_name'], 'salutation' => $in['salutation'] ?? null,
            'email' => $in['email'] ?? null, 'phone' => $in['phone'] ?? null,
            'company' => $in['company'] ?? null, 'nationality' => $in['nationality'] ?? null,
            'country' => $in['country'] ?? null, 'guest_type' => $in['guest_type'] ?? 'Individual',
            'vip_level' => $in['vip_level'] ?? 'Standard', 'lead_source' => $in['lead_source'] ?? null,
            'notes' => $in['notes'] ?? null,
        ], fn($v) => $v !== null));
        return ['success' => true, 'data' => ['id' => $g->id, 'full_name' => $g->full_name, 'message' => "Guest #{$g->id} created"]];
    }

    private function toolUpdateGuest(array $in): array
    {
        $g = Guest::find($in['id']);
        if (!$g) return ['success' => false, 'data' => ['error' => 'Guest not found']];
        $fields = collect($in)->except('id')->filter(fn($v) => $v !== null)->toArray();
        $g->update($fields);
        return ['success' => true, 'data' => ['id' => $g->id, 'message' => 'Guest updated', 'fields' => array_keys($fields)]];
    }

    private function toolCreateInquiry(array $in): array
    {
        $g = Guest::find($in['guest_id']);
        if (!$g) return ['success' => false, 'data' => ['error' => 'Guest not found']];
        $data = array_filter([
            'guest_id' => $in['guest_id'], 'property_id' => $in['property_id'] ?? null,
            'inquiry_type' => $in['inquiry_type'] ?? 'Room Reservation', 'source' => $in['source'] ?? null,
            'check_in' => $in['check_in'] ?? null, 'check_out' => $in['check_out'] ?? null,
            'num_rooms' => $in['num_rooms'] ?? 1, 'room_type_requested' => $in['room_type_requested'] ?? null,
            'rate_offered' => $in['rate_offered'] ?? null, 'total_value' => $in['total_value'] ?? null,
            'status' => $in['status'] ?? 'New', 'priority' => $in['priority'] ?? 'Medium',
            'assigned_to' => $in['assigned_to'] ?? null, 'special_requests' => $in['special_requests'] ?? null,
            'event_name' => $in['event_name'] ?? null, 'event_pax' => $in['event_pax'] ?? null,
            'notes' => $in['notes'] ?? null,
        ], fn($v) => $v !== null);
        if (!empty($data['check_in']) && !empty($data['check_out'])) {
            $data['num_nights'] = (int) date_diff(date_create($data['check_in']), date_create($data['check_out']))->days;
        }
        $inq = Inquiry::create($data);
        $g->update(['last_activity_at' => now()]);
        return ['success' => true, 'data' => ['id' => $inq->id, 'guest' => $g->full_name, 'message' => "Inquiry #{$inq->id} created for {$g->full_name}"]];
    }

    private function toolUpdateInquiry(array $in): array
    {
        $inq = Inquiry::find($in['id']);
        if (!$inq) return ['success' => false, 'data' => ['error' => 'Inquiry not found']];
        $fields = collect($in)->except('id')->filter(fn($v) => $v !== null)->toArray();
        $inq->update($fields);
        return ['success' => true, 'data' => ['id' => $inq->id, 'message' => 'Inquiry updated']];
    }

    private function toolCreateReservation(array $in): array
    {
        $g = Guest::find($in['guest_id']);
        if (!$g) return ['success' => false, 'data' => ['error' => 'Guest not found']];
        $p = Property::find($in['property_id']);
        if (!$p) return ['success' => false, 'data' => ['error' => 'Property not found']];
        $nights = (int) date_diff(date_create($in['check_in']), date_create($in['check_out']))->days;
        $rate = $in['rate_per_night'] ?? null;
        $total = $in['total_amount'] ?? ($rate ? $rate * $nights * ($in['num_rooms'] ?? 1) : null);
        $confNo = strtoupper($p->code) . '-' . str_pad(Reservation::max('id') + 1, 5, '0', STR_PAD_LEFT);

        $res = Reservation::create(array_filter([
            'guest_id' => $in['guest_id'], 'property_id' => $in['property_id'],
            'confirmation_no' => $confNo,
            'check_in' => $in['check_in'], 'check_out' => $in['check_out'], 'num_nights' => $nights,
            'num_rooms' => $in['num_rooms'] ?? 1, 'room_type' => $in['room_type'] ?? null,
            'rate_per_night' => $rate, 'total_amount' => $total,
            'meal_plan' => $in['meal_plan'] ?? 'Bed & Breakfast',
            'booking_channel' => $in['booking_channel'] ?? null,
            'special_requests' => $in['special_requests'] ?? null,
            'notes' => $in['notes'] ?? null, 'status' => 'Confirmed',
        ], fn($v) => $v !== null));

        return ['success' => true, 'data' => ['id' => $res->id, 'confirmation_no' => $confNo, 'message' => "Reservation {$confNo} created for {$g->full_name}"]];
    }

    private function toolUpdateReservation(array $in): array
    {
        $res = Reservation::find($in['id']);
        if (!$res) return ['success' => false, 'data' => ['error' => 'Reservation not found']];
        $fields = collect($in)->except('id')->filter(fn($v) => $v !== null)->toArray();
        if (($fields['status'] ?? null) === 'Checked In' && !$res->checked_in_at) $fields['checked_in_at'] = now();
        if (($fields['status'] ?? null) === 'Checked Out' && !$res->checked_out_at) $fields['checked_out_at'] = now();
        if (($fields['status'] ?? null) === 'Cancelled' && !$res->cancelled_at) $fields['cancelled_at'] = now();
        $res->update($fields);
        return ['success' => true, 'data' => ['id' => $res->id, 'message' => 'Reservation updated']];
    }

    private function toolSearchLoyaltyMembers(array $in): array
    {
        $limit = min($in['limit'] ?? 5, 20);
        $q = LoyaltyMember::with(['user:id,name,email', 'tier:id,name']);
        if (!empty($in['query'])) {
            $s = $in['query'];
            $q->where(function ($query) use ($s) {
                $query->where('member_number', 'ilike', "%$s%")
                    ->orWhereHas('user', fn($q2) => $q2->where('name', 'ilike', "%$s%")->orWhere('email', 'ilike', "%$s%"));
            });
        }
        if (!empty($in['tier'])) {
            $q->whereHas('tier', fn($q2) => $q2->where('name', 'ilike', "%{$in['tier']}%"));
        }
        return ['success' => true, 'data' => $q->limit($limit)->get()->toArray()];
    }

    private function toolGetLoyaltyMember(array $in): array
    {
        $m = LoyaltyMember::with(['user:id,name,email', 'tier', 'pointsTransactions' => fn($q) => $q->latest()->limit(15)])->find($in['id']);
        if (!$m) return ['success' => false, 'data' => ['error' => 'Member not found']];
        $progress = $m->getProgressToNextTier();
        return ['success' => true, 'data' => array_merge($m->toArray(), [
            'tier_progress' => $progress,
            'summary' => [
                'current_points' => $m->current_points,
                'lifetime_points' => $m->lifetime_points,
                'tier' => $m->tier->name ?? 'None',
                'joined' => $m->joined_at?->format('Y-m-d'),
                'last_activity' => $m->last_activity_at?->format('Y-m-d'),
            ],
        ])];
    }

    private function toolAwardPoints(array $in): array
    {
        $m = LoyaltyMember::find($in['member_id']);
        if (!$m) return ['success' => false, 'data' => ['error' => 'Member not found']];
        $points = min(max($in['points'], 1), 100000);
        $type = $in['type'] ?? 'bonus';
        if (!in_array($type, ['earn', 'bonus', 'adjust'])) $type = 'bonus';

        $loyaltyService = app(\App\Services\LoyaltyService::class);
        $tx = $loyaltyService->awardPoints($m, $points, $in['description'], $type);

        return ['success' => true, 'data' => [
            'transaction_id' => $tx->id,
            'member_id' => $m->id,
            'points_awarded' => $points,
            'new_balance' => $m->fresh()->current_points,
            'message' => "{$points} points awarded to member #{$m->member_number}",
        ]];
    }

    private function toolRedeemPoints(array $in): array
    {
        $m = LoyaltyMember::find($in['member_id']);
        if (!$m) return ['success' => false, 'data' => ['error' => 'Member not found']];
        if ($m->current_points < $in['points']) {
            return ['success' => false, 'data' => ['error' => "Insufficient points. Balance: {$m->current_points}"]];
        }

        $loyaltyService = app(\App\Services\LoyaltyService::class);
        $tx = $loyaltyService->redeemPoints($m, $in['points'], $in['description']);

        return ['success' => true, 'data' => [
            'transaction_id' => $tx->id,
            'member_id' => $m->id,
            'points_redeemed' => $in['points'],
            'new_balance' => $m->fresh()->current_points,
            'message' => "{$in['points']} points redeemed from member #{$m->member_number}",
        ]];
    }

    private function toolGetTierInfo(): array
    {
        $tiers = LoyaltyTier::where('is_active', true)->orderBy('min_points')->get(['id', 'name', 'min_points', 'max_points', 'earn_rate', 'bonus_nights', 'perks', 'color_hex']);
        return ['success' => true, 'data' => $tiers->toArray()];
    }

    private function toolSearchOffers(array $in): array
    {
        $limit = min($in['limit'] ?? 10, 30);
        $q = SpecialOffer::query();
        if ($in['active'] ?? true) $q->active();
        if (!empty($in['search'])) {
            $s = $in['search'];
            $q->where(function ($query) use ($s) {
                $query->where('title', 'ilike', "%$s%")->orWhere('description', 'ilike', "%$s%");
            });
        }
        return ['success' => true, 'data' => $q->latest()->limit($limit)->get(['id', 'title', 'description', 'type', 'value', 'start_date', 'end_date', 'tier_ids', 'is_active', 'is_featured', 'times_used', 'usage_limit'])->toArray()];
    }

    private function toolAnalyzeMember(array $in): array
    {
        $m = LoyaltyMember::with(['tier', 'bookings', 'pointsTransactions', 'user'])->find($in['member_id']);
        if (!$m) return ['success' => false, 'data' => ['error' => 'Member not found']];

        $openAi = app(OpenAiService::class);
        $churn = $openAi->predictChurn($m);
        $offer = $openAi->personalizeOffer($m);
        $upsell = $openAi->suggestUpsell($m);

        return ['success' => true, 'data' => [
            'member' => $m->user->name ?? 'Unknown',
            'tier' => $m->tier->name ?? 'None',
            'points' => $m->current_points,
            'churn_risk' => round($churn, 2),
            'churn_level' => $churn >= 0.7 ? 'HIGH' : ($churn >= 0.4 ? 'MEDIUM' : 'LOW'),
            'personalized_offer' => $offer,
            'upsell_suggestion' => $upsell,
        ]];
    }

    private function toolCreatePlannerTask(array $in): array
    {
        $task = PlannerTask::create(array_filter([
            'title' => $in['title'],
            'task_date' => $in['task_date'],
            'employee_name' => $in['employee_name'] ?? null,
            'priority' => $in['priority'] ?? 'Normal',
            'task_group' => $in['task_group'] ?? null,
            'start_time' => $in['start_time'] ?? null,
            'description' => $in['description'] ?? null,
            'completed' => false,
        ], fn($v) => $v !== null));

        return ['success' => true, 'data' => ['id' => $task->id, 'message' => "Task #{$task->id} created for {$task->task_date}"]];
    }

    private function toolSearchVenueBookings(array $in): array
    {
        $limit = min($in['limit'] ?? 10, 30);
        $q = VenueBooking::with(['venue:id,name,venue_type']);
        if (!empty($in['date_from'])) $q->where('booking_date', '>=', $in['date_from']);
        if (!empty($in['date_to'])) $q->where('booking_date', '<=', $in['date_to']);
        if (!empty($in['status'])) $q->where('status', $in['status']);
        return ['success' => true, 'data' => $q->orderBy('booking_date')->limit($limit)->get()->toArray()];
    }

    /* ────────── Advanced AI Tools ────────── */

    private function toolGenerateWeeklyReport(array $in): array
    {
        $now   = now();
        $from  = $now->copy()->subDays(7)->toDateString();
        $to    = $now->toDateString();
        $prevFrom = $now->copy()->subDays(14)->toDateString();
        $prevTo   = $now->copy()->subDays(7)->toDateString();

        // Current week metrics
        $newGuests      = Guest::whereBetween('created_at', [$from, $to])->count();
        $newMembers     = LoyaltyMember::whereBetween('created_at', [$from, $to])->count();
        $newInquiries   = Inquiry::whereBetween('created_at', [$from, $to])->count();
        $confirmedInq   = Inquiry::where('status', 'Confirmed')->whereBetween('updated_at', [$from, $to])->count();
        $lostInq        = Inquiry::where('status', 'Lost')->whereBetween('updated_at', [$from, $to])->count();
        $reservations   = Reservation::whereBetween('created_at', [$from, $to]);
        $resCount       = (clone $reservations)->count();
        $resRevenue     = round((float) (clone $reservations)->sum('total_amount'), 2);
        $checkIns       = Reservation::where('status', 'Checked In')->whereBetween('checked_in_at', [$from, $to])->count();
        $checkOuts      = Reservation::whereNotNull('checked_out_at')->whereBetween('checked_out_at', [$from, $to])->count();
        $pointsAwarded  = (int) PointsTransaction::where('type', 'earn')->whereBetween('created_at', [$from, $to])->sum('points');
        $pointsRedeemed = (int) PointsTransaction::where('type', 'redeem')->whereBetween('created_at', [$from, $to])->sum('points');
        $pipelineValue  = round((float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value'), 2);

        // Previous week for comparison
        $prevGuests  = Guest::whereBetween('created_at', [$prevFrom, $prevTo])->count();
        $prevRes     = Reservation::whereBetween('created_at', [$prevFrom, $prevTo])->count();
        $prevRevenue = round((float) Reservation::whereBetween('created_at', [$prevFrom, $prevTo])->sum('total_amount'), 2);

        // Top performers
        $topMembers = LoyaltyMember::with('user:id,name')
            ->whereHas('pointsTransactions', fn($q) => $q->where('type', 'earn')->whereBetween('created_at', [$from, $to]))
            ->withSum(['pointsTransactions as week_points' => fn($q) => $q->where('type', 'earn')->whereBetween('created_at', [$from, $to])], 'points')
            ->orderByDesc('week_points')->limit(5)->get()
            ->map(fn($m) => ['name' => $m->user?->name, 'points' => (int) $m->week_points])->toArray();

        $currencyRaw = CrmSetting::where('key', 'currency_symbol')->value('value') ?? '€';
        $currency = is_string($currencyRaw) ? (json_decode($currencyRaw, true) ?? $currencyRaw) : $currencyRaw;

        $report = [
            'period'       => "{$from} to {$to}",
            'guests'       => ['new' => $newGuests, 'prev_week' => $prevGuests],
            'members'      => ['new' => $newMembers],
            'inquiries'    => ['new' => $newInquiries, 'confirmed' => $confirmedInq, 'lost' => $lostInq, 'pipeline_value' => $pipelineValue],
            'reservations' => ['new' => $resCount, 'prev_week' => $prevRes, 'revenue' => $resRevenue, 'prev_revenue' => $prevRevenue],
            'operations'   => ['check_ins' => $checkIns, 'check_outs' => $checkOuts],
            'loyalty'      => ['points_awarded' => $pointsAwarded, 'points_redeemed' => $pointsRedeemed],
            'top_earners'  => $topMembers,
            'currency'     => $currency,
        ];

        // Email if requested
        if (!empty($in['email_to'])) {
            $email = $in['email_to'];
            $subject = "Weekly Hotel Report — {$from} to {$to}";
            $html = "<h2>Weekly Performance Report</h2><p><strong>Period:</strong> {$from} to {$to}</p>"
                . "<h3>Guests & Members</h3><p>New guests: {$newGuests} | New members: {$newMembers}</p>"
                . "<h3>Inquiries</h3><p>New: {$newInquiries} | Confirmed: {$confirmedInq} | Lost: {$lostInq} | Pipeline: {$currency}{$pipelineValue}</p>"
                . "<h3>Reservations</h3><p>New: {$resCount} | Revenue: {$currency}{$resRevenue}</p>"
                . "<h3>Operations</h3><p>Check-ins: {$checkIns} | Check-outs: {$checkOuts}</p>"
                . "<h3>Loyalty</h3><p>Points awarded: {$pointsAwarded} | Redeemed: {$pointsRedeemed}</p>";

            Mail::html($html, function ($msg) use ($email, $subject) {
                $msg->to($email)->subject($subject);
            });
            $report['emailed_to'] = $email;
        }

        return ['success' => true, 'data' => $report];
    }

    private function toolDetectAnomalies(): array
    {
        $anomalies = [];

        // 1. Unusually large point transactions (last 7 days, > 3x average)
        $avgPoints = (float) PointsTransaction::where('type', 'earn')->avg('points') ?: 100;
        $threshold = $avgPoints * 3;
        $largeTransactions = PointsTransaction::with(['member.user:id,name'])
            ->where('type', 'earn')
            ->where('points', '>', $threshold)
            ->where('created_at', '>=', now()->subDays(7))
            ->latest()->limit(10)->get();

        foreach ($largeTransactions as $tx) {
            $anomalies[] = [
                'type'     => 'large_point_transaction',
                'severity' => 'warning',
                'detail'   => "{$tx->points} pts awarded to {$tx->member?->user?->name} (avg is " . round($avgPoints) . ")",
                'entity'   => "PointsTransaction #{$tx->id}",
                'date'     => $tx->created_at?->toDateString(),
            ];
        }

        // 2. High-value members inactive > 60 days
        $inactiveVIPs = LoyaltyMember::with(['user:id,name', 'tier:id,name'])
            ->where('lifetime_points', '>', 5000)
            ->where('is_active', true)
            ->where(function ($q) {
                $q->where('last_activity_at', '<', now()->subDays(60))
                  ->orWhereNull('last_activity_at');
            })
            ->orderByDesc('lifetime_points')->limit(10)->get();

        foreach ($inactiveVIPs as $m) {
            $lastActivity = $m->last_activity_at?->toDateString() ?? 'never';
            $anomalies[] = [
                'type'     => 'inactive_high_value_member',
                'severity' => 'attention',
                'detail'   => "{$m->user?->name} ({$m->tier?->name}, {$m->lifetime_points} lifetime pts) — last active: {$lastActivity}",
                'entity'   => "Member #{$m->id}",
                'date'     => $lastActivity,
            ];
        }

        // 3. Booking revenue outliers (last 30 days, > 3x average)
        $avgRevenue = (float) Reservation::whereNotNull('total_amount')->where('total_amount', '>', 0)->avg('total_amount') ?: 500;
        $revThreshold = $avgRevenue * 3;
        $highBookings = Reservation::with(['guest:id,full_name'])
            ->where('total_amount', '>', $revThreshold)
            ->where('created_at', '>=', now()->subDays(30))
            ->latest()->limit(10)->get();

        foreach ($highBookings as $r) {
            $anomalies[] = [
                'type'     => 'high_value_booking',
                'severity' => 'info',
                'detail'   => "Reservation #{$r->id} ({$r->guest?->full_name}) — " . number_format($r->total_amount, 2) . " (avg " . number_format($avgRevenue, 2) . ")",
                'entity'   => "Reservation #{$r->id}",
                'date'     => $r->created_at?->toDateString(),
            ];
        }

        // 4. Sudden point redemption spikes (member redeemed > 50% of balance in one go)
        $bigRedemptions = PointsTransaction::with(['member.user:id,name'])
            ->where('type', 'redeem')
            ->where('created_at', '>=', now()->subDays(7))
            ->latest()->limit(30)->get();

        foreach ($bigRedemptions as $tx) {
            $member = $tx->member;
            if ($member) {
                $total = $member->current_points + abs($tx->points);
                if ($total > 0 && (abs($tx->points) / $total) > 0.5) {
                    $anomalies[] = [
                        'type'     => 'large_redemption',
                        'severity' => 'warning',
                        'detail'   => "{$member->user?->name} redeemed " . abs($tx->points) . " pts (" . round(abs($tx->points) / $total * 100) . "% of balance)",
                        'entity'   => "Member #{$member->id}",
                        'date'     => $tx->created_at?->toDateString(),
                    ];
                }
            }
        }

        // 5. Cancelled reservation spike (last 7 days vs prev 7 days)
        $recentCancels = Reservation::where('status', 'Cancelled')->where('cancelled_at', '>=', now()->subDays(7))->count();
        $prevCancels   = Reservation::where('status', 'Cancelled')->whereBetween('cancelled_at', [now()->subDays(14), now()->subDays(7)])->count();
        if ($recentCancels > 0 && ($prevCancels == 0 || $recentCancels / max($prevCancels, 1) >= 2)) {
            $anomalies[] = [
                'type'     => 'cancellation_spike',
                'severity' => 'warning',
                'detail'   => "{$recentCancels} cancellations this week vs {$prevCancels} last week",
                'entity'   => 'Reservations',
                'date'     => now()->toDateString(),
            ];
        }

        return ['success' => true, 'data' => [
            'anomaly_count' => count($anomalies),
            'anomalies'     => $anomalies,
            'thresholds'    => [
                'points_avg'  => round($avgPoints),
                'points_3x'   => round($threshold),
                'revenue_avg' => round($avgRevenue, 2),
                'revenue_3x'  => round($revThreshold, 2),
            ],
        ]];
    }

    private function toolForecastOccupancy(array $in): array
    {
        $propertyId = $in['property_id'] ?? null;
        $today = now()->toDateString();
        $endDate = now()->addDays(13)->toDateString();

        // Total room capacity
        $capacityQuery = Property::where('is_active', true);
        if ($propertyId) $capacityQuery->where('id', $propertyId);
        $totalRooms = (int) $capacityQuery->sum('room_count') ?: 100; // fallback

        $propertyName = $propertyId ? Property::find($propertyId)?->name : 'All Properties';

        // Get confirmed + checked-in reservations overlapping the 14-day window
        $reservations = Reservation::whereIn('status', ['Confirmed', 'Checked In'])
            ->where('check_in', '<=', $endDate)
            ->where('check_out', '>=', $today)
            ->when($propertyId, fn($q) => $q->where('property_id', $propertyId))
            ->get(['check_in', 'check_out', 'num_rooms']);

        $forecast = [];
        for ($i = 0; $i < 14; $i++) {
            $date = now()->addDays($i)->toDateString();
            $dayName = now()->addDays($i)->format('D');
            $occupiedRooms = 0;

            foreach ($reservations as $res) {
                $ci = $res->check_in->toDateString();
                $co = $res->check_out->toDateString();
                if ($date >= $ci && $date < $co) {
                    $occupiedRooms += $res->num_rooms ?? 1;
                }
            }

            $pct = $totalRooms > 0 ? round($occupiedRooms / $totalRooms * 100, 1) : 0;
            $forecast[] = [
                'date'           => $date,
                'day'            => $dayName,
                'occupied_rooms' => $occupiedRooms,
                'total_rooms'    => $totalRooms,
                'occupancy_pct'  => $pct,
                'status'         => $pct >= 90 ? 'near_full' : ($pct >= 70 ? 'healthy' : ($pct >= 40 ? 'moderate' : 'low')),
            ];
        }

        $avgOccupancy = count($forecast) > 0 ? round(array_sum(array_column($forecast, 'occupancy_pct')) / count($forecast), 1) : 0;
        $peakDay = collect($forecast)->sortByDesc('occupancy_pct')->first();
        $lowDay  = collect($forecast)->sortBy('occupancy_pct')->first();

        return ['success' => true, 'data' => [
            'property'       => $propertyName,
            'total_rooms'    => $totalRooms,
            'avg_occupancy'  => $avgOccupancy,
            'peak_day'       => $peakDay,
            'lowest_day'     => $lowDay,
            'daily_forecast' => $forecast,
        ]];
    }

    private function toolAnalyzeInquiriesCreateFollowups(array $in): array
    {
        $daysStale = $in['days_stale'] ?? 3;
        $assignTo  = $in['assign_to'] ?? null;
        $staleDate = now()->subDays($daysStale)->toDateString();

        // Find open inquiries needing follow-up
        $inquiries = Inquiry::with(['guest:id,full_name', 'property:id,name,code'])
            ->whereNotIn('status', ['Confirmed', 'Lost'])
            ->where(function ($q) use ($staleDate) {
                // No next task set
                $q->whereNull('next_task_due')
                // Or task is overdue
                ->orWhere(function ($q2) {
                    $q2->where('next_task_due', '<', now()->toDateString())->where('next_task_completed', false);
                })
                // Or no activity for N days
                ->orWhere('updated_at', '<', $staleDate);
            })
            ->orderBy('total_value', 'desc')
            ->limit(20)
            ->get();

        $createdTasks = [];
        foreach ($inquiries as $inq) {
            $guestName = $inq->guest?->full_name ?? 'Unknown';
            $propName  = $inq->property?->name ?? '';
            $value     = $inq->total_value ? " ({$inq->total_value})" : '';

            // Determine task type and priority
            $isOverdue = $inq->next_task_due && $inq->next_task_due < now()->toDateString() && !$inq->next_task_completed;
            $priority  = $isOverdue ? 'High' : ($inq->priority === 'High' ? 'High' : 'Normal');

            $title = $isOverdue
                ? "Overdue follow-up: {$guestName} — {$inq->inquiry_type}{$value}"
                : "Follow up: {$guestName} — {$inq->inquiry_type}{$value}";

            $description = "Auto-generated from inquiry #{$inq->id}."
                . " Status: {$inq->status}."
                . ($propName ? " Property: {$propName}." : '')
                . ($inq->check_in ? " Check-in: {$inq->check_in->toDateString()}." : '')
                . ($inq->special_requests ? " Notes: {$inq->special_requests}" : '');

            $task = PlannerTask::create([
                'title'         => $title,
                'task_date'     => now()->addDay()->toDateString(),
                'employee_name' => $assignTo ?? $inq->assigned_to,
                'priority'      => $priority,
                'task_group'    => 'Sales',
                'description'   => $description,
                'completed'     => false,
            ]);

            // Update inquiry's next task
            $inq->update([
                'next_task_type'      => 'Follow-up',
                'next_task_due'       => now()->addDay()->toDateString(),
                'next_task_completed' => false,
            ]);

            $createdTasks[] = [
                'task_id'    => $task->id,
                'inquiry_id' => $inq->id,
                'guest'      => $guestName,
                'title'      => $title,
                'priority'   => $priority,
                'assigned_to'=> $task->employee_name,
                'due_date'   => $task->task_date->toDateString(),
            ];
        }

        return ['success' => true, 'data' => [
            'inquiries_analyzed' => $inquiries->count(),
            'tasks_created'      => count($createdTasks),
            'tasks'              => $createdTasks,
        ]];
    }
}
