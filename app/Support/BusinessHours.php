<?php

namespace App\Support;

use Carbon\CarbonInterface;

/**
 * Whether a venue is open, from the hours its admin editor stores.
 *
 * Extracted from WidgetChatController so the decision has one implementation.
 * The landing page needs the same answer, and two readings of the same column
 * is how a venue ends up shown as open on its website and closed in its chat
 * widget on the same afternoon.
 *
 * THE SHAPE, as the editor actually writes it
 * (frontend/src/pages/ChatbotWidget.tsx):
 *
 *   ['mon' => [['open' => '09:00', 'close' => '17:00']], 'tue' => [...]]
 *
 * Three spellings mean closed, and the editor produces all three:
 *
 *   - The day is ABSENT. Toggling a day off runs `delete next[day.key]`, so
 *     absence is the ONLY signal that a venue has deliberately closed that
 *     day. Reading it as "not configured, assume open" — which is what this
 *     code did until now — meant a salon that switched Sunday off had its
 *     widget greeting visitors on Sunday with no offline message.
 *   - The day is an EMPTY ARRAY. An older spelling; still honoured.
 *   - The day has BLANK times. Clearing a time input stores ['open' => '',
 *     'close' => '']; the editor's own UI renders that as closed.
 *
 * The one case that must stay open is an entirely empty or missing
 * business_hours: that means the venue has never opened the hours editor, and
 * most have not. Telling them they are shut would be a far worse bug than the
 * one this fixes.
 */
final class BusinessHours
{
    /** Day keys as the editor writes them. */
    public const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public static function isOpenAt(mixed $hours, CarbonInterface $now): bool
    {
        // Never configured — say nothing, which means do not claim closed.
        if (!is_array($hours) || $hours === []) {
            return true;
        }

        $windows = $hours[self::dayKey($now)] ?? null;

        // Absent: deliberately closed. See the note above — this is the line
        // the bug lived on.
        if ($windows === null) {
            return false;
        }

        if (!is_array($windows) || $windows === []) {
            return false;
        }

        $current = $now->format('H:i');

        foreach ($windows as $window) {
            if (!is_array($window)) {
                continue;
            }

            $open  = $window['open']  ?? null;
            $close = $window['close'] ?? null;

            // Blank strings are the editor's third spelling of closed.
            if (!is_string($open) || !is_string($close) || $open === '' || $close === '') {
                continue;
            }

            if ($current >= $open && $current <= $close) {
                return true;
            }
        }

        return false;
    }

    /** 'mon' … 'sun', matching the editor's keys. */
    public static function dayKey(CarbonInterface $now): string
    {
        return strtolower(substr($now->format('D'), 0, 3));
    }
}
