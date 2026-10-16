<?php

namespace App\Services\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\ContentPlanner\AiClient;

/**
 * Proposes post templates for a brand from its industry, pillars and audiences (spec 2026-10-16 §5.2): one AI call,
 * in the brand's language, details left as [blanks]; nothing saved. Not final, so tests mock it.
 */
class ContentTemplateSuggester
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return list<array{name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}> */
    public function suggest(ContentPlannerProfile $profile): array
    {
        $pillars = ContentPlannerPillar::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->map(fn ($n) => (string) $n)->all();

        return self::clean($this->ai->generateJson($profile, 'template_suggest', $this->prompt($profile, $pillars), 4000), $pillars);
    }

    /**
     * The AI's answer as at most 5 templates: a name (80) and a hook (500) or a text (5,000) are required; a topic and
     * a call to action are cut to 255; an unknown platform becomes none; a pillar is kept only when it names one of
     * the active pillars (ignoring case), written as the pillar is; hashtags are one word with "#", no repeats
     * (ignoring case), at most 30. Anything else is dropped.
     *
     * @param list<string> $pillars
     * @return list<array{name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>}>
     */
    public static function clean(array $data, array $pillars): array
    {
        $templates = [];
        foreach ((array) ($data['templates'] ?? []) as $template) {
            if (!is_array($template)) {
                continue;
            }
            $name = self::text($template, 'name', 80);
            $hook = self::text($template, 'hook', 500);
            $text = self::text($template, 'main_copy', 5000);
            if ($name === null || ($hook === null && $text === null)) {
                continue;
            }
            $platform = mb_strtolower(trim((string) ($template['platform'] ?? '')));
            $pillar = mb_strtolower(trim((string) ($template['pillar_name'] ?? '')));
            $matched = null;
            foreach ($pillars as $candidate) {
                if ($pillar !== '' && mb_strtolower($candidate) === $pillar) {
                    $matched = $candidate;
                    break;
                }
            }
            $tags = [];
            foreach ((array) ($template['hashtags'] ?? []) as $tag) {
                $tag = '#' . ltrim((string) preg_replace('/\s+/u', '', (string) $tag), '#');
                if ($tag !== '#' && !in_array(mb_strtolower($tag), array_map('mb_strtolower', $tags), true)) {
                    $tags[] = mb_substr($tag, 0, 100);
                }
            }
            $templates[] = [
                'name'        => $name,
                'platform'    => in_array($platform, ContentRules::PLATFORMS, true) ? $platform : null,
                'pillar_name' => $matched,
                'topic'       => self::text($template, 'topic', 255),
                'hook'        => $hook,
                'main_copy'   => $text,
                'cta'         => self::text($template, 'cta', 255),
                'hashtags'    => array_slice($tags, 0, 30),
            ];
        }

        return array_slice($templates, 0, 5);
    }

    private static function text(array $template, string $key, int $max): ?string
    {
        $value = trim((string) ($template[$key] ?? ''));

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    /** @param list<string> $pillars */
    private function prompt(ContentPlannerProfile $profile, array $pillars): string
    {
        $audiences = ContentPlannerAudience::where('planner_profile_id', $profile->id)->where('active', true)->pluck('name')->implode(', ');
        $industry = Organization::find($profile->organization_id)?->resolved_industry ?? 'other';
        $language = $profile->default_language ?: 'en';
        $platforms = implode(', ', ContentRules::PLATFORMS);

        return "You write reusable post templates for the social media of a {$industry} business.\n"
            . "Brand: {$profile->name}. Content pillars: " . ($pillars !== [] ? implode(', ', $pillars) : 'none yet') . '. Audiences: ' . ($audiences ?: 'none yet') . ".\n"
            . "Write 3 to 5 templates in the language '{$language}'. A template is a post shape the team reuses: a short name, an optional platform (one of: {$platforms}), "
            . "the pillar it serves (one of the pillars above, written exactly, or empty), a topic, a hook, the main text and a call to action, and up to 10 relevant hashtags.\n"
            . "Put every detail that changes from post to post in square brackets as a blank, at most 40 characters inside, e.g. [treatment], [date], [price]. Never invent prices, dates or facts.\n"
            . 'Return ONLY JSON: {"templates": [{"name": "...", "platform": "instagram", "pillar_name": "...", "topic": "...", "hook": "...", "main_copy": "...", "cta": "...", "hashtags": ["#..."]}]}';
    }
}
