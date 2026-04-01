<?php

namespace App\Services;

use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Models\LoyaltyMember;
use OpenAI\Laravel\Facades\OpenAI;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OpenAiService
{
    protected string $model;

    public function __construct()
    {
        $this->model = config('openai.model', 'gpt-4o');
    }

    /**
     * Send a chat message from a member and get AI response.
     * Supports OpenAI, Anthropic, and Google providers via model config.
     */
    public function chat(
        array $messages,
        LoyaltyMember $member,
        ?ChatbotBehaviorConfig $behaviorConfig = null,
        ?ChatbotModelConfig $modelConfig = null,
        string $knowledgeContext = '',
    ): string {
        $systemPrompt = $behaviorConfig
            ? $this->buildConfiguredSystemPrompt($member, $behaviorConfig, $knowledgeContext)
            : $this->buildMemberSystemPrompt($member);

        $provider = $modelConfig->provider ?? 'openai';
        $model = $modelConfig->model_name ?? $this->model;
        $temperature = (float) ($modelConfig->temperature ?? 0.7);
        $maxTokens = (int) ($modelConfig->max_tokens ?? 500);

        try {
            return match ($provider) {
                'anthropic' => $this->callAnthropic($systemPrompt, $messages, $model, $temperature, $maxTokens),
                'google'    => $this->callGoogle($systemPrompt, $messages, $model, $temperature, $maxTokens),
                default     => $this->callOpenAi($systemPrompt, $messages, $model, $temperature, $maxTokens, $modelConfig),
            };
        } catch (\Throwable $e) {
            Log::error("AI chat error [{$provider}/{$model}]: " . $e->getMessage());

            if ($behaviorConfig?->fallback_message) {
                return $behaviorConfig->fallback_message;
            }

            return "I'm sorry, I'm having trouble responding right now. Please try again shortly.";
        }
    }

    /**
     * Call via OpenAI SDK (GPT models + o-series).
     */
    private function callOpenAi(
        string $systemPrompt,
        array $messages,
        string $model,
        float $temperature,
        int $maxTokens,
        ?ChatbotModelConfig $modelConfig = null,
    ): string {
        $allMessages = array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        );

        $params = [
            'model'       => $model,
            'messages'    => $allMessages,
            'max_tokens'  => $maxTokens,
            'temperature' => $temperature,
        ];

        if ($modelConfig && $modelConfig->top_p < 1.0) {
            $params['top_p'] = (float) $modelConfig->top_p;
        }
        if ($modelConfig && $modelConfig->frequency_penalty > 0) {
            $params['frequency_penalty'] = (float) $modelConfig->frequency_penalty;
        }
        if ($modelConfig && $modelConfig->presence_penalty > 0) {
            $params['presence_penalty'] = (float) $modelConfig->presence_penalty;
        }

        $response = OpenAI::chat()->create($params);
        $reply = $response->choices[0]->message->content;

        return $reply ?: '';
    }

    /**
     * Call Anthropic Messages API directly via HTTP.
     */
    private function callAnthropic(
        string $systemPrompt,
        array $messages,
        string $model,
        float $temperature,
        int $maxTokens,
    ): string {
        $apiKey = config('services.anthropic.api_key', env('ANTHROPIC_API_KEY'));

        if (!$apiKey) {
            throw new \RuntimeException('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env');
        }

        $response = Http::withHeaders([
            'x-api-key'         => $apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type'      => 'application/json',
        ])->timeout(60)->post('https://api.anthropic.com/v1/messages', [
            'model'      => $model,
            'max_tokens' => $maxTokens,
            'temperature' => min($temperature, 1.0), // Anthropic max temp is 1.0
            'system'     => $systemPrompt,
            'messages'   => $messages,
        ]);

        if ($response->failed()) {
            throw new \RuntimeException('Anthropic API error: ' . $response->body());
        }

        $data = $response->json();
        return $data['content'][0]['text'] ?? '';
    }

    /**
     * Call Google Gemini API directly via HTTP.
     */
    private function callGoogle(
        string $systemPrompt,
        array $messages,
        string $model,
        float $temperature,
        int $maxTokens,
    ): string {
        $apiKey = config('services.google.gemini_api_key', env('GOOGLE_GEMINI_API_KEY'));

        if (!$apiKey) {
            throw new \RuntimeException('Google Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env');
        }

        // Convert messages to Gemini format
        $contents = [];
        foreach ($messages as $msg) {
            $contents[] = [
                'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ];
        }

        $response = Http::timeout(60)->post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
            [
                'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
                'contents'           => $contents,
                'generationConfig'   => [
                    'temperature'     => $temperature,
                    'maxOutputTokens' => $maxTokens,
                ],
            ]
        );

        if ($response->failed()) {
            throw new \RuntimeException('Gemini API error: ' . $response->body());
        }

        $data = $response->json();
        return $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    }

    /**
     * Generate a personalized offer for a member.
     */
    public function personalizeOffer(LoyaltyMember $member): array
    {
        $member->loadMissing(['tier', 'bookings', 'user']);
        $stats = $this->getMemberStats($member);

        $prompt = "You are a hotel loyalty program manager. Based on this member's profile, suggest ONE specific, compelling personalized offer.

Member Profile:
- Tier: {$member->tier->name}
- Total stays: {$stats['total_stays']}
- Average spend per stay: \${$stats['avg_spend']}
- Favorite room type: {$stats['favorite_room_type']}
- Points balance: {$member->current_points}
- Member since: {$member->joined_at->format('Y')}

Return JSON only with keys: title, description, type (discount/bonus_points/upgrade/free_night), value (number), reason";

        try {
            $response = OpenAI::chat()->create([
                'model'    => $this->model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'response_format' => ['type' => 'json_object'],
                'max_tokens' => 300,
            ]);

            return json_decode($response->choices[0]->message->content, true) ?? [];
        } catch (\Throwable $e) {
            Log::error('OpenAI personalizeOffer error: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Predict churn risk for a member (0.0 = low risk, 1.0 = high risk).
     */
    public function predictChurn(LoyaltyMember $member): float
    {
        $member->loadMissing(['bookings', 'pointsTransactions']);
        $stats = $this->getMemberStats($member);

        $prompt = "Analyze this hotel loyalty member and return a churn risk score between 0.0 (very loyal) and 1.0 (about to churn).

Data:
- Days since last stay: {$stats['days_since_last_stay']}
- Total stays: {$stats['total_stays']}
- Stays in last 6 months: {$stats['stays_last_6m']}
- Points redeemed ratio: {$stats['redemption_ratio']}
- Tier: {$stats['tier']}

Return JSON only with: score (float 0-1), reason (string), recommendation (string)";

        try {
            $response = OpenAI::chat()->create([
                'model'    => $this->model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'response_format' => ['type' => 'json_object'],
                'max_tokens' => 200,
            ]);

            $data = json_decode($response->choices[0]->message->content, true);
            return (float) ($data['score'] ?? 0.5);
        } catch (\Throwable $e) {
            Log::error('OpenAI predictChurn error: ' . $e->getMessage());
            return 0.5;
        }
    }

    /**
     * Generate a weekly AI insight report for admin dashboard.
     */
    public function generateInsightReport(array $kpis): string
    {
        $prompt = "You are a hotel loyalty program analyst. Write a concise, actionable weekly insight report (3-4 paragraphs) based on these KPIs:
" . json_encode($kpis, JSON_PRETTY_PRINT) . "

Focus on: key trends, what's working, what needs attention, and 2 specific recommendations for next week.";

        try {
            $response = OpenAI::chat()->create([
                'model'    => $this->model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'max_tokens' => 600,
                'temperature' => 0.5,
            ]);

            return $response->choices[0]->message->content;
        } catch (\Throwable $e) {
            Log::error('OpenAI generateInsightReport error: ' . $e->getMessage());
            return 'Unable to generate AI insights at this time.';
        }
    }

    /**
     * Analyze sentiment of a guest review.
     */
    public function analyzeSentiment(string $text): array
    {
        $prompt = "Analyze the sentiment of this hotel guest review. Return JSON with: sentiment (positive/neutral/negative), score (-1 to 1), key_themes (array of strings), action_required (boolean).

Review: {$text}";

        try {
            $response = OpenAI::chat()->create([
                'model'    => $this->model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'response_format' => ['type' => 'json_object'],
                'max_tokens' => 200,
            ]);

            return json_decode($response->choices[0]->message->content, true) ?? [];
        } catch (\Throwable $e) {
            Log::error('OpenAI analyzeSentiment error: ' . $e->getMessage());
            return ['sentiment' => 'neutral', 'score' => 0, 'key_themes' => [], 'action_required' => false];
        }
    }

    /**
     * Suggest upsell opportunity when staff scans a member.
     */
    public function suggestUpsell(LoyaltyMember $member): string
    {
        $member->loadMissing(['tier', 'bookings', 'user']);
        $stats = $this->getMemberStats($member);

        $prompt = "A hotel receptionist just scanned a loyalty card. Suggest a brief, friendly upsell script (2 sentences max) for this member:

- Name: {$member->user->name}
- Tier: {$member->tier->name}
- Points: {$member->current_points}
- Stays: {$stats['total_stays']}
- Favorite room: {$stats['favorite_room_type']}";

        try {
            $response = OpenAI::chat()->create([
                'model'    => $this->model,
                'messages' => [['role' => 'user', 'content' => $prompt]],
                'max_tokens' => 100,
                'temperature' => 0.8,
            ]);

            return $response->choices[0]->message->content;
        } catch (\Throwable $e) {
            Log::error('OpenAI suggestUpsell error: ' . $e->getMessage());
            return "Welcome back, {$member->user->name}! Would you like to learn about our current promotions?";
        }
    }

    /**
     * Build system prompt using the configurable behavior settings + knowledge context.
     */
    private function buildConfiguredSystemPrompt(
        LoyaltyMember $member,
        ChatbotBehaviorConfig $config,
        string $knowledgeContext = '',
    ): string {
        $member->loadMissing(['tier', 'user']);

        $toneMap = [
            'professional' => 'Be professional and courteous.',
            'friendly' => 'Be warm, friendly, and approachable.',
            'casual' => 'Use a casual, relaxed conversational style.',
            'formal' => 'Maintain a formal, respectful tone.',
        ];

        $lengthMap = [
            'concise' => 'Keep replies short and to the point (1-2 sentences).',
            'moderate' => 'Provide moderately detailed replies (2-4 sentences).',
            'detailed' => 'Give thorough, detailed responses.',
        ];

        $parts = [];

        // Identity
        if ($config->identity) {
            $parts[] = $config->identity;
        } else {
            $parts[] = "You are {$config->assistant_name}, a hotel concierge AI assistant.";
        }

        // Goal
        if ($config->goal) {
            $parts[] = "Your goal: {$config->goal}";
        }

        // Tone and style
        $parts[] = $toneMap[$config->tone] ?? $toneMap['professional'];
        $parts[] = $lengthMap[$config->reply_length] ?? $lengthMap['moderate'];

        // Language
        if ($config->language && $config->language !== 'en') {
            $parts[] = "Respond in language: {$config->language}.";
        }

        // Core rules
        if (!empty($config->core_rules)) {
            $parts[] = "Rules you MUST follow:";
            foreach ($config->core_rules as $rule) {
                $parts[] = "- {$rule}";
            }
        }

        // Escalation policy
        if ($config->escalation_policy) {
            $parts[] = "Escalation policy: {$config->escalation_policy}";
        }

        // Custom instructions
        if ($config->custom_instructions) {
            $parts[] = $config->custom_instructions;
        }

        // Member context
        $parts[] = "\n## Current Guest Context";
        $parts[] = "- Name: {$member->user->name}";
        $parts[] = "- Tier: {$member->tier->name}";
        $parts[] = "- Points Balance: {$member->current_points}";
        if ($member->tier->perks) {
            $parts[] = "- Tier Perks: " . implode(', ', $member->tier->perks);
        }
        $parts[] = "- Date: " . now()->format('Y-m-d');

        // Knowledge context
        if ($knowledgeContext) {
            $parts[] = "\n{$knowledgeContext}";
            $parts[] = "Use the knowledge base above to answer questions when relevant. If the answer is not in the knowledge base, use your general knowledge.";
        }

        return implode("\n", $parts);
    }

    private function buildMemberSystemPrompt(LoyaltyMember $member): string
    {
        $member->loadMissing(['tier', 'user']);
        return "You are a helpful hotel concierge AI assistant for the Hotel Loyalty Program.
You are talking to {$member->user->name}, a {$member->tier->name} tier member with {$member->current_points} points.
Their tier perks include: " . implode(', ', $member->tier->perks ?? []) . ".
Be friendly, professional, and helpful. Keep answers concise.
Only discuss hotel services, loyalty program benefits, and travel-related topics.
Do not discuss pricing specifics you don't have data for.
Today's date is " . now()->format('Y-m-d') . ".";
    }

    private function getMemberStats(LoyaltyMember $member): array
    {
        $bookings = $member->bookings ?? collect();
        $lastBooking = $bookings->sortByDesc('check_out')->first();

        return [
            'total_stays'          => $bookings->count(),
            'avg_spend'            => round($bookings->avg('total_amount') ?? 0, 2),
            'favorite_room_type'   => $bookings->groupBy('room_type')->map->count()->sortDesc()->keys()->first() ?? 'Standard',
            'days_since_last_stay' => $lastBooking ? now()->diffInDays($lastBooking->check_out) : 999,
            'stays_last_6m'        => $bookings->where('check_in', '>=', now()->subMonths(6))->count(),
            'redemption_ratio'     => $member->lifetime_points > 0
                ? round($member->pointsTransactions->where('type', 'redeem')->sum('points') / $member->lifetime_points, 2)
                : 0,
            'tier'                 => $member->tier->name ?? 'Bronze',
        ];
    }
}
