<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Services\LoyaltyService;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MemberController extends Controller
{
    public function __construct(
        protected LoyaltyService $loyaltyService,
        protected QrCodeService $qrService,
    ) {}

    public function profile(Request $request): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember()->with(['tier', 'user'])->firstOrFail();
        $summary = $this->loyaltyService->getMemberSummary($member);

        return response()->json([
            'user'   => $user->only('id', 'name', 'email', 'phone', 'date_of_birth', 'nationality', 'language', 'avatar_url'),
            'member' => $summary,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'              => 'sometimes|string|max:191',
            'phone'             => 'sometimes|nullable|string|max:20',
            'date_of_birth'     => 'sometimes|nullable|date',
            'nationality'       => 'sometimes|nullable|string|max:100',
            'language'          => 'sometimes|nullable|string|max:10',
            'email_notifications' => 'sometimes|boolean',
            'push_notifications'  => 'sometimes|boolean',
            'marketing_consent'   => 'sometimes|boolean',
        ]);

        $user = $request->user();
        $user->update(array_filter($validated, fn($k) => in_array($k, ['name', 'phone', 'date_of_birth', 'nationality', 'language']), ARRAY_FILTER_USE_KEY));

        $member = $user->loyaltyMember;
        $member->update(array_filter($validated, fn($k) => in_array($k, ['email_notifications', 'push_notifications', 'marketing_consent']), ARRAY_FILTER_USE_KEY));

        return response()->json([
            'message' => 'Profile updated',
            'user'    => $user->only('id', 'name', 'email', 'phone', 'date_of_birth', 'nationality', 'language', 'avatar_url'),
            'member'  => $member,
        ]);
    }

    public function card(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('tier')->firstOrFail();

        // Static QR encodes the member_number — permanent, scannable by staff.
        // Member number is unique per org and safe to encode (not a secret).
        $qrImage = null;
        try {
            $qrImage = 'data:image/png;base64,' . $this->qrService->generateStaticQr($member->member_number);
        } catch (\Throwable $e) {
            // GD extension may not be available — skip image
        }

        return response()->json([
            'member_number' => $member->member_number,
            'qr_image'      => $qrImage,
            'nfc_uid'       => $member->nfc_uid,
            'tier'          => $member->tier,
            'current_points'=> $member->current_points,
        ]);
    }

    /**
     * Generate a QR code image for a member by ID (admin use).
     */
    public function memberQr(Request $request, int $memberId): JsonResponse
    {
        $member = \App\Models\LoyaltyMember::findOrFail($memberId);

        $qrImage = null;
        try {
            $qrImage = 'data:image/png;base64,' . $this->qrService->generateStaticQr($member->member_number);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Could not generate QR image'], 500);
        }

        return response()->json([
            'member_number' => $member->member_number,
            'qr_image'      => $qrImage,
        ]);
    }
}
