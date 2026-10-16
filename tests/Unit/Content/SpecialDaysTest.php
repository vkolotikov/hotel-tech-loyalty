<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\DayNames;
use App\Services\Content\Days\PublicHolidays;
use App\Services\Content\Days\SpecialDays;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Marketing days by country and international days by industry (spec 2026-10-16 Appendix B). */
class SpecialDaysTest extends TestCase
{
    #[DataProvider('marketing2026')]
    public function test_marketing_days_follow_the_country(?string $country, array $expected): void
    {
        $this->assertSame($expected, self::lines(SpecialDays::marketing($country, 2026)));
    }

    public function test_mothers_and_fathers_day_in_other_years(): void
    {
        $day = fn (?string $country, int $year, string $id) => array_values(array_filter(SpecialDays::marketing($country, $year), fn (array $d) => $d['id'] === $id))[0]['date'] ?? null;

        // France: Pentecost fell on the last Sunday of May 2023, so Mother's Day moved to the first Sunday of June.
        $this->assertSame('2023-06-04', $day('FR', 2023, 'mothers_day'));
        $this->assertSame('2027-05-30', $day('FR', 2027, 'mothers_day'));
        $this->assertSame('2027-03-07', $day('GB', 2027, 'mothers_day'));
        $this->assertSame('2028-03-26', $day('IE', 2028, 'mothers_day'));
        $this->assertSame('2028-05-14', $day('US', 2028, 'mothers_day'));
        $this->assertSame('2028-05-07', $day('ES', 2028, 'mothers_day'));
        $this->assertSame('2028-09-10', $day('LV', 2028, 'fathers_day'));
        $this->assertSame('2027-11-14', $day('EE', 2027, 'fathers_day'));
        $this->assertSame('2027-11-26', $day('DE', 2027, 'black_friday'));
        $this->assertSame('2028-11-24', $day(null, 2028, 'black_friday'));
        $this->assertNull($day('DE', 2026, 'fathers_day'));
        $this->assertNull($day('LT', 2026, 'mothers_day'));
    }

    #[DataProvider('industries2026')]
    public function test_industry_days_follow_the_industry(?string $industry, array $expected): void
    {
        $this->assertSame($expected, self::lines(SpecialDays::industry($industry, 2026)));
    }

    public function test_weekday_rules_in_later_years(): void
    {
        $this->assertSame(['2027-06-02 global_running', '2027-06-12 global_wellness'], array_values(array_filter(self::lines(SpecialDays::industry('fitness', 2027)), fn (string $l) => str_contains($l, 'global'))));
        $this->assertSame(['2028-10-02 world_habitat'], self::lines(SpecialDays::industry('real_estate', 2028)));
    }

    public function test_the_range_adds_special_days_only_while_the_switch_is_on(): void
    {
        $on = BuiltInDays::between('GB', true, 'beauty', '2026-12-20', '2026-12-31');
        $this->assertSame(
            ['2026-12-24 christmas_eve marketing', '2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday', '2026-12-28 gb.boxing_day holiday', '2026-12-31 new_years_eve marketing'],
            array_map(fn (array $d) => "{$d['date']} {$d['id']} {$d['kind']}", $on),
        );
        $this->assertSame("New Year's Eve", $on[4]['name_en']);

        $off = BuiltInDays::between('GB', false, 'beauty', '2026-12-20', '2026-12-31');
        $this->assertSame(['holiday'], array_values(array_unique(array_column($off, 'kind'))));
        $this->assertSame(['2026-06-13 global_wellness industry', '2026-06-21 yoga industry'], array_map(fn (array $d) => "{$d['date']} {$d['id']} {$d['kind']}", BuiltInDays::between(null, true, 'beauty', '2026-06-08', '2026-06-21')));
    }

    public function test_every_id_has_an_english_name_and_no_name_is_spare(): void
    {
        $ids = array_values(array_unique(array_merge(PublicHolidays::ids(), SpecialDays::ids())));
        sort($ids);
        $named = array_keys(DayNames::EN);
        sort($named);

        $this->assertSame($named, $ids);
    }

    /** @param list<array{id: string, date: string}> $days @return list<string> */
    private static function lines(array $days): array
    {
        return array_map(fn (array $d) => "{$d['date']} {$d['id']}", $days);
    }

    /** @return array<string, array{0: ?string, 1: list<string>}> */
    public static function marketing2026(): array
    {
        $everywhere = ['2026-02-14 valentines', '2026-03-08 womens_day'];

        return [
            'GB' => ['GB', [...$everywhere, '2026-03-15 mothers_day', '2026-04-05 easter_sunday', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'IE' => ['IE', [...$everywhere, '2026-03-15 mothers_day', '2026-04-05 easter_sunday', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'US' => ['US', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-10 mothers_day', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'DE' => ['DE', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-10 mothers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'FR' => ['FR', [...$everywhere, '2026-04-05 easter_sunday', '2026-05-31 mothers_day', '2026-06-21 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'ES' => ['ES', [...$everywhere, '2026-03-19 fathers_day', '2026-04-05 easter_sunday', '2026-05-03 mothers_day', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
            'LV' => ['LV', [...$everywhere, '2026-05-10 mothers_day', '2026-09-13 fathers_day', '2026-10-31 halloween', '2026-11-27 black_friday']],
            'LT' => ['LT', [...$everywhere, '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-31 new_years_eve']],
            'EE' => ['EE', [...$everywhere, '2026-05-10 mothers_day', '2026-10-31 halloween', '2026-11-08 fathers_day', '2026-11-27 black_friday', '2026-12-31 new_years_eve']],
            'no country' => [null, [...$everywhere, '2026-04-05 easter_sunday', '2026-10-31 halloween', '2026-11-27 black_friday', '2026-12-24 christmas_eve', '2026-12-31 new_years_eve']],
        ];
    }

    /** @return array<string, array{0: ?string, 1: list<string>}> */
    public static function industries2026(): array
    {
        return [
            'medical' => ['medical', ['2026-04-07 world_health', '2026-09-29 world_heart', '2026-10-10 world_mental_health']],
            'fitness' => ['fitness', ['2026-04-07 world_health', '2026-06-03 global_running', '2026-06-13 global_wellness', '2026-06-21 yoga', '2026-09-29 world_heart']],
            'beauty' => ['beauty', ['2026-06-13 global_wellness', '2026-06-21 yoga']],
            'hotel' => ['hotel', ['2026-06-13 global_wellness', '2026-09-27 world_tourism']],
            'restaurant' => ['restaurant', ['2026-09-27 world_tourism', '2026-10-16 world_food']],
            'education' => ['education', ['2026-04-23 world_book', '2026-09-08 literacy', '2026-10-05 teachers']],
            'legal' => ['legal', ['2026-04-26 world_ip', '2026-06-27 msme', '2026-12-10 human_rights']],
            'real_estate' => ['real_estate', ['2026-10-05 world_habitat']],
            'services' => ['services', ['2026-06-27 msme']],
            'other' => ['other', ['2026-06-27 msme']],
            'unknown' => [null, []],
        ];
    }
}
