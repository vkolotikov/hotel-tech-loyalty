<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Mail\VerificationCodeMail;
use App\Mail\WelcomeTrialMail;
use App\Models\EmailVerificationCode;
use App\Models\LoyaltyMember;
use App\Models\Organization;
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

        $validated['email'] = strtolower(trim($validated['email']));

        // Bind org context for tenant-scoped queries (tier lookup, settings, etc.)
        $orgId = $validated['organization_id'] ?? null;
        if ($orgId && !app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $orgId);
        }

        // Resolve default tier up-front so we can fail cleanly before creating
        // any rows. Previously a missing tier would 500 on a null->id access
        // after the user row was already written, leaving an orphan.
        $tierQuery = \App\Models\LoyaltyTier::withoutGlobalScopes()
            ->where('is_active', true);
        if ($orgId) {
            $tierQuery->where('organization_id', $orgId);
        }
        $defaultTier = (clone $tierQuery)->where('min_points', 0)->first()
            ?? $tierQuery->orderBy('min_points')->first();

        if (!$defaultTier) {
            return response()->json([
                'message' => 'Loyalty program is not configured for this hotel yet. Please contact reception.',
            ], 422);
        }

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

        try {
            $result = \DB::transaction(function () use ($validated, $orgId, $defaultTier, $referredBy) {
                $user = User::create([
                    'name'            => $validated['name'],
                    'email'           => $validated['email'],
                    'password'        => Hash::make($validated['password']),
                    'phone'           => $validated['phone'] ?? null,
                    'date_of_birth'   => $validated['date_of_birth'] ?? null,
                    'nationality'     => $validated['nationality'] ?? null,
                    'language'        => $validated['language'] ?? 'en',
                    'user_type'       => 'member',
                    'organization_id' => $orgId,
                ]);

                $member = LoyaltyMember::create([
                    'user_id'            => $user->id,
                    'member_number'      => $this->qrService->generateMemberNumber(),
                    'tier_id'            => $defaultTier->id,
                    'qr_code_token'      => hash_hmac('sha256', $user->id . now()->timestamp, config('app.key')),
                    'referral_code'      => $this->qrService->generateReferralCode(),
                    'referred_by'        => $referredBy?->id,
                    'joined_at'          => now(),
                    'points_expiry_date' => now()->addMonths((int) ($orgId ? HotelSetting::getValue('points_expiry_months', 24) : 24)),
                ]);

                // Award welcome bonus inside the same transaction — if it
                // fails, the whole registration rolls back instead of
                // leaving a zero-point orphan.
                $welcomeBonus = (int) ($orgId ? HotelSetting::getValue('welcome_bonus_points', 500) : 500);
                if ($welcomeBonus > 0) {
                    $this->loyaltyService->awardPoints($member, $welcomeBonus, 'Welcome bonus points', 'bonus');
                }

                if ($referredBy) {
                    $referrerBonus = (int) ($orgId ? HotelSetting::getValue('referrer_bonus_points', 250) : 250);
                    $refereeBonus  = (int) ($orgId ? HotelSetting::getValue('referee_bonus_points', 250) : 250);
                    $this->loyaltyService->awardPoints($referredBy, $referrerBonus, "Referral: {$user->name} joined", 'referral');
                    $this->loyaltyService->awardPoints($member, $refereeBonus, 'Referral bonus for joining via referral', 'referral');

                    // Record the referral in the ledger so the member-side
                    // /v1/member/referral endpoint (which reads from
                    // `referrals`) shows total_referrals + earnings, and
                    // staff can see the network in the admin referrals page.
                    // Pre-fix this row was never written — the bonuses
                    // landed in points_transactions but the loyalty_members
                    // referrals() relation was always empty.
                    //
                    // Status starts at 'rewarded' because we already paid
                    // out. If a future iteration wants gated bonuses
                    // (e.g. "unlock the referrer bonus after the referee's
                    // first stay") this is the single field to change.
                    \App\Models\Referral::create([
                        'organization_id'         => $orgId,
                        'referrer_id'             => $referredBy->id,
                        'referee_id'              => $member->id,
                        'status'                  => 'rewarded',
                        'referrer_points_awarded' => $referrerBonus,
                        'referee_points_awarded'  => $refereeBonus,
                        'qualified_at'            => now(),
                        'rewarded_at'             => now(),
                    ]);
                }

                return ['user' => $user, 'member' => $member];
            });
        } catch (\Throwable $e) {
            \Log::error('Member register failed', [
                'email' => $validated['email'],
                'error' => $e->getMessage(),
                'file'  => $e->getFile() . ':' . $e->getLine(),
            ]);
            return response()->json([
                'message' => 'Registration failed: ' . $e->getMessage(),
            ], 500);
        }

        $user = $result['user'];
        $member = $result['member'];

        // Non-critical side effects — don't fail registration if they throw
        try { $this->linkService->linkMemberToGuests($member); }
        catch (\Throwable $e) { \Log::warning('linkMemberToGuests failed', ['member_id' => $member->id, 'error' => $e->getMessage()]); }

        $token = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'token'  => $token,
            'user'   => $user->fresh(),
            'member' => $member->fresh()->load('tier'),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
            'device'   => 'nullable|string|max:50',
        ]);

        $validated['email'] = strtolower(trim($validated['email']));

        // No tenant context at login — bypass global scopes
        $user = User::withoutGlobalScopes()->where('email', $validated['email'])->first();
        $localOk = $user && Hash::check($validated['password'], $user->password);

        // SaaS fallback: when local lookup fails, ask SaaS whether this
        // email+password combo is valid. Covers the case where a
        // super-admin created the user in the SaaS Companies / Users
        // page so the row only exists on the SaaS side. On success,
        // provision the local user (or sync the existing one's
        // password) so subsequent logins go straight to the local DB.
        if (!$localOk) {
            $saasResult = $this->verifyAgainstSaas($validated['email'], $validated['password']);
            if (!$saasResult) {
                throw ValidationException::withMessages([
                    'email' => ['The provided credentials are incorrect.'],
                ]);
            }
            $user = $this->provisionLocalUserFromSaas($saasResult, $validated['password']);
        }

        // Bind org context so subsequent scoped queries work
        if ($user->organization_id) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $token = $user->createToken($validated['device'] ?? 'api')->plainTextToken;

        // Industry Platform Plan mobile follow-up — the login response
        // mirrors /v1/auth/me's industry payload so the mobile app gets
        // industry + has_loyalty + industry_explicit at login time
        // without a second round-trip. The User Eloquent model gets the
        // extra fields appended; ->fresh() reload happens implicitly
        // via the JSON serialization picking up the appended array.
        $industry = \App\Models\Organization::DEFAULT_INDUSTRY;
        $industryExplicit = false;
        if ($user->organization_id) {
            $org = \App\Models\Organization::find($user->organization_id);
            if ($org) {
                $industry = $org->resolved_industry;
                $industryExplicit = $org->hasExplicitIndustry();
            }
        }
        $userArray = $user->toArray();
        $userArray['industry'] = $industry;
        $userArray['industry_explicit'] = $industryExplicit;
        $userArray['has_loyalty'] = app(\App\Services\IndustryPrompts\IndustryPromptService::class)
            ->for($industry)->hasLoyalty;

        $response = ['token' => $token, 'user' => $userArray];

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

    /**
     * HMAC-signed call to SaaS /auth/service-verify-password. Returns
     * the SaaS-side user + primary-org payload on success, or null
     * when SaaS rejects or is unreachable. Fail-closed: any exception
     * or non-200 → null, so the caller still throws "credentials
     * incorrect" rather than leaking a partial signal.
     */
    private function verifyAgainstSaas(string $email, string $password): ?array
    {
        $saasApi = config('services.saas.api_url');
        $secret  = config('services.saas.jwt_secret', '');
        if (!$saasApi || !$secret) return null;

        $signature = hash_hmac('sha256', $email . '|verify-password', $secret);

        try {
            $res = Http::connectTimeout(2)->timeout(5)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post(rtrim($saasApi, '/') . '/auth/service-verify-password', [
                    'email'    => $email,
                    'password' => $password,
                ]);
        } catch (\Throwable $e) {
            \Log::warning('SaaS verify-password unreachable', ['error' => $e->getMessage()]);
            return null;
        }

        return $res->successful() ? $res->json() : null;
    }

    /**
     * After SaaS confirmed the password, make sure a local User row
     * (and the linking Organization + Staff row) exist, then sync the
     * local password to whatever the caller just typed so the next
     * login goes straight to the local DB without an extra round trip.
     *
     * Re-uses the same role-mapping that SaasAuthMiddleware does so a
     * user who logs in directly here ends up with the same admin role
     * they would have via the SSO handoff.
     */
    private function provisionLocalUserFromSaas(array $saasData, string $plainPassword): User
    {
        $email   = strtolower(trim($saasData['user']['email'] ?? ''));
        $name    = $saasData['user']['name'] ?? $email;
        $phone   = $saasData['user']['phone'] ?? null;
        $saasOrg = $saasData['organization'] ?? null;
        $saasRole = strtoupper((string) ($saasOrg['role'] ?? 'STAFF'));

        // Mirror SaasAuthMiddleware role-mapping so the user lands with
        // the same admin rights regardless of which door they came in.
        $localRole = match ($saasRole) {
            'OWNER' => 'super_admin',
            'ADMIN' => 'manager',
            default => 'receptionist',
        };

        // Find-or-create the local org linked to SaaS.
        $org = null;
        if ($saasOrg && !empty($saasOrg['id'])) {
            $org = Organization::where('saas_org_id', $saasOrg['id'])->first();
            if (!$org) {
                $baseSlug = $saasOrg['slug'] ?? \Illuminate\Support\Str::slug((string) $saasOrg['id']);
                $slug = $baseSlug;
                $i = 1;
                while (Organization::where('slug', $slug)->exists()) {
                    $slug = $baseSlug . '-' . $i++;
                }
                // Phase 2 — stamp industry on the local org BEFORE
                // setupDefaults runs. `setupDefaults()` reads
                // `$org->resolved_industry` to decide whether to seed
                // Bronze→Diamond tiers + hotel benefits; without this
                // stamp the accessor falls back to 'hotel' on a fresh
                // org and a beauty / medical / restaurant org would
                // silently get hotel loyalty defaults. The SaaS-side
                // `service-verify-password` response carries the org's
                // industry exactly for this purpose.
                $org = Organization::create([
                    'saas_org_id' => $saasOrg['id'],
                    'name'        => $saasOrg['name'] ?? 'Organization',
                    'slug'        => $slug,
                    'industry'    => Organization::normaliseIndustry($saasOrg['industry'] ?? null),
                ]);
                try {
                    app(\App\Services\OrganizationSetupService::class)->setupDefaults($org);
                } catch (\Throwable $e) {
                    \Log::warning('OrganizationSetupService::setupDefaults failed during SaaS-fallback login', [
                        'org_id' => $org->id,
                        'error'  => $e->getMessage(),
                    ]);
                }
            }
        }

        // Find-or-create the local user.
        $user = User::withoutGlobalScopes()->where('email', $email)->first();
        if (!$user) {
            $user = User::create([
                'name'            => $name,
                'email'           => $email,
                'phone'           => $phone,
                'password'        => Hash::make($plainPassword),
                'user_type'       => 'staff',
                'organization_id' => $org?->id,
            ]);
        } else {
            // Sync the local password to the just-verified one so the
            // next login bypasses the SaaS roundtrip. Safe: SaaS just
            // confirmed the user knows this password.
            $user->password = Hash::make($plainPassword);
            if (!$user->organization_id && $org) {
                $user->organization_id = $org->id;
            }
            $user->save();
        }

        // Ensure a Staff row exists for admin access. Use the SaaS-mapped
        // role on creation; don't downgrade an existing one (an admin in
        // loyalty may have been promoted locally beyond their SaaS role).
        if ($org) {
            $staff = Staff::withoutGlobalScopes()
                ->where('user_id', $user->id)
                ->where('organization_id', $org->id)
                ->first();
            if (!$staff) {
                try {
                    Staff::withoutGlobalScopes()->create([
                        'organization_id' => $org->id,
                        'user_id'         => $user->id,
                        'role'            => $localRole,
                        'can_award_points'   => in_array($localRole, ['super_admin', 'manager', 'receptionist'], true),
                        'can_redeem_points'  => in_array($localRole, ['super_admin', 'manager'], true),
                        'can_manage_offers'  => in_array($localRole, ['super_admin', 'manager'], true),
                        'can_view_analytics' => in_array($localRole, ['super_admin', 'manager'], true),
                    ]);
                } catch (\Throwable $e) {
                    \Log::warning('Staff seed failed during SaaS-fallback login', [
                        'user_id' => $user->id,
                        'org_id'  => $org->id,
                        'error'   => $e->getMessage(),
                    ]);
                }
            }
        }

        return $user;
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        // Bypass scopes for relationship loading — user may not have tenant context yet
        $member = LoyaltyMember::withoutGlobalScopes()
            ->where('user_id', $user->id)->with('tier')->first();
        $staff = Staff::withoutGlobalScopes()
            ->where('user_id', $user->id)->first();

        // Industry Platform Plan Phase 1 — surface the resolved industry on
        // the bootstrap payload so the SPA can immediately apply
        // industry-aware behaviour (sidebar gating, dashboard KPIs, AI
        // vocabulary, mobile theme). Reads via the fallback chain on
        // Organization (column → crm_settings.industry_preset → 'hotel')
        // so legacy hotel orgs return a sensible value before the Phase 10
        // backfill writes the column. `industry_explicit` distinguishes a
        // real choice from a defaulted-to-hotel fallback — Phase 4's
        // mismatch banner uses this to avoid prompting orgs that have
        // never explicitly picked an industry yet.
        // Organization model is the tenant root — does NOT use
        // BelongsToOrganization itself, so no global scope to bypass.
        $industry = \App\Models\Organization::DEFAULT_INDUSTRY;
        $industryExplicit = false;
        if ($user->organization_id) {
            $org = \App\Models\Organization::find($user->organization_id);
            if ($org) {
                $industry = $org->resolved_industry;
                $industryExplicit = $org->hasExplicitIndustry();
            }
        }

        $data = [
            'id'        => $user->id,
            'name'      => $user->name,
            'email'     => $user->email,
            'phone'     => $user->phone,
            'user_type' => $user->user_type,
            'avatar_url'=> $user->avatar_url,
            // Admin SPA reads this on bootstrap to set the i18n locale.
            // Stored as a 2-letter code (en/ru/de/fr/es); see MeController.
            'language'  => $user->language ?: 'en',
            'loyalty_member' => $member,
            'staff'     => $staff,
            // Industry Platform Plan — the SPA gates UI on this. See
            // apps/loyalty/INDUSTRY_PLATFORM_PLAN.md.
            'industry'          => $industry,
            'industry_explicit' => $industryExplicit,
            // Phase 8.x mobile follow-up — derived from the industry
            // profile so the mobile member app can gate the "Add to
            // Apple/Google Wallet" button without probing the
            // endpoints. Medical orgs (decision #5) return false;
            // every other industry returns true. Reading via the
            // IndustryPromptProfile keeps the policy single-sourced.
            'has_loyalty'       => app(\App\Services\IndustryPrompts\IndustryPromptService::class)
                ->for($industry)->hasLoyalty,
        ];

        return response()->json($data);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    /**
     * POST /v1/auth/apply-industry — Re-apply an industry preset to the
     * caller's org. Used by:
     *   1. The Phase 4 sub-domain mismatch banner (admin lands on
     *      beauty-tech.uk but org.industry='hotel' → one-tap switch).
     *   2. Phase 10's in-app Settings → Industry switcher.
     *   3. Recovery path when Phase 2 signup's preset-apply step
     *      failed (audit row `signup.preset_apply_failed`).
     *
     * **Data-safety contract**: when the caller's org has any data in
     * inquiries / loyalty_members / reservations / booking_mirror /
     * guests / corporate_accounts / lead_form_submissions / tasks /
     * planner_tasks / activities / chat_conversations, the body MUST
     * include `acknowledge: true`. Otherwise we return 409 with a
     * structured `changes` array the UI can render in a confirmation
     * modal. This prevents a Phase 4 banner click from silently
     * reshaping a fully-populated workspace.
     *
     * Throttled at 5 requests / minute per Sanctum token via the route
     * (`throttle:5,1`). This is a per-session token throttle, not a
     * per-org daily limit — two admins in the same org can each issue
     * 5/min independently. A stricter per-org RateLimiter (1 switch /
     * 24h per org) is documented as a Phase 10 hardening item
     * alongside the in-app Settings → Industry switcher; until then the
     * acknowledge gate plus the audit log + the UI's confirmation
     * modal are the load-bearing safety controls.
     */
    public function applyIndustry(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'industry'    => 'required|string|max:32',
            'acknowledge' => 'nullable|boolean',
        ]);

        $user = $request->user();
        if (!$user || !$user->organization_id) {
            return response()->json(['error' => 'No organization context'], 422);
        }

        $industry = \App\Models\Organization::normaliseIndustry($validated['industry']);
        if ($industry === null) {
            return response()->json([
                'error' => "Unknown industry '{$validated['industry']}'. Allowed: " . implode(', ', \App\Models\Organization::INDUSTRIES),
            ], 422);
        }

        $org = \App\Models\Organization::find($user->organization_id);
        if (!$org) return response()->json(['error' => 'Organization not found'], 404);

        // No-op when the org is already on the requested industry. Save
        // a wasted preset apply + audit row + the throttle slot.
        if ($org->resolved_industry === $industry) {
            return response()->json([
                'message'  => 'Already configured for ' . $industry,
                'industry' => $industry,
                'changed'  => false,
            ]);
        }

        // Bind tenant context — preset services read crm_settings via
        // tenant scope (BelongsToOrganization), so without this the
        // updateOrCreate calls would fail-closed and quietly write
        // nothing.
        app()->instance('current_organization_id', $org->id);

        // Existing-data check. We probe every tenant-scoped table that
        // carries customer-visible work a preset switch will reshape or
        // relabel — the count itself isn't the gate, the existence of
        // ANY data is. The acknowledge flag is the user's "yes, I read
        // the warnings" signal; the UI must surface the `changes` list
        // to them first.
        //
        // Service businesses (beauty / medical / restaurant) typically
        // populate guests + tasks + planner_tasks + activities + chat
        // conversations + lead_form_submissions BEFORE they have any
        // loyalty_members / reservations / booking_mirror rows. Probing
        // only the booking-engine tables would have let those orgs slip
        // through the gate.
        $probeTables = [
            'inquiries',
            'loyalty_members',
            'reservations',
            'booking_mirror',
            'guests',
            'corporate_accounts',
            'lead_form_submissions',
            'tasks',
            'planner_tasks',
            'activities',
            'chat_conversations',
        ];
        $hasData = false;
        foreach ($probeTables as $t) {
            try {
                if (\DB::table($t)->where('organization_id', $org->id)->exists()) {
                    $hasData = true;
                    break;
                }
            } catch (\Illuminate\Database\QueryException) {
                // Table missing in a partial-deploy environment — ignore
                // and continue probing. We err on the side of "no data"
                // here because the acknowledge gate is opt-in.
            }
        }

        if ($hasData && empty($validated['acknowledge'])) {
            return response()->json([
                'error'       => 'Industry change against an org with existing data requires acknowledge=true.',
                'requires_acknowledge' => true,
                'from'        => $org->resolved_industry,
                'to'          => $industry,
                'changes'     => [
                    'Sidebar labels + vocabulary will swap to ' . $industry . ' terminology',
                    'CRM pipeline + stages will be replaced with the ' . $industry . ' preset (existing inquiries migrate by stage kind — won / lost / open)',
                    'Lost-reason taxonomy will be reseeded (in-use reasons soft-deactivated, never deleted)',
                    'Custom fields will be reseeded (existing custom_data on entities is preserved)',
                    'Planner task groups + templates will be replaced (admin manual templates are kept)',
                    // Phase 5 — loyalty-side reshapes now happen inside
                    // the same transaction. Surface them so the
                    // acknowledge gate is honest:
                    //   - tiers + benefits add by name (existing rows
                    //     preserved when org already has members)
                    //   - welcome bonus is ONLY rewritten when org has
                    //     zero members (a hotel admin's hand-tuned bonus
                    //     never silently flips to a different industry's
                    //     default)
                    //   - medical short-circuits to no loyalty reshape
                    //     (decision #5)
                    ($industry === 'medical'
                        ? 'Loyalty: medical industry has no loyalty program (existing tiers / benefits / welcome bonus stay; no new ones added)'
                        : 'Loyalty tiers + benefits will be added by name (existing tiers + benefits preserved); welcome bonus reseeded ONLY for orgs without members'),
                    'Chatbot identity blurb will be re-seeded for ' . $industry . ' (custom assistant_name stays)',
                    'Existing customer / member / reservation / booking data is NOT deleted',
                ],
            ], 409);
        }

        $beforeIndustry = $org->resolved_industry;

        $loyaltySummary = null;
        try {
            \DB::transaction(function () use ($org, $industry, &$loyaltySummary) {
                $org->industry = $industry;
                $org->save();

                app(\App\Services\IndustryPresetService::class)->apply($industry);
                app(\App\Services\PlannerPresetService::class)->apply($industry);
                // Phase 5 — Loyalty preset now resolves the canonical
                // industry id (medical → no-op; hospitality →
                // restaurant; legal / real_estate / education →
                // simple_two_tier; hotel → hotel_classic) so the
                // industry switcher writes industry-appropriate tiers +
                // benefits + welcome bonus instead of stranding the org
                // on the previous industry's loyalty config.
                $loyaltySummary = app(\App\Services\LoyaltyPresetService::class)->apply($industry, $org->id);
            });
        } catch (\Throwable $e) {
            report($e);
            \App\Models\AuditLog::record(
                'industry.apply_failed',
                $org,
                ['from' => $beforeIndustry, 'to' => $industry, 'error' => $e->getMessage()],
                [],
                $user,
                "Industry apply failed: {$beforeIndustry} → {$industry}"
            );
            return response()->json(['error' => 'Industry apply failed: ' . $e->getMessage()], 500);
        }

        \App\Models\AuditLog::record(
            'industry.applied',
            $org,
            [
                'industry'        => $industry,
                'acknowledge'     => (bool) ($validated['acknowledge'] ?? false),
                // Phase 5 — surface loyalty no-op signal + summary so
                // an audit-log reader can distinguish a real loyalty
                // reshape (hotel→beauty: tiers added by name) from a
                // medical short-circuit (no tiers touched).
                'loyalty_noop'    => (bool) ($loyaltySummary['noop'] ?? false),
                'loyalty_summary' => $loyaltySummary,
            ],
            ['industry' => $beforeIndustry],
            $user,
            "Industry switched: {$beforeIndustry} → {$industry}"
            . (($loyaltySummary['noop'] ?? false) ? ' (loyalty no-op — medical industry)' : '')
        );

        return response()->json([
            'message'         => 'Industry applied.',
            'industry'        => $industry,
            'from'            => $beforeIndustry,
            'changed'         => true,
            // Phase 5 — surface the loyalty summary so the UI can
            // render a "what was just done" confirmation (e.g. "5
            // tiers added by name, 0 benefits replaced, welcome bonus
            // preserved (existing members)").
            'loyalty_summary' => $loyaltySummary,
        ]);
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

        // Normalize email — verification codes are matched on exact equality,
        // so stray casing or whitespace between send/verify breaks the flow.
        $validated['email'] = strtolower(trim($validated['email']));

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
            return response()->json(['error' => 'Could not send verification email. Please try again.'], 502);
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

        $validated['email'] = strtolower(trim($validated['email']));
        $validated['code']  = trim($validated['code']);

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
            'phone'      => 'required|string|max:30',
            'password'   => 'required|string|min:8',
            'hotel_name' => 'required|string|max:191',
            'plan'       => 'nullable|string|max:50',
            // Language preference picked at signup — persisted on the user
            // so they get the right locale on every device the first time
            // they sign in. Whitelist matches MeController::SUPPORTED_LANGUAGES.
            'language'   => 'nullable|string|in:en,ru,de,fr,es',
            // Industry Platform Plan Phase 2 — captured at signup by
            // Login.tsx (sub-brand hostname OR umbrella picker). Optional
            // on wire so legacy clients keep working; we validate +
            // normalise via Organization::normaliseIndustry below and
            // fall back to 'hotel' when missing / invalid (existing
            // hotel-only behaviour for clients that don't send it).
            'industry'   => 'nullable|string|max:32',
        ]);

        // Normalise + validate the picked industry. Aliases
        // (`hospitality` → `restaurant`) are translated here so the
        // column holds canonical ids only. Invalid / missing falls back
        // to 'hotel' which matches today's behaviour for orgs that
        // haven't picked.
        $industry = \App\Models\Organization::normaliseIndustry($validated['industry'] ?? null)
            ?? \App\Models\Organization::DEFAULT_INDUSTRY;

        $validated['email'] = strtolower(trim($validated['email']));

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
                    'phone'    => $validated['phone'],
                    'password' => $validated['password'],
                    'orgName'  => $validated['hotel_name'],
                    'planSlug' => $validated['plan'] ?? 'starter',
                    // Phase 2 — let SaaS persist a metadata mirror of the
                    // industry choice so the SSO handoff JWT carries
                    // `currentOrgIndustry` for the loyalty middleware to
                    // pick up on first-time org creation.
                    'industry' => $industry,
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
                        'name'     => $validated['hotel_name'],
                        'slug'     => \Illuminate\Support\Str::slug($validated['hotel_name']),
                        // Phase 2 — stamp the canonical industry on the
                        // row at create time so every reader (sidebar,
                        // dashboard, AI prompts in later phases) sees
                        // the right value from the very first request.
                        'industry' => $industry,
                    ]
                );
            }

            if (!$org && $existingUser?->organization_id) {
                $org = \App\Models\Organization::find($existingUser->organization_id);
            }
            if (!$org) {
                $org = \App\Models\Organization::create([
                    'name'     => $validated['hotel_name'],
                    'slug'     => \Illuminate\Support\Str::slug($validated['hotel_name']) . '-' . \Illuminate\Support\Str::random(4),
                    'industry' => $industry,
                ]);
            }

            // Phase 2 — orgs found via existing-user or saas-org-id match
            // may pre-date Phase 1 and lack the column value. Stamp now
            // (only when truly unset — we never overwrite an explicit
            // choice in this path). Same defensive guarantee as Phase 10
            // backfill would do, just per-org-on-signup.
            if (!$org->hasExplicitIndustry()) {
                $org->industry = $industry;
                $org->save();
            }

            // Bind org context for BelongsToOrganization trait
            app()->instance('current_organization_id', $org->id);

            // NOTE: Do NOT call setupDefaults() here — let the Setup wizard handle it
            // so the user gets to choose blank vs demo data.

            // Create or re-use local user. When an existing user completes
            // their trial signup (they had a half-set-up account), honor the
            // password they just typed — otherwise they'll be locked out.
            $localUser = $existingUser;
            $signupLang = $validated['language'] ?? 'en';
            if (!$localUser) {
                $localUser = User::create([
                    'name'            => $validated['name'],
                    'email'           => $validated['email'],
                    'phone'           => $validated['phone'] ?? null,
                    'password'        => Hash::make($validated['password']),
                    'user_type'       => 'staff',
                    'organization_id' => $org->id,
                    'language'        => $signupLang,
                ]);
            } else {
                $updates = [
                    'password' => Hash::make($validated['password']),
                    'name'     => $validated['name'],
                    'phone'    => $validated['phone'] ?? $localUser->phone,
                ];
                if (!$localUser->organization_id) {
                    $updates['organization_id'] = $org->id;
                }
                if (!$localUser->language) {
                    $updates['language'] = $signupLang;
                }
                $localUser->update($updates);
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

        // Industry Platform Plan Phase 2 + Phase 5 — apply industry
        // presets atomically against the new org. Three services:
        //
        //   1. IndustryPresetService — CRM (pipeline / stages / lost
        //      reasons / 6 entity field layouts / custom fields) +
        //      ChatbotBehaviorConfig identity re-seed (Phase 5).
        //   2. PlannerPresetService — task groups + starter templates.
        //   3. LoyaltyPresetService — tiers + benefits + welcome bonus.
        //
        // Phase 5 unblock: LoyaltyPresetService now resolves canonical
        // industry ids via internal ALIASES:
        //   - hotel       → hotel_classic
        //   - hospitality → restaurant
        //   - legal / real_estate / education → simple_two_tier
        //   - medical     → SHORT-CIRCUITS to a no-op that stamps
        //     `members_preset='medical'` without writing tiers /
        //     benefits / welcome bonus (decision #5: no patient
        //     loyalty program).
        //
        // First-signup orgs hit `totalMembers === 0` → clean-replace
        // path → tiers, benefits, and welcome_bonus_points all written
        // fresh. Existing-data orgs (members already present) skip
        // tier replacement entirely (additive-by-name) AND skip the
        // welcome bonus rewrite (prevents silently flipping a hotel
        // org's hand-tuned 500 → beauty's 100).
        //
        // All three services compose as Postgres SAVEPOINTs inside the
        // outer DB::transaction — atomic commit or atomic rollback.
        // None do external side effects (HTTP / queue), so DB rollback
        // is a complete reversal.
        //
        // The block is wrapped in a single try/catch. A preset failure
        // does NOT block signup — the user lands in the admin and the
        // Phase 2 retry UX (apply-industry endpoint) picks up via the
        // `signup.preset_apply_failed` audit-row signal. The
        // `failed_at` marker captured below names which service threw,
        // so the retry has a clearer recovery target.
        $failedAt = null;
        $loyaltySummary = null;
        try {
            \DB::transaction(function () use ($industry, $org, &$failedAt, &$loyaltySummary) {
                $failedAt = 'crm';
                app(\App\Services\IndustryPresetService::class)->apply($industry);
                $failedAt = 'planner';
                app(\App\Services\PlannerPresetService::class)->apply($industry);
                $failedAt = 'loyalty';
                $loyaltySummary = app(\App\Services\LoyaltyPresetService::class)->apply($industry, $org->id);
                $failedAt = null;
            });
            \App\Models\AuditLog::record(
                'signup.presets_applied',
                $org,
                [
                    'industry' => $industry,
                    'services' => ['crm', 'planner', 'loyalty'],
                    // Phase 5 reviewer fix: surface the loyalty no-op
                    // signal so audit-log readers don't see "loyalty
                    // applied" for a medical org that actually wrote
                    // only one CrmSetting row.
                    'loyalty_noop' => (bool) ($loyaltySummary['noop'] ?? false),
                    'loyalty_summary' => $loyaltySummary,
                ],
                [],
                $localUser ?? null,
                "Applied CRM + Planner + Loyalty presets '{$industry}' on trial signup"
                . (($loyaltySummary['noop'] ?? false) ? ' (loyalty no-op — medical industry)' : '')
            );
        } catch (\Throwable $e) {
            report($e);
            \App\Models\AuditLog::record(
                'signup.preset_apply_failed',
                $org,
                [
                    'industry'  => $industry,
                    'services'  => ['crm', 'planner', 'loyalty'],
                    'failed_at' => $failedAt,
                    'error'     => $e->getMessage(),
                ],
                [],
                $localUser ?? null,
                "Preset apply failed on trial signup (failed at: {$failedAt}) — workspace will retry via apply-industry"
            );
        }

        // Step 4: Provision trial entitlements on the local org.
        //
        // Two paths:
        //   a) SaaS registration succeeded → sync from SaaS bootstrap (authoritative)
        //   b) SaaS unreachable / not configured → create a local trial directly
        //
        // Either way, the org MUST end up with subscription_status + plan data
        // so that subscription() and CheckSubscription work correctly.
        $planSlug = $validated['plan'] ?? 'starter';
        $trialDays = 7; // Matches SaaS plan config
        $trialSynced = false;

        // Path A: Sync from SaaS if registration succeeded
        if ($saasToken && $saasApi && $org) {
            try {
                $bootstrap = Http::withToken($saasToken)->timeout(5)
                    ->get("{$saasApi}/tools/bootstrap");

                if ($bootstrap->successful()) {
                    $bsData = $bootstrap->json();
                    $sub = $bsData['subscription'] ?? null;
                    if ($sub) {
                        $org->plan_slug           = $sub['plan']['slug'] ?? $planSlug;
                        $org->subscription_status = $sub['status'] ?? 'TRIALING';
                        $org->trial_end           = $sub['trialEnd'] ?? now()->addDays($trialDays);
                        $org->period_end          = $sub['currentPeriodEnd'] ?? now()->addDays($trialDays);
                        if (!$org->trial_started_at) $org->trial_started_at = now();
                    }
                    $org->entitled_products     = $bsData['entitled_product_slugs'] ?? [];
                    $org->plan_features         = (array) ($bsData['features'] ?? []);
                    $org->entitlements_synced_at = now();
                    $org->save();
                    $trialSynced = true;
                }
            } catch (\Exception $e) {
                report($e);
            }
        }

        // Path B: Local trial fallback — SaaS unreachable or sync failed
        if (!$trialSynced && $org) {
            $org->plan_slug           = $planSlug;
            $org->subscription_status = 'TRIALING';
            $org->trial_end           = now()->addDays($trialDays);
            $org->period_end          = now()->addDays($trialDays);
            if (!$org->trial_started_at) $org->trial_started_at = now();
            $org->entitled_products   = $this->getPlanProducts($planSlug);
            $org->plan_features       = $this->getTrialFeatures($planSlug);
            $org->entitlements_synced_at = now();
            $org->save();
        }

        $sanctumToken = $localUser->createToken('admin')->plainTextToken;
        $staff = Staff::withoutGlobalScopes()->where('user_id', $localUser->id)->first();

        try {
            $planLabel = ucfirst($planSlug);
            // Pre-fix this read `config('app.frontend_url', config('app.url', ...))`
            // — `frontend_url` isn't a defined config key so it was always null,
            // and any env where APP_URL defaulted to http://localhost (Laravel's
            // own default) shipped a localhost link to real customers. Use the
            // resolveLoyaltyUrl helper which is the same one billingActivate /
            // billingPortal use — fails closed in prod, falls back to request
            // origin in dev so local testing still works.
            $loginUrl = $this->resolveLoyaltyUrl() ?? 'https://loyalty.hotel-tech.ai';
            Mail::to($validated['email'])->queue(new WelcomeTrialMail(
                userName: $validated['name'],
                hotelName: $validated['hotel_name'],
                planName: $planLabel,
                trialDays: $trialDays,
                loginUrl: $loginUrl,
                // Phase 2 — Mailable swaps a handful of subject + body
                // placeholders ("Hotel Tech" → "BeautyTech" etc.) based
                // on industry. Full per-industry HTML redesign is
                // deferred to Phase 8 (token-substitution approach).
                industry: $industry,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'token'      => $sanctumToken,
            'saas_token' => $saasToken,
            'user'       => $localUser->fresh(),
            'staff'      => $staff,
            'org_id'     => $saasOrgId ?? $org->id,
            'message'    => 'Trial started! You have ' . $trialDays . ' days to explore.',
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
        // Platform admin (hotel-tech.ai operator) gets full access — no subscription needed.
        // This is NOT the same as org "super_admin" role — every org owner has that.
        $user = $request->user();
        $platformEmails = array_map('trim', explode(',', config('services.saas.platform_admin_emails', '')));
        $isPlatformAdmin = $user && in_array($user->email, $platformEmails, true);
        if ($isPlatformAdmin) {
            return response()->json([
                'active'   => true,
                'status'   => 'ACTIVE',
                'plan'     => ['name' => 'Enterprise', 'slug' => 'enterprise'],
                'trialEnd' => null,
                'periodEnd'=> null,
                'features' => [
                    'max_team_members' => 'unlimited', 'max_guests' => 'unlimited',
                    'max_properties' => 'unlimited', 'max_loyalty_members' => 'unlimited',
                    'ai_insights' => 'true', 'ai_avatars' => 'true',
                    'custom_branding' => 'true', 'api_access' => 'true',
                    'push_notifications' => 'true', 'mobile_app' => 'true',
                    'nfc_cards' => 'true', 'priority_support' => 'dedicated',
                ],
                'products' => ['crm', 'chat', 'loyalty', 'education', 'avatar', 'booking'],
                'billingAvailable' => false,
                'isSuperAdmin' => true,
            ]);
        }

        // Check if billing operations are available (requires SaaS link)
        $orgForBilling = $request->user()?->organization_id
            ? \App\Models\Organization::find($request->user()->organization_id)
            : null;
        $saasApi = config('services.saas.api_url');
        // Billing is available when SaaS API is configured — ensureSaasOrg() handles auto-registration
        $billingAvailable = (bool) $saasApi;

        // 1. Live SaaS query (only when user has a SaaS JWT — set by SaasAuthMiddleware)
        $saasOrgId = $request->attributes->get('saas_org_id');
        if ($saasOrgId) {
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
                                'billingAvailable' => true,
                            ]);
                        }
                    }
                    // PAST_DUE / UNPAID inside the grace window: the
                    // middleware lets the request through but the user
                    // needs to see a banner explaining what's wrong.
                    // We still return the full features/products so the
                    // dashboard works normally while they fix billing.
                    foreach ($subs as $sub) {
                        if (in_array($sub['status'] ?? '', ['PAST_DUE', 'UNPAID'])) {
                            $periodEnd = $sub['currentPeriodEnd'] ?? null;
                            $graceUntil = $periodEnd
                                ? date('c', strtotime($periodEnd . ' +3 days'))
                                : date('c', strtotime('+3 days'));
                            $inGrace = strtotime($graceUntil) > time();
                            return response()->json([
                                'active'     => $inGrace,
                                'status'     => $inGrace ? 'PAST_DUE_GRACE' : 'PAST_DUE',
                                'plan'       => $sub['plan'] ?? null,
                                'trialEnd'   => $sub['trialEnd'] ?? null,
                                'periodEnd'  => $periodEnd,
                                'graceUntil' => $graceUntil,
                                'features'   => $inGrace ? $features : [],
                                'products'   => $inGrace ? $products : [],
                                'billingAvailable' => true,
                            ]);
                        }
                    }
                    return response()->json(['active' => false, 'status' => 'EXPIRED', 'features' => [], 'products' => [], 'billingAvailable' => true]);
                }
            } catch (\Exception $e) {
                // SaaS API unreachable — fall through to cached data
            }
        }

        // 2. Cached org entitlements (synced at trial creation or by SaasAuthMiddleware).
        //    For Sanctum-authenticated requests (no SaaS JWT), also try a refresh when
        //    the cache is stale so orgs created before the per-plan entitlement fix
        //    inherit the correct products/features on their next page load.
        if ($orgForBilling && $orgForBilling->saas_org_id) {
            $stale = !$orgForBilling->entitlements_synced_at
                || $orgForBilling->entitlements_synced_at->lt(now()->subMinutes(5));
            if ($stale) {
                $saasToken = $this->getSaasToken($request);
                if ($saasToken) {
                    $this->syncEntitlementsFromSaas($request, $saasToken);
                    $orgForBilling->refresh();
                }
            }
        }

        if ($orgForBilling && $orgForBilling->subscription_status) {
            // Check if trial has expired since last sync
            $status = $orgForBilling->subscription_status;
            if ($status === 'TRIALING' && $orgForBilling->trial_end && $orgForBilling->trial_end->isPast()) {
                $status = 'EXPIRED';
                $orgForBilling->update(['subscription_status' => 'EXPIRED']);
            }

            return response()->json([
                'active'   => in_array($status, ['ACTIVE', 'TRIALING'], true),
                'status'   => $status,
                'plan'     => $orgForBilling->plan_slug
                    ? ['name' => ucfirst($orgForBilling->plan_slug), 'slug' => $orgForBilling->plan_slug]
                    : null,
                'trialEnd' => $orgForBilling->trial_end?->toIso8601String(),
                'trialStartedAt'  => $orgForBilling->trial_started_at?->toIso8601String(),
                'trialAlreadyUsed'=> (bool) $orgForBilling->trial_started_at,
                'periodEnd'=> $orgForBilling->period_end?->toIso8601String(),
                'features' => $orgForBilling->plan_features ?: [],
                'products' => $orgForBilling->entitled_products ?: [],
                'billingAvailable' => $billingAvailable,
            ]);
        }

        // 3. No subscription data at all — SaaS not configured AND no cached data
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
                'billingAvailable' => false,
            ]);
        }

        // SaaS is configured but org has no subscription — user needs to pick a plan
        return response()->json([
            'active'   => false,
            'status'   => 'NO_PLAN',
            'plan'     => null,
            'features' => [],
            'products' => [],
            'billingAvailable' => $billingAvailable,
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

        // Get or create SaaS connection for this org (auto-registers if needed)
        $saasToken = $this->ensureSaasOrg($request);
        if (!$saasToken) {
            $orgForDebug = $request->user() ? \App\Models\Organization::find($request->user()->organization_id) : null;
            return response()->json([
                'error' => 'Could not connect to billing system. Please try again.',
                'debug' => [
                    'saas_api' => $saasApi,
                    'has_saas_org_id' => (bool) $orgForDebug?->saas_org_id,
                    'hint' => 'Check laravel.log for detailed SaaS connection errors',
                ],
            ], 422);
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
            // Always pass return URLs — matches the activate flow at
            // doBillingActivate. Without them, SaaS falls back to its
            // own dashboard URL on Stripe Checkout completion and the
            // user never hits loyalty's /billing?success=1 handler
            // that fires /v1/auth/billing/refresh to bust the
            // entitlement cache. Net effect: a fresh upgrade stays
            // locked behind the 5-min sync window for no reason.
            $loyaltyUrl = $this->resolveLoyaltyUrl();
            $response = Http::withToken($saasToken)->timeout(10)->post($endpoint, [
                'planId'     => $planId,
                'interval'   => $request->input('interval', 'MONTHLY'),
                'successUrl' => "{$loyaltyUrl}/billing?success=1",
                'cancelUrl'  => "{$loyaltyUrl}/billing?canceled=1",
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
            return response()->json(['error' => 'Billing service unavailable'], 422);
        }
    }

    /**
     * POST /v1/auth/billing/activate
     * Proxy to SaaS billing/activate — converts trial to paid via Stripe Checkout.
     */
    public function billingActivate(Request $request): JsonResponse
    {
        try {
            return $this->doBillingActivate($request);
        } catch (\Throwable $e) {
            \Log::error('[billingActivate] FATAL: ' . $e->getMessage(), [
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);
            return response()->json([
                'error' => 'Billing system error: ' . $e->getMessage(),
            ], 422);
        }
    }

    private function doBillingActivate(Request $request): JsonResponse
    {
        $request->validate([
            'interval'  => 'nullable|string|in:MONTHLY,YEARLY',
            'plan_slug' => 'nullable|string',
        ]);

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'Billing not configured — SAAS_API_URL missing'], 400);
        }

        $saasToken = $this->ensureSaasOrg($request);
        if (!$saasToken) {
            $org = $request->user() ? \App\Models\Organization::find($request->user()->organization_id) : null;
            return response()->json([
                'error' => 'Could not connect to billing system. Check logs for details.',
                'debug' => [
                    'saas_api' => $saasApi,
                    'has_saas_org_id' => (bool) $org?->saas_org_id,
                    'hint' => 'Check laravel.log for [ensureSaasOrg] entries',
                ],
            ], 422);
        }

        // Pull our own public URL from APP_URL. Pre-fix we fell back to the
        // production loyalty domain when APP_URL was blank — a staging or
        // preview deploy with an empty APP_URL would silently route paying
        // customers' Stripe Checkout success/cancel redirects to prod.
        $loyaltyUrl = $this->resolveLoyaltyUrl();
        if (!$loyaltyUrl) {
            return response()->json(['error' => 'Loyalty URL not configured (APP_URL missing)'], 500);
        }

        try {
            $response = Http::withToken($saasToken)->timeout(10)->post("{$saasApi}/billing/activate", [
                'interval'   => $request->input('interval', 'MONTHLY'),
                'planSlug'   => $request->input('plan_slug'),
                'successUrl' => "{$loyaltyUrl}/billing?success=1",
                'cancelUrl'  => "{$loyaltyUrl}/billing?canceled=1",
            ]);

            if (!$response->successful()) {
                $body = $response->json();
                return response()->json([
                    'error' => $body['error'] ?? 'Activation failed',
                ], $response->status());
            }

            $data = $response->json();

            if (isset($data['checkoutUrl'])) {
                return response()->json(['checkoutUrl' => $data['checkoutUrl']]);
            }

            // Direct activation — refresh local entitlement cache
            $this->syncEntitlementsFromSaas($request, $saasToken);

            return response()->json(['success' => true, 'message' => 'Subscription activated']);
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Billing service unavailable'], 422);
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

        $saasToken = $this->ensureSaasOrg($request);
        if (!$saasToken) {
            return response()->json(['error' => 'Could not connect to billing system. Please try again.'], 422);
        }

        $loyaltyUrl = $this->resolveLoyaltyUrl();
        if (!$loyaltyUrl) {
            return response()->json(['error' => 'Loyalty URL not configured (APP_URL missing)'], 500);
        }

        try {
            $response = Http::withToken($saasToken)->timeout(10)->post("{$saasApi}/billing/portal", [
                'returnUrl' => "{$loyaltyUrl}/billing",
            ]);

            if (!$response->successful()) {
                return response()->json(['error' => 'Billing portal not available'], 400);
            }

            return response()->json($response->json());
        } catch (\Exception $e) {
            report($e);
            return response()->json(['error' => 'Billing service unavailable'], 422);
        }
    }

    /**
     * POST /v1/auth/billing/refresh — Force a fresh entitlement pull from SaaS.
     *
     * Called by the loyalty SPA after the customer returns from Stripe Checkout
     * (`/billing?success=1`). Without this, the org keeps reading the cached
     * pre-upgrade plan_features / entitled_products until the 5-min staleness
     * window expires, which makes "I just paid but the new features aren't on"
     * a real complaint. Also busts the CheckSubscription cache so PAST_DUE /
     * EXPIRED status flips to ACTIVE without waiting 60s.
     */
    public function billingRefresh(Request $request): JsonResponse
    {
        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'Billing not configured'], 400);
        }

        $saasToken = $this->getSaasToken($request);
        if (!$saasToken) {
            return response()->json(['error' => 'Could not authenticate with billing service'], 422);
        }

        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;
        if (!$org) {
            return response()->json(['error' => 'No organization on the current user'], 422);
        }

        // Run the bootstrap fetch inline so we can tell the SPA whether SaaS
        // actually responded. Calling syncEntitlementsFromSaas() would swallow
        // every error and return 200 with stale data — which is the failure
        // mode this endpoint exists to prevent.
        try {
            $bootstrap = Http::withToken($saasToken)->timeout(8)
                ->get("{$saasApi}/tools/bootstrap");

            if (!$bootstrap->successful()) {
                return response()->json([
                    'error'  => 'Billing service returned ' . $bootstrap->status(),
                    'status' => $org->subscription_status,
                ], 502);
            }

            $data = $bootstrap->json();
            $sub  = $data['subscription'] ?? null;
            if ($sub) {
                $org->plan_slug           = $sub['plan']['slug'] ?? null;
                $org->subscription_status = $sub['status'] ?? null;
                $org->trial_end           = $sub['trialEnd'] ?? null;
                $org->period_end          = $sub['currentPeriodEnd'] ?? null;
            }
            $org->entitled_products      = $data['entitled_product_slugs'] ?? [];
            $org->plan_features          = (array) ($data['features'] ?? []);
            $org->entitlements_synced_at = now();
            $org->save();
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'error'  => 'Could not reach billing service',
                'status' => $org->subscription_status,
            ], 502);
        }

        // Bust the CheckSubscription cache so the next request sees fresh state.
        if ($org->saas_org_id) {
            \Illuminate\Support\Facades\Cache::forget("subscription_status:{$org->saas_org_id}");
        }

        return response()->json([
            'success' => true,
            'subscription' => [
                'status'   => $org->subscription_status,
                'plan'     => $org->plan_slug,
                'trialEnd' => $org->trial_end?->toIso8601String(),
                'periodEnd'=> $org->period_end?->toIso8601String(),
                'features' => $org->plan_features ?? [],
                'products' => $org->entitled_products ?? [],
            ],
        ]);
    }

    /**
     * Canonical product list per plan — mirrors apps/saas/backend's v3 plan matrix
     * (reset_plans_to_v3 migration). Used when SaaS is unreachable so the local
     * fallback doesn't grant every plan the same entitlements.
     */
    private function getPlanProducts(string $planSlug): array
    {
        return match ($planSlug) {
            'starter'    => ['crm', 'loyalty'],
            'growth'     => ['crm', 'loyalty', 'booking', 'chat'],
            'enterprise' => ['crm', 'loyalty', 'booking', 'chat'],
            default      => ['crm', 'loyalty'],
        };
    }

    /**
     * Feature set for each plan tier (used when SaaS is unreachable).
     * These mirror the PlanFeature seed in apps/saas/backend/database/seeders/DatabaseSeeder.php
     * — keep them in sync.
     */
    private function getTrialFeatures(string $planSlug): array
    {
        return match ($planSlug) {
            'starter' => [
                'max_team_members'     => '5',
                'max_guests'           => '1000',
                'max_properties'       => '1',
                'max_loyalty_members'  => '500',
                'ai_insights'          => 'false',
                'ai_avatars'           => 'false',
                'custom_branding'      => 'false',
                'api_access'           => 'false',
                'push_notifications'   => 'false',
                'mobile_app'           => 'false',
                'nfc_cards'            => 'false',
                'priority_support'     => 'email',
                // Pricing v2 (2026-06-07): Enterprise-only gates.
                'time_management'      => 'false',
                'admin_ai'             => 'false',
                'brands'               => 'false',
            ],
            'growth' => [
                'max_team_members'     => '25',
                'max_guests'           => '10000',
                'max_properties'       => '3',
                'max_loyalty_members'  => '5000',
                'ai_insights'          => 'true',
                'ai_avatars'           => 'false',
                'custom_branding'      => 'true',
                'api_access'           => 'true',
                'push_notifications'   => 'true',
                'mobile_app'           => 'true',
                'nfc_cards'            => 'true',
                'priority_support'     => 'chat',
                'time_management'      => 'false',
                'admin_ai'             => 'false',
                'brands'               => 'false',
            ],
            'enterprise' => [
                'max_team_members'     => 'unlimited',
                'max_guests'           => 'unlimited',
                'max_properties'       => 'unlimited',
                'max_loyalty_members'  => 'unlimited',
                'ai_insights'          => 'true',
                'ai_avatars'           => 'false',
                'custom_branding'      => 'true',
                'api_access'           => 'true',
                'push_notifications'   => 'true',
                'mobile_app'           => 'true',
                'nfc_cards'            => 'true',
                'priority_support'     => 'dedicated',
                // Enterprise customers MUST get true here on the
                // SaaS-unreachable fallback path — otherwise their own
                // paid features stay locked until SaaS sync recovers.
                'time_management'      => 'true',
                'admin_ai'             => 'true',
                'brands'               => 'true',
            ],
            default => [
                'max_team_members'     => '5',
                'max_guests'           => '1000',
                'max_properties'       => '1',
                'max_loyalty_members'  => '500',
                'ai_insights'          => 'false',
                'custom_branding'      => 'false',
                'push_notifications'   => 'false',
                'mobile_app'           => 'false',
                'time_management'      => 'false',
                'admin_ai'             => 'false',
                'brands'               => 'false',
            ],
        };
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
     *
     * Negative-cached: when the service-token call fails (timeout, 5xx, etc.)
     * we set a short-lived "unhealthy" key in the cache so subsequent calls
     * return null fast instead of every admin request blocking for the full
     * HTTP timeout. Without this, a slow SaaS makes the loyalty backend feel
     * frozen for everyone — PHP-FPM children pile up waiting on 5s curls
     * because the dashboard polls /subscription, which calls this, which
     * hangs, exhausting the FPM worker pool within seconds.
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

        // Fail-fast circuit breaker. Two cache keys:
        //   saas_token_unhealthy — set for 60s after a confirmed failure.
        //     Returns null immediately so polling admin tabs don't repeat
        //     the curl call across the next minute.
        //   saas_token_inflight — set for 3s when we START the call. Catches
        //     the concurrent-request race: two admin polls within the same
        //     2s window otherwise both make the call (both miss the breaker
        //     because the first hasn't tripped it yet). With this key, the
        //     second sees an in-flight call and returns null without burning
        //     a second curl. 3s is the timeout (2s) + a small grace.
        $cache = \Illuminate\Support\Facades\Cache::store();
        if ($cache->has('saas_token_unhealthy') || $cache->has('saas_token_inflight')) {
            return null;
        }

        $payload = implode('|', [$user->email, $org->saas_org_id]);
        $signature = hash_hmac('sha256', $payload, $jwtSecret);

        // Mark in-flight before the curl call so concurrent requests bail.
        $cache->put('saas_token_inflight', 1, 3);

        try {
            // Tightened from 5s to 2s. The endpoint is a single signed POST
            // against a Laravel route — when it's healthy it returns in
            // ~100ms. 2s is well above any real latency floor while keeping
            // worker-block time bounded under SaaS slowdowns.
            $response = Http::timeout(2)->connectTimeout(2)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post("{$saasApi}/auth/service-token", [
                    'email' => $user->email,
                    'orgId' => $org->saas_org_id,
                ]);

            $cache->forget('saas_token_inflight');

            if ($response->successful()) {
                return $response->json('token');
            }

            // Non-2xx: SaaS is up but rejecting. Don't trip the circuit on
            // a 401/403 — that's our problem (bad signature / disabled org),
            // not theirs, and we don't want to mask it. Only trip on 5xx.
            if ($response->serverError()) {
                $cache->put('saas_token_unhealthy', 1, 60);
            }
        } catch (\Throwable $e) {
            // Connection-level failure (timeout, DNS, refused). Trip the
            // breaker so the next 60s of admin requests skip the call.
            $cache->forget('saas_token_inflight');
            $cache->put('saas_token_unhealthy', 1, 60);
            // Log once per breaker window instead of every failed request.
            // The previous behaviour (report() on every call) produced
            // duplicate Nightwatch entries for the same outage.
            \Illuminate\Support\Facades\Log::warning('SaaS service-token call failed — breaker tripped for 60s', [
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    /**
     * Resolve this app's public URL (used for Stripe Checkout return URLs).
     * Returns null when APP_URL is missing in production — caller decides what
     * to do; we never silently fall back to the production loyalty domain
     * from a staging / preview deploy.
     */
    private function resolveLoyaltyUrl(): ?string
    {
        $url = trim((string) config('app.url'));
        if ($url) return rtrim($url, '/');

        // Dev convenience: in non-prod, fall back to the request origin so
        // local tunneling / preview environments still work without config.
        if (!app()->environment('production')) {
            return rtrim(request()->getSchemeAndHttpHost(), '/');
        }
        return null;
    }

    /**
     * Ensure the local organization exists on SaaS.
     * If it doesn't have a saas_org_id, register the user+org on SaaS
     * and store the returned IDs. Returns a SaaS JWT on success.
     *
     * IMPORTANT: All HTTP calls use very short timeouts (2s connect, 4s total)
     * because Laravel Cloud kills PHP workers on long requests.
     */
    private function ensureSaasOrg(Request $request): ?string
    {
        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;
        if (!$user || !$org) return null;

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) return null;

        // Already linked — get a token via the normal path
        if ($org->saas_org_id) {
            return $this->getSaasToken($request);
        }

        // Not linked — register on SaaS to create the org there. Use a fresh
        // random password rather than deriving from app.key + email: that
        // older scheme meant anyone with APP_KEY could compute every linked
        // user's SaaS password. The password is never used again after this
        // call — subsequent loyalty→SaaS auth goes through service-lookup /
        // service-verify-password which are HMAC-signed.
        $tempPassword = \Illuminate\Support\Str::random(40);

        try {
            $response = Http::connectTimeout(2)->timeout(4)->post("{$saasApi}/auth/register", [
                'name'     => $user->name,
                'email'    => $user->email,
                'password' => $tempPassword,
                'orgName'  => $org->name,
                'planSlug' => $org->plan_slug ?? 'starter',
            ]);
        } catch (\Exception $e) {
            \Log::error('[ensureSaasOrg] SaaS unreachable', [
                'url' => "{$saasApi}/auth/register",
                'error' => $e->getMessage(),
            ]);
            return null;
        }

        // Success — new user registered on SaaS
        if ($response->successful()) {
            $data = $response->json();
            $saasOrgId = $data['organization']['id'] ?? null;
            $saasToken = $data['token'] ?? null;

            if ($saasOrgId) {
                $org->saas_org_id = $saasOrgId;
                $org->save();
            }

            return $saasToken;
        }

        // User already exists on SaaS — use service-lookup (HMAC-signed, no password needed)
        if (in_array($response->status(), [409, 422])) {
            return $this->serviceLookupSaas($user, $org, $saasApi);
        }

        \Log::error('[ensureSaasOrg] Registration failed', [
            'status' => $response->status(),
            'body' => substr($response->body(), 0, 200),
        ]);
        return null;
    }

    /**
     * Look up existing user on SaaS using HMAC-signed service call.
     * No password needed — authenticated via shared JWT secret.
     */
    private function serviceLookupSaas($user, $org, string $saasApi): ?string
    {
        $jwtSecret = config('services.saas.jwt_secret', '');
        if (!$jwtSecret) {
            \Log::error('[serviceLookupSaas] No jwt_secret configured');
            return null;
        }

        $signature = hash_hmac('sha256', $user->email, $jwtSecret);

        try {
            $lookupRes = Http::connectTimeout(2)->timeout(4)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post("{$saasApi}/auth/service-lookup", [
                    'email' => $user->email,
                ]);
        } catch (\Exception $e) {
            \Log::error('[serviceLookupSaas] SaaS unreachable', ['error' => $e->getMessage()]);
            return null;
        }

        if ($lookupRes->successful()) {
            $data = $lookupRes->json();
            $saasOrgId = $data['organization']['id'] ?? null;
            $saasToken = $data['token'] ?? null;

            if ($saasOrgId && !$org->saas_org_id) {
                $org->saas_org_id = $saasOrgId;
                $org->save();
                \Log::error('[serviceLookupSaas] Linked org ' . $org->id . ' → SaaS ' . $saasOrgId);
            }

            return $saasToken;
        }

        \Log::error('[serviceLookupSaas] Lookup failed', [
            'status' => $lookupRes->status(),
            'body' => substr($lookupRes->body(), 0, 200),
        ]);
        return null;
    }

    /**
     * POST /v1/auth/billing/start-trial
     * Allow existing staff users to start a free trial on their org.
     * Works even without SaaS connection — provisions entitlements locally.
     */
    public function billingStartTrial(Request $request): JsonResponse
    {
        $request->validate([
            'plan_slug' => 'required|string|in:starter,growth,enterprise',
        ]);

        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;

        if (!$org) {
            return response()->json(['error' => 'No organization found for your account'], 400);
        }

        // Already on an active subscription — nothing to start
        if ($org->subscription_status === 'ACTIVE') {
            return response()->json(['error' => 'You already have an active subscription'], 400);
        }

        // Active trial — don't allow re-arming on a different plan
        if ($org->subscription_status === 'TRIALING' && $org->trial_end && $org->trial_end->isFuture()) {
            return response()->json(['error' => 'You already have an active trial'], 400);
        }

        // Trial already used by this org (across any plan).
        // Without this guard a user whose trial expired could call /trial again with a
        // different plan_slug and get a fresh 7-day window — bypassing the paywall.
        if ($org->trial_started_at) {
            return response()->json([
                'error'   => 'trial_already_used',
                'message' => 'Your free trial has already been used. Please subscribe to continue using the platform.',
            ], 403);
        }

        $planSlug = $request->input('plan_slug');
        $trialDays = 7; // Matches SaaS plan config

        // Try SaaS first if connected
        $saasApi = config('services.saas.api_url');
        $trialSynced = false;

        if ($saasApi && $org->saas_org_id) {
            $saasToken = $this->getSaasToken($request);
            if ($saasToken) {
                try {
                    // Resolve plan ID from slug
                    $plansRes = Http::withToken($saasToken)->timeout(5)->get("{$saasApi}/billing/plans");
                    $planId = null;
                    foreach ($plansRes->json('plans', []) as $p) {
                        if (($p['slug'] ?? '') === $planSlug) {
                            $planId = $p['id'];
                            $trialDays = $p['trialDays'] ?? 7;
                            break;
                        }
                    }

                    if ($planId) {
                        $response = Http::withToken($saasToken)->timeout(10)
                            ->post("{$saasApi}/billing/subscribe", [
                                'planId'   => $planId,
                                'interval' => 'MONTHLY',
                            ]);

                        if ($response->successful()) {
                            $this->syncEntitlementsFromSaas($request, $saasToken);
                            $trialSynced = true;
                        }
                    }
                } catch (\Exception $e) {
                    report($e);
                }
            }
        }

        // Local trial fallback
        if (!$trialSynced) {
            $org->plan_slug           = $planSlug;
            $org->subscription_status = 'TRIALING';
            $org->trial_end           = now()->addDays($trialDays);
            $org->period_end          = now()->addDays($trialDays);
            if (!$org->trial_started_at) $org->trial_started_at = now();
            $org->entitled_products   = $this->getPlanProducts($planSlug);
            $org->plan_features       = $this->getTrialFeatures($planSlug);
            $org->entitlements_synced_at = now();
            $org->save();
        } else if (!$org->trial_started_at) {
            // SaaS path succeeded but we still want to lock the trial window
            $org->trial_started_at = now();
            $org->save();
        }

        return response()->json([
            'success'   => true,
            'plan_slug' => $planSlug,
            'trial_days'=> $trialDays,
            'message'   => "Your {$trialDays}-day free trial of " . ucfirst($planSlug) . " has started!",
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => 'required|email']);
        $validated['email'] = strtolower(trim($validated['email']));

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

        $validated['email'] = strtolower(trim($validated['email']));
        $validated['code']  = trim($validated['code']);

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

    /**
     * POST /v1/auth/claim
     *
     * Staff creates a member without a password → member receives a
     * welcome email with a 6-digit invitation code. This endpoint lets
     * the member set their password AND log in with a single request.
     */
    public function claimAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'    => 'required|email',
            'code'     => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $validated['email'] = strtolower(trim($validated['email']));
        $validated['code']  = trim($validated['code']);

        $record = EmailVerificationCode::where('email', $validated['email'])
            ->where('code', $validated['code'])
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (!$record || $record->isExpired()) {
            return response()->json(['message' => 'Invalid or expired invitation code.'], 422);
        }

        $user = User::where('email', $validated['email'])->first();
        if (!$user) {
            return response()->json(['message' => 'No account found for this email.'], 422);
        }

        $user->update(['password' => Hash::make($validated['password'])]);
        $record->update(['verified_at' => now()]);

        // Bind org context so subsequent scoped queries work (same as login)
        if ($user->organization_id) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $member = LoyaltyMember::withoutGlobalScopes()
            ->where('user_id', $user->id)->with('tier')->first();
        $token  = $user->createToken('mobile-app')->plainTextToken;

        return response()->json([
            'token'  => $token,
            'user'   => $user,
            'member' => $member,
        ]);
    }

    /**
     * POST /v1/auth/activate
     *
     * Activate a new staff account from a SaaS invite email. Takes the
     * password-reset token emitted by SaaS, sets the password there (SaaS
     * remains the source of truth for identity), then provisions the local
     * User / Organization / Staff records so the new user lands straight
     * in the loyalty admin — no extra redirect through the SaaS frontend.
     */
    public function activateAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token'    => 'required|string',
            'email'    => 'required|email',
            'password' => 'required|string|min:8',
        ]);

        $validated['email'] = strtolower(trim($validated['email']));

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return response()->json(['error' => 'Account service is not configured. Please contact support.'], 500);
        }

        // 1. Set password against SaaS — it owns identity + billing.
        try {
            $response = \Illuminate\Support\Facades\Http::timeout(12)->acceptJson()->post(
                rtrim($saasApi, '/') . '/auth/reset-password',
                [
                    'token'    => $validated['token'],
                    'email'    => $validated['email'],
                    'password' => $validated['password'],
                ]
            );
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'error' => 'Could not reach the account service. Please try again in a moment.',
            ], 502);
        }

        if (!$response->successful()) {
            $body = $response->json();
            $msg  = $body['error'] ?? $body['message'] ?? 'This activation link is invalid or has expired. Please request a new one.';
            return response()->json(['error' => $msg], $response->status());
        }

        $data       = $response->json();
        $saasToken  = $data['token'] ?? null;
        $saasUser   = $data['user'] ?? null;
        $saasOrg    = $data['organization'] ?? null;

        if (!$saasUser) {
            return response()->json([
                'error' => 'Activation succeeded but no account information was returned. Please sign in manually.',
            ], 500);
        }

        // 2. Provision the local Organization + User + Staff so the user
        //    can use the loyalty admin immediately. Mirrors the
        //    SaasAuthMiddleware sync logic but runs eagerly here so we can
        //    surface any failure on the activation page instead of
        //    stranding the user on the login screen.
        try {
            $org = null;
            if ($saasOrg && !empty($saasOrg['id'])) {
                $org = \App\Models\Organization::where('saas_org_id', $saasOrg['id'])->first();
                if (!$org) {
                    $baseSlug = !empty($saasOrg['slug'])
                        ? $saasOrg['slug']
                        : \Illuminate\Support\Str::slug($saasOrg['name'] ?? 'org');
                    $slug   = $baseSlug ?: 'org';
                    $suffix = 1;
                    while (\App\Models\Organization::where('slug', $slug)->exists()) {
                        $slug = $baseSlug . '-' . $suffix++;
                    }
                    $org = \App\Models\Organization::create([
                        'saas_org_id' => $saasOrg['id'],
                        'name'        => $saasOrg['name'] ?? 'Organization',
                        'slug'        => $slug,
                    ]);
                }
            }

            $localUser = User::withoutGlobalScopes()->where('email', $validated['email'])->first();
            if (!$org && $localUser?->organization_id) {
                $org = \App\Models\Organization::find($localUser->organization_id);
            }
            if (!$org) {
                return response()->json([
                    'error' => 'No organization is linked to this invite. Please contact your administrator.',
                ], 422);
            }

            app()->instance('current_organization_id', $org->id);

            if (!$localUser) {
                $localUser = User::create([
                    'name'            => $saasUser['name'] ?? $validated['email'],
                    'email'           => $validated['email'],
                    'password'        => Hash::make($validated['password']),
                    'user_type'       => 'staff',
                    'organization_id' => $org->id,
                ]);
            } else {
                $updates = ['password' => Hash::make($validated['password'])];
                if (!$localUser->organization_id) {
                    $updates['organization_id'] = $org->id;
                }
                if (empty($localUser->name) && !empty($saasUser['name'])) {
                    $updates['name'] = $saasUser['name'];
                }
                $localUser->update($updates);
            }

            $staff = Staff::withoutGlobalScopes()->where('user_id', $localUser->id)->first();
            if (!$staff) {
                $staff = Staff::withoutGlobalScopes()->create([
                    'user_id'            => $localUser->id,
                    'organization_id'    => $org->id,
                    'role'               => $saasOrg['role'] ?? 'super_admin',
                    'hotel_name'         => $org->name,
                    'can_award_points'   => true,
                    'can_redeem_points'  => true,
                    'can_manage_offers'  => true,
                    'can_view_analytics' => true,
                ]);
            }

            // Best-effort entitlements sync from SaaS bootstrap endpoint.
            if ($saasToken) {
                try {
                    $bootstrap = \Illuminate\Support\Facades\Http::withToken($saasToken)->timeout(5)
                        ->acceptJson()->get(rtrim($saasApi, '/') . '/tools/bootstrap');
                    if ($bootstrap->successful()) {
                        $bs  = $bootstrap->json();
                        $sub = $bs['subscription'] ?? null;
                        if ($sub) {
                            $org->plan_slug           = $sub['plan']['slug'] ?? $org->plan_slug;
                            $org->subscription_status = $sub['status'] ?? 'TRIALING';
                            $org->trial_end           = $sub['trialEnd'] ?? $org->trial_end;
                            $org->period_end          = $sub['currentPeriodEnd'] ?? $org->period_end;
                        }
                        $org->entitled_products      = $bs['entitled_product_slugs'] ?? ($org->entitled_products ?? []);
                        $org->plan_features          = (array) ($bs['features'] ?? ($org->plan_features ?? []));
                        $org->entitlements_synced_at = now();
                        $org->save();
                    }
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        } catch (\Throwable $e) {
            report($e);
            return response()->json([
                'error' => 'Could not finish setting up your account: ' . $e->getMessage(),
            ], 500);
        }

        $localUser->refresh();
        $sanctumToken = $localUser->createToken('admin')->plainTextToken;

        return response()->json([
            'token' => $sanctumToken,
            'user'  => $localUser,
            'staff' => $staff,
        ]);
    }
}
