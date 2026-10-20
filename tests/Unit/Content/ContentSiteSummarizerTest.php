<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSiteSummarizer;
use PHPUnit\Framework\TestCase;

/** The company summary's request and answer (spec 2026-10-20 §3.6), without the AI. */
class ContentSiteSummarizerTest extends TestCase
{
    public function test_the_request_carries_every_page_the_language_and_the_facts_only_rule(): void
    {
        $prompt = ContentSiteSummarizer::prompt([
            ['url' => 'https://lumiere.example/', 'title' => 'Lumière', 'text' => 'Hair and colour in Riga.'],
            ['url' => 'https://lumiere.example/services', 'title' => 'Services', 'text' => 'Cuts from 40 €.'],
        ], 'ru');

        $this->assertStringContainsString('Use only facts the pages state', $prompt);
        $this->assertStringContainsString('"ru"', $prompt);
        $this->assertStringContainsString("### Lumière (https://lumiere.example/)\nHair and colour in Riga.", $prompt);
        $this->assertStringContainsString("### Services (https://lumiere.example/services)\nCuts from 40 €.", $prompt);
        $this->assertStringContainsString('"brand_summary"', $prompt);
    }

    public function test_the_answer_is_trimmed_cut_and_empty_fields_become_null(): void
    {
        $answer = ContentSiteSummarizer::answer(['summary' => '  A salon.  ', 'brand_summary' => str_repeat('b', 700), 'usp' => '', 'mission' => ['not text']]);

        $this->assertSame('A salon.', $answer['summary']);
        $this->assertSame(600, mb_strlen($answer['brand_summary']));
        $this->assertNull($answer['usp']);
        $this->assertNull($answer['mission']);
    }

    public function test_an_answer_without_a_summary_is_a_failure(): void
    {
        $this->expectException(\RuntimeException::class);
        ContentSiteSummarizer::answer(['brand_summary' => 'x']);
    }
}
