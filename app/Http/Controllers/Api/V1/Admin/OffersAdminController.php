<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Services\NotificationService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OffersAdminController extends Controller
{
    public function __construct(
        protected OpenAiService $openAi,
        protected NotificationService $notificationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(
            SpecialOffer::with('createdBy:id,name')
                ->orderByDesc('created_at')
                ->paginate(20)
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'            => 'required|string|max:191',
            'description'      => 'required|string',
            'type'             => 'required|in:discount,points_multiplier,free_night,upgrade,bonus_points,cashback',
            'value'            => 'required|numeric|min:0',
            'tier_ids'         => 'nullable|array',
            'start_date'       => 'required|date',
            'end_date'         => 'required|date|after:start_date',
            'usage_limit'      => 'nullable|integer|min:1',
            'per_member_limit' => 'nullable|integer|min:1',
            'is_featured'      => 'boolean',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:2048',
            'image_url'        => 'nullable|url',
        ]);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('offers', 'public');
            $validated['image_url'] = '/storage/' . $path;
        }
        unset($validated['image']);

        $validated['created_by'] = $request->user()->id;
        $offer = SpecialOffer::create($validated);

        return response()->json(['message' => 'Offer created', 'offer' => $offer], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $offer = SpecialOffer::findOrFail($id);

        $data = $request->only(['title', 'description', 'type', 'value', 'tier_ids', 'start_date', 'end_date', 'usage_limit', 'per_member_limit', 'is_featured', 'is_active', 'image_url']);

        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('offers', 'public');
            $data['image_url'] = '/storage/' . $path;
        }

        $offer->update($data);
        return response()->json(['message' => 'Offer updated', 'offer' => $offer]);
    }

    public function destroy(int $id): JsonResponse
    {
        SpecialOffer::findOrFail($id)->delete();
        return response()->json(['message' => 'Offer deleted']);
    }

    public function generateAiOffer(Request $request): JsonResponse
    {
        $validated = $request->validate(['member_id' => 'required|exists:loyalty_members,id']);
        $member = LoyaltyMember::with(['tier', 'bookings', 'user'])->findOrFail($validated['member_id']);

        $offerData = $this->openAi->personalizeOffer($member);

        if (empty($offerData)) {
            return response()->json(['message' => 'Could not generate offer'], 422);
        }

        // Create the offer
        $offer = SpecialOffer::create([
            'title'        => $offerData['title'] ?? 'Personalized Offer',
            'description'  => $offerData['description'] ?? '',
            'type'         => $offerData['type'] ?? 'discount',
            'value'        => $offerData['value'] ?? 10,
            'tier_ids'     => [$member->tier_id],
            'start_date'   => now(),
            'end_date'     => now()->addDays(30),
            'ai_generated' => true,
            'per_member_limit' => 1,
            'is_active'    => true,
            'created_by'   => $request->user()->id,
        ]);

        // Assign to member
        MemberOffer::create([
            'member_id'    => $member->id,
            'offer_id'     => $offer->id,
            'ai_generated' => true,
            'ai_reason'    => $offerData['reason'] ?? '',
            'status'       => 'available',
            'expires_at'   => now()->addDays(30),
        ]);

        $this->notificationService->sendOfferNotification($member, $offer->title);

        return response()->json(['message' => 'AI offer generated', 'offer' => $offer]);
    }
}
