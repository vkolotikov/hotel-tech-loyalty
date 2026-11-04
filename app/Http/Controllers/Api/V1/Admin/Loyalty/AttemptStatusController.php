<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Staff\AttemptStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AttemptStatusController extends Controller
{
    /** A read using POST so the private reason is never placed in URLs or access logs. */
    public function __invoke(Request $request, int $id, AttemptStatus $status): JsonResponse
    {
        $data = $request->validate([
            'action' => 'required|in:award,redeem,checkin', 'idempotency_key' => 'required|string|max:64',
            'amount' => 'nullable|numeric|gt:0|max:1000000', 'note' => 'nullable|string|max:200',
        ]);
        $member = LoyaltyMember::query()->find($id) ?? throw LoyaltyRefused::notFound();

        return response()->json($status->read($member, $request->user(), $data['action'], $data['idempotency_key'],
            isset($data['amount']) ? (float) $data['amount'] : null, trim($data['note'] ?? '')))
            ->header('Cache-Control', 'no-store');
    }
}
