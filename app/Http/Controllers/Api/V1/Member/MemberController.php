<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Services\LoyaltyService;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

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

    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $user = $request->user();

        // Delete old avatar if it exists
        if ($user->avatar_url) {
            $oldPath = str_replace('/storage/', '', $user->avatar_url);
            \Illuminate\Support\Facades\Storage::disk('public')->delete($oldPath);
        }

        $path = $request->file('avatar')->storePublicly('avatars', 'public');
        $user->update(['avatar_url' => '/storage/' . $path]);

        return response()->json([
            'message'    => 'Avatar updated',
            'avatar_url' => '/storage/' . $path,
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
     * DELETE /v1/member/account
     *
     * Members can delete their own account from the mobile app. We
     * anonymize rather than hard-delete so the append-only points ledger
     * and related audit records remain intact (required for compliance +
     * analytics). The user's login is permanently revoked.
     *
     * Requires password re-confirmation to prevent accidental deletion
     * and to confirm account ownership on a device that may be shared.
     */
    public function deleteAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'password'      => 'required|string',
            'confirmation'  => 'required|string|in:DELETE',
        ]);

        $user = $request->user();

        if (!Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['Incorrect password.'],
            ]);
        }

        $member = $user->loyaltyMember;

        try {
            DB::transaction(function () use ($user, $member) {
                // Anonymize user-identifying fields. Keep the row so FKs
                // (points_transactions, bookings, audit_logs) stay valid.
                $deletedEmail = 'deleted-' . $user->id . '-' . time() . '@deleted.local';
                $user->update([
                    'name'          => 'Deleted Member',
                    'email'         => $deletedEmail,
                    'phone'         => null,
                    'date_of_birth' => null,
                    'nationality'   => null,
                    'avatar_url'    => null,
                    'password'      => Hash::make(\Illuminate\Support\Str::random(64)),
                ]);

                if ($member) {
                    $member->update([
                        'is_active'       => false,
                        'qr_code_token'   => null,
                        'last_activity_at'=> now(),
                    ]);
                }

                // Revoke all Sanctum tokens — immediate logout everywhere.
                $user->tokens()->delete();
            });
        } catch (\Throwable $e) {
            Log::error('Account deletion failed', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not delete account: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message' => 'Your account has been deleted. We are sorry to see you go.',
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
