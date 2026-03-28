<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\PlannerTask;
use App\Models\Property;
use App\Models\Reservation;
use App\Models\CorporateAccount;
use Illuminate\Support\Facades\Http;

class CrmAiService
{
    private string $apiKey;
    private string $model;
    private int $maxRounds = 8;

    public function __construct()
    {
        $this->apiKey = env('ANTHROPIC_API_KEY', '');
        $this->model  = env('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514');
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
        $roomTypes = json_decode($settings['room_types'] ?? '[]', true);
        $sources   = json_decode($settings['lead_sources'] ?? '[]', true);
        $inquiryTypes = json_decode($settings['inquiry_types'] ?? '[]', true);

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
        $roomTypes  = implode(', ', json_decode($settings['room_types'] ?? '[]', true));
        $inqTypes   = implode(', ', json_decode($settings['inquiry_types'] ?? '[]', true));
        $inqStatuses= implode(', ', json_decode($settings['inquiry_statuses'] ?? '[]', true));
        $resStatuses= implode(', ', json_decode($settings['reservation_statuses'] ?? '[]', true));
        $employees  = implode(', ', json_decode($settings['employees'] ?? '[]', true));
        $currency   = json_decode($settings['currency_symbol'] ?? '"€"', true);
        $mealPlans  = implode(', ', json_decode($settings['meal_plans'] ?? '[]', true));

        $properties = Property::where('is_active', true)->get(['id', 'name', 'code'])->map(fn($p) => "{$p->name} ({$p->code}, ID:{$p->id})")->implode(', ');

        $guestCount   = Guest::count();
        $memberCount  = LoyaltyMember::count();
        $activeInq    = Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->count();
        $pipelineVal  = (float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value');
        $inHouse      = Reservation::where('status', 'Checked In')->count();
        $arrivalsToday= Reservation::where('check_in', now()->toDateString())->where('status', 'Confirmed')->count();
        $today        = now()->toDateString();

        return <<<PROMPT
You are an AI assistant for a unified Hotel CRM & Loyalty platform. You help manage guest profiles, inquiries (sales pipeline), reservations, properties, loyalty members, planner tasks, and more.

Hotel snapshot ({$today}):
- {$guestCount} guests, {$memberCount} loyalty members, {$activeInq} active inquiries ({$currency}{$pipelineVal} pipeline)
- {$inHouse} in-house guests, {$arrivalsToday} arrivals today

Properties: {$properties}
Room types: {$roomTypes}
Inquiry types: {$inqTypes}
Inquiry statuses: {$inqStatuses}
Reservation statuses: {$resStatuses}
Meal plans: {$mealPlans}
Team: {$employees}
Currency: {$currency}

Rules:
- Always use tools for real data — never invent IDs, names, or numbers.
- When creating/updating records, state what you did with IDs.
- Be concise. Use bullet points for lists.
- Monetary values use {$currency}.
- If ambiguous, ask a clarifying question.
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
}
