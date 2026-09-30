<?php

namespace App\Services\Appointments;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\DiscountService;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;

/**
 * The client's real membership, read from the programme's own records:
 * the member row's tier and balance, the tier's benefits through the
 * discount engine, and what the ledger says this booking was awarded.
 * It keeps no balance of its own.
 */
final class LoyaltyCard
{
    public function __construct(
        private readonly DiscountService $discounts,
        private readonly BookingPointsService $points,
    ) {
    }

    /** @return array{id: int, number: string, tier: ?string, points: int} */
    public static function memberSummary(LoyaltyMember $member): array
    {
        $member->loadMissing('tier');

        return [
            'id'     => (int) $member->id,
            'number' => (string) $member->member_number,
            'tier'   => $member->tier?->name,
            'points' => (int) $member->current_points,
        ];
    }

    /**
     * Null when the organisation runs no programme — the card is not shown
     * at all. `member` is null for a client who is not a member.
     *
     * @return array{member: ?array, benefits: list<array{name: ?string, display: ?string, description: ?string}>}|null
     */
    public function forMember(int $orgId, ?LoyaltyMember $member): ?array
    {
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            return null;
        }
        if (!$member) {
            return ['member' => null, 'benefits' => []];
        }

        return [
            'member'   => self::memberSummary($member),
            'benefits' => $this->discounts->benefitsFor($member, null)->map(fn ($tb) => [
                'name'        => $tb->benefit?->name,
                'display'     => $tb->value,
                'description' => $tb->custom_description ?? $tb->benefit?->description,
            ])->values()->all(),
        ];
    }

    /** forMember() for the booking's member, plus what this booking earns or earned. */
    public function forBooking(ServiceBooking $b): ?array
    {
        $orgId = (int) $b->organization_id;
        $card = $this->forMember($orgId, $b->member_id ? $b->member : null);
        if ($card === null) {
            return null;
        }

        $card['points_on_bookings'] = $this->points->pointsOnBookingsEnabled($orgId);
        $card['awarded'] = $b->points_awarded_at !== null ? $this->awarded($b) : null;

        return $card;
    }

    /** Points the ledger holds for this booking that have not been reversed. */
    private function awarded(ServiceBooking $b): int
    {
        return (int) PointsTransaction::withoutGlobalScopes()
            ->where('organization_id', $b->organization_id)
            ->where('reference_type', 'service_booking')
            ->where('reference_id', $b->id)
            ->where('points', '>', 0)
            ->where('is_reversed', false)
            ->sum('points');
    }
}
