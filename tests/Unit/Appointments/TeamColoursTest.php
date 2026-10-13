<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\TeamColours;
use PHPUnit\Framework\TestCase;

/** Team colours (spec §5.3): a fixed palette the server owns; every active person gets one, choices are kept. */
class TeamColoursTest extends TestCase
{
    private static function lum(string $hex): float
    {
        $c = array_map(fn ($i) => hexdec(substr($hex, $i, 2)) / 255, [1, 3, 5]);
        $c = array_map(fn ($v) => $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4, $c);

        return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
    }

    private static function ratio(string $a, string $b): float
    {
        [$x, $y] = [self::lum($a), self::lum($b)];

        return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
    }

    public function test_the_palette_has_ten_distinct_lowercase_colours(): void
    {
        $this->assertCount(10, TeamColours::PALETTE);
        $this->assertSame(array_values(TeamColours::PALETTE), array_values(array_unique(TeamColours::PALETTE)));
        foreach (TeamColours::PALETTE as $hex) {
            $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $hex);
        }
    }

    public function test_every_colour_reads_as_a_dot_on_light_and_dark_surfaces(): void
    {
        // Atelier surfaces (spec §4.1): light canvas, surface, surface-2; dark canvas, surface, surface-2.
        foreach (TeamColours::PALETTE as $key => $hex) {
            foreach (['#f4f6f8', '#ffffff', '#eef2f5', '#0e1a24', '#13232f', '#1a2e3c'] as $surface) {
                $this->assertGreaterThanOrEqual(3.0, self::ratio($hex, $surface), "$key $hex on $surface");
            }
        }
    }

    public function test_choices_are_kept_and_the_rest_take_the_first_free_colour_by_id(): void
    {
        $p = array_values(TeamColours::PALETTE);
        $members = [
            (object) ['id' => 7, 'color' => null],
            (object) ['id' => 3, 'color' => $p[0]],   // a manager's choice
            (object) ['id' => 5, 'color' => null],
            (object) ['id' => 9, 'color' => 'not-a-palette-colour'],
        ];

        $this->assertSame([3 => $p[0], 5 => $p[1], 7 => $p[2], 9 => $p[3]], TeamColours::assign($members));
    }

    public function test_a_team_larger_than_the_palette_wraps_and_never_changes_a_choice(): void
    {
        $p = array_values(TeamColours::PALETTE);
        $members = array_map(fn ($id) => (object) ['id' => $id, 'color' => null], range(1, 12));
        $members[] = (object) ['id' => 13, 'color' => $p[4]];
        $out = TeamColours::assign($members);

        $this->assertCount(13, $out);
        $this->assertSame($p[4], $out[13]);
        foreach ($out as $hex) {
            $this->assertContains($hex, $p);
        }
    }

    public function test_the_palette_list_keeps_the_order(): void
    {
        $list = TeamColours::paletteList();
        $this->assertSame(array_keys(TeamColours::PALETTE), array_column($list, 'key'));
        $this->assertSame(array_values(TeamColours::PALETTE), array_column($list, 'hex'));
    }
}
