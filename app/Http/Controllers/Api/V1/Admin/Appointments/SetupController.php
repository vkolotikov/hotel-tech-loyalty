<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The workspace's Setup in one read, and the booking-link mark. Any staff user reads; the answer says who may edit. */
class SetupController extends Controller
{
    public function show(Request $request, SetupPresenter $present, SetupChecklist $checklist): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $canManage = SetupAccess::canManage($user);
        $today = VenueClock::today($orgId);

        return response()->json([
            'can_manage'        => $canManage,
            'my_team_member_id' => SetupAccess::ownTeamMemberId($user),
            'services'          => Service::with('masters')->orderBy('sort_order')->orderBy('name')->get()->map(fn (Service $s) => $present->service($s))->all(),
            'categories'        => ServiceCategory::orderBy('sort_order')->orderBy('name')->get()->map(fn (ServiceCategory $c) => $present->category($c))->all(),
            'team'              => ServiceMaster::with(SetupPresenter::memberRelations($today))->orderBy('sort_order')->orderBy('name')->get()->map(fn (ServiceMaster $m) => $present->member($m))->all(),
            'staff_accounts'    => $canManage ? $present->staffAccounts() : [],
            'settings'          => BookingRules::read($org),
            'checklist'         => $checklist->for($orgId, self::brandId()),
        ]);
    }

    public function linkCopied(Request $request, SetupChecklist $checklist): JsonResponse
    {
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        BookingRules::markLinkCopied($orgId);

        return response()->json(['checklist' => $checklist->for($orgId, self::brandId())]);
    }

    public static function brandId(): ?int
    {
        return app()->bound('current_brand_id') && app('current_brand_id') ? (int) app('current_brand_id') : null;
    }
}
