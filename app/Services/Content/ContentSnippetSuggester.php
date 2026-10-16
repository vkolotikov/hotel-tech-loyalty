<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\ContentPlanner\AiClient;

/**
 * Proposes hashtag groups for a brand from its pillars, audiences and industry (spec 2026-10-15 §6): one AI call,
 * nothing saved. Not final, so tests mock it (AiClient's provider path cannot be faked).
 */
class ContentSnippetSuggester
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return list<array{name: string, body: string}> */
    public function suggest(ContentPlannerProfile $profile): array
    {
        return self::clean($this->ai->generateJson($profile, 'snippet_suggest', $this->prompt($profile), 2000));
    }

    /**
     * The AI's answer as at most 5 groups: a name of at most 60 characters and up to 30 distinct hashtags (ignoring
     * case), each one word starting with #. Groups without a name or a hashtag, and anything else, are dropped.
     *
     * @return list<array{name: string, body: string}>
     */
    public static function clean(array $data): array
    {
        $groups = [];
        foreach ((array) ($data['groups'] ?? []) as $group) {
            $name = trim((string) ($group['name'] ?? ''));
            $tags = [];
            foreach ((array) ($group['hashtags'] ?? []) as $tag) {
                $tag = '#' . ltrim((string) preg_replace('/\s+/u', '', (string) $tag), '#');
                if ($tag !== '#' && !in_array(mb_strtolower($tag), array_map('mb_strtolower', $tags), true)) {
                    $tags[] = $tag;
                }
            }
            if ($name !== '' && $tags !== []) {
                $groups[] = ['name' => mb_substr($name, 0, 60), 'body' => implode(' ', array_slice($tags, 0, 30))];
            }
        }

        return array_slice($groups, 0, 5);
    }

    private function prompt(ContentPlannerProfile $profile): string
    {
        $pillars = ContentPlannerPillar::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $audiences = ContentPlannerAudience::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $industry = Organization::find($profile->organization_id)?->resolved_industry ?? 'other';
        $language = $profile->default_language ?: 'en';

        return "You suggest hashtag groups for the social posts of a {$industry} business.\n"
            . "Brand: {$profile->name}. Content pillars: " . ($pillars ?: 'none yet') . '. Audiences: ' . ($audiences ?: 'none yet') . ".\n"
            . "Write 3 to 5 groups. Each has a short name in the language '{$language}' and 8 to 15 relevant hashtags: mix popular and local or niche ones; no spaces inside a hashtag.\n"
            . 'Return ONLY JSON: {"groups": [{"name": "...", "hashtags": ["#..."]}]}';
    }
}
