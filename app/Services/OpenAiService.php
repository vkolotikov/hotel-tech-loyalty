<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use OpenAI\Laravel\Facades\OpenAI;
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
     */
    public function chat(array $messages, LoyaltyMember $member): string
    {
        $systemPrompt = $this->buildMemberSystemPrompt($member);

        $allMessages = array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        );

        try {
            $response = OpenAI::chat()->create([
                'model'       => $this->model,
                'messages'    => $allMessages,
                'max_tokens'  => 500,
                'temperature' => 0.7,
            ]);

            return $response->choices[0]->message->content;
        } catch (\Throwable $e) {
            Log::error('OpenAI chat error: ' . $e->getMessage());
            return "I'm sorry, I'm having trouble responding right now. Please try again shortly.";
        }
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
