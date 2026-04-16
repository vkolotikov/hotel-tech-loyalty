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

        if (!$member) {
            return response()->json(['data' => [], 'next_page_url' => null]);
        }

        $bookings = $member->bookings()
            ->orderByDesc('check_in')
            ->paginate(10);

        return response()->json($bookings);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        if (!$member) {
            return response()->json(['message' => 'No member record found.'], 404);
        }

        $booking = $member->bookings()->findOrFail($id);
        return response()->json($booking);
    }
}
