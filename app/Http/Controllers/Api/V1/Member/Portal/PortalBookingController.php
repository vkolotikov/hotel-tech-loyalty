<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\Portal\MemberBookingQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortalBookingController extends Controller
{
    public function __construct(private MemberBookingQuery $bookings)
    {
    }

    /** GET /v1/member/portal/bookings?scope=upcoming|past&page=N */
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['data' => [], 'meta' => ['scope' => 'upcoming', 'page' => 1, 'per_page' => 20, 'total' => 0]]);
        }

        $scope = $request->query('scope') === MemberBookingQuery::PAST ? MemberBookingQuery::PAST : MemberBookingQuery::UPCOMING;
        $page = max(1, (int) $request->query('page', 1));

        // Every DTO's total is a float; a whole-number amount (60.0) must not
        // silently become the JSON number 60 and decode back as an int.
        return response()->json($this->bookings->list($member, $scope, $page), 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    /** GET /v1/member/portal/bookings/{kind}/{id} */
    public function show(Request $request, string $kind, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        $dto = $member ? $this->bookings->find($member, $kind, $id) : null;

        if (!$dto) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that booking.'], 404);
        }

        return response()->json($dto, 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }
}
