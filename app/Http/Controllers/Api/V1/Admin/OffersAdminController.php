<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Concerns\IndexesResource;
use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Services\NotificationService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OffersAdminController extends Controller
{
    use IndexesResource;

    public function __construct(
        protected OpenAiService $openAi,
        protected NotificationService $notificationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        // Migrated to the shared IndexesResource trait — see
        // AUDIT-2026-06-13-ADDENDUM.md maintainability finding. Pre-fix
        // this hardcoded per_page=20 (the smallest of 24 controllers'
        // inconsistent defaults) and had no `sort` allowlist. Default
        // sort + direction preserved (created_at desc).
        return response()->json(
            $this->applyIndex(
                SpecialOffer::with('createdBy:id,name'),
                $request,
                sortable: ['created_at','title','start_date','end_date','is_featured','type'],
                defaultSort: 'created_at',
                searchable: ['title','description'],
            )
        );
    }

    public function store(Request $request): JsonResponse
    {
        $orgId = app('current_organization_id');
        $this->normalizeOfferCode($request);

        $validated = $request->validate([
            'title'            => 'required|string|max:191',
            'description'      => 'required|string',
            'type'             => 'required|in:discount,points_multiplier,free_night,upgrade,bonus_points,cashback,fixed_amount',
            'value'            => 'required|numeric|min:0',
            'code'             => 'nullable|string|min:4|max:24|regex:/^[A-Za-z0-9-]+$/',
            // Booking scope: which kind of booking this offer's discount is
            // allowed to apply to (see BookingScope).
            'applies_to'       => 'nullable|in:all,services,stays',
            'tier_ids'         => 'nullable|array',
            'tier_ids.*'       => [Rule::in(LoyaltyTier::withoutGlobalScopes()->where('organization_id', $orgId)->pluck('id'))],
            'start_date'       => 'required|date',
            'end_date'         => 'required|date|after:start_date',
            'usage_limit'      => 'nullable|integer|min:1',
            'per_member_limit' => 'nullable|integer|min:1',
            'is_featured'      => 'boolean',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:2048',
            'image_url'        => 'nullable|url',
        ]);

        if ($duplicate = $this->duplicateCodeResponse($orgId, $validated['code'] ?? null)) {
            return $duplicate;
        }
        $validated = $this->integerTierIds($validated);

        if ($request->hasFile('image')) {
            $validated['image_url'] = \App\Services\MediaService::upload($request->file('image'), 'offers');
        }
        unset($validated['image']);

        $validated['created_by'] = $request->user()->id;
        $offer = SpecialOffer::create($validated);

        return response()->json(['message' => 'Offer created', 'offer' => $offer], 201);
    }

    public function show(int $id): JsonResponse
    {
        $offer = SpecialOffer::with('createdBy:id,name')->findOrFail($id);
        return response()->json($offer);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $offer = SpecialOffer::findOrFail($id);
        $orgId = app('current_organization_id');
        $this->normalizeOfferCode($request);

        // Was `$request->only(...)`, unvalidated: any string could ride
        // through as `type`, `tier_ids` never checked against the org's own
        // tiers, and a code could collide silently. Every field this action
        // accepts now goes through the same rules `store()` uses — except
        // that an offer written before those rules (or by the AI generator)
        // may keep the type it already has, and `end_date` is compared with
        // the stored start when the request carries no `start_date`.
        $types = ['discount', 'points_multiplier', 'free_night', 'upgrade', 'bonus_points', 'cashback', 'fixed_amount'];
        if (is_string($offer->type) && $offer->type !== '' && !in_array($offer->type, $types, true)) {
            $types[] = $offer->type;
        }
        $startForEnd = $request->has('start_date') ? 'start_date' : $offer->start_date?->toDateString();
        $data = $request->validate([
            'title'            => 'sometimes|string|max:191',
            'description'      => 'sometimes|string',
            'type'             => ['sometimes', Rule::in($types)],
            'value'            => 'sometimes|numeric|min:0',
            'code'             => 'sometimes|nullable|string|min:4|max:24|regex:/^[A-Za-z0-9-]+$/',
            'applies_to'       => 'sometimes|nullable|in:all,services,stays',
            'tier_ids'         => 'sometimes|nullable|array',
            'tier_ids.*'       => [Rule::in(LoyaltyTier::withoutGlobalScopes()->where('organization_id', $orgId)->pluck('id'))],
            'start_date'       => 'sometimes|date',
            'end_date'         => array_merge(['sometimes', 'date'], $startForEnd ? ['after:' . $startForEnd] : []),
            'usage_limit'      => 'sometimes|nullable|integer|min:1',
            'per_member_limit' => 'sometimes|nullable|integer|min:1',
            'is_featured'      => 'sometimes|boolean',
            'is_active'        => 'sometimes|boolean',
            'image_url'        => 'sometimes|nullable|url',
        ]);

        if (array_key_exists('code', $data) && $data['code'] !== null) {
            if ($duplicate = $this->duplicateCodeResponse($orgId, $data['code'], $offer)) {
                return $duplicate;
            }
        }

        if ($request->hasFile('image')) {
            $data['image_url'] = \App\Services\MediaService::upload($request->file('image'), 'offers');
        }

        $offer->update($this->integerTierIds($data));
        return response()->json(['message' => 'Offer updated', 'offer' => $offer]);
    }

    /**
     * The admin form posts multipart `FormData`, so every `tier_ids[]` entry
     * arrives as a string; stored as `["30"]`, `SpecialOffer::scopeForTier()`'s
     * `whereJsonContains(…, 30)` never matches it and the offer is invisible to
     * the members it targets. Store integers, whatever the transport.
     */
    private function integerTierIds(array $data): array
    {
        if (isset($data['tier_ids']) && is_array($data['tier_ids'])) {
            $data['tier_ids'] = array_values(array_map('intval', $data['tier_ids']));
        }

        return $data;
    }

    /** Trim the incoming `code` before validation so `' welcome10 '` passes the charset regex, then upper-case it. */
    private function normalizeOfferCode(Request $request): void
    {
        if ($request->filled('code')) {
            $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        }
    }

    private function duplicateCodeResponse(int $orgId, ?string $code, ?SpecialOffer $offer = null): ?JsonResponse
    {
        if (!$code) {
            return null;
        }

        $exists = SpecialOffer::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('code', $code)
            ->when($offer, fn ($q) => $q->whereKeyNot($offer->id))
            ->exists();

        return $exists ? response()->json(['message' => 'That code is already used by another offer.'], 422) : null;
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
