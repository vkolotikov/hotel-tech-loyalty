<?php

namespace App\Services\Content\Days;

/**
 * Marketing days (by the holiday country; spec 2026-10-16 Appendix B.1) and real international days (by the
 * organisation's industry; B.2). A marketing day that is a public holiday in the country is left out here: the
 * holiday table shows it (Lithuania's Mother's and Father's Day, Latvia's Christmas Eve, Germany's Father's Day =
 * Ascension). A brand with no holiday country gets the days that need no country.
 */
final class SpecialDays
{
    /** [id, rule] on the same day everywhere. */
    private const EVERYWHERE = [
        ['valentines', ['fixed', 2, 14]],
        ['womens_day', ['fixed', 3, 8]],
        ['halloween', ['fixed', 10, 31]],
        ['black_friday', ['black_friday']],
    ];

    /** id => [country (or 'none' for no country) => rule]; a country left out has none of that day here. */
    private const BY_COUNTRY = [
        'mothers_day' => [
            'GB' => ['easter', -21], 'IE' => ['easter', -21],
            'US' => ['nth', 5, 7, 2], 'DE' => ['nth', 5, 7, 2], 'LV' => ['nth', 5, 7, 2], 'EE' => ['nth', 5, 7, 2],
            'ES' => ['nth', 5, 7, 1], 'FR' => ['fr_mothers'],
        ],
        'fathers_day' => [
            'GB' => ['nth', 6, 7, 3], 'IE' => ['nth', 6, 7, 3], 'US' => ['nth', 6, 7, 3], 'FR' => ['nth', 6, 7, 3],
            'ES' => ['fixed', 3, 19], 'LV' => ['nth', 9, 7, 2], 'EE' => ['nth', 11, 7, 2],
        ],
        'easter_sunday' => [
            'GB' => ['easter', 0], 'IE' => ['easter', 0], 'US' => ['easter', 0], 'DE' => ['easter', 0], 'FR' => ['easter', 0],
            'ES' => ['easter', 0], 'none' => ['easter', 0],
        ],
        'christmas_eve' => [
            'GB' => ['fixed', 12, 24], 'IE' => ['fixed', 12, 24], 'US' => ['fixed', 12, 24], 'DE' => ['fixed', 12, 24],
            'FR' => ['fixed', 12, 24], 'ES' => ['fixed', 12, 24], 'none' => ['fixed', 12, 24],
        ],
        'new_years_eve' => [
            'GB' => ['fixed', 12, 31], 'IE' => ['fixed', 12, 31], 'US' => ['fixed', 12, 31], 'DE' => ['fixed', 12, 31],
            'FR' => ['fixed', 12, 31], 'ES' => ['fixed', 12, 31], 'LT' => ['fixed', 12, 31], 'EE' => ['fixed', 12, 31],
            'none' => ['fixed', 12, 31],
        ],
    ];

    /** [id, rule, industries (Organization::INDUSTRIES)]. */
    private const INDUSTRY = [
        ['world_health', ['fixed', 4, 7], ['medical', 'fitness']],
        ['world_heart', ['fixed', 9, 29], ['medical', 'fitness']],
        ['world_mental_health', ['fixed', 10, 10], ['medical']],
        ['yoga', ['fixed', 6, 21], ['fitness', 'beauty']],
        ['global_wellness', ['nth', 6, 6, 2], ['beauty', 'fitness', 'hotel']],
        ['global_running', ['nth', 6, 3, 1], ['fitness']],
        ['world_tourism', ['fixed', 9, 27], ['hotel', 'restaurant']],
        ['world_food', ['fixed', 10, 16], ['restaurant']],
        ['world_book', ['fixed', 4, 23], ['education']],
        ['literacy', ['fixed', 9, 8], ['education']],
        ['teachers', ['fixed', 10, 5], ['education']],
        ['world_ip', ['fixed', 4, 26], ['legal']],
        ['human_rights', ['fixed', 12, 10], ['legal']],
        ['world_habitat', ['nth', 10, 1, 1], ['real_estate']],
        ['msme', ['fixed', 6, 27], ['services', 'legal', 'other']],
    ];

    /** @return list<array{id: string, date: string}> by date */
    public static function marketing(?string $country, int $year): array
    {
        $key = $country ?? 'none';
        $days = [];
        foreach (self::EVERYWHERE as [$id, $rule]) {
            $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year)];
        }
        foreach (self::BY_COUNTRY as $id => $rules) {
            if (isset($rules[$key])) {
                $days[] = ['id' => $id, 'date' => DayMath::on($rules[$key], $year)];
            }
        }

        return self::byDate($days);
    }

    /** @return list<array{id: string, date: string}> by date */
    public static function industry(?string $industry, int $year): array
    {
        $days = [];
        foreach (self::INDUSTRY as [$id, $rule, $industries]) {
            if ($industry !== null && in_array($industry, $industries, true)) {
                $days[] = ['id' => $id, 'date' => DayMath::on($rule, $year)];
            }
        }

        return self::byDate($days);
    }

    /** Every id this class uses (DayNames must name each). @return list<string> */
    public static function ids(): array
    {
        return array_values(array_unique(array_merge(
            array_column(self::EVERYWHERE, 0),
            array_keys(self::BY_COUNTRY),
            array_column(self::INDUSTRY, 0),
        )));
    }

    /** @param list<array{id: string, date: string}> $days @return list<array{id: string, date: string}> */
    private static function byDate(array $days): array
    {
        usort($days, fn (array $a, array $b) => [$a['date'], $a['id']] <=> [$b['date'], $b['id']]);

        return $days;
    }
}
