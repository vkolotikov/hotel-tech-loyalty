<?php

namespace App\Services\Time;

use App\Models\CrmSetting;

/**
 * Buddies (HexaTech Time Planner, 2026-11-28, the owner: "add some animated characters … to make it even more
 * interesting"): the character that keeps a person company in recognition — it reacts to their day on My day, stands
 * beside their name in the week's ranking and cheers with them.
 *
 * - **Which one**: a person's own choice (`staff.planner_profile.buddy`, written only by `PlannerProfiles::chooseBuddy`
 *   through `PUT admin/time/buddy`, the one field of the profile a person writes for themselves), one of KINDS, or
 *   NONE for no character at all. Someone who never chose gets one by their account, so a team is varied from the
 *   first day and nobody has to set anything up.
 * - **Whether at all** is the organisation's (`planner_buddies`, `on` unless a manager says `off`; written only by
 *   `PUT admin/time/settings/…`): switched off, nobody is shown a character and the workspace offers none.
 *
 * A character is only a picture: it decides nothing and earns nothing. How it looks and what mood it is in are the
 * workspace's, read from the same answer as the points (Recognition).
 */
final class Buddies
{
    public const KEY = 'planner_buddies';

    public const ON = 'on';

    public const OFF = 'off';

    /** The characters there are; the workspace draws each by its code. */
    public const KINDS = ['hexi', 'pip', 'kit', 'ember'];

    /** A person's choice of no character. */
    public const NONE = 'none';

    /** Whether the organisation shows characters (the current tenant's row); anything unreadable is on. */
    public static function enabled(): bool
    {
        return self::readEnabled(CrmSetting::query()->where('key', self::KEY)->value('value'));
    }

    public static function readEnabled(mixed $value): bool
    {
        return self::readWord($value) !== self::OFF;
    }

    /** The setting as its word, `on` or `off`. */
    public static function readWord(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_string($decoded) ? $decoded : $value;
        }

        return $value === self::OFF || $value === false ? self::OFF : self::ON;
    }

    /** What a profile holds: a kind, NONE, or null for someone who never chose. */
    public static function choice(mixed $value): ?string
    {
        return is_string($value) && ($value === self::NONE || in_array($value, self::KINDS, true)) ? $value : null;
    }

    /**
     * The character a person (a row of Team::people()) is shown with: their choice, or — never having chosen — one by
     * their account; null for a choice of none and for a name without an account.
     *
     * @param  array<string, mixed>  $person
     */
    public static function shown(array $person): ?string
    {
        $userId = (int) ($person['user_id'] ?? 0);
        if ($userId <= 0) {
            return null;
        }
        $choice = self::choice($person['profile']['buddy'] ?? null);
        if ($choice === self::NONE) {
            return null;
        }

        return $choice ?? self::KINDS[$userId % count(self::KINDS)];
    }
}
