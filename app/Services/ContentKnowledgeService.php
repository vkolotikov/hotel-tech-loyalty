<?php

namespace App\Services;

use App\Models\ContentPlannerProfile;
use App\Models\KnowledgeItem;
use App\Models\KnowledgeCategory;
use App\Models\ChatWidgetConfig;
use App\Models\Service;
use App\Models\Organization;

/**
 * Builds a comprehensive knowledge summary from existing AI Chat FAQ,
 * Knowledge Base, and company settings. This is the critical service
 * for knowledge reuse — ensures users don't re-enter company info twice.
 */
class ContentKnowledgeService
{
    /**
     * Build knowledge summary for a brand from all available sources.
     * Returns structured data ready for AI prompts + UI display.
     */
    public function buildForBrand(int $orgId, int $brandId): array
    {
        $faq = $this->loadFaq($brandId);
        $chatbot = $this->loadChatbotConfig($brandId);
        $services = $this->loadServices($orgId);
        $org = Organization::find($orgId);

        return [
            'exists' => true,
            'sources' => [
                'has_faq' => $faq->isNotEmpty(),
                'faq_count' => $faq->count(),
                'has_chatbot' => $chatbot !== null,
                'has_services' => $services->isNotEmpty(),
                'has_org_info' => $org !== null,
            ],
            'faq' => $faq->map(fn($item) => [
                'question' => $item->question,
                'answer' => $item->answer,
                'keywords' => $item->keywords ?? [],
                'category' => $item->category?->name,
            ])->values()->toArray(),
            'chatbot' => $chatbot ? [
                'company_name' => $chatbot->company_name,
                'welcome_message' => $chatbot->welcome_message,
                'header_title' => $chatbot->header_title,
                'suggestions' => $chatbot->suggestions ?? [],
                'canned_responses' => $chatbot->canned_responses ?? [],
            ] : null,
            'services' => $services->map(fn($s) => [
                'name' => $s->name,
                'description' => $s->description,
                'category' => $s->category?->name,
            ])->values()->toArray(),
            'organization' => $org ? [
                'name' => $org->name,
                'industry' => $org->resolved_industry,
                'website' => $org->website,
            ] : null,
            'missing_fields' => $this->detectMissingFields($faq, $chatbot, $services, $org),
        ];
    }

    /**
     * Create a natural-language summary suitable for AI context.
     * Condenses knowledge into ~500 words to minimize token usage.
     */
    public function summarizeForAi(int $orgId, int $brandId): string
    {
        $data = $this->buildForBrand($orgId, $brandId);

        $parts = [];

        if ($data['organization']) {
            $org = $data['organization'];
            $parts[] = "Company: {$org['name']} ({$org['industry']} industry)";
            if ($org['website']) {
                $parts[] = "Website: {$org['website']}";
            }
        }

        if ($data['chatbot']) {
            $cb = $data['chatbot'];
            $parts[] = "\nCompany description from chatbot: {$cb['company_name']}";
            if ($cb['welcome_message']) {
                $parts[] = "Welcome message: {$cb['welcome_message']}";
            }
        }

        if (!empty($data['services'])) {
            $serviceList = array_map(fn($s) => "- {$s['name']}: {$s['description']}", $data['services']);
            $parts[] = "\nServices offered:\n" . implode("\n", array_slice($serviceList, 0, 5));
        }

        if (!empty($data['faq'])) {
            $faqSnippets = array_map(
                fn($f) => "Q: {$f['question']}\nA: " . mb_substr($f['answer'], 0, 100) . "...",
                array_slice($data['faq'], 0, 5)
            );
            $parts[] = "\nCommon questions:\n" . implode("\n\n", $faqSnippets);
        }

        if (!empty($data['missing_fields'])) {
            $parts[] = "\n⚠️ Missing information: " . implode(", ", $data['missing_fields']);
        }

        return implode("\n", $parts);
    }

    /**
     * Load active FAQ items from the knowledge base.
     */
    private function loadFaq($brandId)
    {
        return KnowledgeItem::where('brand_id', $brandId)
            ->active()
            ->with('category')
            ->orderBy('priority', 'desc')
            ->get();
    }

    /**
     * Load chatbot configuration for the brand.
     */
    private function loadChatbotConfig($brandId)
    {
        return ChatWidgetConfig::where('brand_id', $brandId)
            ->where('is_active', true)
            ->first();
    }

    /**
     * Load services/products offered by the organization.
     */
    private function loadServices($orgId)
    {
        return Service::where('organization_id', $orgId)
            ->with('category')
            ->where('is_active', true)
            ->limit(10)
            ->get();
    }

    /**
     * Detect missing information that would improve content generation.
     * Returns a list of fields to prompt the user to fill.
     */
    private function detectMissingFields($faq, $chatbot, $services, $org): array
    {
        $missing = [];

        // Company info
        if (!$org || !$org->name) {
            $missing[] = 'Company name';
        }
        if (!$org || !$org->website) {
            $missing[] = 'Website';
        }

        // Chatbot info
        if (!$chatbot || !$chatbot->company_name) {
            $missing[] = 'Company description';
        }
        if (!$chatbot || !$chatbot->welcome_message) {
            $missing[] = 'Brand message';
        }

        // FAQ
        if ($faq->isEmpty()) {
            $missing[] = 'FAQ content';
        } elseif ($faq->count() < 5) {
            $missing[] = 'More FAQ entries (have ' . $faq->count() . ', need 5+)';
        }

        // Services
        if ($services->isEmpty()) {
            $missing[] = 'Services/products list';
        }

        return $missing;
    }

    /**
     * Compute the content readiness score for a planner profile.
     *
     * Returns:
     * {
     *   "overall": 62,
     *   "sections": [{"key":"company","label":"Company info","score":80,"hints":["..."]}, ...]
     * }
     *
     * Also persists the overall score to $profile->knowledge_score.
     */
    public function readinessFor(ContentPlannerProfile $profile): array
    {
        $knowledge = $this->buildForBrand($profile->organization_id, $profile->brand_id);

        $sections = [
            $this->scoreCompany($profile, $knowledge),
            $this->scoreKnowledge($knowledge),
            $this->scoreAudience($profile),
            $this->scoreVoice($profile),
            $this->scoreChannels($profile),
            $this->scoreStrategyInputs($profile),
        ];

        $overall = (int) round(array_sum(array_column($sections, 'score')) / count($sections));

        $profile->update(['knowledge_score' => $overall]);

        return [
            'overall' => $overall,
            'sections' => $sections,
        ];
    }

    /**
     * Company section: org name/industry/website + profile brand DNA fields.
     */
    private function scoreCompany(ContentPlannerProfile $profile, array $knowledge): array
    {
        $org = $knowledge['organization'] ?? null;
        $score = 0;
        $hints = [];

        if (!empty($org['name'])) {
            $score += 15;
        } else {
            $hints[] = 'Set the company name in organization settings.';
        }

        if (!empty($org['industry'])) {
            $score += 10;
        } else {
            $hints[] = 'Set the company industry.';
        }

        if (!empty($org['website'])) {
            $score += 10;
        } else {
            $hints[] = 'Add the company website.';
        }

        if (trim((string) $profile->brand_summary) !== '') {
            $score += 25;
        } else {
            $hints[] = 'Add a brand summary in the setup wizard.';
        }

        if (trim((string) $profile->usp) !== '') {
            $score += 20;
        } else {
            $hints[] = 'Define your USP (what makes you different).';
        }

        if (trim((string) $profile->mission) !== '') {
            $score += 20;
        } else {
            $hints[] = 'Add your mission statement.';
        }

        return ['key' => 'company', 'label' => 'Company info', 'score' => min(100, $score), 'hints' => $hints];
    }

    /**
     * Knowledge section: FAQ count (5+ = full credit) + services presence.
     */
    private function scoreKnowledge(array $knowledge): array
    {
        $faqCount = (int) ($knowledge['sources']['faq_count'] ?? 0);
        $hints = [];

        $score = (int) round(min($faqCount, 5) / 5 * 70);

        if ($faqCount === 0) {
            $hints[] = 'Add FAQ entries in the AI Chat Widget knowledge base.';
        } elseif ($faqCount < 5) {
            $hints[] = "Add more FAQ entries (have {$faqCount}, 5+ recommended).";
        }

        if (!empty($knowledge['sources']['has_services'])) {
            $score += 30;
        } else {
            $hints[] = 'Add your services/products list.';
        }

        return ['key' => 'knowledge', 'label' => 'FAQ & knowledge', 'score' => min(100, $score), 'hints' => $hints];
    }

    /**
     * Audience section: segments exist + have pain points and goals.
     */
    private function scoreAudience(ContentPlannerProfile $profile): array
    {
        $audiences = $profile->audiences()->active()->get();

        if ($audiences->isEmpty()) {
            return [
                'key' => 'audience',
                'label' => 'Audience',
                'score' => 0,
                'hints' => ['Add at least one target audience segment.'],
            ];
        }

        $hints = [];
        $score = 40;
        $total = $audiences->count();

        $withPains = $audiences->filter(fn ($audience) => !empty($audience->pain_points))->count();
        $withGoals = $audiences->filter(fn ($audience) => !empty($audience->goals))->count();

        $score += (int) round($withPains / $total * 30);
        $score += (int) round($withGoals / $total * 30);

        if ($withPains < $total) {
            $hints[] = 'Add pain points to every audience segment.';
        }

        if ($withGoals < $total) {
            $hints[] = 'Add goals/desires to every audience segment.';
        }

        return ['key' => 'audience', 'label' => 'Audience', 'score' => min(100, $score), 'hints' => $hints];
    }

    /**
     * Voice section: brand voice row with tone + emoji/hashtag policies.
     */
    private function scoreVoice(ContentPlannerProfile $profile): array
    {
        $voice = $profile->brandVoices()->active()->first();

        if (!$voice) {
            return [
                'key' => 'voice',
                'label' => 'Brand voice',
                'score' => 0,
                'hints' => ['Define your brand voice in the setup wizard.'],
            ];
        }

        $hints = [];
        $score = 40;

        if (trim((string) $voice->tone) !== '') {
            $score += 20;
        } else {
            $hints[] = 'Choose a tone for your brand voice.';
        }

        if (trim((string) $voice->emoji_policy) !== '') {
            $score += 20;
        } else {
            $hints[] = 'Set an emoji policy.';
        }

        if (trim((string) $voice->hashtag_policy) !== '') {
            $score += 20;
        } else {
            $hints[] = 'Set a hashtag policy.';
        }

        return ['key' => 'voice', 'label' => 'Brand voice', 'score' => min(100, $score), 'hints' => $hints];
    }

    /**
     * Channels section: at least one active channel + frequency/posts_per_week.
     */
    private function scoreChannels(ContentPlannerProfile $profile): array
    {
        $channels = $profile->channels()->active()->get();

        if ($channels->isEmpty()) {
            return [
                'key' => 'channels',
                'label' => 'Social channels',
                'score' => 0,
                'hints' => ['Activate at least one social channel.'],
            ];
        }

        $hints = [];
        $score = 50;

        $hasFrequency = $channels->contains(function ($channel) {
            return is_array($channel->frequency) && count(array_filter($channel->frequency)) > 0;
        });

        $hasPostsPerWeek = $channels->contains(fn ($channel) => (int) $channel->posts_per_week > 0);

        if ($hasFrequency) {
            $score += 25;
        } else {
            $hints[] = 'Set posting days (frequency) on your channels.';
        }

        if ($hasPostsPerWeek) {
            $score += 25;
        } else {
            $hints[] = 'Set posts per week on your channels.';
        }

        return ['key' => 'channels', 'label' => 'Social channels', 'score' => min(100, $score), 'hints' => $hints];
    }

    /**
     * Strategy inputs section: content mix + weekly rhythm + engagement goals.
     */
    private function scoreStrategyInputs(ContentPlannerProfile $profile): array
    {
        $hints = [];
        $score = 0;

        if (!empty($profile->content_mix)) {
            $score += 40;
        } else {
            $hints[] = 'Set your content mix percentages.';
        }

        if (!empty($profile->weekly_rhythm)) {
            $score += 30;
        } else {
            $hints[] = 'Configure your weekly rhythm.';
        }

        if (!empty($profile->engagement_goals)) {
            $score += 30;
        } else {
            $hints[] = 'Choose your engagement goals.';
        }

        return ['key' => 'strategy_inputs', 'label' => 'Strategy inputs', 'score' => min(100, $score), 'hints' => $hints];
    }
}
