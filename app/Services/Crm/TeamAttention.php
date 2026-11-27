<?php

namespace App\Services\Crm;

use Illuminate\Support\Arr;

final class TeamAttention
{
    public const WAIT_DAYS = 7;

    /** Project ranked threads into distinct leads, preserving the evidence behind each link. */
    public static function lists(array $ranked): array
    {
        $needed = $waiting = $checkins = $fallbacks = [];
        foreach ($ranked as $row) {
            $id = $row['lead_id'];
            if (isset($row['outreach'])) {
                $checkins[$id] = self::publicRow(array_replace($row, $row['outreach'], ['kind' => 'checkin', 'ai_reason' => null]));
            }
            if ($row['kind'] === 'checkin') {
                continue;
            }
            if ($row['kind'] === 'email' && in_array($row['ai_reason'], ['automated', 'information_only'], true)) {
                if (isset($row['fallback'])) {
                    $fallbacks[$id] ??= self::publicRow(array_replace($row, $row['fallback'], ['source' => null, 'message_id' => null, 'subject' => '', 'age_days' => null, 'ai_reason' => null]));
                }
                continue;
            }
            $needed[$id] ??= self::publicRow($row);
            if ($row['kind'] === 'email' && $row['age_days'] >= self::WAIT_DAYS && (!isset($waiting[$id]) || $row['at'] < $waiting[$id]['at'])) {
                $waiting[$id] = self::publicRow($row);
            }
        }
        $needed += $fallbacks;
        uasort($waiting, fn ($a, $b) => $a['at'] <=> $b['at'] ?: $a['lead_id'] <=> $b['lead_id']);
        $top = array_slice($needed, 0, 3, true);
        if ($waiting) {
            $oldest = reset($waiting);
            if (!isset($top[$oldest['lead_id']])) {
                $top = array_slice($top, 0, 2, true);
            }
            $top[$oldest['lead_id']] = $oldest;
        }
        return ['needed' => array_values($needed), 'waiting_week' => array_values($waiting), 'checkin' => array_values($checkins),
            'summary' => ['needed' => count($needed), 'waiting_week' => count($waiting), 'checkin' => count($checkins),
                'top' => array_values($top), 'followups' => array_values(array_slice($checkins, 0, 2))]];
    }

    public static function publicRow(array $row): array
    {
        return Arr::except($row, ['evidence','score','review_key','guest_id','brand_id','outreach','fallback']);
    }
}
