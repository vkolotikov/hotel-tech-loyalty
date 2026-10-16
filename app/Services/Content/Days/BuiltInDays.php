<?php

namespace App\Services\Content\Days;

/**
 * The built-in days of a range (spec 2026-10-16 §3.2): the holiday country's public holidays (with substitute and
 * observed days), and — while the brand's switch is on — the marketing days and the organisation's industry days.
 */
final class BuiltInDays
{
    private const KIND_ORDER = ['holiday' => 0, 'marketing' => 1, 'industry' => 2];

    /** @return list<array{id: string, kind: string, date: string, substitute: bool, name_en: string}> */
    public static function between(?string $country, bool $marketing, ?string $industry, string $from, string $to): array
    {
        $days = [];
        // A day observed on 31 December comes from the next year's rules.
        for ($year = (int) substr($from, 0, 4); $year <= (int) substr($to, 0, 4) + 1; $year++) {
            if ($country !== null) {
                foreach (PublicHolidays::for($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'holiday'];
                }
            }
            if ($marketing) {
                foreach (SpecialDays::marketing($country, $year) as $day) {
                    $days[] = $day + ['kind' => 'marketing', 'substitute' => false];
                }
                foreach (SpecialDays::industry($industry, $year) as $day) {
                    $days[] = $day + ['kind' => 'industry', 'substitute' => false];
                }
            }
        }
        $days = array_values(array_filter($days, fn (array $d) => $d['date'] >= $from && $d['date'] <= $to));
        usort($days, fn (array $a, array $b) => [$a['date'], self::KIND_ORDER[$a['kind']], $a['substitute'], $a['id']]
            <=> [$b['date'], self::KIND_ORDER[$b['kind']], $b['substitute'], $b['id']]);

        return array_map(fn (array $d) => [
            'id' => $d['id'], 'kind' => $d['kind'], 'date' => $d['date'], 'substitute' => $d['substitute'], 'name_en' => DayNames::en($d['id']),
        ], $days);
    }
}
