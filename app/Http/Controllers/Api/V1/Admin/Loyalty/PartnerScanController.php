<?php
namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Loyalty\Access\PlaceScan;
use App\Services\Loyalty\Partners\PartnerAccess;
use App\Services\Appointments\VenueClock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

final class PartnerScanController extends Controller
{
    public function context(Request $request): JsonResponse
    {
        $staff = PartnerAccess::staff($request->user());
        $org = Organization::findOrFail($staff->organization_id);
        return response()->json([
            'organization' => ['name' => $org->name],
            'currency' => \App\Services\Portal\PortalBootstrap::currency($org),
            'staff' => ['name' => $request->user()->name],
            'places' => PartnerAccess::places($staff)->map(fn ($place) => ['id' => $place->id, 'name' => $place->name])->values(),
            'today' => VenueClock::today((int) $staff->organization_id),
        ]);
    }

    public function scan(Request $request, PlaceScan $scanner): JsonResponse
    {
        $data = $request->validate([
            'code' => 'required|string|max:2048', 'place_id' => 'required|integer|min:1',
            'idempotency_key' => 'required|string|min:1|max:64',
        ]);
        // Recheck the live place grant before card consumption or reading any cached answer.
        $place = PartnerAccess::place($request->user(), $data['place_id']);
        $key = hash('sha256', 'partner:'.$request->user()->id.':'.$data['idempotency_key']);
        $answer = $scanner->scan($place, $data['code'], $request->user(), $key);
        if (isset($answer['body']['member'])) {
            $answer['body']['member'] = Arr::only($answer['body']['member'], ['id', 'name', 'member_number', 'tier_id', 'tier_name', 'is_active', 'membership_valid_from', 'membership_valid_until', 'membership_state']);
        }
        return response()->json($answer['body'], $answer['status']);
    }
}
