<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\PushNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        // Every row is a notification kept for the member's inbox (NotificationService::keep(), release 3 §3). No
        // `is_sent` filter: a row the code before release 3 wrote while the deploy switched over still shows.
        $notifications = PushNotification::where('member_id', $member->id)
            ->orderByDesc('created_at')
            ->paginate($request->get('per_page', 50));

        return response()->json($notifications);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        $notification = PushNotification::where('member_id', $member->id)
            ->findOrFail($id);

        $notification->update(['read_at' => now()]);

        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        PushNotification::where('member_id', $member->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read']);
    }
}
