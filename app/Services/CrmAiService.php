<?php

namespace App\Services;

use App\Models\BookingMirror;
use App\Models\CrmSetting;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Property;
use App\Models\Reservation;
use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Http;

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

        $toolset  = new CrmAiToolset();
        $system   = $this->buildSystemPrompt();
        $messages = $this->toClaudeMessages($userMessages);
        $tools    = $toolset->getTools();
        $actions  = [];

        for ($i = 0; $i < $this->maxRounds; $i++) {
            $res = $this->call($system, $messages, $tools);
            if (!isset($res['content'])) return ['response' => 'Failed to reach AI service.', 'actions' => $actions];

            $hasToolUse  = false;
            $toolResults = [];

            foreach ($res['content'] as $block) {
                if (($block['type'] ?? '') === 'tool_use') {
                    $hasToolUse = true;
                    $result     = $toolset->executeTool($block['name'], $block['input'] ?? []);
                    $actions[]  = ['tool' => $block['name'], 'input' => $block['input'] ?? [], 'success' => $result['success']];
                    $toolResults[] = ['type' => 'tool_result', 'tool_use_id' => $block['id'], 'content' => json_encode($result['data'])];
                }
            }

            if (!$hasToolUse) return ['response' => $this->extractText($res['content']), 'actions' => $actions];

            // Sanitize the assistant content before round 2. Anthropic's
            // tool_use blocks must have `input` as a JSON object, even when
            // it's empty -- but PHP's json_decode parses `{}` as an empty
            // array which re-encodes as `[]` (JSON array), tripping the
            // validator with "messages.N.content[K].input: Input should be
            // an object". Force empty/numeric tool inputs back to stdClass
            // so they serialize as `{}`.
            $cleanContent = array_map(function ($block) {
                if (($block['type'] ?? '') === 'tool_use') {
                    $input = $block['input'] ?? [];
                    if (!is_array($input) || empty($input) || array_is_list($input)) {
                        $block['input'] = (object) (is_array($input) ? $input : []);
                    }
                }
                return $block;
            }, $res['content']);

            $messages[] = ['role' => 'assistant', 'content' => $cleanContent];
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
                    'customer_name'    => ['type' => 'string', 'description' => 'Full name of the guest/customer'],
                    'email'            => ['type' => 'string', 'description' => 'Email if found'],
                    'phone'            => ['type' => 'string', 'description' => 'Phone if found'],
                    'company'          => ['type' => 'string', 'description' => 'Company name'],
                    'country'          => ['type' => 'string', 'description' => 'Country of residence'],
                    'nationality'      => ['type' => 'string', 'description' => 'Nationality if explicitly mentioned'],
                    'guest_type'       => ['type' => 'string', 'description' => 'Guest type (Individual, Corporate, Group, etc.)'],
                    'vip_level'        => ['type' => 'string', 'description' => 'VIP level if mentioned (Standard, Silver, Gold, Platinum, Diamond)'],
                    'inquiry_type'     => ['type' => 'string', 'description' => 'Type of inquiry (Booking, Event, MICE, Quote, etc.)'],
                    'check_in'         => ['type' => 'string', 'description' => 'Check-in date YYYY-MM-DD'],
                    'check_out'        => ['type' => 'string', 'description' => 'Check-out date YYYY-MM-DD'],
                    'num_rooms'        => ['type' => 'integer', 'description' => 'Number of rooms'],
                    'num_adults'       => ['type' => 'integer', 'description' => 'Number of adults'],
                    'num_children'     => ['type' => 'integer', 'description' => 'Number of children'],
                    'room_type'        => ['type' => 'string', 'description' => 'Requested room type'],
                    'total_value'      => ['type' => 'number', 'description' => 'Estimated value'],
                    'source'           => ['type' => 'string', 'description' => 'Lead source channel (Email, WhatsApp, Phone, Website, etc.)'],
                    'special_requests' => ['type' => 'string', 'description' => 'Any special requests'],
                    'notes'            => ['type' => 'string', 'description' => 'Summary of the inquiry'],
                    'priority'         => ['type' => 'string', 'enum' => ['Low', 'Medium', 'High']],
                    'event_name'       => ['type' => 'string', 'description' => 'Event name if MICE'],
                    'event_pax'        => ['type' => 'integer', 'description' => 'Event attendees if MICE'],
                ],
                'required' => ['customer_name', 'notes'],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract guest inquiry information:\n\n" . $text]];
        $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_extracted_inquiry']);

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && $block['name'] === 'save_extracted_inquiry') {
                $data = $block['input'];
                // Backwards-compat: accept old field names if Claude returns them
                if (isset($data['guest_name']) && empty($data['customer_name'])) {
                    $data['customer_name'] = $data['guest_name'];
                }
                if (empty($data['country']) && !empty($data['nationality'])) {
                    $data['country'] = $data['nationality'];
                }
                return ['success' => true, 'data' => $data];
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

    /**
     * Pull a CRM guest (customer) out of unstructured text — email
     * Sibling to extractLead() but built for the chat widget's auto-
     * capture pipeline. Key differences:
     *
     *   - Vertical-neutral system prompt (no hotel jargon). The same
     *     widget ships across hospitality, beauty, legal, real-estate,
     *     manufacturing, agency, etc. -- "room_type" naming would
     *     confuse the model for verticals where the product is a
     *     business card or a metal sign.
     *   - Takes the visitor's accumulated chat messages, not a single
     *     paste. The first message in a chat almost always contains
     *     the name + company + product + ballpark price; later
     *     messages refine.
     *   - Schema gives generic field names that map cleanly onto the
     *     inquiries.{subject, room_type_requested, num_rooms, total_value}
     *     legacy columns (re-used as product / quantity / price).
     *
     * Returns the same { success, data } shape as the other extract*
     * methods so callers can integrate uniformly.
     */
    public function extractLeadFromChat(string $conversationText): array
    {
        if (!$this->apiKey) return ['success' => false, 'error' => 'AI not configured'];
        if (mb_strlen(trim($conversationText)) < 12) return ['success' => false, 'error' => 'Too little context'];

        $system = "You extract sales-lead information from chat-widget transcripts. "
            . "The widget is embedded on the customer's own website and serves a wide range "
            . "of industries: hospitality, beauty/spa, medical, legal, real-estate, agencies, "
            . "manufacturing, restaurants, education, fitness. Never assume hotel context.\n\n"
            . "Goal: pull EXACTLY what the visitor stated. Do not invent values. Leave fields "
            . "blank when the visitor never mentioned them. Do not guess country from language. "
            . "Do not guess a price band -- only fill it if the visitor named a number or a "
            . "stated budget. Do not guess company size or quantity.\n\n"
            . "Field-mapping conventions used by callers:\n"
            . "  product           = what the visitor wants to buy / book / order (free text)\n"
            . "  quantity          = how many units, if explicit\n"
            . "  estimated_value   = total budget or price the visitor mentioned (numeric)\n"
            . "  subject           = a one-sentence summary of the request (you write this)\n"
            . "  inquiry_type      = Quote / Booking / Support / Partnership / Other\n\n"
            . "Use the message context to write a short professional subject line that names "
            . "the product + quantity when possible (e.g. 'Quote: 500 premium metal cards'). "
            . "Keep the subject under 90 chars.";

        $tools = [[
            'name' => 'save_chat_lead',
            'description' => 'Save the structured lead pulled from the chat transcript.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'customer_name'    => ['type' => 'string', 'description' => 'Full name the visitor introduced themselves with'],
                    'email'            => ['type' => 'string', 'description' => 'Email mentioned in the conversation'],
                    'phone'            => ['type' => 'string', 'description' => 'Phone mentioned in the conversation'],
                    'company'          => ['type' => 'string', 'description' => 'Company / brand name the visitor represents'],
                    'position_title'   => ['type' => 'string', 'description' => 'Job title / role (e.g. Founder, Marketing Manager)'],
                    'country'          => ['type' => 'string', 'description' => 'Country if EXPLICITLY mentioned (do not infer from language)'],
                    'guest_type'       => ['type' => 'string', 'enum' => ['Individual', 'Corporate', 'Travel Agent', 'Group'], 'description' => 'Best-fit category'],
                    'inquiry_type'     => ['type' => 'string', 'description' => 'Quote, Booking, Support, Partnership, Information, Other'],
                    'product'          => ['type' => 'string', 'description' => 'What the visitor wants to purchase / book (free text, no hotel jargon)'],
                    'quantity'         => ['type' => 'integer', 'description' => 'Number of units / rooms / sessions if explicit'],
                    'estimated_value' => ['type' => 'number', 'description' => 'Total value the visitor mentioned (number only, no currency)'],
                    'subject'          => ['type' => 'string', 'description' => 'One-sentence summary of the request, < 90 chars'],
                    'special_requests' => ['type' => 'string', 'description' => 'Customisations / requirements the visitor listed'],
                    'priority'         => ['type' => 'string', 'enum' => ['Low', 'Normal', 'High'], 'description' => 'High only if the visitor explicitly signals urgency'],
                ],
                'required' => [],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract sales-lead information from this chat transcript:\n\n" . $conversationText]];

        try {
            $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_chat_lead']);
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => 'Extraction call failed: ' . $e->getMessage()];
        }

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && ($block['name'] ?? '') === 'save_chat_lead') {
                return ['success' => true, 'data' => (array) ($block['input'] ?? [])];
            }
        }

        return ['success' => false, 'error' => 'No structured fields extracted'];
    }

    /**
     * signature, scraped contact card, manual paste from a business
     * card photo, etc. Mirrors extractMember but with Guest-table
     * fields (company, position_title, location, VIP/importance).
     *
     * Defensive on AI failure: returns `success=false` so the caller
     * can prompt the staff to fall back to manual entry rather than
     * shipping nulls into the database.
     */
    public function extractGuest(string $text): array
    {
        if (!$this->apiKey) return ['success' => false, 'error' => 'AI not configured — add ANTHROPIC_API_KEY to .env'];

        $system = "You extract CRM customer (guest) information from raw unstructured text — email "
            . "signatures, business cards, scraped contact pages, WhatsApp messages, phone notes, etc. "
            . "This is for a hospitality CRM. Focus on people the hotel does (or might do) business with. "
            . "Distinguish individual leisure travellers ('Individual') from B2B / corporate contacts "
            . "('Corporate'). When in doubt about VIP / importance, leave them blank — never invent. "
            . "Phone numbers should be normalised to international format with the country code when "
            . "the surrounding context implies one.";

        $tools = [[
            'name' => 'save_extracted_guest',
            'description' => 'Save the extracted guest profile.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'full_name'       => ['type' => 'string', 'description' => 'Full name of the person'],
                    'first_name'      => ['type' => 'string', 'description' => 'First name if separable'],
                    'last_name'       => ['type' => 'string', 'description' => 'Last name / surname if separable'],
                    'email'           => ['type' => 'string', 'description' => 'Email address'],
                    'phone'           => ['type' => 'string', 'description' => 'Phone or mobile number'],
                    'company'         => ['type' => 'string', 'description' => 'Company / organization name (B2B contacts)'],
                    'position_title'  => ['type' => 'string', 'description' => 'Job title / role (e.g. Director, Manager)'],
                    'guest_type'      => ['type' => 'string', 'description' => 'Individual or Corporate', 'enum' => ['Individual', 'Corporate']],
                    'nationality'     => ['type' => 'string', 'description' => 'Nationality if mentioned'],
                    'country'         => ['type' => 'string', 'description' => 'Country of residence'],
                    'city'            => ['type' => 'string', 'description' => 'City'],
                    'vip_level'       => ['type' => 'string', 'description' => 'VIP level only if explicitly mentioned', 'enum' => ['Standard', 'VIP', 'VVIP', 'Platinum']],
                    'importance'      => ['type' => 'string', 'description' => 'Importance only if explicitly mentioned', 'enum' => ['Normal', 'High', 'Critical']],
                    'notes'           => ['type' => 'string', 'description' => 'Any additional context that doesn\'t fit other fields (special requests, preferences, the source of the data, etc.)'],
                ],
                'required' => ['full_name'],
            ],
        ]];

        $messages = [['role' => 'user', 'content' => "Extract a CRM customer profile from this text:\n\n" . $text]];
        $res = $this->call($system, $messages, $tools, ['type' => 'tool', 'name' => 'save_extracted_guest']);

        foreach ($res['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'tool_use' && $block['name'] === 'save_extracted_guest') {
                return ['success' => true, 'data' => $block['input']];
            }
        }

        return ['success' => false, 'error' => 'Could not extract a guest profile from the text.'];
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
        // Plan-cap gate: refuse early if the org's plan doesn't include
        // this model. Throws so the controller can surface a clear
        // upgrade-your-plan message instead of silently failing the call.
        $org = app()->bound('current_organization_id')
            ? \App\Models\Organization::find((int) app('current_organization_id'))
            : null;
        if ($org && !app(\App\Services\AiUsageService::class)->isModelAllowed($org, $this->model)) {
            $allowed = (array) ($org->featureValue('ai_allowed_models') ?? []);
            throw new \App\Exceptions\AiModelNotAllowed($this->model, $allowed);
        }

        $body = ['model' => $this->model, 'max_tokens' => 4096, 'system' => $system, 'messages' => $messages];
        if ($tools)      $body['tools']       = $tools;
        if ($toolChoice) $body['tool_choice']  = $toolChoice;

        $maxAttempts = 3;
        $lastError   = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = Http::timeout(90)->withHeaders([
                    'x-api-key' => $this->apiKey, 'anthropic-version' => '2023-06-01', 'content-type' => 'application/json',
                ])->post('https://api.anthropic.com/v1/messages', $body);
            } catch (\Throwable $e) {
                \Log::warning('CrmAi HTTP attempt failed', ['attempt' => $attempt, 'error' => $e->getMessage()]);
                $lastError = 'AI service unreachable: ' . $e->getMessage();
                if ($attempt < $maxAttempts) { usleep($attempt * 500_000); continue; }
                return ['content' => [['type' => 'text', 'text' => $lastError]]];
            }

            if ($response->successful()) {
                $json = $response->json() ?? ['content' => [['type' => 'text', 'text' => 'Empty response from AI service.']]];

                // Record usage for billing + plan-cap enforcement. Anthropic
                // returns usage.input_tokens / usage.output_tokens. Wrapped
                // in app()-resolution so this service can still be used in
                // contexts where the container isn't bound.
                $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;
                if ($orgId) {
                    app(\App\Services\AiUsageService::class)->recordUsage(
                        orgId:        $orgId,
                        model:        $this->model,
                        inputTokens:  (int) ($json['usage']['input_tokens']  ?? 0),
                        outputTokens: (int) ($json['usage']['output_tokens'] ?? 0),
                        feature:      'crm_chat',
                    );
                }
                return $json;
            }

            $status = $response->status();
            // Retry on 429 (rate-limit), 500 (server error), 529 (overloaded)
            if (in_array($status, [429, 500, 529]) && $attempt < $maxAttempts) {
                $delay = $status === 429
                    ? (int) ($response->header('retry-after') ?: $attempt * 2)
                    : $attempt;
                \Log::warning('CrmAi retryable error', ['attempt' => $attempt, 'status' => $status, 'delay' => $delay]);
                sleep($delay);
                continue;
            }

            $bodyPreview = substr($response->body(), 0, 500);
            \Log::warning('CrmAi non-2xx', ['status' => $status, 'body' => $bodyPreview]);
            return ['content' => [['type' => 'text', 'text' => 'API error ' . $status . ': ' . $bodyPreview]]];
        }

        return ['content' => [['type' => 'text', 'text' => $lastError ?? 'AI call failed after retries.']]];
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
        // Defensive helper: each lookup is wrapped so a single failed query (missing
        // table during migration, scope error, missing org context) cannot 500 the
        // entire AI chat — we just substitute an empty value and keep going.
        $safe = function (callable $fn, $default = null) {
            try { return $fn(); }
            catch (\Throwable $e) {
                \Log::warning('CrmAi buildSystemPrompt sub-query failed', ['error' => $e->getMessage()]);
                return $default;
            }
        };

        // Industry Platform Plan Phase 7 — resolve org industry for the
        // admin AI's persona + capability headings + snapshot label.
        // Falls back to hotel for unknown / unbound contexts (hotel
        // profile is the canonical-English back-compat default).
        $industry = $safe(
            fn () => \App\Models\Organization::find(\Illuminate\Support\Facades\Auth::user()?->organization_id)?->resolved_industry,
            \App\Models\Organization::DEFAULT_INDUSTRY
        ) ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile = app(\App\Services\IndustryPrompts\IndustryPromptService::class)->for($industry);
        $workspaceLabel = $profile->workspaceLabel;
        $platformName = $industry === 'hotel'
            ? 'Hotel Tech'
            : 'HexaTech ' . ucfirst($workspaceLabel);

        $settings = $safe(fn() => CrmSetting::all()->pluck('value', 'key')->toArray(), []);
        $roomTypes  = implode(', ', ($settings['room_types'] ?? []));
        $inqTypes   = implode(', ', ($settings['inquiry_types'] ?? []));
        $inqStatuses= implode(', ', ($settings['inquiry_statuses'] ?? []));
        $resStatuses= implode(', ', ($settings['reservation_statuses'] ?? []));
        $employees  = implode(', ', ($settings['employees'] ?? []));
        $currency   = ($settings['currency_symbol'] ?? '€');
        $mealPlans  = implode(', ', ($settings['meal_plans'] ?? []));

        $properties = $safe(fn() => Property::where('is_active', true)->get(['id', 'name', 'code'])->map(fn($p) => "{$p->name} ({$p->code}, ID:{$p->id})")->implode(', '), '');

        $guestCount   = $safe(fn() => Guest::count(), 0);
        $memberCount  = $safe(fn() => LoyaltyMember::count(), 0);
        $activeInq    = $safe(fn() => Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->count(), 0);
        $pipelineVal  = $safe(fn() => (float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value'), 0.0);
        $inHouse      = $safe(fn() => Reservation::where('status', 'Checked In')->count(), 0);
        $arrivalsToday= $safe(fn() => Reservation::where('check_in', now()->toDateString())->where('status', 'Confirmed')->count(), 0);
        $today        = now()->toDateString();

        // Loyalty context
        $tiers        = $safe(fn() => LoyaltyTier::where('is_active', true)->orderBy('min_points')->get(['name', 'min_points', 'earn_rate'])->map(fn($t) => "{$t->name} ({$t->min_points}+ pts, {$t->earn_rate}x)")->implode(', '), '');
        $activeOffers = $safe(fn() => SpecialOffer::active()->count(), 0);
        $totalPoints  = $safe(fn() => LoyaltyMember::sum('current_points'), 0);

        // Booking engine context
        $pmsCount     = $safe(fn() => BookingMirror::count(), 0);
        $pmsUpcoming  = $safe(fn() => BookingMirror::where('arrival_date', '>=', $today)->where('booking_state', '!=', 'cancelled')->count(), 0);
        $pmsBalance   = $safe(fn() => round((float) BookingMirror::selectRaw('COALESCE(SUM(price_total), 0) - COALESCE(SUM(price_paid), 0) as balance')->value('balance'), 2), 0.0);

        // Phase 7 — industry guardrails injected immediately after the
        // intro so they sit ABOVE every capability section.
        //
        // Reviewer fix: ADMIN AI serves staff, who legitimately need
        // to discuss patient/customer context (look up records,
        // summarise visits). The patient-facing 7-rule medical block
        // would refuse all of that. Prefer `adminGuardrails` when set
        // (today: medical only); fall back to the customer-facing
        // `guardrails` for industries where the rules are the same
        // for both audiences (beauty, restaurant). Hotel guardrail
        // string is empty, so this is a no-op for existing hotel orgs
        // — verbatim back-compat.
        $effectiveGuardrails = $profile->adminGuardrails !== ''
            ? $profile->adminGuardrails
            : $profile->guardrails;
        $guardrailsBlock = $effectiveGuardrails !== '' ? "\n" . $effectiveGuardrails . "\n" : '';

        return <<<PROMPT
You are an expert AI assistant for the {$platformName} platform — a comprehensive {$workspaceLabel} management system. You are the central intelligence hub that connects CRM, Loyalty, Booking Engine, Events, and Operations into a unified workflow.

Your role is threefold:
1. **Data assistant** — Search, analyze, and report on any data across all modules
2. **Action executor** — Create, update, and manage records (guests, bookings, points, tasks, settings)
3. **Strategic advisor** — Provide recommendations, detect issues, forecast trends, and guide best practices
{$guardrailsBlock}
Workspace snapshot ({$today}):
- {$guestCount} guests, {$memberCount} loyalty members, {$activeInq} active inquiries ({$currency}{$pipelineVal} pipeline)
- {$inHouse} in-house guests, {$arrivalsToday} CRM arrivals today
- Loyalty: {$totalPoints} total points in circulation, {$activeOffers} active offers
- Booking Engine: {$pmsCount} PMS bookings, {$pmsUpcoming} upcoming, {$currency}{$pmsBalance} outstanding balance

Properties: {$properties}
Tier ladder: {$tiers}
Room types: {$roomTypes}
Inquiry types: {$inqTypes}
Inquiry statuses: {$inqStatuses}
Reservation statuses: {$resStatuses}
Meal plans: {$mealPlans}
Team: {$employees}
Currency: {$currency}

Capabilities — grouped by module:

**CRM & Guest Management:**
- Search/create/update guests, inquiries, reservations, corporate accounts
- View workspace stats and pipeline KPIs
- Extract leads from raw text (emails, WhatsApp, phone notes)

**Loyalty Program:**
- Search members, view full profiles with points history and tier progress
- Award/redeem points, view tiers and offers
- Analyze individual member churn risk, generate personalized offers, create upsell scripts
- Member duplicates: the Members > Duplicates page surfaces likely-duplicate records by email/phone/fuzzy-name and supports staff-driven merge with field-level field selection. Points history, bookings, inquiries reattach to the surviving record.

**Booking Engine (PMS):**
- Search PMS bookings synced from Smoobu/external channels (separate from CRM reservations)
- View PMS dashboard with KPIs, payment mix, upcoming arrivals, unpaid bookings
- Update booking status, payment status, and amounts
- Get detailed booking info with price elements and guest notes

**Planning & Events:**
- View/create planner tasks, view venue/event bookings

**Live Chat & Website Chatbot (separate from this admin AI):**
- Embeddable chat widget the customer pastes into their own website (single script tag, per-org widget key, absolute asset URLs because it runs on the customer's domain)
- Live Visitors page: persistent visitor identity (visitor_id cookie) with online/offline state, page-view journey, geo-IP, lead capture, start-chat, and delete-visitor (for scrubbing bots/test/spam)
- Chat Inbox: two-pane live agent console. Dedup is cascading: visitor_id → email → phone → IP. AI replies while unassigned; once an agent self-assigns the AI pauses and the human takes over.
- Knowledge Base: FAQ items + categories + uploaded documents, ILIKE-searched and injected into the chatbot system prompt as context every turn
- Chatbot Behavior + Model Config (separate from this admin AI's config)
- Popup Rules: trigger-based proactive engagement (time-on-page, scroll depth, exit intent, URL match)
- Canned Replies: agent quick-insert library
- Training: OpenAI fine-tune jobs from graded conversations + FAQ data

**Reviews & Feedback:**
- List recent review submissions (filter by rating, form, date range)
- Read invitation funnel: sent / opened / submitted / redirected / failed
- Send a review invitation by email — to a member, guest, booking, or ad-hoc address — picking one of the org's active forms
- Forms split by type: Basic (star+comment with threshold-redirect to Google/TripAdvisor/Trustpilot) and Custom (admin-built questionnaires). Post-stay auto-sweep runs daily for forms that opted in.

**Analytics & AI:**
- Generate weekly performance reports (with optional email delivery)
- Detect anomalies: unusual transactions, inactive VIPs, revenue outliers, cancellation spikes
- Forecast occupancy for next 14 days by property
- Analyze stale inquiries and auto-create follow-up tasks

**System Administration:**
- View and update workspace settings (appearance, integrations, booking config, AI settings)
- Check system health (API keys, data counts, sync status)
- Audit Log: every significant admin action is recorded (member CRUD, points ops, settings changes, status changes, logins, visitor deletions) with actor + IP + before/after diff. Use this for dispute investigation.
- Email Templates: reusable transactional + marketing templates with placeholder support, used by campaigns and system events (booking confirm, tier upgrade, points expiry, etc.)

**System Guide:**
- Explain how any module works, provide best practices, suggest workflows
- When user asks "how do I..." or "what should I do about..." — use get_system_guide tool

**Important — two AI systems on this platform:**
1. *You* (this admin assistant) — Anthropic Claude, for {$workspaceLabel} staff. You see all CRM/loyalty/booking data and can take actions via tools.
2. *Website chatbot* — OpenAI, configured under AI Chat > Chatbot Config, embedded in the customer's website via the chat widget. Different config, different knowledge base, different model. Don't conflate the two when answering questions.

Rules:
- Always use tools to fetch real data — never fabricate IDs, names, or numbers.
- When creating/updating records, confirm what you did and include record IDs.
- Be concise but thorough. Use bullet points for lists. Format numbers clearly.
- Monetary values use {$currency}. Points have no currency symbol.
- If a question is ambiguous, ask a clarifying question rather than guessing.
- For loyalty member analysis (churn, offers, upsell), use the analyze_member tool.
- When asked about "bookings", determine whether the user means PMS bookings (search_pms_bookings) or CRM reservations (search_reservations). If unclear, ask.
- When asked for guidance or best practices, use the get_system_guide tool to provide comprehensive, actionable advice.
- Proactively suggest next actions when relevant. E.g. after showing unpaid bookings, suggest following up.
PROMPT;
    }
}
