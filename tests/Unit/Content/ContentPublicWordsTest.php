<?php

namespace Tests\Unit\Content;

use Tests\TestCase;

/** The public pages' words (spec 2026-10-19 §5.3, §6.2, §7.3): five languages with the same keys and placeholders. */
class ContentPublicWordsTest extends TestCase
{
    public function test_every_language_has_every_english_word_and_keeps_its_placeholders(): void
    {
        $en = require lang_path('en/content_public.php');
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            $words = require lang_path("{$locale}/content_public.php");
            $this->assertSame(array_keys($en), array_keys($words), $locale);
            foreach ($en as $key => $text) {
                preg_match_all('/:[a-z]+/', $text, $want);
                preg_match_all('/:[a-z]+/', $words[$key], $got);
                $this->assertSame($want[0], $got[0], "{$locale} {$key}");
            }
        }
    }
}
