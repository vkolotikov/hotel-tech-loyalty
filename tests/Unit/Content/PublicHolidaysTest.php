<?php

namespace Tests\Unit\Content;

use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\DayMath;
use App\Services\Content\Days\DayNames;
use App\Services\Content\Days\PublicHolidays;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Public holidays of the nine countries (spec 2026-10-16 Appendix A), against the official lists for 2026–2028. */
class PublicHolidaysTest extends TestCase
{
    public function test_easter_follows_the_gregorian_computus(): void
    {
        $this->assertSame(
            ['2023-04-09', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2030-04-21'],
            array_map(fn (int $y) => DayMath::easter($y), [2023, 2024, 2025, 2026, 2027, 2028, 2030]),
        );
    }

    #[DataProvider('officialLists')]
    public function test_each_country_matches_its_official_list(string $country, int $year, array $expected): void
    {
        $days = BuiltInDays::between($country, false, null, "{$year}-01-01", "{$year}-12-31");

        $this->assertSame($expected, array_map(fn (array $d) => $d['date'] . ' ' . $d['id'] . ($d['substitute'] ? '*' : ''), $days));
        $this->assertSame(['holiday'], array_values(array_unique(array_column($days, 'kind'))));
    }

    public function test_st_brigids_day_is_the_first_of_february_when_that_is_a_friday(): void
    {
        $brigid = array_values(array_filter(PublicHolidays::for('IE', 2030), fn (array $d) => $d['id'] === 'ie.st_brigid'));

        $this->assertSame('2030-02-01', $brigid[0]['date']);
    }

    public function test_every_holiday_has_an_english_name(): void
    {
        foreach (PublicHolidays::ids() as $id) {
            $this->assertArrayHasKey($id, DayNames::EN, "{$id} has no English name");
        }
        $this->assertSame('Christmas Day', DayNames::en('christmas'));
    }

    public function test_an_unknown_country_has_no_holidays(): void
    {
        $this->assertSame([], PublicHolidays::for('RU', 2026));
        $this->assertSame([], BuiltInDays::between(null, false, null, '2026-01-01', '2026-12-31'));
    }

    /** @return array<string, array{0: string, 1: int, 2: list<string>}> */
    public static function officialLists(): array
    {
        return [
            'GB 2026' => ['GB', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-06 easter_monday', '2026-05-04 gb.early_may', '2026-05-25 gb.spring', '2026-08-31 gb.summer', '2026-12-25 christmas', '2026-12-26 gb.boxing_day', '2026-12-28 gb.boxing_day*']],
            'GB 2027' => ['GB', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-29 easter_monday', '2027-05-03 gb.early_may', '2027-05-31 gb.spring', '2027-08-30 gb.summer', '2027-12-25 christmas', '2027-12-26 gb.boxing_day', '2027-12-27 christmas*', '2027-12-28 gb.boxing_day*']],
            'GB 2028' => ['GB', 2028, ['2028-01-01 new_year', '2028-01-03 new_year*', '2028-04-14 good_friday', '2028-04-17 easter_monday', '2028-05-01 gb.early_may', '2028-05-29 gb.spring', '2028-08-28 gb.summer', '2028-12-25 christmas', '2028-12-26 gb.boxing_day']],
            'IE 2026' => ['IE', 2026, ['2026-01-01 new_year', '2026-02-02 ie.st_brigid', '2026-03-17 ie.st_patrick', '2026-04-06 easter_monday', '2026-05-04 ie.may', '2026-06-01 ie.june', '2026-08-03 ie.august', '2026-10-26 ie.october', '2026-12-25 christmas', '2026-12-26 ie.st_stephen']],
            'IE 2027' => ['IE', 2027, ['2027-01-01 new_year', '2027-02-01 ie.st_brigid', '2027-03-17 ie.st_patrick', '2027-03-29 easter_monday', '2027-05-03 ie.may', '2027-06-07 ie.june', '2027-08-02 ie.august', '2027-10-25 ie.october', '2027-12-25 christmas', '2027-12-26 ie.st_stephen']],
            'IE 2028' => ['IE', 2028, ['2028-01-01 new_year', '2028-02-07 ie.st_brigid', '2028-03-17 ie.st_patrick', '2028-04-17 easter_monday', '2028-05-01 ie.may', '2028-06-05 ie.june', '2028-08-07 ie.august', '2028-10-30 ie.october', '2028-12-25 christmas', '2028-12-26 ie.st_stephen']],
            'DE 2026' => ['DE', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-14 ascension', '2026-05-25 whit_monday', '2026-10-03 de.unity', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'DE 2027' => ['DE', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-06 ascension', '2027-05-17 whit_monday', '2027-10-03 de.unity', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'DE 2028' => ['DE', 2028, ['2028-01-01 new_year', '2028-04-14 good_friday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-25 ascension', '2028-06-05 whit_monday', '2028-10-03 de.unity', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'FR 2026' => ['FR', 2026, ['2026-01-01 new_year', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-08 fr.victory', '2026-05-14 ascension', '2026-05-25 whit_monday', '2026-07-14 fr.bastille', '2026-08-15 assumption', '2026-11-01 all_saints', '2026-11-11 fr.armistice', '2026-12-25 christmas']],
            'FR 2027' => ['FR', 2027, ['2027-01-01 new_year', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-06 ascension', '2027-05-08 fr.victory', '2027-05-17 whit_monday', '2027-07-14 fr.bastille', '2027-08-15 assumption', '2027-11-01 all_saints', '2027-11-11 fr.armistice', '2027-12-25 christmas']],
            'FR 2028' => ['FR', 2028, ['2028-01-01 new_year', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-08 fr.victory', '2028-05-25 ascension', '2028-06-05 whit_monday', '2028-07-14 fr.bastille', '2028-08-15 assumption', '2028-11-01 all_saints', '2028-11-11 fr.armistice', '2028-12-25 christmas']],
            'ES 2026' => ['ES', 2026, ['2026-01-01 new_year', '2026-01-06 es.epiphany', '2026-04-03 good_friday', '2026-05-01 labour_day', '2026-08-15 assumption', '2026-10-12 es.national', '2026-11-01 all_saints', '2026-12-06 es.constitution', '2026-12-08 es.immaculate', '2026-12-25 christmas']],
            'ES 2027' => ['ES', 2027, ['2027-01-01 new_year', '2027-01-06 es.epiphany', '2027-03-26 good_friday', '2027-05-01 labour_day', '2027-08-15 assumption', '2027-10-12 es.national', '2027-11-01 all_saints', '2027-12-06 es.constitution', '2027-12-08 es.immaculate', '2027-12-25 christmas']],
            'ES 2028' => ['ES', 2028, ['2028-01-01 new_year', '2028-01-06 es.epiphany', '2028-04-14 good_friday', '2028-05-01 labour_day', '2028-08-15 assumption', '2028-10-12 es.national', '2028-11-01 all_saints', '2028-12-06 es.constitution', '2028-12-08 es.immaculate', '2028-12-25 christmas']],
            'LV 2026' => ['LV', 2026, ['2026-01-01 new_year', '2026-04-03 good_friday', '2026-04-05 easter_sunday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-04 lv.independence', '2026-05-24 pentecost', '2026-06-23 lv.ligo', '2026-06-24 midsummer', '2026-11-18 lv.proclamation', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second', '2026-12-31 new_years_eve']],
            'LV 2027' => ['LV', 2027, ['2027-01-01 new_year', '2027-03-26 good_friday', '2027-03-28 easter_sunday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-04 lv.independence', '2027-05-16 pentecost', '2027-06-23 lv.ligo', '2027-06-24 midsummer', '2027-11-18 lv.proclamation', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second', '2027-12-31 new_years_eve']],
            'LV 2028' => ['LV', 2028, ['2028-01-01 new_year', '2028-04-14 good_friday', '2028-04-16 easter_sunday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-04 lv.independence', '2028-06-04 pentecost', '2028-06-23 lv.ligo', '2028-06-24 midsummer', '2028-11-18 lv.proclamation', '2028-11-20 lv.proclamation*', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second', '2028-12-31 new_years_eve']],
            'LT 2026' => ['LT', 2026, ['2026-01-01 new_year', '2026-02-16 lt.state', '2026-03-11 lt.independence', '2026-04-05 easter_sunday', '2026-04-06 easter_monday', '2026-05-01 labour_day', '2026-05-03 mothers_day', '2026-06-07 fathers_day', '2026-06-24 lt.st_johns', '2026-07-06 lt.statehood', '2026-08-15 assumption', '2026-11-01 all_saints', '2026-11-02 all_souls', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'LT 2027' => ['LT', 2027, ['2027-01-01 new_year', '2027-02-16 lt.state', '2027-03-11 lt.independence', '2027-03-28 easter_sunday', '2027-03-29 easter_monday', '2027-05-01 labour_day', '2027-05-02 mothers_day', '2027-06-06 fathers_day', '2027-06-24 lt.st_johns', '2027-07-06 lt.statehood', '2027-08-15 assumption', '2027-11-01 all_saints', '2027-11-02 all_souls', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'LT 2028' => ['LT', 2028, ['2028-01-01 new_year', '2028-02-16 lt.state', '2028-03-11 lt.independence', '2028-04-16 easter_sunday', '2028-04-17 easter_monday', '2028-05-01 labour_day', '2028-05-07 mothers_day', '2028-06-04 fathers_day', '2028-06-24 lt.st_johns', '2028-07-06 lt.statehood', '2028-08-15 assumption', '2028-11-01 all_saints', '2028-11-02 all_souls', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'EE 2026' => ['EE', 2026, ['2026-01-01 new_year', '2026-02-24 ee.independence', '2026-04-03 good_friday', '2026-04-05 easter_sunday', '2026-05-01 ee.spring_day', '2026-05-24 pentecost', '2026-06-23 ee.victory', '2026-06-24 midsummer', '2026-08-20 ee.restoration', '2026-12-24 christmas_eve', '2026-12-25 christmas', '2026-12-26 christmas_second']],
            'EE 2027' => ['EE', 2027, ['2027-01-01 new_year', '2027-02-24 ee.independence', '2027-03-26 good_friday', '2027-03-28 easter_sunday', '2027-05-01 ee.spring_day', '2027-05-16 pentecost', '2027-06-23 ee.victory', '2027-06-24 midsummer', '2027-08-20 ee.restoration', '2027-12-24 christmas_eve', '2027-12-25 christmas', '2027-12-26 christmas_second']],
            'EE 2028' => ['EE', 2028, ['2028-01-01 new_year', '2028-02-24 ee.independence', '2028-04-14 good_friday', '2028-04-16 easter_sunday', '2028-05-01 ee.spring_day', '2028-06-04 pentecost', '2028-06-23 ee.victory', '2028-06-24 midsummer', '2028-08-20 ee.restoration', '2028-12-24 christmas_eve', '2028-12-25 christmas', '2028-12-26 christmas_second']],
            'US 2026' => ['US', 2026, ['2026-01-01 new_year', '2026-01-19 us.mlk', '2026-02-16 us.washington', '2026-05-25 us.memorial', '2026-06-19 us.juneteenth', '2026-07-03 us.independence*', '2026-07-04 us.independence', '2026-09-07 us.labor', '2026-10-12 us.columbus', '2026-11-11 us.veterans', '2026-11-26 us.thanksgiving', '2026-12-25 christmas']],
            'US 2027' => ['US', 2027, ['2027-01-01 new_year', '2027-01-18 us.mlk', '2027-02-15 us.washington', '2027-05-31 us.memorial', '2027-06-18 us.juneteenth*', '2027-06-19 us.juneteenth', '2027-07-04 us.independence', '2027-07-05 us.independence*', '2027-09-06 us.labor', '2027-10-11 us.columbus', '2027-11-11 us.veterans', '2027-11-25 us.thanksgiving', '2027-12-24 christmas*', '2027-12-25 christmas', '2027-12-31 new_year*']],
            'US 2028' => ['US', 2028, ['2028-01-01 new_year', '2028-01-17 us.mlk', '2028-02-21 us.washington', '2028-05-29 us.memorial', '2028-06-19 us.juneteenth', '2028-07-04 us.independence', '2028-09-04 us.labor', '2028-10-09 us.columbus', '2028-11-10 us.veterans*', '2028-11-11 us.veterans', '2028-11-23 us.thanksgiving', '2028-12-25 christmas']],
        ];
    }
}
