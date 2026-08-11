<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use Illuminate\Http\JsonResponse;

/**
 * Everything a public sign-up page needs before anyone types anything.
 *
 * Member registration is tenant-scoped: `register` has to know which
 * organisation someone is joining, or it picks a tier from whichever org
 * happens to answer first and writes a user with a null `organization_id`
 * — which TenantScope then fails closed on, leaving a member who can log
 * in and see nothing. In practice it 500s with
 * "No query results for model [LoyaltyMember]".
 *
 * So the join link carries the org: `/portal/join?org={widget_token}`,
 * the same public token the booking, services and chat widgets already
 * use. It is not a secret — it appears in every embed snippet — but it
 * avoids putting sequential organisation ids in a public URL.
 *
 * This endpoint turns that token into the things the page must show: who
 * you are joining, and whether the programme is actually set up.
 */
class PublicJoinController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $brand = Brand::resolveByToken($token);

        if (!$brand || !$brand->organization) {
            return response()->json([
                'error' => 'This sign-up link is not valid. Please check with the hotel for a current link.',
            ], 404);
        }

        $org = $brand->organization;

        // resolveByToken binds org + brand context, so the scoped queries
        // below resolve to this tenant.
        $tier = LoyaltyTier::where('is_active', true)
            ->orderBy('min_points')
            ->first();

        if (!$tier) {
            // Honest and specific: signing someone up into a programme with
            // no tiers would fail deep inside the transaction with a
            // meaningless error.
            return response()->json([
                'error'            => 'This loyalty programme is not set up yet. Please contact reception.',
                'organization'     => ['name' => $org->name],
                'accepting_joins'  => false,
            ], 422);
        }

        return response()->json([
            'organization' => [
                'id'   => $org->id,
                'name' => $brand->name ?: $org->name,
            ],
            'accepting_joins' => true,
            'starting_tier'   => $tier->name,
            // Shown on the form as the reason to bother signing up.
            'welcome_bonus'   => (int) HotelSetting::getValue('welcome_bonus_points', 0),
        ]);
    }
}
