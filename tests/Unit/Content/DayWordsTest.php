<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\DayNames;
use PHPUnit\Framework\TestCase;

/** The portal's day names (spec 2026-10-16 §9.3): one key per server id in every bundle, the English the AI reads. */
class DayWordsTest extends TestCase
{
    /** @return array<string, string> the bundle's keydates.day words, flattened to their ids ("gb.early_may") */
    private static function days(string $locale): array
    {
        $path = dirname(__DIR__, 3) . "/frontend/src/content/i18n/content.{$locale}.json";
        $bundle = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $flat = [];
        $walk = function (array $node, string $prefix) use (&$walk, &$flat): void {
            foreach ($node as $key => $value) {
                if (is_array($value)) {
                    $walk($value, "{$prefix}{$key}.");
                } else {
                    $flat["{$prefix}{$key}"] = (string) $value;
                }
            }
        };
        $walk($bundle['keydates']['day'] ?? [], '');
        ksort($flat);

        return $flat;
    }

    public function test_every_built_in_day_has_words_in_every_bundle_and_none_is_spare(): void
    {
        $ids = array_keys(DayNames::EN);
        sort($ids);
        foreach (['en', 'ru', 'de', 'fr', 'es'] as $locale) {
            $this->assertSame($ids, array_keys(self::days($locale)), "{$locale}: keydates.day differs from DayNames::EN");
        }
    }

    public function test_the_english_bundle_says_what_the_server_tells_the_ai(): void
    {
        $en = self::days('en');
        foreach (DayNames::EN as $id => $name) {
            $this->assertSame($name, $en[$id] ?? null, $id);
        }
    }
}
