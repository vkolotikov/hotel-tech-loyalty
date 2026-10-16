<?php

namespace App\Services\Content;

use App\Models\ContentPlannerKeyDate;
use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\Content\Days\BuiltInDays;
use App\Services\Content\Days\HolidayCountry;

/** Key dates for the Plan and the AI (spec 2026-10-16 §3): the built-in days and the brand's own events and notes. */
final class ContentKeyDates
{
    /**
     * The key dates of a range (spec 2026-10-16 §9.2): the built-in days — the brand's holiday country (chosen or
     * guessed), and the marketing and industry days while its switch is on — then its events and notes that overlap
     * the range. A brand without a profile gets the guessed holidays and the special days.
     *
     * @return list<array<string, mixed>>
     */
    public static function forRange(Organization $org, ?ContentPlannerProfile $profile, string $from, string $to): array
    {
        $days = BuiltInDays::between(
            HolidayCountry::for($org, $profile),
            $profile === null || (bool) ($profile->marketing_days ?? true),
            $org->resolved_industry,
            $from,
            $to,
        );

        return $profile === null ? $days : array_merge($days, self::ownBetween($profile, $from, $to));
    }

    /** The brand's events and notes that touch the range, by first day. @return list<array{id: int, kind: string, title: string, details: ?string, start: string, end: ?string}> */
    public static function ownBetween(ContentPlannerProfile $profile, string $from, string $to): array
    {
        return $profile->keyDates()
            ->whereDate('start_date', '<=', $to)
            ->where(fn ($q) => $q->whereDate('end_date', '>=', $from)
                ->orWhere(fn ($q) => $q->whereNull('end_date')->whereDate('start_date', '>=', $from)))
            ->orderBy('start_date')->orderBy('id')
            ->get()
            ->map(fn (ContentPlannerKeyDate $keyDate) => self::own($keyDate))->values()->all();
    }

    /**
     * The key dates the AI is told for a range (spec 2026-10-16 §3.6): holidays, special days (while shown) and the
     * brand's events with their details — never a note — one line each, by day; '' when there are none.
     */
    public static function forAi(Organization $org, ContentPlannerProfile $profile, string $from, string $to): string
    {
        $labels = ['holiday' => 'public holiday', 'marketing' => 'marketing day', 'industry' => 'international day'];
        $lines = [];
        foreach (self::forRange($org, $profile, $from, $to) as $day) {
            if ($day['kind'] === 'note') {
                continue;
            }
            if ($day['kind'] === 'event') {
                $details = trim((string) $day['details']);
                $when = $day['end'] !== null ? "{$day['start']} to {$day['end']}" : $day['start'];
                $lines[] = [$day['start'], "- {$when}: {$day['title']} (the brand's own event)" . ($details !== '' ? ' — ' . mb_substr($details, 0, 300) : '')];
                continue;
            }
            $label = $labels[$day['kind']] . ($day['substitute'] ? ', substitute day off' : '');
            $lines[] = [$day['date'], "- {$day['date']}: {$day['name_en']} ({$label})"];
        }
        // By day; usort is stable, so the built-in order stays within a day.
        usort($lines, fn (array $a, array $b) => strcmp($a[0], $b[0]));

        return implode("\n", array_column($lines, 1));
    }

    /** A stored date as `Y-m-d` (SQLite keeps a time after it). */
    public static function day(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return substr($value instanceof \DateTimeInterface ? $value->format('Y-m-d') : (string) $value, 0, 10);
    }

    /** @return array{id: int, kind: string, title: string, details: ?string, start: string, end: ?string} */
    public static function own(ContentPlannerKeyDate $keyDate): array
    {
        return [
            'id'      => (int) $keyDate->id,
            'kind'    => (string) $keyDate->kind,
            'title'   => (string) $keyDate->title,
            'details' => $keyDate->details,
            'start'   => (string) self::day($keyDate->start_date),
            'end'     => self::day($keyDate->end_date),
        ];
    }
}
