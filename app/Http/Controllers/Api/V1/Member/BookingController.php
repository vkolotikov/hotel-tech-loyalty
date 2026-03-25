<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        $bookings = $member->bookings()
            ->orderByDesc('check_in')
            ->paginate(10);

        return response()->json($bookings);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        $booking = $member->bookings()->findOrFail($id);
        return response()->json($booking);
    }
}
