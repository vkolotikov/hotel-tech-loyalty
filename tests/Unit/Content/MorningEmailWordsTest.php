<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentRules;
use Carbon\CarbonImmutable;
use Tests\TestCase;

/** The morning email's words (spec 2026-10-19 §4.5, §7.3): five languages with the same keys, placeholders and lists. */
class MorningEmailWordsTest extends TestCase
{
    /** @return array<string, string> */
    private function flat(array $words, string $prefix = ''): array
    {
        $out = [];
        foreach ($words as $key => $value) {
            is_array($value) ? $out += $this->flat($value, "{$prefix}{$key}.") : $out["{$prefix}{$key}"] = (string) $value;
        }

        return $out;
    }

    public function test_every_language_has_every_english_word_and_keeps_its_placeholders(): void
    {
        $en = $this->flat(require lang_path('en/content_morning.php'));
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            $words = $this->flat(require lang_path("{$locale}/content_morning.php"));
            $this->assertSame(array_keys($en), array_keys($words), $locale);
            foreach ($en as $key => $text) {
                preg_match_all('/:[a-z]+/', $text, $want);
                preg_match_all('/:[a-z]+/', $words[$key], $got);
                $this->assertSame($want[0], $got[0], "{$locale} {$key}");
            }
        }
        $english = require lang_path('en/content_morning.php');
        $this->assertSame(ContentRules::STATUSES, array_keys($english['status']));
        $this->assertSame(ContentRules::PLATFORMS, array_keys($english['platform']));
    }

    public function test_the_date_reads_naturally_in_each_language(): void
    {
        $day = CarbonImmutable::parse('2026-10-05');
        $expected = [
            'en' => 'Monday, 5 October',
            'ru' => 'понедельник, 5 октября',
            'de' => 'Montag, 5. Oktober',
            'fr' => 'lundi 5 octobre',
            'es' => 'lunes, 5 de octubre',
        ];
        foreach ($expected as $locale => $text) {
            $this->assertSame($text, $day->locale($locale)->isoFormat(__('content_morning.date_format', [], $locale)), $locale);
        }
    }
}
