<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\Loyalty\Members\MembershipAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class MembershipAssignmentController extends Controller
{
    public function update(Request $request, int $id, MembershipAssignment $assignments): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = LoyaltyMember::query()->find($id) ?? throw LoyaltyRefused::notFound();
        $data = $request->validate([
            'membership_mode' => ['required', Rule::in(MembershipAssignment::MODES)],
            'tier_id' => 'required_if:membership_mode,assigned|nullable|integer|min:1',
            'valid_from' => 'sometimes|nullable|string|max:10',
            'valid_until' => 'sometimes|nullable|string|max:10',
            'confirm_replace' => 'sometimes|boolean',
            'idempotency_key' => 'required|string|max:64',
        ]);
        $answer = $assignments->assign($member, $data, $request->user(), $data['idempotency_key']);

        return response()->json(['member' => MemberProfile::of($answer['member']), 'replayed' => $answer['replayed']]);
    }
}
