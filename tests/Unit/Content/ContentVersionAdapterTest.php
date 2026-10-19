<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentPlatformRules;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentVersionAdapter;
use PHPUnit\Framework\TestCase;

/** Adapting a version to its platform (spec 2026-10-19 §3.3): the request and the answer, without the AI. */
class ContentVersionAdapterTest extends TestCase
{
    private const POST = [
        'language' => 'en', 'hook' => 'Three colours for October', 'main_copy' => 'Warm tones, booked in October: 20 % off.',
        'short_copy' => null, 'cta' => 'Book now', 'hashtags' => ['#autumn', '#hair'],
    ];

    public function test_the_request_names_both_platforms_carries_the_targets_rules_the_context_and_every_word(): void
    {
        $prompt = ContentVersionAdapter::prompt(self::POST, 'instagram', 'linkedin', 'A salon in Riga.');

        $this->assertStringContainsString('written for instagram', $prompt);
        $this->assertStringContainsString('native linkedin post', $prompt);
        $this->assertStringContainsString(ContentPlatformRules::for('linkedin'), $prompt);
        $this->assertStringNotContainsString(ContentPlatformRules::for('instagram'), $prompt);
        $this->assertStringContainsString('A salon in Riga.', $prompt);
        $this->assertStringContainsString('language (en)', $prompt);
        foreach (['Three colours for October', 'Warm tones, booked in October: 20 % off.', 'Book now', '#autumn #hair'] as $words) {
            $this->assertStringContainsString($words, $prompt);
        }
    }

    public function test_the_answer_is_cut_to_the_columns_and_what_the_ai_left_out_keeps_the_versions_words(): void
    {
        $words = ContentVersionAdapter::words([
            'hook' => '  ' . str_repeat('h', 600), 'main_copy' => 'Adapted', 'cta' => ['not text'],
            'hashtags' => [' #a ', '', 7, ['x'], ...array_fill(0, 40, '#many')],
        ], self::POST);

        $this->assertSame(500, mb_strlen($words['hook']));
        $this->assertSame('Adapted', $words['main_copy']);
        $this->assertNull($words['short_copy']);
        $this->assertSame('Book now', $words['cta']);
        $this->assertCount(30, $words['hashtags']);
        $this->assertSame(['#a', '7'], array_slice($words['hashtags'], 0, 2));

        $this->assertSame(['#autumn', '#hair'], ContentVersionAdapter::words([], self::POST)['hashtags']);
        $this->assertArrayNotHasKey('language', ContentVersionAdapter::words([], self::POST));
    }

    public function test_every_platform_has_its_own_rules_and_an_unknown_one_gets_the_default(): void
    {
        foreach (ContentRules::PLATFORMS as $platform) {
            $this->assertNotSame(ContentPlatformRules::RULES['default'], ContentPlatformRules::for($platform), $platform);
        }
        $this->assertSame(ContentPlatformRules::RULES['default'], ContentPlatformRules::for('myspace'));
        $this->assertStringContainsString('maximum 280 characters per post', ContentPlatformRules::for('x'));
    }
}
