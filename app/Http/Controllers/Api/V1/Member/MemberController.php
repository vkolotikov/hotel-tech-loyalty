<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
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
        $member = $user->loyaltyMember()->with(['tier', 'user'])->first();

        // Self-heal for orphaned member-type users whose loyalty_member row
        // is missing — can happen with legacy accounts that predate the
        // transactional register flow, or if an admin created a User without
        // enrolling them. Without this, the mobile app shows a hard 404.
        if (!$member && $user->user_type === 'member' && $user->organization_id) {
            $member = $this->ensureLoyaltyMember($user);
            $member?->load(['tier', 'user']);
        }

        if (!$member) {
            return response()->json([
                'message' => 'Your membership is not set up yet. Please contact reception.',
            ], 404);
        }

        $summary = $this->loyaltyService->getMemberSummary($member);

        // Surface the org's widget_token so the mobile app can deep-link into
        // the public booking / services / chat widgets (which all key off
        // widget_token in the URL). The token isn't a secret — it appears in
        // every embed snippet on the hotel's public site.
        $org = \App\Models\Organization::find($user->organization_id);

        return response()->json([
            'user'    => $user->only('id', 'name', 'email', 'phone', 'date_of_birth', 'nationality', 'language', 'avatar_url'),
            'member'  => $summary,
            'org'     => $org ? [
                'id'           => $org->id,
                'name'         => $org->name,
                'widget_token' => $org->widget_token,
            ] : null,
        ]);
    }

    /**
     * Create a loyalty_member row for a user that should have one but doesn't.
     * Returns null if no default tier is configured for the org (the caller
     * will surface a clear error to the client).
     */
    private function ensureLoyaltyMember($user): ?LoyaltyMember
    {
        if (!app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $tier = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $user->organization_id)
            ->where('is_active', true)
            ->orderBy('min_points')
            ->first();

        if (!$tier) return null;

        return LoyaltyMember::create([
            'user_id'       => $user->id,
            'tier_id'       => $tier->id,
            'member_number' => $this->qrService->generateMemberNumber(),
            'qr_code_token' => hash_hmac('sha256', $user->id . now()->timestamp, config('app.key')),
            'referral_code' => $this->qrService->generateReferralCode(),
            'joined_at'     => $user->created_at ?? now(),
            'is_active'     => true,
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
        //
        // We try PNG first (renders directly via the mobile <Image>) but PNG
        // requires the GD or Imagick PHP extension. On servers without it the
        // PngWriter throws — fall back to SVG (pure PHP, no extension) so the
        // mobile app always has something to render. The mobile side prefers
        // qr_svg when present and falls back to qr_image.
        $qrImage = null;
        try {
            $qrImage = 'data:image/png;base64,' . $this->qrService->generateStaticQr($member->member_number);
        } catch (\Throwable $e) {
            \Log::info('QR PNG generation failed, falling back to SVG', ['error' => $e->getMessage()]);
        }

        $qrSvg = null;
        try {
            $qrSvg = $this->qrService->generateStaticQrSvg($member->member_number);
        } catch (\Throwable $e) {
            \Log::warning('QR SVG generation failed', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'member_number' => $member->member_number,
            'qr_image'      => $qrImage,
            'qr_svg'        => $qrSvg,
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
