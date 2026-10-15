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
     * Every readiness gap by its code (`missing`, beside the English `hints`): the portal says
     * each one in the reader's language (content.brand.gap.<code>; a test keeps both lists equal).
     */
    public const GAPS = [
        'company_name', 'company_industry', 'company_website', 'brand_summary', 'usp', 'mission',
        'faq_none', 'faq_more', 'services',
        'audience_none', 'audience_pains', 'audience_goals',
        'voice_none', 'voice_tone', 'voice_emoji', 'voice_hashtag',
        'channels_none', 'channels_days', 'channels_per_week',
        'content_mix', 'weekly_rhythm', 'engagement_goals',
    ];

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
     * Saves the overall score to the profile; readinessOf() does not.
     */
    public function readinessFor(ContentPlannerProfile $profile): array
    {
        $readiness = $this->readinessOf($profile);
        $profile->update(['knowledge_score' => $readiness['overall']]);

        return $readiness;
    }

    /**
     * The same readiness without saving it: what a read shows (spec 2026-10-14 §7, F4).
     * readinessFor() saves it, for the moments the profile or its knowledge changed.
     */
    public function readinessOf(ContentPlannerProfile $profile): array
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

        return [
            'overall' => $overall,
            'sections' => $sections,
        ];
    }

    /** A gap: its sentence for the old screens and its code for the portal. */
    private static function gap(array &$hints, array &$missing, string $code, string $hint): void
    {
        $hints[] = $hint;
        $missing[] = $code;
    }

    /**
     * Company section: org name/industry/website + profile brand DNA fields.
     */
    private function scoreCompany(ContentPlannerProfile $profile, array $knowledge): array
    {
        $org = $knowledge['organization'] ?? null;
        $score = 0;
        $hints = [];
        $missing = [];

        if (!empty($org['name'])) {
            $score += 15;
        } else {
            self::gap($hints, $missing, 'company_name', 'Set the company name in organization settings.');
        }

        if (!empty($org['industry'])) {
            $score += 10;
        } else {
            self::gap($hints, $missing, 'company_industry', 'Set the company industry.');
        }

        if (!empty($org['website'])) {
            $score += 10;
        } else {
            self::gap($hints, $missing, 'company_website', 'Add the company website.');
        }

        if (trim((string) $profile->brand_summary) !== '') {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'brand_summary', 'Add a brand summary in the setup wizard.');
        }

        if (trim((string) $profile->usp) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'usp', 'Define your USP (what makes you different).');
        }

        if (trim((string) $profile->mission) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'mission', 'Add your mission statement.');
        }

        return ['key' => 'company', 'label' => 'Company info', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Knowledge section: FAQ count (5+ = full credit) + services presence.
     */
    private function scoreKnowledge(array $knowledge): array
    {
        $faqCount = (int) ($knowledge['sources']['faq_count'] ?? 0);
        $hints = [];
        $missing = [];

        $score = (int) round(min($faqCount, 5) / 5 * 70);

        if ($faqCount === 0) {
            self::gap($hints, $missing, 'faq_none', 'Add FAQ entries in the AI Chat Widget knowledge base.');
        } elseif ($faqCount < 5) {
            self::gap($hints, $missing, 'faq_more', "Add more FAQ entries (have {$faqCount}, 5+ recommended).");
        }

        if (!empty($knowledge['sources']['has_services'])) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'services', 'Add your services/products list.');
        }

        return ['key' => 'knowledge', 'label' => 'FAQ & knowledge', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing, 'faq_count' => $faqCount];
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
                'missing' => ['audience_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 40;
        $total = $audiences->count();

        $withPains = $audiences->filter(fn ($audience) => !empty($audience->pain_points))->count();
        $withGoals = $audiences->filter(fn ($audience) => !empty($audience->goals))->count();

        $score += (int) round($withPains / $total * 30);
        $score += (int) round($withGoals / $total * 30);

        if ($withPains < $total) {
            self::gap($hints, $missing, 'audience_pains', 'Add pain points to every audience segment.');
        }

        if ($withGoals < $total) {
            self::gap($hints, $missing, 'audience_goals', 'Add goals/desires to every audience segment.');
        }

        return ['key' => 'audience', 'label' => 'Audience', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
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
                'missing' => ['voice_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 40;

        if (trim((string) $voice->tone) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_tone', 'Choose a tone for your brand voice.');
        }

        if (trim((string) $voice->emoji_policy) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_emoji', 'Set an emoji policy.');
        }

        if (trim((string) $voice->hashtag_policy) !== '') {
            $score += 20;
        } else {
            self::gap($hints, $missing, 'voice_hashtag', 'Set a hashtag policy.');
        }

        return ['key' => 'voice', 'label' => 'Brand voice', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
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
                'missing' => ['channels_none'],
            ];
        }

        $hints = [];
        $missing = [];
        $score = 50;

        $hasFrequency = $channels->contains(function ($channel) {
            return is_array($channel->frequency) && count(array_filter($channel->frequency)) > 0;
        });

        $hasPostsPerWeek = $channels->contains(fn ($channel) => (int) $channel->posts_per_week > 0);

        if ($hasFrequency) {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'channels_days', 'Set posting days (frequency) on your channels.');
        }

        if ($hasPostsPerWeek) {
            $score += 25;
        } else {
            self::gap($hints, $missing, 'channels_per_week', 'Set posts per week on your channels.');
        }

        return ['key' => 'channels', 'label' => 'Social channels', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }

    /**
     * Strategy inputs section: content mix + weekly rhythm + engagement goals.
     */
    private function scoreStrategyInputs(ContentPlannerProfile $profile): array
    {
        $hints = [];
        $missing = [];
        $score = 0;

        if (!empty($profile->content_mix)) {
            $score += 40;
        } else {
            self::gap($hints, $missing, 'content_mix', 'Set your content mix percentages.');
        }

        if (!empty($profile->weekly_rhythm)) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'weekly_rhythm', 'Configure your weekly rhythm.');
        }

        if (!empty($profile->engagement_goals)) {
            $score += 30;
        } else {
            self::gap($hints, $missing, 'engagement_goals', 'Choose your engagement goals.');
        }

        return ['key' => 'strategy_inputs', 'label' => 'Strategy inputs', 'score' => min(100, $score), 'hints' => $hints, 'missing' => $missing];
    }
}
