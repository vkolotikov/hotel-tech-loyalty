<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\NotificationCampaign;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    public function __construct(private NotificationService $notifications) {}

    public function index(): JsonResponse
    {
        $campaigns = NotificationCampaign::orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'campaigns' => $campaigns,
            'total'     => $campaigns->count(),
        ]);
    }

    public function createCampaign(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'title'        => 'required|string|max:255',
            'body'         => 'required|string',
            'segment_rules'=> 'nullable|array',
            'scheduled_at' => 'nullable|date',
        ]);

        $campaign = NotificationCampaign::create([
            'name'           => $validated['name'],
            'title'          => $validated['title'],
            'body'           => $validated['body'],
            'segment_rules'  => $validated['segment_rules'] ?? [],
            'status'         => 'sending',
            'created_by'     => $request->user()->id,
            'scheduled_at'   => $validated['scheduled_at'] ?? null,
        ]);

        // Build member query based on segment rules
        $rules   = $validated['segment_rules'] ?? [];
        $query   = LoyaltyMember::with(['user', 'tier'])->where('is_active', true);

        if (!empty($rules['tiers'])) {
            $query->whereHas('tier', fn($q) => $q->whereIn('name', $rules['tiers']));
        }
        if (!empty($rules['points_min'])) {
            $query->where('current_points', '>=', $rules['points_min']);
        }
        if (!empty($rules['points_max'])) {
            $query->where('current_points', '<=', $rules['points_max']);
        }

        $members = $query->whereNotNull('expo_push_token')->get();
        $sentCount = 0;

        foreach ($members as $member) {
            try {
                $this->notifications->send($member, [
                    'type'        => 'campaign',
                    'title'       => $validated['title'],
                    'body'        => $validated['body'],
                    'data'        => ['campaign_id' => $campaign->id],
                ]);
                $sentCount++;
            } catch (\Exception) {
                // Continue even if individual push fails
            }
        }

        $campaign->update([
            'status'     => 'sent',
            'sent_count' => $sentCount,
        ]);

        return response()->json([
            'message'   => "Campaign sent to {$sentCount} members",
            'campaign'  => $campaign->fresh(),
            'sent_count'=> $sentCount,
        ]);
    }
}
