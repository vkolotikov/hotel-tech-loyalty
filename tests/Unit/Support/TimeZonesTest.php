<?php

namespace Tests\Unit\Support;

use App\Services\Portal\PortalBootstrap;
use App\Support\TimeZones;
use PHPUnit\Framework\TestCase;

/**
 * Old zone names are mapped by our own table, so a venue's zone reads the same whether this PHP's time-zone database
 * still has the old names (PHP's bundled one does) or not (a system database without Debian/Ubuntu's
 * `tzdata-legacy`, as in this repository's Linux container: timezone_version_get() = "0.system").
 */
class TimeZonesTest extends TestCase
{
    public function test_the_old_names_the_product_meets_map_to_their_zone(): void
    {
        $this->assertSame('America/New_York', TimeZones::canonical('US/Eastern'));
        $this->assertSame('Europe/Dublin', TimeZones::canonical('Eire'));
        $this->assertSame('Europe/London', TimeZones::canonical('GB'));
        $this->assertSame('Europe/London', TimeZones::canonical('GB-Eire'));
        $this->assertSame('Europe/London', TimeZones::canonical('Europe/Belfast'));
        $this->assertSame('Asia/Kolkata', TimeZones::canonical('Asia/Calcutta'));
        $this->assertSame('Europe/Kyiv', TimeZones::canonical('Europe/Kiev'));
        $this->assertSame('Pacific/Honolulu', TimeZones::canonical('US/Hawaii'));
        $this->assertSame('America/Indiana/Indianapolis', TimeZones::canonical('America/Indianapolis'));
    }

    public function test_an_old_name_is_found_in_any_case_as_php_finds_zone_names(): void
    {
        $this->assertSame('America/New_York', TimeZones::canonical('us/eastern'));
        $this->assertSame('Europe/London', TimeZones::canonical('gb'));
        $this->assertSame('Asia/Kolkata', TimeZones::canonical('ASIA/CALCUTTA'));
    }

    public function test_every_other_value_comes_back_exactly_as_given(): void
    {
        foreach ([
            // Current zones, including links that are their own country's zone in zone.tab.
            'Europe/Riga', 'America/New_York', 'America/Toronto', 'Europe/Busingen', 'Arctic/Longyearbyen', 'Europe/Vatican',
            'europe/riga',
            // Names of UTC: PortalBootstrap::namedZone() reads every one of them as UTC itself.
            'UTC', 'utc', 'Etc/UTC', 'Zulu', 'Universal', 'UCT', 'GMT', 'GMT0', 'Greenwich', 'Etc/GMT',
            // Abbreviations and POSIX-style names: PHP reads several as fixed offsets, which a venue's zone never is.
            'EET', 'CET', 'MET', 'WET', 'EST', 'MST', 'HST', 'EST5EDT', 'PST8PDT', 'PST', 'Z',
            // Offsets, garbage, blanks — and no trimming.
            '+03:00', 'Mars/Olympus', '', ' US/Eastern ',
        ] as $value) {
            $this->assertSame($value, TimeZones::canonical($value), $value);
        }
    }

    public function test_every_target_is_a_current_zone_with_a_country_and_never_another_old_name(): void
    {
        $lower = array_change_key_case(TimeZones::LEGACY, CASE_LOWER);
        $this->assertCount(count(TimeZones::LEGACY), $lower, 'no old name is listed twice in another case');

        foreach (TimeZones::LEGACY as $old => $zone) {
            $this->assertArrayNotHasKey(strtolower($zone), $lower, "{$old} → {$zone} is not a chain");
            $location = (new \DateTimeZone($zone))->getLocation();
            $this->assertIsArray($location, $zone);
            $this->assertMatchesRegularExpression('/^[A-Z]{2}$/', (string) $location['country_code'], "{$old} → {$zone} has a country");
        }
    }

    public function test_where_php_still_knows_an_old_name_it_keeps_the_same_clock(): void
    {
        $instants = [new \DateTimeImmutable('2026-01-15 12:00:00 UTC'), new \DateTimeImmutable('2026-07-15 12:00:00 UTC')];
        foreach (TimeZones::LEGACY as $old => $zone) {
            try {
                $legacy = new \DateTimeZone($old);
            } catch (\Exception) {
                continue; // This PHP does not know the old name — exactly why the table exists.
            }
            foreach ($instants as $at) {
                $this->assertSame((new \DateTimeZone($zone))->getOffset($at), $legacy->getOffset($at), "{$old} and {$zone} at {$at->format('c')}");
            }
        }
    }

    public function test_the_venue_zone_reads_an_old_name_as_its_zone(): void
    {
        $this->assertSame('America/New_York', PortalBootstrap::namedZone('US/Eastern'));
        $this->assertSame('America/New_York', PortalBootstrap::namedZone(' us/eastern '));
        $this->assertSame('Europe/London', PortalBootstrap::namedZone('GB'));
        $this->assertSame('Europe/Riga', PortalBootstrap::namedZone('Europe/Riga'));
        $this->assertSame('UTC', PortalBootstrap::namedZone('Zulu'));
        $this->assertNull(PortalBootstrap::namedZone('EET'));
        $this->assertNull(PortalBootstrap::namedZone('+03:00'));
        $this->assertNull(PortalBootstrap::namedZone('Mars/Olympus'));
    }
}
