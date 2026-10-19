<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * Adapts a version's words to its platform (spec 2026-10-19 §3.3): the same offer in the platform's own form, with
 * the platform's rules and the brand's context, in the post's language. Not final, so tests mock it.
 */
class ContentVersionAdapter
{
    public function __construct(protected AiClient $ai, protected ContextBuilder $context)
    {
    }

    /**
     * The version holds the original's words and its own platform; `$from` is the platform they were written for.
     *
     * @return array{hook: ?string, main_copy: ?string, short_copy: ?string, cta: ?string, hashtags: list<string>}
     */
    public function adapt(ContentPlannerPost $version, string $from): array
    {
        $profile = ContentPlannerProfile::findOrFail($version->planner_profile_id);
        $kept = [
            'language'   => $version->language,
            'hook'       => $version->hook,
            'main_copy'  => $version->main_copy,
            'short_copy' => $version->short_copy,
            'cta'        => $version->cta,
            'hashtags'   => array_values((array) ($version->hashtags ?? [])),
        ];
        $prompt = self::prompt($kept, $from, (string) $version->platform, $this->context->build($profile));

        return self::words($this->ai->generateJson($profile, 'version_adapt', $prompt, 3000), $kept);
    }

    /** @param array<string, mixed> $post the words to adapt: language, hook, main_copy, short_copy, cta, hashtags */
    public static function prompt(array $post, string $from, string $to, string $context): string
    {
        return "You adapt a social media post written for {$from} into a native {$to} post.\n"
            . 'Keep the same offer, facts, prices, dates and links exactly, the same language (' . ($post['language'] ?? '') . ') '
            . "and the intent of the call to action. Do not invent anything.\n\n"
            . "Platform rules ({$to}): " . ContentPlatformRules::for($to) . "\n\n"
            . "Brand context:\n{$context}\n\n"
            . 'Hook: ' . ($post['hook'] ?? '') . "\n"
            . "Text:\n" . ($post['main_copy'] ?? '') . "\n"
            . 'Short text: ' . ($post['short_copy'] ?? '') . "\n"
            . 'Call to action: ' . ($post['cta'] ?? '') . "\n"
            . 'Hashtags: ' . implode(' ', (array) ($post['hashtags'] ?? [])) . "\n\n"
            . 'Return ONLY JSON: {"hook": "...", "main_copy": "...", "short_copy": "...", "cta": "...", "hashtags": ["#..."]}';
    }

    /**
     * The answer, cut to the columns' limits; a field the AI left out (or did not give as text) keeps the version's words.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $kept
     * @return array{hook: ?string, main_copy: ?string, short_copy: ?string, cta: ?string, hashtags: list<string>}
     */
    public static function words(array $data, array $kept): array
    {
        $text = fn (string $key, int $max) => isset($data[$key]) && is_scalar($data[$key])
            ? mb_substr(trim((string) $data[$key]), 0, $max)
            : ($kept[$key] ?? null);
        $tags = is_array($data['hashtags'] ?? null)
            ? array_slice(array_values(array_filter(
                array_map(fn ($tag) => is_scalar($tag) ? mb_substr(trim((string) $tag), 0, 100) : '', $data['hashtags']),
                fn (string $tag) => $tag !== '',
            )), 0, 30)
            : array_values((array) ($kept['hashtags'] ?? []));

        return [
            'hook'       => $text('hook', 500),
            'main_copy'  => $text('main_copy', 20000),
            'short_copy' => $text('short_copy', 5000),
            'cta'        => $text('cta', 255),
            'hashtags'   => $tags,
        ];
    }
}
