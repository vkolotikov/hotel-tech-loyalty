<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\BenefitEntitlement;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\RequestQueue;
use App\Services\Portal\PortalBootstrap;
use App\Support\OrgAccent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What HexaTech Loyalty needs before it can draw anything (spec 2026-10-21 §6.4); release 2 adds the venue's currency
 * (the portal's rule) and the plan features its areas depend on.
 */
class BootstrapController extends Controller
{
    public const NAME = 'HexaTech Loyalty';

    public function show(Request $request): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        // Tenant-scoped: a user with staff rows in two organisations reports this one's role.
        $staff = Staff::where('user_id', $user->id)->first();

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'accent'       => OrgAccent::of($orgId),
            'venue'        => [
                'timezone'       => VenueClock::zone($orgId),
                'timezone_named' => VenueClock::isNamed($orgId),
                'today'          => VenueClock::today($orgId),
                'currency'       => PortalBootstrap::currency($org),
            ],
            // What the plan holds (the routes behind them answer 402 `feature_locked` without it).
            'features'     => [
                'campaigns' => $org->hasFeature('campaigns'),
                'wallet'    => $org->hasFeature('wallet'),
                'push'      => $org->hasFeature('push_notifications'),
            ],
            'staff'        => [
                'id'   => (int) $user->id,
                'name' => (string) $user->name,
                'role' => $staff?->role,
                'can'  => LoyaltyAccess::forBootstrap($user),
            ],
            'programme'    => [
                // The member portal's own switch: an active tier, not the Appointments plan, an industry with loyalty.
                'on'    => PortalBootstrap::loyaltyOn($orgId),
                'tiers' => LoyaltyTier::query()->orderBy('sort_order')->orderBy('min_points')->get()
                    ->map(fn (LoyaltyTier $t) => [
                        'id'         => (int) $t->id,
                        'name'       => (string) $t->name,
                        'color'      => $t->color_hex,
                        'min_points' => (int) $t->min_points,
                        'is_active'  => (bool) $t->is_active,
                    ])->values(),
                // Release 7: which ways to earn and reward the venue uses, for the screens that offer them.
                'ways'  => self::ways($orgId),
                // Release 8 (§3): how members move between tiers — `points`, `visits` or `spend` (ProgrammeOptions).
                'progress_by' => app(\App\Services\LoyaltyService::class)->progressBy($orgId),
            ],
            'counts'       => [
                'members'          => LoyaltyMember::query()->where('is_active', true)->count(),
                'requests_waiting' => BenefitEntitlement::query()->whereIn('status', RequestQueue::WAITING)->count(),
            ],
        ]);
    }

    /** @return array<string, mixed> The options the workspace's screens read (ProgrammeOptions; release 7). */
    private static function ways(int $orgId): array
    {
        $o = \App\Services\Loyalty\Programme\ProgrammeOptions::for($orgId);

        return [
            'stamps'           => (bool) $o['stamps_enabled'],
            'stamps_per_card'  => (int) $o['stamps_per_card'],
            'checkin'          => (bool) $o['checkin_enabled'],
            'checkin_points'   => (int) $o['checkin_points'],
            'desk_earn'        => (bool) $o['desk_earn_enabled'],
            'cashback'         => (bool) $o['cashback_enabled'],
            'cashback_percent' => (float) $o['cashback_percent'],
            'setup_done'       => $o['programme_setup_completed_at'] !== null,
        ];
    }
}
