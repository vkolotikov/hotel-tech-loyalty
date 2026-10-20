<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;

/**
 * The company summary (spec 2026-10-20 §3.6): one AI call with the site's own pages, facts only, in the brand's
 * language. Not final, so tests replace it.
 */
class ContentSiteSummarizer
{
    public function __construct(protected AiClient $ai)
    {
    }

    /**
     * @param list<array{url: string, title: string, text: string}> $pages
     * @return array{summary: string, brand_summary: ?string, usp: ?string, mission: ?string}
     */
    public function summarize(ContentPlannerProfile $profile, array $pages): array
    {
        $prompt = self::prompt($pages, (string) ($profile->default_language ?: 'en'));

        return self::answer($this->ai->generateJson($profile, 'website_summary', $prompt, 3000));
    }

    /** @param list<array{url: string, title: string, text: string}> $pages */
    public static function prompt(array $pages, string $language): string
    {
        $blocks = array_map(fn (array $page) => "### {$page['title']} ({$page['url']})\n{$page['text']}", $pages);

        return "You read a company's own website and write what a social media writer must know about the company.\n"
            . 'Use only facts the pages state: no invented services, prices, numbers, awards or quotes. '
            . "Write in the language with the code \"{$language}\".\n\n"
            . "## THE PAGES\n" . implode("\n\n", $blocks) . "\n\n"
            . 'Return ONLY JSON: {"summary": "...", "brand_summary": "...", "usp": "...", "mission": "..."}' . "\n"
            . "- summary: up to 400 words of plain text in short labelled lines: What we do; Services or products; Who it is for; Where; Proof points; Tone of voice.\n"
            . "- brand_summary: one paragraph, up to 600 characters.\n"
            . "- usp: what makes the company different, up to 300 characters; an empty string when the pages do not say.\n"
            . '- mission: up to 300 characters; an empty string when the pages do not say.';
    }

    /**
     * @param array<string, mixed> $data
     * @return array{summary: string, brand_summary: ?string, usp: ?string, mission: ?string}
     */
    public static function answer(array $data): array
    {
        $summary = self::text($data['summary'] ?? null, ContentSiteScan::SUMMARY_MAX);
        if ($summary === null) {
            throw new \RuntimeException('The website summary came back without a summary.');
        }

        return [
            'summary'       => $summary,
            'brand_summary' => self::text($data['brand_summary'] ?? null, 600),
            'usp'           => self::text($data['usp'] ?? null, 300),
            'mission'       => self::text($data['mission'] ?? null, 300),
        ];
    }

    private static function text(mixed $value, int $max): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
