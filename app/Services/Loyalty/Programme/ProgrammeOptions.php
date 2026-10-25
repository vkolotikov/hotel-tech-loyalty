<?php

namespace App\Services\Loyalty\Programme;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\Reward;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A venue's loyalty options — which ways to earn and to be rewarded it uses, and their numbers (release 7, spec
 * 2026-10-25 §1). The one reader and the one writer: the rows are `hotel_settings` keys (the engine's existing keys keep
 * their names), read for the organisation named, never whichever tenant happens to be bound.
 *
 * Every option is answered typed, with its default when the venue never set it; `save()` validates a partial change,
 * writes it (a new row gets group `loyalty`), flushes the settings cache and audits `loyalty.options_changed` with the
 * old and new values. `programme_setup_completed_at` is the wizard's alone (`markSetUp()`, called by ProgrammeSetup);
 * a change that names it is refused. `ways()` and `fields()` describe the options for the workspace's cards.
 */
final class ProgrammeOptions
{
    /**
     * Every option: its type, its default, and its label for a new `hotel_settings` row. `bool`, `int`, `decimal`,
     * `enum:<a>|<b>`, `reward` (a catalogue reward id of this organisation, or null) or `time` (ISO, or null).
     *
     * @var array<string, array{0: string, 1: mixed, 2: string}>
     */
    public const OPTIONS = [
        // Points on spend
        'points_on_bookings'          => ['bool', true, 'Points on Bookings'],
        'points_per_currency'         => ['decimal', 1.0, 'Points per Currency Unit'],
        'points_expiry_months'        => ['int', 24, 'Points Expiry (months, 0 = never)'],
        // Bonuses
        'welcome_bonus_points'        => ['int', 500, 'Welcome Bonus Points'],
        'birthday_bonus_points'       => ['int', 500, 'Birthday Bonus Points'],
        // Referrals
        'referral_enabled'            => ['bool', true, 'Referrals On'],
        'referrer_bonus_points'       => ['int', 250, 'Referrer Bonus Points'],
        'referee_bonus_points'        => ['int', 250, 'Referee Bonus Points'],
        'referral_reward_on'          => ['enum:first_visit|signup', 'first_visit', 'Referral Rewarded On'],
        // The stamp card
        'stamps_enabled'              => ['bool', false, 'Stamp Card On'],
        'stamps_per_card'             => ['int', 10, 'Stamps per Card'],
        'stamp_reward_kind'           => ['enum:points|reward', 'points', 'Full Card Gives'],
        'stamp_reward_points'         => ['int', 100, 'Full Card Points'],
        'stamp_reward_id'             => ['reward', null, 'Full Card Reward'],
        // At the desk
        'checkin_enabled'             => ['bool', false, 'Check-in On'],
        'checkin_points'              => ['int', 0, 'Check-in Points'],
        'desk_earn_enabled'           => ['bool', false, 'Earn at the Desk On'],
        // Cashback credit
        'cashback_enabled'            => ['bool', false, 'Cashback Credit On'],
        'cashback_percent'            => ['decimal', 5.0, 'Cashback Percent'],
        // How members move up (release 8, spec 2026-10-25 §3, R8-4): what assessTier() and every progress line read
        'tier_progress_by'            => ['enum:points|visits|spend', 'points', 'Tier Progress By'],
        // The wizard
        'programme_setup_completed_at' => ['time', null, 'Programme Setup Completed'],
    ];

    /** Bounds a value must stay within, by option (inclusive). @var array<string, array{0: float|int, 1: float|int}> */
    public const BOUNDS = [
        'points_per_currency'   => [0.01, 1000],
        'points_expiry_months'  => [0, 120],
        'welcome_bonus_points'  => [0, 1000000],
        'birthday_bonus_points' => [0, 1000000],
        'referrer_bonus_points' => [0, 1000000],
        'referee_bonus_points'  => [0, 1000000],
        'stamps_per_card'       => [2, 50],
        'stamp_reward_points'   => [1, 1000000],
        'checkin_points'        => [0, 100000],
        'cashback_percent'      => [0.1, 50],
    ];

    /**
     * The ways to earn and be rewarded as the options page and the wizard show them, one card each (release 7 §1): the
     * option that switches the way on (`switch`), or the number whose 0 means off (`zero_off`: no expiry, no bonus),
     * and the options the card sets. The workspace draws its cards from this list; it keeps no copy. A card with
     * neither is always on (release 8's "How members move up": a choice, never off).
     *
     * @var array<string, array{switch?: string, zero_off?: string, fields: list<string>}>
     */
    public const WAYS = [
        'points_on_spend' => ['switch' => 'points_on_bookings', 'fields' => ['points_per_currency']],
        'points_expiry'   => ['zero_off' => 'points_expiry_months', 'fields' => ['points_expiry_months']],
        'welcome_bonus'   => ['zero_off' => 'welcome_bonus_points', 'fields' => ['welcome_bonus_points']],
        'birthday_bonus'  => ['zero_off' => 'birthday_bonus_points', 'fields' => ['birthday_bonus_points']],
        'referrals'       => ['switch' => 'referral_enabled', 'fields' => ['referrer_bonus_points', 'referee_bonus_points', 'referral_reward_on']],
        'stamp_card'      => ['switch' => 'stamps_enabled', 'fields' => ['stamps_per_card', 'stamp_reward_kind', 'stamp_reward_points', 'stamp_reward_id']],
        'check_in'        => ['switch' => 'checkin_enabled', 'fields' => ['checkin_points']],
        'desk_earn'       => ['switch' => 'desk_earn_enabled', 'fields' => []],
        'cashback'        => ['switch' => 'cashback_enabled', 'fields' => ['cashback_percent']],
        'tier_progress'   => ['fields' => ['tier_progress_by']],
    ];

    /** A field that counts only while another option holds a value: [that option, the value]. */
    public const SHOWN_WHEN = [
        'stamp_reward_points' => ['stamp_reward_kind', 'points'],
        'stamp_reward_id'     => ['stamp_reward_kind', 'reward'],
    ];

    /** Written only by the setup wizard's apply and skip (markSetUp()), never by a change. */
    public const WIZARD_ONLY = ['programme_setup_completed_at'];

    /**
     * The cards, as the workspace reads them.
     *
     * @return list<array{key: string, switch: ?string, zero_off: ?string, fields: list<string>}>
     */
    public static function ways(): array
    {
        $out = [];
        foreach (self::WAYS as $key => $way) {
            $out[] = ['key' => $key, 'switch' => $way['switch'] ?? null, 'zero_off' => $way['zero_off'] ?? null, 'fields' => $way['fields']];
        }

        return $out;
    }

    /**
     * Each option a change may name: its type (`bool`, `int`, `decimal`, `enum`, `reward`), its default, its bounds,
     * its choices and when it counts — so the workspace checks a field as the server will, without a copy of the rules.
     *
     * @return array<string, array{type: string, default: mixed, min: float|int|null, max: float|int|null, choices: ?list<string>, when: ?array{field: string, is: string}}>
     */
    public static function fields(): array
    {
        $out = [];
        foreach (self::OPTIONS as $key => [$type, $default]) {
            if (in_array($key, self::WIZARD_ONLY, true)) {
                continue;
            }
            $enum = str_starts_with($type, 'enum:');
            $when = self::SHOWN_WHEN[$key] ?? null;
            $out[$key] = [
                'type'    => $enum ? 'enum' : $type,
                'default' => $default,
                'min'     => self::BOUNDS[$key][0] ?? null,
                'max'     => self::BOUNDS[$key][1] ?? null,
                'choices' => $enum ? explode('|', substr($type, 5)) : null,
                'when'    => $when ? ['field' => $when[0], 'is' => $when[1]] : null,
            ];
        }

        return $out;
    }

    /**
     * Every option of the organisation, typed, defaults filled in.
     *
     * @return array<string, mixed>
     */
    public static function for(int $orgId): array
    {
        $rows = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('key', array_keys(self::OPTIONS))->get()->keyBy('key');

        $out = [];
        foreach (self::OPTIONS as $key => [$type, $default]) {
            $row = $rows->get($key);
            $out[$key] = $row === null ? $default : self::cast($type, $row->value, $default);
        }

        return $out;
    }

    /** The container key of perRequest()'s memo (a scoped instance: a new one for every request and every queued job). */
    private const MEMO = 'loyalty.programme-options.memo';

    /** How long perRequest() trusts what it read, in seconds, within one request, job or command run. */
    public const MEMO_SECONDS = 60;

    /**
     * One option of the organisation, typed as for() types it, read from the database once per request or queued job
     * (and again after MEMO_SECONDS in a long command): for a hot path that asks on every earn or assessment (release 8's
     * `tier_progress_by`, read by every assessTier()). Never through HotelSetting's settings map, which is each
     * container's own file cache for half an hour — a venue's switch must hold on every container from the next request.
     * A save in this process forgets what was read (save(), markSetUp()).
     */
    public static function perRequest(int $orgId, string $key): mixed
    {
        if (!array_key_exists($key, self::OPTIONS)) {
            throw new \InvalidArgumentException("Unknown loyalty option {$key}");
        }
        $memo = self::memo();
        $seen = $memo[$orgId] ?? null;
        if (!is_array($seen) || time() - $seen['at'] > self::MEMO_SECONDS) {
            $seen = ['at' => time(), 'options' => self::for($orgId)];
            $memo[$orgId] = $seen;
        }

        return $seen['options'][$key];
    }

    /** @return \ArrayObject<int, array{at: int, options: array<string, mixed>}> */
    private static function memo(): \ArrayObject
    {
        $app = app();
        if (!$app->bound(self::MEMO)) {
            $app->scoped(self::MEMO, fn () => new \ArrayObject());
        }

        return $app->make(self::MEMO);
    }

    /** What perRequest() read for the organisation is read again next time (its options were just written). */
    private static function forgetRead(int $orgId): void
    {
        unset(self::memo()[$orgId]);
    }

    /** One option of the organisation, typed (its default when never set). */
    public static function get(int $orgId, string $key): mixed
    {
        if (!array_key_exists($key, self::OPTIONS)) {
            throw new \InvalidArgumentException("Unknown loyalty option {$key}");
        }

        return self::for($orgId)[$key];
    }

    /**
     * Validates and writes a partial change; answers every option after it. Field errors are a ValidationException
     * keyed by option.
     *
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    public static function save(int $orgId, array $changes, ?User $by): array
    {
        $clean = self::validate($orgId, $changes);
        if ($clean === []) {
            return self::for($orgId);
        }

        $before = self::for($orgId);
        self::write($orgId, $clean);
        self::markSwitchedOn($orgId, $before, $clean);
        $after = self::for($orgId);

        $changed = array_filter(array_keys($clean), fn (string $k) => $before[$k] !== $after[$k]);
        if ($changed !== []) {
            $old = array_intersect_key($before, array_flip($changed));
            $new = array_intersect_key($after, array_flip($changed));
            AuditLog::create([
                'organization_id' => $orgId,
                'causer_type'     => $by ? User::class : null,
                'causer_id'       => $by?->id,
                'action'          => 'loyalty.options_changed',
                'subject_type'    => 'organization',
                'subject_id'      => $orgId,
                'old_values'      => $old,
                'new_values'      => $new,
                'description'     => 'Loyalty options changed: ' . implode(', ', $changed),
            ]);
        }

        return $after;
    }

    /**
     * The ways that earn on a booking's visit (a stay, an appointment) count visits from the venue day they were switched
     * on: a booking completed or departed before then earns no stamp and no cashback when it is touched later (a status
     * change, the nightly stay sweep). Kept beside the option, not in OPTIONS: nobody sets it but the switch.
     */
    public const ON_SINCE = [
        'stamps_enabled'   => 'stamps_enabled_since',
        'cashback_enabled' => 'cashback_enabled_since',
    ];

    /**
     * The venue day (Y-m-d) the option was last switched on, or null when that was never recorded (the option was on
     * before release 7 kept the day, or was never switched on here): no earlier visit is then refused.
     */
    public static function onSince(int $orgId, string $option): ?string
    {
        if (!isset(self::ON_SINCE[$option])) {
            throw new \InvalidArgumentException("No switched-on day is kept for {$option}");
        }
        $raw = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', self::ON_SINCE[$option])->value('value');

        return is_string($raw) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) ? $raw : null;
    }

    /** Whether a visit on this venue day counts for the option (on, and on or after the day it was switched on). */
    public static function countsVisitOn(int $orgId, string $option, string $venueDay): bool
    {
        if (!self::get($orgId, $option)) {
            return false;
        }
        $since = self::onSince($orgId, $option);

        return $since === null || $venueDay >= $since;
    }

    /**
     * Records today (on the venue's clock) for every ON_SINCE option this change switched from off to on.
     *
     * @param array<string, mixed> $before
     * @param array<string, mixed> $clean
     */
    private static function markSwitchedOn(int $orgId, array $before, array $clean): void
    {
        $today = null;
        foreach (self::ON_SINCE as $option => $key) {
            if (($clean[$option] ?? null) === true && $before[$option] !== true) {
                $today ??= \App\Services\Portal\PortalBootstrap::venueToday($orgId)->toDateString();
                self::writeRaw($orgId, $key, $today, 'Switched On Since');
            }
        }
    }

    /**
     * The wizard was applied or skipped: stamps `programme_setup_completed_at` (now) and answers it. The caller audits
     * what happened (`loyalty.programme_setup` / `loyalty.programme_setup_skipped`), so the stamp writes no
     * `loyalty.options_changed` row of its own.
     */
    public static function markSetUp(int $orgId): string
    {
        $at = now()->toIso8601String();
        self::write($orgId, ['programme_setup_completed_at' => $at]);

        return $at;
    }

    /**
     * Writes typed values (a new row gets group `loyalty`, its type and label) and flushes the settings cache, inside
     * a transaction (a savepoint when the caller has one open).
     *
     * @param array<string, mixed> $clean
     */
    /** One row outside OPTIONS (a switched-on day), written as write() writes, under the organisation named. */
    private static function writeRaw(int $orgId, string $key, string $value, string $label): void
    {
        self::underOrg($orgId, function () use ($orgId, $key, $value, $label) {
            $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $orgId, 'key' => $key]);
            if (!$row->exists) {
                $row->forceFill(['organization_id' => $orgId, 'type' => 'string', 'group' => 'loyalty', 'label' => $label]);
            }
            $row->value = $value;
            $row->save();
        });
        HotelSetting::flushCacheFor($orgId);
    }

    private static function write(int $orgId, array $clean): void
    {
        self::underOrg($orgId, fn () => DB::transaction(function () use ($orgId, $clean) {
            foreach ($clean as $key => $value) {
                [$type, , $label] = self::OPTIONS[$key];
                $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $orgId, 'key' => $key]);
                if (!$row->exists) {
                    $row->forceFill(['organization_id' => $orgId, 'type' => self::rowType($type), 'group' => 'loyalty', 'label' => $label]);
                }
                $row->value = self::store($type, $value);
                $row->save();
            }
        }));
        HotelSetting::flushCacheFor($orgId);
        self::forgetRead($orgId);
    }

    /**
     * A new row takes the BOUND tenant's organisation (BelongsToOrganization's creating hook), so the organisation named
     * is bound while writing — a console or queued caller with another tenant bound writes this one's rows.
     */
    private static function underOrg(int $orgId, \Closure $work): void
    {
        $bound = app()->bound('current_organization_id');
        $prior = $bound ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            $work();
        } finally {
            if ($bound) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }

    /**
     * The changes, typed and checked; unknown keys are refused, and so is the wizard's own stamp (WIZARD_ONLY).
     *
     * @param array<string, mixed> $changes
     * @return array<string, mixed>
     */
    public static function validate(int $orgId, array $changes): array
    {
        $errors = [];
        $clean = [];
        foreach ($changes as $key => $value) {
            if (!array_key_exists($key, self::OPTIONS)) {
                $errors[$key] = ['This is not a loyalty option.'];
                continue;
            }
            if (in_array($key, self::WIZARD_ONLY, true)) {
                $errors[$key] = ['This is set by the setup wizard.'];
                continue;
            }
            [$type] = self::OPTIONS[$key];
            $problem = null;
            $typed = self::accept($orgId, $type, $value, $problem);
            if ($problem === null && isset(self::BOUNDS[$key]) && $typed !== null) {
                [$min, $max] = self::BOUNDS[$key];
                if ($typed < $min || $typed > $max) {
                    $problem = "Must be between {$min} and {$max}.";
                }
            }
            if ($problem !== null) {
                $errors[$key] = [$problem];
                continue;
            }
            $clean[$key] = $typed;
        }
        // A full card that gives a reward needs one: the kind and the reward as they will stand after the change (an
        // emptied reward under a stored `reward` kind is refused too). Checked only when the change names either.
        if (!isset($errors['stamp_reward_kind']) && !isset($errors['stamp_reward_id'])
            && (array_key_exists('stamp_reward_kind', $clean) || array_key_exists('stamp_reward_id', $clean))) {
            $kind = array_key_exists('stamp_reward_kind', $clean) ? $clean['stamp_reward_kind'] : self::get($orgId, 'stamp_reward_kind');
            $reward = array_key_exists('stamp_reward_id', $clean) ? $clean['stamp_reward_id'] : self::get($orgId, 'stamp_reward_id');
            if ($kind === 'reward' && $reward === null) {
                $errors['stamp_reward_id'] = ['Choose the reward a full card gives.'];
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $clean;
    }

    private static function accept(int $orgId, string $type, mixed $value, ?string &$problem): mixed
    {
        switch (true) {
            case $type === 'bool':
                if (is_bool($value) || in_array($value, [0, 1, '0', '1', 'true', 'false'], true)) {
                    return filter_var($value, FILTER_VALIDATE_BOOLEAN);
                }
                $problem = 'Must be on or off.';
                return null;
            case $type === 'int':
                if (is_int($value) || (is_string($value) && preg_match('/^\d+$/', $value)) || (is_float($value) && floor($value) === $value)) {
                    return (int) $value;
                }
                $problem = 'Must be a whole number.';
                return null;
            case $type === 'decimal':
                if (is_numeric($value)) {
                    return round((float) $value, 2);
                }
                $problem = 'Must be a number.';
                return null;
            case str_starts_with($type, 'enum:'):
                $allowed = explode('|', substr($type, 5));
                if (is_string($value) && in_array($value, $allowed, true)) {
                    return $value;
                }
                $problem = 'Must be one of: ' . implode(', ', $allowed) . '.';
                return null;
            case $type === 'reward':
                if ($value === null || $value === '') {
                    return null;
                }
                // One of this organisation's rewards that members can still be given (the picker lists the active ones).
                $own = is_numeric($value) && Reward::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey((int) $value)
                    ->where('is_active', true)->exists();
                if ($own) {
                    return (int) $value;
                }
                $problem = 'Choose one of your rewards.';
                return null;
            case $type === 'time':
                if ($value === null || $value === '') {
                    return null;
                }
                try {
                    return \Illuminate\Support\Carbon::parse((string) $value)->toIso8601String();
                } catch (\Throwable) {
                    $problem = 'Must be a date and time.';
                    return null;
                }
        }
        $problem = 'Unknown option type.';

        return null;
    }

    private static function cast(string $type, ?string $raw, mixed $default): mixed
    {
        if ($raw === null || $raw === '') {
            return in_array($type, ['reward', 'time'], true) ? null : $default;
        }

        return match (true) {
            $type === 'bool'               => filter_var($raw, FILTER_VALIDATE_BOOLEAN),
            $type === 'int'                => is_numeric($raw) ? (int) $raw : $default,
            $type === 'decimal'            => is_numeric($raw) ? round((float) $raw, 2) : $default,
            $type === 'reward'             => is_numeric($raw) ? (int) $raw : null,
            str_starts_with($type, 'enum:') => in_array($raw, explode('|', substr($type, 5)), true) ? $raw : $default,
            default                        => $raw,
        };
    }

    private static function store(string $type, mixed $value): string
    {
        return match (true) {
            $value === null => '',
            $type === 'bool' => $value ? 'true' : 'false',
            default          => (string) $value,
        };
    }

    /** The `hotel_settings.type` a new row gets. */
    private static function rowType(string $type): string
    {
        return match (true) {
            $type === 'bool'                          => 'boolean',
            in_array($type, ['int', 'decimal'], true) => 'number',
            default                                   => 'string',
        };
    }
}
