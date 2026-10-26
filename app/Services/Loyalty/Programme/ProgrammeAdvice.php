<?php

namespace App\Services\Loyalty\Programme;

use App\Models\LoyaltyEvent;
use App\Services\Booking\BookingCapability;

/**
 * What "Ways to earn" checks about a venue's programme (owner 2026-10-26: "better logic"): the options read together
 * with what the venue actually has — bookings to earn on, events that count as visits, rewards to spend on — so a
 * manager is told when ways do not work together, before members find out. Reads only; the workspace names each code.
 *
 * - `advice`: a list of `{code, level, way, params}`, the warnings first. `level` is `warn` (members are short of
 *   something) or `tip` (it works, but is unusual); `way` is the card to open for it (null: it is fixed elsewhere —
 *   the catalogue).
 * - `not_used`: the ways that do nothing at this venue as it stands (points on bookings where nothing can be booked).
 *
 * A booking source is appointments bookable (BookingCapability) or rooms to sell — a stay may arrive from the PMS even
 * when the venue does not sell it online. `read()` is pure, so every rule is tested by value.
 */
final class ProgrammeAdvice
{
    public const WARN = 'warn';
    public const TIP = 'tip';

    /** Points expiring sooner than this many months reads as a mistake to most members. */
    public const SHORT_EXPIRY_MONTHS = 6;

    public function __construct(private readonly BookingCapability $capability)
    {
    }

    /**
     * @param array<string, mixed> $options ProgrammeOptions::for()
     * @param list<int> $activeRewardIds the catalogue's offered rewards
     * @return array{advice: list<array{code: string, level: string, way: ?string, params: array<string, int>}>, not_used: list<string>}
     */
    public function for(int $orgId, array $options, array $activeRewardIds): array
    {
        $venue = [
            'bookings'     => $this->capability->appointmentsBookable($orgId) || $this->capability->staysBookable($orgId),
            'visit_events' => LoyaltyEvent::query()->where('organization_id', $orgId)
                ->where('status', LoyaltyEvent::PUBLISHED)->where('counts_as_visit', true)->exists(),
        ];

        return self::read($options, $venue, $activeRewardIds);
    }

    /**
     * @param array<string, mixed> $o the options
     * @param array{bookings: bool, visit_events: bool} $venue
     * @param list<int> $activeRewardIds
     * @return array{advice: list<array{code: string, level: string, way: ?string, params: array<string, int>}>, not_used: list<string>}
     */
    public static function read(array $o, array $venue, array $activeRewardIds): array
    {
        $bookings = $venue['bookings'];
        $checkin = ($o['checkin_enabled'] ?? false) === true;
        $checkinPoints = (int) ($o['checkin_points'] ?? 0);
        $desk = ($o['desk_earn_enabled'] ?? false) === true;
        $stamps = ($o['stamps_enabled'] ?? false) === true;
        $bookingPoints = $bookings && ($o['points_on_bookings'] ?? false) === true;
        $progress = (string) ($o['tier_progress_by'] ?? 'points');
        $months = (int) ($o['points_expiry_months'] ?? 0);

        $warn = [];
        $tips = [];
        $say = fn (string $code, ?string $way, array $params = []) => ['code' => $code, 'way' => $way, 'params' => $params];

        // Members can earn points regularly: on bookings (where there are any), at the desk, by checking in, by stamps.
        if (!$bookingPoints && !$desk && !($checkin && $checkinPoints > 0) && !$stamps) {
            $warn[] = $say('nothing_earns', $bookings ? 'points_on_spend' : 'desk_earn');
        }
        // A tier by visits needs something that records a visit; by spend, something that records a spend.
        if ($progress === 'visits' && !$bookings && !$checkin && !$desk && !$venue['visit_events']) {
            $warn[] = $say('visits_without_source', 'check_in');
        }
        if ($progress === 'spend' && !$bookings && !$desk) {
            $warn[] = $say('spend_without_source', 'desk_earn');
        }
        if ($stamps && ($o['stamp_reward_kind'] ?? 'points') === 'reward' && !in_array((int) ($o['stamp_reward_id'] ?? 0), $activeRewardIds, true)) {
            $warn[] = $say('stamp_reward_missing', 'stamp_card');
        }
        if (($o['referral_enabled'] ?? false) === true && (int) ($o['referrer_bonus_points'] ?? 0) === 0 && (int) ($o['referee_bonus_points'] ?? 0) === 0) {
            $warn[] = $say('referrals_give_nothing', 'referrals');
        }
        if ($activeRewardIds === []) {
            $warn[] = $say('no_rewards', null);
        }

        if ($months > 0 && $months < self::SHORT_EXPIRY_MONTHS) {
            $tips[] = $say('expiry_short', 'points_expiry', ['months' => $months]);
        }
        if ($checkin && $checkinPoints === 0 && !$stamps && $progress !== 'visits') {
            $tips[] = $say('checkin_counts_only', 'check_in');
        }

        return [
            'advice'   => array_merge(
                array_map(fn (array $a) => ['code' => $a['code'], 'level' => self::WARN, 'way' => $a['way'], 'params' => $a['params']], $warn),
                array_map(fn (array $a) => ['code' => $a['code'], 'level' => self::TIP, 'way' => $a['way'], 'params' => $a['params']], $tips),
            ),
            'not_used' => $bookings ? [] : ['points_on_spend'],
        ];
    }
}
