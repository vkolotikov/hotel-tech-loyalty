<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Mail\VerificationCodeMail;
use App\Models\EmailVerificationCode;
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
use Illuminate\Support\Facades\Mail;
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
            'organization_id' => 'nullable|integer|exists:organizations,id',
        ]);

        // Bind org context for tenant-scoped queries (tier lookup, settings, etc.)
        $orgId = $validated['organization_id'] ?? null;
        if ($orgId && !app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $orgId);
        }

        $user = User::create([
            'name'          => $validated['name'],
            'email'         => $validated['email'],
            'password'      => Hash::make($validated['password']),
            'phone'         => $validated['phone'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'nationality'   => $validated['nationality'] ?? null,
            'language'      => $validated['language'] ?? 'en',
            'user_type'     => 'member',
            'organization_id' => $orgId,
        ]);

        // Find default tier (Bronze) — scoped to the org if available
        $tierQuery = \App\Models\LoyaltyTier::withoutGlobalScopes()
            ->where('min_points', 0)->where('is_active', true);
        if ($orgId) {
            $tierQuery->where('organization_id', $orgId);
        }
        $defaultTier = $tierQuery->first();

        // Find referrer if code provided — scoped to same org
        $referredBy = null;
        if (!empty($validated['referral_code'])) {
            $referrerQuery = LoyaltyMember::withoutGlobalScopes()
                ->where('referral_code', $validated['referral_code']);
            if ($orgId) {
                $referrerQuery->where('organization_id', $orgId);
            }
            $referredBy = $referrerQuery->first();
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
            'points_expiry_date' => now()->addMonths((int) ($orgId ? HotelSetting::getValue('points_expiry_months', 24) : 24)),
        ]);

        // Award welcome bonus (use org-scoped settings with safe fallbacks)
        $welcomeBonus = (int) ($orgId ? HotelSetting::getValue('welcome_bonus_points', 500) : 500);
        $this->loyaltyService->awardPoints($member, $welcomeBonus, 'Welcome bonus points', 'bonus');

        // Award referral points if applicable
        if ($referredBy) {
            $referrerBonus = (int) ($orgId ? HotelSetting::getValue('referrer_bonus_points', 250) : 250);
            $refereeBonus = (int) ($orgId ? HotelSetting::getValue('referee_bonus_points', 250) : 250);
            $this->loyaltyService->awardPoints($referredBy, $referrerBonus, "Referral: {$user->name} joined", 'referral');
            $this->loyaltyService->awardPoints($member, $refereeBonus, 'Referral bonus for joining via referral', 'referral');
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

        // No tenant context at login — bypass global scopes
        $user = User::withoutGlobalScopes()->where('email', $validated['email'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Bind org context so subsequent scoped queries work
        if ($user->organization_id) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $token = $user->createToken($validated['device'] ?? 'api')->plainTextToken;

        $response = ['token' => $token, 'user' => $user];

        if ($user->isMember()) {
            $response['member'] = LoyaltyMember::withoutGlobalScopes()
                ->where('user_id', $user->id)->with('tier')->first();
        } elseif ($user->isStaff()) {
            $staff = Staff::withoutGlobalScopes()->where('user_id', $user->id)->first();
            try {
                $staff?->update(['last_login_at' => now()]);
            } catch (\Exception $e) {
                report($e);
            }
            $response['staff'] = $staff;
        }

        return response()->json($response);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        // Bypass scopes for relationship loading — user may not have tenant context yet
        $member = LoyaltyMember::withoutGlobalScopes()
            ->where('user_id', $user->id)->with('tier')->first();
        $staff = Staff::withoutGlobalScopes()
            ->where('user_id', $user->id)->first();

        $data = [
            'id'        => $user->id,
            'name'      => $user->name,
            'email'     => $user->email,
            'phone'     => $user->phone,
            'user_type' => $user->user_type,
            'avatar_url'=> $user->avatar_url,
            'loyalty_member' => $member,
            'staff'     => $staff,
        ];

        return response()->json($data);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function updatePushToken(Request $request): JsonResponse
    {
        $validated = $request->validate(['expo_push_token' => 'required|string']);
        $member = LoyaltyMember::withoutGlobalScopes()
            ->where('user_id', $request->user()->id)->first();
        if ($member) {
            $member->update(['expo_push_token' => $validated['expo_push_token']]);
        }
        return response()->json(['message' => 'Push token updated']);
    }

    /**
     * POST /v1/auth/send-code — Send a 6-digit verification code to the email.
     */
    public function sendVerificationCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email|max:191',
            'name'  => 'nullable|string|max:191',
        ]);

        // Rate limit: max 1 code per email per 60 seconds
        $recent = EmailVerificationCode::where('email', $validated['email'])
            ->where('created_at', '>', now()->subMinutes(1))
            ->exists();

        if ($recent) {
            return response()->json(['error' => 'Please wait before requesting another code.'], 429);
        }

        // Generate 6-digit code
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Invalidate old codes
        EmailVerificationCode::where('email', $validated['email'])
            ->whereNull('verified_at')
            ->delete();

        EmailVerificationCode::create([
            'email'      => $validated['email'],
            'code'       => $code,
            'expires_at' => now()->addMinutes(15),
        ]);

        try {
            Mail::to($validated['email'])->send(new VerificationCodeMail($code, $validated['name'] ?? ''));
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Could not send verification email. Please try again.'], 503);
        }

        return response()->json(['message' => 'Verification code sent.']);
    }

    /**
     * POST /v1/auth/verify-code — Verify the 6-digit code.
     */
    public function verifyCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'code'  => 'required|string|size:6',
        ]);

        // Brute-force protection: max 5 failed attempts per email per 15 minutes
        $attemptKey = 'verify_attempts:' . strtolower($validated['email']);
        $attempts = (int) \Illuminate\Support\Facades\Cache::get($attemptKey, 0);
        if ($attempts >= 5) {
            return response()->json(['error' => 'Too many verification attempts. Please request a new code.'], 429);
        }

        $record = EmailVerificationCode::where('email', $validated['email'])
            ->where('code', $validated['code'])
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (!$record) {
            \Illuminate\Support\Facades\Cache::put($attemptKey, $attempts + 1, now()->addMinutes(15));
            return response()->json(['error' => 'Invalid verification code.'], 422);
        }

        if ($record->isExpired()) {
            return response()->json(['error' => 'Code has expired. Please request a new one.'], 422);
        }

        $record->update(['verified_at' => now()]);

        // Clear attempt counter on success
        \Illuminate\Support\Facades\Cache::forget($attemptKey);

        return response()->json(['verified' => true]);
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

        // Require verified email (only if a code was actually sent — skip if mail isn't configured)
        $codeWasSent = EmailVerificationCode::where('email', $validated['email'])->exists();
        if ($codeWasSent) {
            $verified = EmailVerificationCode::where('email', $validated['email'])
                ->whereNotNull('verified_at')
                ->where('verified_at', '>', now()->subMinutes(30))
                ->exists();

            if (!$verified) {
                return response()->json(['error' => 'Email not verified. Please verify your email first.'], 422);
            }
        }

        // Check if user already exists and is fully set up (bypass scopes)
        $existingUser = User::withoutGlobalScopes()->where('email', $validated['email'])->first();
        $existingStaff = $existingUser
            ? Staff::withoutGlobalScopes()->where('user_id', $existingUser->id)->first()
            : null;

        if ($existingUser && $existingStaff) {
            return response()->json(['error' => 'This email is already registered. Please sign in instead.'], 422);
        }

        $saasApi = config('services.saas.api_url');
        $saasToken = null;
        $saasOrgId = null;

        // Step 1: Register on SaaS platform (if configured)
        // SaaS register auto-provisions a trial subscription for the requested plan.
        if ($saasApi) {
            try {
                $regResponse = Http::timeout(10)->post("{$saasApi}/auth/register", [
                    'name'     => $validated['name'],
                    'email'    => $validated['email'],
                    'password' => $validated['password'],
                    'orgName'  => $validated['hotel_name'],
                    'planSlug' => $validated['plan'] ?? 'starter',
                ]);

                if ($regResponse->successful()) {
                    $saasData = $regResponse->json();
                    $saasToken = $saasData['token'] ?? null;
                    $saasOrgId = $saasData['organization']['id'] ?? null;
                } else {
                    $body = $regResponse->json();
                    $msg = $body['error'] ?? $body['message'] ?? 'unknown';
                    report(new \RuntimeException("SaaS register [{$regResponse->status()}]: {$msg}"));
                }
            } catch (\Exception $e) {
                report($e);
            }
        }

        // Step 3: Create or complete local organization + staff user
        try {
            $org = null;
            if ($saasOrgId) {
                $org = \App\Models\Organization::firstOrCreate(
                    ['saas_org_id' => $saasOrgId],
                    [
                        'name' => $validated['hotel_name'],
                        'slug' => \Illuminate\Support\Str::slug($validated['hotel_name']),
                    ]
                );
            }

            if (!$org && $existingUser?->organization_id) {
                $org = \App\Models\Organization::find($existingUser->organization_id);
            }
            if (!$org) {
                $org = \App\Models\Organization::create([
                    'name' => $validated['hotel_name'],
                    'slug' => \Illuminate\Support\Str::slug($validated['hotel_name']) . '-' . \Illuminate\Support\Str::random(4),
                ]);
            }

            // Bind org context for BelongsToOrganization trait
            app()->instance('current_organization_id', $org->id);

            // NOTE: Do NOT call setupDefaults() here — let the Setup wizard handle it
            // so the user gets to choose blank vs demo data.

            // Create or re-use local user
            $localUser = $existingUser;
            if (!$localUser) {
                $localUser = User::create([
                    'name'            => $validated['name'],
                    'email'           => $validated['email'],
                    'password'        => Hash::make($validated['password']),
                    'user_type'       => 'staff',
                    'organization_id' => $org->id,
                ]);
            } elseif (!$localUser->organization_id) {
                $localUser->update(['organization_id' => $org->id]);
            }

            // Create staff record if missing (bypass scopes for check)
            if (!$existingStaff) {
                Staff::withoutGlobalScopes()->create([
                    'user_id'             => $localUser->id,
                    'organization_id'     => $org->id,
                    'role'                => 'super_admin',
                    'hotel_name'          => $validated['hotel_name'],
                    'can_award_points'    => true,
                    'can_redeem_points'   => true,
                    'can_manage_offers'   => true,
                    'can_view_analytics'  => true,
                ]);
            }
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Account creation failed: ' . $e->getMessage()], 500);
        }

        // Step 4: Sync subscription entitlements from SaaS → local org
        // This ensures subscription() returns real plan data instead of LOCAL mode.
        if ($saasToken && $saasApi && $org) {
            try {
                $bootstrap = Http::withToken($saasToken)->timeout(5)
                    ->get("{$saasApi}/tools/bootstrap");

                if ($bootstrap->successful()) {
                    $bsData = $bootstrap->json();
                    $sub = $bsData['subscription'] ?? null;
                    if ($sub) {
                        $org->plan_slug           = $sub['plan']['slug'] ?? null;
                        $org->subscription_status = $sub['status'] ?? null;
                        $org->trial_end           = $sub['trialEnd'] ?? null;
                        $org->period_end          = $sub['currentPeriodEnd'] ?? null;
                    }
                    $org->entitled_products     = $bsData['entitled_product_slugs'] ?? [];
                    $org->plan_features         = (array) ($bsData['features'] ?? []);
                    $org->entitlements_synced_at = now();
                    $org->save();
                }
            } catch (\Exception $e) {
                report($e);
            }
        }

        $sanctumToken = $localUser->createToken('admin')->plainTextToken;
        $staff = Staff::withoutGlobalScopes()->where('user_id', $localUser->id)->first();

        return response()->json([
            'token'      => $sanctumToken,
            'saas_token' => $saasToken,
            'user'       => $localUser->fresh(),
            'staff'      => $staff,
            'org_id'     => $saasOrgId ?? $org->id,
            'message'    => 'Trial started! You have ' . ($org->trial_end ? (int) now()->diffInDays($org->trial_end) : 14) . ' days to explore.',
        ], 201);
    }

    /**
     * GET /v1/auth/subscription — Return current subscription status.
     *
     * Resolution order:
     *   1. Live SaaS API (if user arrived via SaaS JWT)
     *   2. Cached entitlements on the local Organization (synced at trial or by SaasAuthMiddleware)
     *   3. Expired/no-plan response (NOT unlimited LOCAL mode)
     */
    public function subscription(Request $request): JsonResponse
    {
        // 1. Live SaaS query (only when user has a SaaS JWT — set by SaasAuthMiddleware)
        $saasOrgId = $request->attributes->get('saas_org_id');
        if ($saasOrgId) {
            $saasApi = config('services.saas.api_url');
            $token = $request->bearerToken();
            try {
                $response = Http::withToken($token)->timeout(5)->get("{$saasApi}/billing/subscriptions");
                if ($response->successful()) {
                    $subs = $response->json('subscriptions', []);
                    $features = $response->json('features', []);
                    $products = $response->json('products', []);
                    foreach ($subs as $sub) {
                        if (in_array($sub['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
                            return response()->json([
                                'active'     => true,
                                'status'     => $sub['status'],
                                'plan'       => $sub['plan'] ?? null,
                                'trialEnd'   => $sub['trialEnd'] ?? null,
                                'periodEnd'  => $sub['currentPeriodEnd'] ?? null,
                                'features'   => $features,
                                'products'   => $products,
                            ]);
                        }
                    }
                    return response()->json(['active' => false, 'status' => 'EXPIRED', 'features' => [], 'products' => []]);
                }
            } catch (\Exception $e) {
                // SaaS API unreachable — fall through to cached data
            }
        }

        // 2. Cached org entitlements (synced at trial creation or by SaasAuthMiddleware)
        $org = $request->user()?->organization_id
            ? \App\Models\Organization::find($request->user()->organization_id)
            : null;

        if ($org && $org->subscription_status) {
            // Check if trial has expired since last sync
            $status = $org->subscription_status;
            if ($status === 'TRIALING' && $org->trial_end && $org->trial_end->isPast()) {
                $status = 'EXPIRED';
                $org->update(['subscription_status' => 'EXPIRED']);
            }

            return response()->json([
                'active'   => in_array($status, ['ACTIVE', 'TRIALING'], true),
                'status'   => $status,
                'plan'     => $org->plan_slug
                    ? ['name' => ucfirst($org->plan_slug), 'slug' => $org->plan_slug]
                    : null,
                'trialEnd' => $org->trial_end?->toIso8601String(),
                'periodEnd'=> $org->period_end?->toIso8601String(),
                'features' => $org->plan_features ?: [],
                'products' => $org->entitled_products ?: [],
            ]);
        }

        // 3. No subscription data at all — SaaS not configured AND no cached data
        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            // Truly local dev with no SaaS — grant all features for development
            return response()->json([
                'active'   => true,
                'status'   => 'LOCAL',
                'plan'     => null,
                'features' => [
                    'max_team_members' => 'unlimited', 'max_guests' => 'unlimited',
                    'max_properties' => 'unlimited', 'max_loyalty_members' => 'unlimited',
                    'ai_insights' => 'true', 'ai_avatars' => 'true',
                    'custom_branding' => 'true', 'api_access' => 'true',
                    'push_notifications' => 'true', 'mobile_app' => 'true',
                    'nfc_cards' => 'true', 'priority_support' => 'dedicated',
                ],
                'products' => ['crm', 'chat', 'loyalty', 'education', 'avatar', 'booking'],
            ]);
        }

        // SaaS is configured but org has no subscription — user needs to pick a plan
        return response()->json([
            'active'   => false,
            'status'   => 'NO_PLAN',
            'plan'     => null,
            'features' => [],
            'products' => [],
        ]);
    }

    /**
     * POST /v1/auth/billing/checkout
     * Proxy to SaaS billing/subscribe — returns Stripe Checkout URL.
     * Overrides success/cancel URLs to point back to loyalty app.
     */
    public function billingCheckout(Request $request): JsonResponse
    {
        $request->validate([
            'plan_slug' => 'required|string',
            'interval'  => 'nullable|string|in:MONTHLY,YEARLY',
        ]);

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'Billing not configured'], 400);
        }

        // Get the SaaS JWT for this org
        $saasToken = $this->getSaasToken($request);
        if (!$saasToken) {
            return response()->json(['error' => 'Not connected to billing system. Please re-login.'], 401);
        }

        try {
            // Resolve plan ID from slug
            $plansRes = Http::withToken($saasToken)->timeout(5)->get("{$saasApi}/billing/plans");
            $plans = $plansRes->json('plans', []);
            $planId = null;
            foreach ($plans as $plan) {
                if (($plan['slug'] ?? '') === $request->input('plan_slug')) {
                    $planId = $plan['id'];
                    break;
                }
            }
            if (!$planId) {
                return response()->json(['error' => 'Plan not found'], 404);
            }

            // Check if org already has an active subscription (upgrade/change-plan flow)
            $subsRes = Http::withToken($saasToken)->timeout(5)->get("{$saasApi}/billing/subscriptions");
            $hasActive = false;
            if ($subsRes->successful()) {
                foreach ($subsRes->json('subscriptions', []) as $sub) {
                    if (in_array($sub['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
                        $hasActive = true;
                        break;
                    }
                }
            }

            // Use change-plan if already subscribed, otherwise subscribe
            $endpoint = $hasActive ? "{$saasApi}/billing/change-plan" : "{$saasApi}/billing/subscribe";
            $response = Http::withToken($saasToken)->timeout(10)->post($endpoint, [
                'planId'   => $planId,
                'interval' => $request->input('interval', 'MONTHLY'),
            ]);

            if (!$response->successful()) {
                $body = $response->json();
                return response()->json([
                    'error' => $body['error'] ?? 'Checkout failed',
                ], $response->status());
            }

            $data = $response->json();

            // If checkout URL returned (Stripe flow), override redirect URLs
            if (isset($data['checkoutUrl'])) {
                return response()->json([
                    'checkoutUrl' => $data['checkoutUrl'],
                ]);
            }

            // Direct trial/change (no Stripe) — refresh local entitlement cache
            $this->syncEntitlementsFromSaas($request, $saasToken);

            return response()->json([
                'success' => true,
                'message' => 'Subscription activated',
            ]);
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Billing service unavailable'], 503);
        }
    }

    /**
     * POST /v1/auth/billing/portal — Proxy to SaaS Stripe Customer Portal.
     */
    public function billingPortal(Request $request): JsonResponse
    {
        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'Billing not configured'], 400);
        }

        $saasToken = $this->getSaasToken($request);
        if (!$saasToken) {
            return response()->json(['error' => 'Not connected to billing system'], 401);
        }

        try {
            $response = Http::withToken($saasToken)->timeout(10)->post("{$saasApi}/billing/portal");

            if (!$response->successful()) {
                return response()->json(['error' => 'Billing portal not available'], 400);
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Billing service unavailable'], 503);
        }
    }

    /**
     * Sync entitlements from SaaS bootstrap endpoint onto the local Organization.
     */
    private function syncEntitlementsFromSaas(Request $request, string $saasToken): void
    {
        $saasApi = config('services.saas.api_url');
        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;
        if (!$org || !$saasApi) return;

        try {
            $bootstrap = Http::withToken($saasToken)->timeout(5)
                ->get("{$saasApi}/tools/bootstrap");

            if ($bootstrap->successful()) {
                $data = $bootstrap->json();
                $sub = $data['subscription'] ?? null;
                if ($sub) {
                    $org->plan_slug           = $sub['plan']['slug'] ?? null;
                    $org->subscription_status = $sub['status'] ?? null;
                    $org->trial_end           = $sub['trialEnd'] ?? null;
                    $org->period_end          = $sub['currentPeriodEnd'] ?? null;
                }
                $org->entitled_products     = $data['entitled_product_slugs'] ?? [];
                $org->plan_features         = (array) ($data['features'] ?? []);
                $org->entitlements_synced_at = now();
                $org->save();
            }
        } catch (\Exception $e) {
            report($e);
        }
    }

    /**
     * Get a SaaS JWT for the current user's org.
     * Tries: (1) existing SaaS JWT on the request, (2) service-to-service token endpoint.
     */
    private function getSaasToken(Request $request): ?string
    {
        // If the request already has a SaaS JWT (user came from SaaS dashboard), use it
        $authHeader = $request->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
            // Sanctum tokens contain "|" — SaaS JWTs don't
            if (!str_contains($token, '|')) {
                return $token;
            }
        }

        // Service-to-service: request a short-lived JWT from SaaS using the shared secret
        $saasApi = config('services.saas.api_url');
        $user = $request->user();
        if (!$user || !$saasApi) return null;

        $org = \App\Models\Organization::find($user->organization_id);
        if (!$org || !$org->saas_org_id) return null;

        $jwtSecret = config('services.saas.jwt_secret', '');
        if (!$jwtSecret) return null;

        $payload = implode('|', [$user->email, $org->saas_org_id]);
        $signature = hash_hmac('sha256', $payload, $jwtSecret);

        try {
            $response = Http::timeout(5)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post("{$saasApi}/auth/service-token", [
                    'email' => $user->email,
                    'orgId' => $org->saas_org_id,
                ]);

            if ($response->successful()) {
                return $response->json('token');
            }
        } catch (\Exception $e) {
            report($e);
        }

        return null;
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => 'required|email']);

        $user = User::where('email', $validated['email'])->first();
        if (!$user) {
            // Don't reveal whether the email exists
            return response()->json(['message' => 'If an account exists with that email, a reset code has been sent.']);
        }

        // Expire any previous codes for this email
        EmailVerificationCode::where('email', $validated['email'])
            ->whereNull('verified_at')
            ->delete();

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        EmailVerificationCode::create([
            'email'      => $validated['email'],
            'code'       => $code,
            'expires_at' => now()->addMinutes(15),
        ]);

        Mail::to($validated['email'])->send(new \App\Mail\PasswordResetCodeMail($code));

        return response()->json(['message' => 'If an account exists with that email, a reset code has been sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => 'required|email',
            'code'     => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $record = EmailVerificationCode::where('email', $validated['email'])
            ->where('code', $validated['code'])
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (!$record || $record->isExpired()) {
            return response()->json(['message' => 'Invalid or expired reset code.'], 422);
        }

        $user = User::where('email', $validated['email'])->first();
        if (!$user) {
            return response()->json(['message' => 'Invalid or expired reset code.'], 422);
        }

        $user->update(['password' => Hash::make($validated['password'])]);
        $record->update(['verified_at' => now()]);

        return response()->json(['message' => 'Password has been reset successfully.']);
    }
}
