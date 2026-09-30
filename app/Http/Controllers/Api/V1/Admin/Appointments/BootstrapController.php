<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Models\Staff;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingCapability;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What the appointments workspace needs before it can draw anything. */
class BootstrapController extends Controller
{
    public const NAME = 'HexaTech Appointments';

    public function show(Request $request, BookingCapability $capability, BookingPointsService $points): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $staff = Staff::withoutGlobalScopes()->where('user_id', $user->id)->first();
        $brandId = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brand = $brandId ? Brand::find($brandId) : null;

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'brand'        => $brand ? ['id' => (int) $brand->id, 'name' => (string) $brand->name] : null,
            'venue'        => [
                'timezone'       => VenueClock::zone($orgId),
                'timezone_named' => VenueClock::isNamed($orgId),
                'today'          => VenueClock::today($orgId),
                'currency'       => $org->currency ?: 'EUR',
            ],
            'staff'        => ['name' => (string) $user->name, 'role' => $staff?->role],
            'loyalty'      => [
                'programme_on'       => PortalBootstrap::loyaltyOn($orgId),
                'points_on_bookings' => $points->pointsOnBookingsEnabled($orgId),
            ],
            'readiness'    => [
                'services' => Service::where('is_active', true)->count(),
                'team'     => ServiceMaster::where('is_active', true)->count(),
                'bookable' => $capability->appointmentsBookable($orgId, $brandId ? (int) $brandId : null),
            ],
        ]);
    }
}
