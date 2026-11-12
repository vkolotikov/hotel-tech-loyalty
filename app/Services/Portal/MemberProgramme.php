<?php

namespace App\Services\Portal;

use App\Models\AccessPlace;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Programme\ProgrammeOptions;

/** Read-only facts for the web card and earning panels; the programme and door retain their own decisions. */
final class MemberProgramme
{
    public function for(LoyaltyMember $member): array
    {
        $orgId = (int) $member->getAttribute('organization_id');
        $on = PortalBootstrap::loyaltyOn($orgId);
        $options = $on ? ProgrammeOptions::for($orgId) : [];
        $decision = app(AccessDecision::class);

        return [
            'earning' => $on ? [
                'bookings' => $options['points_on_bookings'],
                'desk' => $options['desk_earn_enabled'],
                'base_rate' => $options['points_per_currency'],
                'checkin' => $options['checkin_enabled'],
                'checkin_points' => $options['checkin_points'],
                'expiry_months' => $options['points_expiry_months'],
                'birthday_points' => $options['birthday_bonus_points'],
                'referrals' => $options['referral_enabled'],
            ] : null,
            'places' => AccessPlace::query()->where('organization_id', $orgId)->where('is_active', true)
                ->with('tiers')->orderBy('sort_order')->orderBy('id')->get()->map(function (AccessPlace $place) use ($member, $decision) {
                    $verdict = $decision->decide($member, $place);

                    return [
                        'id' => (int) $place->id,
                        'name' => (string) $place->name,
                        'description' => $place->description,
                        'granted' => $verdict->granted,
                        'reason' => $verdict->reason,
                        'allowed_tiers' => $verdict->allowedTiers,
                    ];
                })->values()->all(),
        ];
    }
}
