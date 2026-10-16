<?php

namespace App\Services\Content\Days;

/**
 * The public holidays of the nine countries (spec 2026-10-16 §3.2, Appendix A) as a rule table, with the substitute
 * days the law sets: in the United Kingdom and Latvia a marked day on a weekend gives the next weekday that is not
 * already a holiday; in the United States a marked day on a Saturday is observed the Friday before, on a Sunday the
 * Monday after (so New Year's Day of one year can be observed on 31 December of the year before).
 */
final class PublicHolidays
{
    public const COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'LV', 'LT', 'EE', 'US'];

    /** How a country moves a marked day that falls on a weekend. */
    private const SUBSTITUTE = ['GB' => 'next_weekday', 'LV' => 'next_weekday', 'US' => 'observed'];

    /** country => list of [id, rule (DayMath::on), moves when on a weekend]. Weekdays: 1 Monday … 7 Sunday. */
    private const RULES = [
        'GB' => [
            ['new_year', ['fixed', 1, 1], true],
            ['good_friday', ['easter', -2], false],
            ['easter_monday', ['easter', 1], false],
            ['gb.early_may', ['nth', 5, 1, 1], false],
            ['gb.spring', ['last', 5, 1], false],
            ['gb.summer', ['last', 8, 1], false],
            ['christmas', ['fixed', 12, 25], true],
            ['gb.boxing_day', ['fixed', 12, 26], true],
        ],
        'IE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['ie.st_brigid', ['brigid'], false],
            ['ie.st_patrick', ['fixed', 3, 17], false],
            ['easter_monday', ['easter', 1], false],
            ['ie.may', ['nth', 5, 1, 1], false],
            ['ie.june', ['nth', 6, 1, 1], false],
            ['ie.august', ['nth', 8, 1, 1], false],
            ['ie.october', ['last', 10, 1], false],
            ['christmas', ['fixed', 12, 25], false],
            ['ie.st_stephen', ['fixed', 12, 26], false],
        ],
        'DE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['good_friday', ['easter', -2], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['ascension', ['easter', 39], false],
            ['whit_monday', ['easter', 50], false],
            ['de.unity', ['fixed', 10, 3], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'FR' => [
            ['new_year', ['fixed', 1, 1], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['fr.victory', ['fixed', 5, 8], false],
            ['ascension', ['easter', 39], false],
            ['whit_monday', ['easter', 50], false],
            ['fr.bastille', ['fixed', 7, 14], false],
            ['assumption', ['fixed', 8, 15], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['fr.armistice', ['fixed', 11, 11], false],
            ['christmas', ['fixed', 12, 25], false],
        ],
        'ES' => [
            ['new_year', ['fixed', 1, 1], false],
            ['es.epiphany', ['fixed', 1, 6], false],
            ['good_friday', ['easter', -2], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['assumption', ['fixed', 8, 15], false],
            ['es.national', ['fixed', 10, 12], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['es.constitution', ['fixed', 12, 6], false],
            ['es.immaculate', ['fixed', 12, 8], false],
            ['christmas', ['fixed', 12, 25], false],
        ],
        'LV' => [
            ['new_year', ['fixed', 1, 1], false],
            ['good_friday', ['easter', -2], false],
            ['easter_sunday', ['easter', 0], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['lv.independence', ['fixed', 5, 4], true],
            ['pentecost', ['easter', 49], false],
            ['lv.ligo', ['fixed', 6, 23], false],
            ['midsummer', ['fixed', 6, 24], false],
            ['lv.proclamation', ['fixed', 11, 18], true],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
            ['new_years_eve', ['fixed', 12, 31], false],
        ],
        'LT' => [
            ['new_year', ['fixed', 1, 1], false],
            ['lt.state', ['fixed', 2, 16], false],
            ['lt.independence', ['fixed', 3, 11], false],
            ['easter_sunday', ['easter', 0], false],
            ['easter_monday', ['easter', 1], false],
            ['labour_day', ['fixed', 5, 1], false],
            ['mothers_day', ['nth', 5, 7, 1], false],
            ['fathers_day', ['nth', 6, 7, 1], false],
            ['lt.st_johns', ['fixed', 6, 24], false],
            ['lt.statehood', ['fixed', 7, 6], false],
            ['assumption', ['fixed', 8, 15], false],
            ['all_saints', ['fixed', 11, 1], false],
            ['all_souls', ['fixed', 11, 2], false],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'EE' => [
            ['new_year', ['fixed', 1, 1], false],
            ['ee.independence', ['fixed', 2, 24], false],
            ['good_friday', ['easter', -2], false],
            ['easter_sunday', ['easter', 0], false],
            ['ee.spring_day', ['fixed', 5, 1], false],
            ['pentecost', ['easter', 49], false],
            ['ee.victory', ['fixed', 6, 23], false],
            ['midsummer', ['fixed', 6, 24], false],
            ['ee.restoration', ['fixed', 8, 20], false],
            ['christmas_eve', ['fixed', 12, 24], false],
            ['christmas', ['fixed', 12, 25], false],
            ['christmas_second', ['fixed', 12, 26], false],
        ],
        'US' => [
            ['new_year', ['fixed', 1, 1], true],
            ['us.mlk', ['nth', 1, 1, 3], false],
            ['us.washington', ['nth', 2, 1, 3], false],
            ['us.memorial', ['last', 5, 1], false],
            ['us.juneteenth', ['fixed', 6, 19], true],
            ['us.independence', ['fixed', 7, 4], true],
            ['us.labor', ['nth', 9, 1, 1], false],
            ['us.columbus', ['nth', 10, 1, 2], false],
            ['us.veterans', ['fixed', 11, 11], true],
            ['us.thanksgiving', ['nth', 11, 4, 4], false],
            ['christmas', ['fixed', 12, 25], true],
        ],
    ];

    /**
     * A country's public holidays by its rules for `$year`, with the substitute or observed days they cause, by date
     * (a day before its substitute). An observed day can fall in the year before (BuiltInDays filters by range).
     *
     * @return list<array{id: string, date: string, substitute: bool}>
     */
    public static function for(string $country, int $year): array
    {
        $days = [];
        foreach (self::RULES[$country] ?? [] as [$id, $rule, $moves]) {
            $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year), 'substitute' => false, 'moves' => $moves];
        }
        usort($days, fn (array $a, array $b) => strcmp($a['date'], $b['date']));

        $style = self::SUBSTITUTE[$country] ?? null;
        // A weekday that is already a holiday is never a substitute day.
        $taken = [];
        foreach ($days as $day) {
            if (!DayMath::isWeekend($day['date'])) {
                $taken[$day['date']] = true;
            }
        }
        $out = array_map(fn (array $d) => ['id' => $d['id'], 'date' => $d['date'], 'substitute' => false], $days);
        foreach ($days as $day) {
            if ($style === null || !$day['moves'] || !DayMath::isWeekend($day['date'])) {
                continue;
            }
            if ($style === 'observed') {
                $date = DayMath::add($day['date'], DayMath::weekday($day['date']) === 6 ? -1 : 1);
            } else {
                $date = DayMath::add($day['date'], 1);
                while (DayMath::isWeekend($date) || isset($taken[$date])) {
                    $date = DayMath::add($date, 1);
                }
                $taken[$date] = true;
            }
            $out[] = ['id' => $day['id'], 'date' => $date, 'substitute' => true];
        }
        usort($out, fn (array $a, array $b) => [$a['date'], $a['substitute']] <=> [$b['date'], $b['substitute']]);

        return $out;
    }

    /** Every id the table uses (DayNames must name each). @return list<string> */
    public static function ids(): array
    {
        $ids = [];
        foreach (self::RULES as $rules) {
            foreach ($rules as [$id]) {
                $ids[$id] = true;
            }
        }

        return array_keys($ids);
    }
}
