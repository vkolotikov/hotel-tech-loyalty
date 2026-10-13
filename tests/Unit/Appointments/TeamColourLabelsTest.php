<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\TeamColours;
use PHPUnit\Framework\TestCase;

/**
 * The palette's words follow the palette (one source of truth): the server owns
 * TeamColours::PALETTE, and Setup names each colour with
 * t(`appointments.colours.<key>`). The workspace's bundles are registered under
 * `appointments`, so in each file the word sits at `colours.<key>`. Every colour
 * the server offers is named in all five languages, and no language names a
 * colour the palette does not have.
 */
class TeamColourLabelsTest extends TestCase
{
    private const LOCALES = ['en', 'de', 'es', 'fr', 'ru'];

    /** @return array<string, mixed> */
    private static function bundle(string $locale): array
    {
        $path = dirname(__DIR__, 3) . "/frontend/src/appointments/i18n/appointments.{$locale}.json";
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function test_every_palette_colour_is_named_in_every_workspace_language(): void
    {
        foreach (self::LOCALES as $locale) {
            $colours = self::bundle($locale)['colours'] ?? [];
            foreach (array_keys(TeamColours::PALETTE) as $key) {
                $word = $colours[$key] ?? null;
                $this->assertIsString($word, "{$locale}: colours.{$key} is missing");
                $this->assertNotSame('', trim($word), "{$locale}: colours.{$key} is empty");
            }
        }
    }

    public function test_no_language_names_a_colour_the_palette_does_not_have(): void
    {
        foreach (self::LOCALES as $locale) {
            $named = array_keys(self::bundle($locale)['colours'] ?? []);
            $this->assertSame([], array_values(array_diff($named, array_keys(TeamColours::PALETTE))), "{$locale} names colours outside the palette");
        }
    }
}
