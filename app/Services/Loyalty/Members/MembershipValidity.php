<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\NotificationService;
use App\Support\SharedCache;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * A membership's optional end date (release 8, spec 2026-10-25 §3, owner's R8-2): the only writer of
 * `loyalty_members.membership_valid_until` and of `membership_reminded_for`, the end date the "your membership ends
 * soon" reminder went out for.
 *
 * A date is the last venue day the membership holds: the member is let in on it and refused from the day after
 * (AccessDecision reads the column the same way). No date: the membership never ends. What a date changes is access
 * only — an expired member keeps earning and spending at the desk, and keeps signing in to the portal.
 *
 * Writers:
 *  - change(): a manager's Set a date, Extend (1, 3 or 6 months or a year from the later of the venue's today and the
 *    current end) and Remove the end date — under the member row lock, audited `member.validity_changed` with the old
 *    and new date, idempotent by the request's key (a replay answers the first outcome and writes nothing; the same
 *    key with another change is 409 `key_reused`). A date before the venue's today is refused (422).
 *  - onCreate(): the optional date an enrolment or an import gives a new member (inside the caller's transaction).
 *  - keptOnMerge(): the date a merged member keeps (the later of the two).
 *  - remind(): the reminder's mark, by a conditional update, before the message goes (at most once per end date).
 *
 * Every change of the date clears `membership_reminded_for`, so a renewed membership is reminded again before its new
 * end; a change that keeps the date writes nothing.
 */
class MembershipValidity
{
    /** An end date this near (in days, the last day counting 0) reads as "expiring" on the screens. */
    public const EXPIRING_DAYS = 30;

    /** The reminder goes out this many days before the end (and on any later day up to it, if a run was missed). */
    public const REMIND_DAYS = 14;

    /** Extend's quick choices, in months. */
    public const EXTENSIONS = ['1m' => 1, '3m' => 3, '6m' => 6, '1y' => 12];

    /** The latest end a manager may set, in years from the venue's today: past it a date is a typing slip. */
    public const MAX_YEARS = 50;

    /** How long a request's outcome is kept for a retry with the same key. */
    public const REPLAY_SECONDS = 86400;

    public const ACTIVE = 'active';
    public const EXPIRING = 'expiring';
    public const EXPIRED = 'expired';
    public const OFF = 'off';

    /**
     * What the portal and the screens show of a member's validity: the end date (Y-m-d, or null) and the state on the
     * venue's clock — `off` for a switched-off member, else `expired` after the end date, `expiring` within
     * EXPIRING_DAYS of it, `active` otherwise (no end date included).
     *
     * @return array{valid_until: ?string, state: string}
     */
    public static function summaryFor(LoyaltyMember $member): array
    {
        $validUntil = self::endOf($member);
        $today = $validUntil !== null ? VenueClock::today((int) $member->organization_id) : null;

        return ['valid_until' => $validUntil, 'state' => self::stateOf($validUntil, (bool) $member->is_active, $today)];
    }

    /** The state of an end date on a venue day (`$today` Y-m-d; not read when there is no end date). */
    public static function stateOf(?string $validUntil, bool $active, ?string $today): string
    {
        if (!$active) {
            return self::OFF;
        }
        if ($validUntil === null || $today === null) {
            return self::ACTIVE;
        }
        if ($validUntil < $today) {
            return self::EXPIRED;
        }

        return self::daysBetween($today, $validUntil) <= self::EXPIRING_DAYS ? self::EXPIRING : self::ACTIVE;
    }

    /** The member's end date as stored (Y-m-d), or null — read safely on a row that never loaded the column. */
    public static function endOf(LoyaltyMember $member): ?string
    {
        $raw = $member->getAttributes()['membership_valid_until'] ?? null;

        return $raw === null || $raw === '' ? null : $member->membership_valid_until?->toDateString();
    }

    /**
     * The end Extend gives: `$months` months after the later of the venue's today and the current end, on the same day
     * of the month or the month's last day when it has no such day (31 January + 1 month is 28 or 29 February).
     */
    public static function extended(?string $current, string $today, int $months): string
    {
        $from = $current !== null && $current > $today ? $current : $today;

        return CarbonImmutable::createFromFormat('!Y-m-d', $from, 'UTC')->addMonthsNoOverflow($months)->toDateString();
    }

    /** Whole days from one Y-m-d to another (negative when the second is earlier). */
    public static function daysBetween(string $from, string $to): int
    {
        $a = CarbonImmutable::createFromFormat('!Y-m-d', $from, 'UTC');
        $b = CarbonImmutable::createFromFormat('!Y-m-d', $to, 'UTC');

        return (int) $a->diffInDays($b, false);
    }

    /** A real calendar day written Y-m-d (2026-02-30 is not one). */
    public static function isDay(mixed $value): bool
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        [$y, $m, $d] = array_map('intval', explode('-', $value));

        return checkdate($m, $d, $y);
    }

    /**
     * A manager's change: `['valid_until' => 'Y-m-d'|null]` (set a date, or remove it) or `['extend' => '1m'|'3m'|'6m'|'1y']`.
     * The caller has checked the manager and that the member is this organisation's and not deleted.
     *
     * @param array{valid_until?: ?string, extend?: string} $change
     * @return array{member: LoyaltyMember, valid_until: ?string, state: string, changed: bool, replayed: bool}
     *
     * @throws ValidationException a date that is not a day, before the venue's today or too far ahead; an unknown extension
     * @throws LoyaltyRefused `key_reused` (409) a key already used for another change
     */
    public function change(LoyaltyMember $member, array $change, User $by, ?string $key = null): array
    {
        $orgId = (int) $member->organization_id;
        $today = VenueClock::today($orgId);
        $wanted = self::checked($change, $today);
        $replayKey = $key !== null && $key !== '' ? "loyalty-validity:{$orgId}:{$member->id}:" . hash('sha256', $key) : null;
        $hash = hash('sha256', (string) json_encode($wanted));

        $outcome = DB::transaction(function () use ($member, $orgId, $wanted, $today, $by, $replayKey, $hash) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->firstOrFail();

            if ($replayKey !== null && is_array($seen = SharedCache::store()->get($replayKey))) {
                if (($seen['hash'] ?? null) !== $hash) {
                    throw new LoyaltyRefused('key_reused', 'This retry key was used for a different change.', 409);
                }

                return ['changed' => false, 'replayed' => true, 'valid_until' => $seen['valid_until']];
            }

            $old = self::endOf($locked);
            $new = array_key_exists('extend', $wanted)
                ? self::extended($old, $today, self::EXTENSIONS[$wanted['extend']])
                : $wanted['valid_until'];

            $changed = $new !== $old;
            if ($changed) {
                self::write($orgId, (int) $locked->id, ['membership_valid_until' => $new, 'membership_reminded_for' => null]);
                AuditLog::create([
                    'organization_id' => $orgId,
                    'causer_type'     => User::class,
                    'causer_id'       => $by->id,
                    'action'          => 'member.validity_changed',
                    'subject_type'    => LoyaltyMember::class,
                    'subject_id'      => $locked->id,
                    'old_values'      => ['valid_until' => $old],
                    'new_values'      => ['valid_until' => $new] + (isset($wanted['extend']) ? ['extend' => $wanted['extend']] : []),
                    'description'     => $new === null
                        ? 'Membership end date removed'
                        : ($old === null ? "Membership valid until {$new}" : "Membership end date changed from {$old} to {$new}"),
                ]);
            }

            // Inside the transaction: the shared cache is the database in production, so the record commits with the change.
            if ($replayKey !== null) {
                SharedCache::store()->put($replayKey, ['hash' => $hash, 'valid_until' => $new], self::REPLAY_SECONDS);
            }

            return ['changed' => $changed, 'replayed' => false, 'valid_until' => $new];
        });

        $fresh = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->with(['user', 'tier'])->findOrFail($member->id);

        return [
            'member'      => $fresh,
            'valid_until' => self::endOf($fresh),
            'state'       => self::summaryFor($fresh)['state'],
            'changed'     => $outcome['changed'],
            'replayed'    => $outcome['replayed'],
        ];
    }

    /**
     * The change, checked against the venue's today: exactly one of a date (or null) and an extension.
     *
     * @param array{valid_until?: ?string, extend?: string} $change
     * @return array{valid_until?: ?string, extend?: string}
     */
    private static function checked(array $change, string $today): array
    {
        $hasDate = array_key_exists('valid_until', $change);
        $hasExtend = array_key_exists('extend', $change) && $change['extend'] !== null;
        if ($hasDate === $hasExtend) {
            throw ValidationException::withMessages(['valid_until' => ['Send an end date, no end date, or an extension.']]);
        }
        if ($hasExtend) {
            if (!is_string($change['extend']) || !isset(self::EXTENSIONS[$change['extend']])) {
                throw ValidationException::withMessages(['extend' => ['Extend by 1m, 3m, 6m or 1y.']]);
            }

            return ['extend' => $change['extend']];
        }

        $date = $change['valid_until'];
        if ($date === null || $date === '') {
            return ['valid_until' => null];
        }
        if (!self::isDay($date)) {
            throw ValidationException::withMessages(['valid_until' => ['The end date must be a day written YYYY-MM-DD.']]);
        }
        if ($date < $today) {
            throw ValidationException::withMessages(['valid_until' => ['The end date cannot be before today.']]);
        }
        if ($date > CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->addYears(self::MAX_YEARS)->toDateString()) {
            throw ValidationException::withMessages(['valid_until' => ['The end date is too far ahead.']]);
        }

        return ['valid_until' => $date];
    }

    /**
     * The end date a new member starts with (an enrolment's or an import's), written on the row inside the caller's
     * transaction, never audited on its own: the enrolment and the import are. The caller has checked it is a day.
     */
    public static function onCreate(LoyaltyMember $member, ?string $validUntil): void
    {
        if ($validUntil === null || $validUntil === '') {
            return;
        }
        self::write((int) $member->organization_id, (int) $member->id, ['membership_valid_until' => $validUntil, 'membership_reminded_for' => null]);
        $member->setRawAttributes(array_merge($member->getAttributes(), ['membership_valid_until' => $validUntil, 'membership_reminded_for' => null]), true);
    }

    /**
     * What a merged member keeps (for MemberMergeService, which saves the winner): the later of the two end dates — a
     * member with no end date and one with an end date keep the end date, so a duplicate account made without one
     * never lifts a paid membership's end — and the reminder mark that goes with it.
     */
    public static function keptOnMerge(LoyaltyMember $winner, LoyaltyMember $loser): void
    {
        $a = self::endOf($winner);
        $b = self::endOf($loser);
        if ($b === null || ($a !== null && $a >= $b)) {
            return;
        }
        // Raw, as write() stores them (a plain Y-m-d): the merge's save writes them as they are.
        $reminded = $loser->membership_reminded_for?->toDateString();
        $winner->setRawAttributes(array_merge($winner->getAttributes(), ['membership_valid_until' => $b, 'membership_reminded_for' => $reminded]));
    }

    /**
     * The one statement that stores the dates: plain `Y-m-d` strings, never through the model's date cast, which would
     * write `Y-m-d 00:00:00` on SQLite and break the day comparisons the list, the reminder and the access check make.
     *
     * @param array{membership_valid_until?: ?string, membership_reminded_for?: ?string} $values
     */
    private static function write(int $orgId, int $memberId, array $values): void
    {
        DB::table('loyalty_members')->where('organization_id', $orgId)->where('id', $memberId)->update($values + ['updated_at' => now()]);
    }

    /**
     * The reminder for one organisation (`php artisan loyalty:membership-reminders`): every active, not deleted member
     * whose end date is between the venue's today and REMIND_DAYS after it and who was not reminded for that date gets
     * an inbox message and a push ("Your membership ends on {date}"), through NotificationService::send(). The mark is
     * written first, by a conditional update under the member row lock, so two runs remind once; the message goes
     * after the commit. Answers how many were reminded.
     */
    public function remind(int $orgId, NotificationService $notify): int
    {
        $today = VenueClock::today($orgId);
        $until = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->addDays(self::REMIND_DAYS)->toDateString();
        $sent = 0;

        LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->whereNotNull('membership_valid_until')
            ->where('membership_valid_until', '>=', $today)
            ->where('membership_valid_until', '<=', $until)
            ->where(fn ($q) => $q->whereNull('membership_reminded_for')->orWhereColumn('membership_reminded_for', '!=', 'membership_valid_until'))
            ->with('user')
            ->orderBy('id')
            ->chunkById(100, function ($members) use ($orgId, $today, $until, $notify, &$sent) {
                foreach ($members as $member) {
                    if (MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member)) {
                        continue;
                    }
                    $date = $this->markReminded($orgId, (int) $member->id, $today, $until);
                    if ($date === null) {
                        continue;
                    }
                    try {
                        $member->refresh();
                        $notify->send($member, [
                            'type'  => 'membership_ending',
                            'title' => 'Your membership ends soon',
                            'body'  => 'Your membership ends on ' . CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC')->format('j M Y') . '.',
                            'data'  => ['valid_until' => $date],
                        ]);
                        $sent++;
                    } catch (\Throwable $e) {
                        // At most once: the mark stays, and the member is not reminded twice for this date.
                        Log::warning('loyalty.membership_reminder_failed', ['org' => $orgId, 'member' => $member->id, 'error' => $e->getMessage()]);
                    }
                }
            });

        return $sent;
    }

    /** Marks the member reminded for their end date, if it is still due; answers the date, or null when it is not. */
    private function markReminded(int $orgId, int $memberId, string $today, string $until): ?string
    {
        return DB::transaction(function () use ($orgId, $memberId, $today, $until) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($memberId)->lockForUpdate()->first();
            $date = $locked ? self::endOf($locked) : null;
            if ($date === null || !$locked->is_active || $date < $today || $date > $until) {
                return null;
            }
            $marked = LoyaltyMember::withoutGlobalScopes()->whereKey($memberId)
                ->where('membership_valid_until', $date)
                ->where(fn ($q) => $q->whereNull('membership_reminded_for')->orWhere('membership_reminded_for', '!=', $date))
                ->update(['membership_reminded_for' => $date]);

            return $marked === 1 ? $date : null;
        });
    }
}
