<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\Staff;
use App\Models\User;
use App\Services\GuestMemberLinkService;
use App\Services\LoyaltyService;
use App\Models\HotelSetting;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        protected LoyaltyService $loyaltyService,
        protected QrCodeService $qrService,
        protected GuestMemberLinkService $linkService,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'          => 'required|string|max:191',
            'email'         => 'required|email|unique:users',
            'password'      => 'required|string|min:8|confirmed',
            'phone'         => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'nationality'   => 'nullable|string|max:100',
            'language'      => 'nullable|string|max:10',
            'referral_code' => 'nullable|string|max:20',
        ]);

        $user = User::create([
            'name'          => $validated['name'],
            'email'         => $validated['email'],
            'password'      => Hash::make($validated['password']),
            'phone'         => $validated['phone'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'nationality'   => $validated['nationality'] ?? null,
            'language'      => $validated['language'] ?? 'en',
            'user_type'     => 'member',
        ]);

        // Find default tier (Bronze)
        $defaultTier = \App\Models\LoyaltyTier::where('min_points', 0)->where('is_active', true)->first();

        // Find referrer if code provided
        $referredBy = null;
        if (!empty($validated['referral_code'])) {
            $referredBy = LoyaltyMember::where('referral_code', $validated['referral_code'])->first();
        }

        $qrToken = $this->qrService->generateToken(new LoyaltyMember(['id' => 0, 'member_number' => '']));

        $member = LoyaltyMember::create([
            'user_id'      => $user->id,
            'member_number'=> $this->qrService->generateMemberNumber(),
            'tier_id'      => $defaultTier->id,
            'qr_code_token'=> hash_hmac('sha256', $user->id . now()->timestamp, config('app.key')),
            'referral_code'=> $this->qrService->generateReferralCode(),
            'referred_by'  => $referredBy?->id,
            'joined_at'    => now(),
            'points_expiry_date' => now()->addMonths((int) HotelSetting::getValue('points_expiry_months', 24)),
        ]);

        // Award welcome bonus
        $this->loyaltyService->awardPoints($member, (int) HotelSetting::getValue('welcome_bonus_points', 500), 'Welcome bonus points', 'bonus');

        // Award referral points if applicable
        if ($referredBy) {
            $this->loyaltyService->awardPoints($referredBy, (int) HotelSetting::getValue('referrer_bonus_points', 250), "Referral: {$user->name} joined", 'referral');
            $this->loyaltyService->awardPoints($member, (int) HotelSetting::getValue('referee_bonus_points', 250), 'Referral bonus for joining via referral', 'referral');
        }

        // Auto-link existing CRM guests by email
        $this->linkService->linkMemberToGuests($member);

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'token'  => $token,
            'user'   => $user,
            'member' => $member->load('tier'),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
            'device'   => 'nullable|string|max:50',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Revoke old tokens if needed
        // $user->tokens()->delete();

        $token = $user->createToken($validated['device'] ?? 'api')->plainTextToken;

        $response = ['token' => $token, 'user' => $user];

        if ($user->isMember()) {
            $response['member'] = $user->loyaltyMember?->load('tier');
        } elseif ($user->isStaff()) {
            $staff = $user->staff;
            $staff?->update(['last_login_at' => now()]);
            $response['staff'] = $staff;
        }

        return response()->json($response);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('loyaltyMember.tier', 'staff');
        return response()->json($user);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function updatePushToken(Request $request): JsonResponse
    {
        $validated = $request->validate(['expo_push_token' => 'required|string']);
        $member = $request->user()->loyaltyMember;
        if ($member) {
            $member->update(['expo_push_token' => $validated['expo_push_token']]);
        }
        return response()->json(['message' => 'Push token updated']);
    }
}
