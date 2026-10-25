<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\TierBenefit;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use App\Services\Loyalty\MemberLedger;
use App\Services\Loyalty\Members\MemberDetails;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\Loyalty\RequestQueue;
use App\Services\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Members: the list, Find, a member's page and their points history (spec 2026-10-21 §4.2, §4.3, §4.8); release 2
 * (§4.1) adds the member's details to their page.
 */
class MemberController extends Controller
{
    public function index(Request $request, MemberDirectory $directory): JsonResponse
    {
        $orgId = (int) app('current_organization_id');
        $filters = [
            'q'       => mb_substr((string) $request->query('q', ''), 0, 100),
            'tier_id' => $request->filled('tier_id') ? (int) $request->query('tier_id') : null,
            'state'   => $request->query('state'),
            'sort'    => $request->query('sort'),
        ];

        return response()->json($directory->page($filters, (int) $request->query('page', 1)) + [
            'figures' => $directory->figures($orgId),
        ]);
    }

    public function find(Request $request, MemberDirectory $directory): JsonResponse
    {
        return response()->json(['members' => $directory->find(mb_substr((string) $request->query('q', ''), 0, 100))]);
    }

    public function show(int $id, LoyaltyService $loyalty, RequestQueue $requests): JsonResponse
    {
        $member = $this->member($id);
        $member->load('user');

        $benefits = $member->tier_id === null ? collect() : TierBenefit::query()
            ->where('tier_id', $member->tier_id)->where('is_active', true)
            ->with('benefit:id,name,code,category,description,fulfillment_mode,is_active')
            ->get()
            ->filter(fn (TierBenefit $tb) => $tb->benefit !== null && $tb->benefit->is_active)
            ->map(fn (TierBenefit $tb) => [
                'id'          => (int) $tb->id,
                'name'        => (string) $tb->benefit->name,
                'category'    => $tb->benefit->category,
                'value'       => $tb->value,
                'description' => $tb->custom_description ?? $tb->benefit->description,
            ])->values();

        return response()->json([
            // Release 2 (§4.1): the details block, the tier's hold and whether the member was deleted (MemberProfile).
            'member'   => MemberProfile::of($member),
            // Release 8: progress in the programme's own terms — points, visits or spend (tier_progress_by).
            'progress' => $loyalty->tierProgress($member),
            'benefits' => $benefits,
            // The member's requests that still wait for staff: waiting, then approved.
            'requests' => collect([
                ...$requests->page('waiting', 1, $member->id)['requests'],
                ...$requests->page('approved', 1, $member->id)['requests'],
            ])->values(),
            // What Edit details offers (the workspace keeps no list of its own).
            'options'  => ['languages' => MemberDetails::LANGUAGES],
        ]);
    }

    public function history(Request $request, int $id, MemberLedger $ledger): JsonResponse
    {
        return response()->json($ledger->page($this->member($id), (int) $request->query('page', 1)));
    }
    /** One of this organisation's members (the tenant scope), or 404. */
    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with('tier')->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
