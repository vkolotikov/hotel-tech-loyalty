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
use Illuminate\Support\Facades\Http;
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

    /**
     * GET /v1/plans — Proxy to SaaS platform to fetch available plans.
     */
    public function plans(): JsonResponse
    {
        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['plans' => []]);
        }

        try {
            $response = Http::timeout(5)->get("{$saasApi}/billing/plans");
            return response()->json($response->json());
        } catch (\Exception $e) {
            return response()->json(['plans' => [], 'error' => 'Could not fetch plans']);
        }
    }

    /**
     * POST /v1/auth/trial — Register on SaaS platform, start trial, create local staff user.
     *
     * Accepts: name, email, password, hotel_name, plan (optional, defaults to starter)
     * 1. Registers user + org on SaaS platform
     * 2. Subscribes to a trial plan
     * 3. Creates local staff user in loyalty DB
     * 4. Returns SaaS JWT + local Sanctum token
     */
    public function startTrial(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'       => 'required|string|max:191',
            'email'      => 'required|email|max:191',
            'password'   => 'required|string|min:8',
            'hotel_name' => 'required|string|max:191',
            'plan'       => 'nullable|string|max:50',
        ]);

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'SaaS platform not configured'], 503);
        }

        // Step 1: Register on SaaS platform
        try {
            $regResponse = Http::timeout(10)->post("{$saasApi}/auth/register", [
                'name'             => $validated['name'],
                'email'            => $validated['email'],
                'password'         => $validated['password'],
                'organizationName' => $validated['hotel_name'],
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Could not reach the subscription platform. Please try again.'], 503);
        }

        if (!$regResponse->successful()) {
            $msg = $regResponse->json('error') ?? $regResponse->json('message') ?? 'Registration failed';
            return response()->json(['error' => $msg], $regResponse->status());
        }

        $saasData = $regResponse->json();
        $saasToken = $saasData['token'] ?? null;
        $saasOrgId = $saasData['organization']['id'] ?? null;

        // Step 2: Subscribe to trial plan
        if ($saasToken) {
            try {
                // First get available plans to find the requested one
                $plansRes = Http::withToken($saasToken)->timeout(5)->get("{$saasApi}/billing/plans");
                $plans = $plansRes->json('plans', []);
                $targetSlug = $validated['plan'] ?? 'starter';
                $planId = null;
                foreach ($plans as $plan) {
                    if (($plan['slug'] ?? '') === $targetSlug) {
                        $planId = $plan['id'];
                        break;
                    }
                }
                // Fall back to first plan if slug not found
                if (!$planId && count($plans) > 0) {
                    $planId = $plans[0]['id'];
                }

                if ($planId) {
                    Http::withToken($saasToken)->timeout(5)->post("{$saasApi}/billing/subscribe", [
                        'planId'   => $planId,
                        'interval' => 'MONTHLY',
                    ]);
                }
            } catch (\Exception $e) {
                // Non-fatal — user is registered, trial can be started manually
                report($e);
            }
        }

        // Step 3: Create local organization + staff user
        $localUser = User::where('email', $validated['email'])->first();
        if (!$localUser) {
            // Create local organization linked to SaaS org
            $org = null;
            if ($saasOrgId) {
                $org = \App\Models\Organization::firstOrCreate(
                    ['saas_org_id' => $saasOrgId],
                    [
                        'name' => $validated['hotel_name'],
                        'slug' => \Illuminate\Support\Str::slug($validated['hotel_name']),
                    ]
                );
                // Auto-setup defaults (tiers, benefits, settings)
                app(\App\Services\OrganizationSetupService::class)->setupDefaults($org);
            }

            $localUser = User::create([
                'name'            => $validated['name'],
                'email'           => $validated['email'],
                'password'        => Hash::make($validated['password']),
                'user_type'       => 'staff',
                'organization_id' => $org?->id,
            ]);

            Staff::create([
                'user_id'             => $localUser->id,
                'organization_id'     => $org?->id,
                'role'                => 'super_admin',
                'hotel_name'          => $validated['hotel_name'],
                'can_award_points'    => true,
                'can_redeem_points'   => true,
                'can_manage_offers'   => true,
                'can_view_analytics'  => true,
            ]);
        }

        $sanctumToken = $localUser->createToken('admin')->plainTextToken;

        return response()->json([
            'token'      => $sanctumToken,
            'saas_token' => $saasToken,
            'user'       => $localUser,
            'staff'      => $localUser->staff,
            'org_id'     => $saasOrgId,
            'message'    => 'Trial started! You have 14 days to explore all features.',
        ], 201);
    }

    /**
     * GET /v1/auth/subscription — Return current subscription status.
     */
    public function subscription(Request $request): JsonResponse
    {
        // If SaaS-authenticated, fetch from SaaS
        $orgId = $request->attributes->get('saas_org_id');
        if ($orgId) {
            $saasApi = config('services.saas.api_url');
            $token = $request->bearerToken();
            try {
                $response = Http::withToken($token)->timeout(5)->get("{$saasApi}/billing/subscriptions");
                if ($response->successful()) {
                    $subs = $response->json('subscriptions', []);
                    foreach ($subs as $sub) {
                        if (in_array($sub['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
                            return response()->json([
                                'active'     => true,
                                'status'     => $sub['status'],
                                'plan'       => $sub['plan'] ?? null,
                                'trialEnd'   => $sub['trialEnd'] ?? null,
                                'periodEnd'  => $sub['currentPeriodEnd'] ?? null,
                            ]);
                        }
                    }
                    return response()->json(['active' => false, 'status' => 'EXPIRED']);
                }
            } catch (\Exception $e) {
                // Fail open
            }
        }

        // For local-only users, always active
        return response()->json(['active' => true, 'status' => 'LOCAL', 'plan' => null]);
    }
}
