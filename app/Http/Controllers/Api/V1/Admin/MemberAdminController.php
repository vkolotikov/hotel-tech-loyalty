<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\GuestMemberLinkService;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use App\Services\OpenAiService;
use App\Services\AnalyticsService;
use App\Services\QrCodeService;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MemberAdminController extends Controller
{
    public function __construct(
        protected LoyaltyService $loyaltyService,
        protected NotificationService $notificationService,
        protected OpenAiService $openAi,
        protected QrCodeService $qrCode,
        protected GuestMemberLinkService $linkService,
        protected RealtimeEventService $realtime,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            // Password is now OPTIONAL — when omitted, the member gets a
            // welcome email with a 6-digit code they use to set their own
            // password via the standard password-reset flow.
            'password' => 'nullable|string|min:8',
            'phone'    => 'nullable|string|max:20',
            'tier_id'  => 'nullable|exists:loyalty_tiers,id',
            'nfc_uid'  => 'nullable|string|max:100',
            'send_welcome_email' => 'nullable|boolean',
        ]);

        $tier = !empty($validated['tier_id'])
            ? LoyaltyTier::find($validated['tier_id'])
            : (LoyaltyTier::where('name', 'Bronze')->first()
                ?? LoyaltyTier::orderBy('min_points')->first());

        if (!$tier) {
            return response()->json([
                'message' => 'No loyalty tiers configured for this organization. Create at least one tier (e.g. Bronze) before enrolling members.',
            ], 422);
        }

        $useInviteFlow = empty($validated['password']);
        $welcomeBonus = (int) HotelSetting::getValue('welcome_bonus_points', 500);
        $sendEmail = $request->boolean('send_welcome_email', $useInviteFlow);

        try {
            $result = \DB::transaction(function () use ($validated, $request, $tier, $useInviteFlow, $welcomeBonus) {
                $user = User::create([
                    'name'      => $validated['name'],
                    'email'     => $validated['email'],
                    // Use a random password when admin didn't provide one —
                    // the user will reset it via the welcome-email code.
                    'password'  => Hash::make($validated['password'] ?? \Illuminate\Support\Str::random(40)),
                    'phone'     => $validated['phone'] ?? null,
                    'user_type' => 'member',
                ]);

                $member = LoyaltyMember::create([
                    'user_id'        => $user->id,
                    'tier_id'        => $tier->id,
                    'member_number'  => $this->qrCode->generateMemberNumber(),
                    'qr_code_token'  => \Illuminate\Support\Str::random(64),
                    'referral_code'  => $this->qrCode->generateReferralCode(),
                    'lifetime_points'=> 0,
                    'current_points' => 0,
                    'is_active'      => true,
                    'joined_at'      => now(),
                ]);

                $this->qrCode->generateToken($member);

                if (!empty($validated['nfc_uid'])) {
                    $nfcUid = $validated['nfc_uid'];
                    \App\Models\NfcCard::create([
                        'member_id' => $member->id,
                        'uid'       => $nfcUid,
                        'card_type' => 'NTAG213',
                        'issued_at' => now(),
                        'issued_by' => $request->user()->id,
                        'is_active' => true,
                    ]);
                    $member->update(['qr_code_token' => $nfcUid]);
                }

                // Award welcome bonus INSIDE the transaction so a failure rolls
                // everything back — no more orphaned zero-point members.
                if ($welcomeBonus > 0) {
                    $this->loyaltyService->awardPoints(
                        $member,
                        $welcomeBonus,
                        'Welcome bonus — registered by staff',
                        'bonus',
                        $request->user(),
                    );
                }

                // Generate an invite code (48h) if we're using the email flow.
                $inviteCode = null;
                if ($useInviteFlow) {
                    \App\Models\EmailVerificationCode::where('email', $user->email)
                        ->whereNull('verified_at')
                        ->delete();

                    $inviteCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                    \App\Models\EmailVerificationCode::create([
                        'email'      => $user->email,
                        'code'       => $inviteCode,
                        'expires_at' => now()->addHours(48),
                    ]);
                }

                return ['member' => $member, 'invite_code' => $inviteCode];
            });

            $member = $result['member'];
            $inviteCode = $result['invite_code'];
        } catch (\Throwable $e) {
            \Log::error('Member store failed', [
                'error'     => $e->getMessage(),
                'file'      => $e->getFile() . ':' . $e->getLine(),
                'org_bound' => app()->bound('current_organization_id'),
                'org_id'    => app()->bound('current_organization_id') ? app('current_organization_id') : null,
            ]);
            return response()->json([
                'message' => 'Failed to create member: ' . $e->getMessage(),
            ], 500);
        }

        // Fire-and-forget welcome email — failure here shouldn't 500 the
        // request (the member already exists; admin can resend later).
        $emailSent = false;
        if ($sendEmail && $inviteCode) {
            try {
                $org = \App\Models\Organization::find($member->organization_id);
                \Illuminate\Support\Facades\Mail::to($member->user->email)
                    ->send(new \App\Mail\WelcomeMemberMail($member->load(['user', 'tier']), $org, $inviteCode));
                $emailSent = true;
            } catch (\Throwable $e) {
                \Log::warning('Welcome email send failed', [
                    'member_id' => $member->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        try { $this->linkService->linkMemberToGuests($member); }
        catch (\Throwable $e) { \Log::warning('linkMemberToGuests failed', ['member_id' => $member->id, 'error' => $e->getMessage()]); }

        try {
            $this->realtime->dispatch('member', 'New Member Registered',
                "{$member->user->name} joined as {$tier->name}",
                ['id' => $member->id, 'name' => $member->user->name, 'tier' => $tier->name]
            );
        } catch (\Throwable $e) { \Log::warning('Realtime dispatch failed', ['error' => $e->getMessage()]); }

        try {
            AuditLog::record('member_created', $member,
                ['name' => $member->user->name, 'email' => $member->user->email, 'tier' => $tier->name],
                [], $request->user(), "Member '{$member->user->name}' created"
            );
        } catch (\Throwable $e) { \Log::warning('AuditLog::record failed', ['error' => $e->getMessage()]); }

        try { AnalyticsService::clearDashboardCache(); } catch (\Throwable $e) {}

        return response()->json([
            'message'      => $useInviteFlow
                ? ($emailSent
                    ? 'Member created. Welcome email sent — user will set their own password.'
                    : 'Member created, but the welcome email failed to send. You may need to share credentials manually.')
                : 'Member created successfully',
            'member'       => $member->load(['user', 'tier']),
            'invite_flow'  => $useInviteFlow,
            'email_sent'   => $emailSent,
        ], 201);
    }

    /**
     * Resend the welcome / set-password email to a member.
     * Generates a fresh 48h code each time.
     */
    public function resendWelcomeEmail(int $id): JsonResponse
    {
        $member = LoyaltyMember::with(['user', 'tier'])->findOrFail($id);

        if (!$member->user || !$member->user->email) {
            return response()->json(['message' => 'Member has no email on file'], 422);
        }

        \App\Models\EmailVerificationCode::where('email', $member->user->email)
            ->whereNull('verified_at')
            ->delete();

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        \App\Models\EmailVerificationCode::create([
            'email'      => $member->user->email,
            'code'       => $code,
            'expires_at' => now()->addHours(48),
        ]);

        try {
            $org = \App\Models\Organization::find($member->organization_id);
            \Illuminate\Support\Facades\Mail::to($member->user->email)
                ->send(new \App\Mail\WelcomeMemberMail($member, $org, $code));
        } catch (\Throwable $e) {
            \Log::error('Welcome email resend failed', [
                'member_id' => $member->id,
                'error'     => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not send email: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json(['message' => 'Welcome email sent to ' . $member->user->email]);
    }

    public function index(Request $request): JsonResponse
    {
        // Eager-load the linked CRM guest (if any) so the unified Members
        // table can render lead_source / lifecycle / company without a
        // second round-trip. Members and Guests are now one list — every
        // contact in the system shows up here.
        $query = LoyaltyMember::with([
                'user:id,name,email,phone,avatar_url',
                'tier:id,name,color_hex',
                'guests' => fn($q) => $q->select('id', 'member_id', 'lead_source', 'lifecycle_status', 'company', 'phone', 'mobile', 'last_activity_at')
                    ->latest('id')
                    ->limit(1),
            ])
            ->when($request->search, function ($q, $search) {
                $q->whereHas('user', fn($u) => $u->where('name', 'ILIKE', "%{$search}%")
                    ->orWhere('email', 'ILIKE', "%{$search}%"))
                  ->orWhere('member_number', 'ILIKE', "%{$search}%");
            })
            ->when($request->tier_id, fn($q, $tierId) => $q->where('tier_id', $tierId))
            ->when($request->tier, fn($q, $tierName) => $q->whereHas('tier', fn($t) => $t->where('name', $tierName)))
            ->when($request->lead_source, fn($q, $src) => $q->whereHas('guests', fn($g) => $g->where('lead_source', $src)))
            ->when($request->lifecycle, fn($q, $ls) => $q->whereHas('guests', fn($g) => $g->where('lifecycle_status', $ls)))
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')));

        return response()->json(
            $query->orderByDesc('created_at')->paginate($request->get('per_page', 25))
        );
    }

    public function show(int $id): JsonResponse
    {
        // Stats are computed via withCount/withSum so they reflect ALL bookings,
        // not just the limited 10 we eager-load for display. Previously
        // total_bookings/total_spent were capped at 10 because they were
        // counted/summed against the already-limited collection.
        $member = LoyaltyMember::with([
            'user', 'tier',
            'pointsTransactions' => fn($q) => $q->latest()->limit(20),
            'bookings'           => fn($q) => $q->latest()->limit(10),
            'nfcCards',
            'guests' => fn($q) => $q->with([
                'tags',
                'reservations' => fn($r) => $r->with('property:id,name,code')->latest('check_in')->limit(10),
                'inquiries'    => fn($r) => $r->with('property:id,name,code')->latest()->limit(10),
                'activities'   => fn($r) => $r->latest()->limit(10),
            ]),
        ])
            ->withCount('bookings')
            ->withSum('bookings as bookings_total_amount', 'total_amount')
            ->findOrFail($id);

        $stats = [
            'total_bookings' => (int) $member->bookings_count,
            'total_spent'    => (float) ($member->bookings_total_amount ?? 0),
        ];

        // Aggregate CRM guest data for linked guests
        $linkedGuest = $member->guests->first();
        $guestData = null;
        if ($linkedGuest) {
            $guestData = [
                'id'                  => $linkedGuest->id,
                'full_name'           => $linkedGuest->full_name,
                'first_name'          => $linkedGuest->first_name,
                'last_name'           => $linkedGuest->last_name,
                'vip_level'           => $linkedGuest->vip_level,
                'guest_type'          => $linkedGuest->guest_type,
                'lifecycle_status'    => $linkedGuest->lifecycle_status,
                'lead_source'         => $linkedGuest->lead_source,
                'importance'          => $linkedGuest->importance,
                'owner_name'          => $linkedGuest->owner_name,
                'total_stays'         => $linkedGuest->total_stays,
                'total_nights'        => $linkedGuest->total_nights,
                'total_revenue'       => $linkedGuest->total_revenue,
                'avg_daily_rate'      => $linkedGuest->avg_daily_rate,
                'first_stay_date'     => $linkedGuest->first_stay_date,
                'last_stay_date'      => $linkedGuest->last_stay_date,
                'last_activity_at'    => $linkedGuest->last_activity_at,
                'company'             => $linkedGuest->company,
                'position_title'      => $linkedGuest->position_title,
                'nationality'         => $linkedGuest->nationality,
                'country'             => $linkedGuest->country,
                'city'                => $linkedGuest->city,
                'address'             => $linkedGuest->address,
                'postal_code'         => $linkedGuest->postal_code,
                'preferred_language'  => $linkedGuest->preferred_language,
                'preferred_room_type' => $linkedGuest->preferred_room_type,
                'preferred_floor'     => $linkedGuest->preferred_floor,
                'dietary_preferences' => $linkedGuest->dietary_preferences,
                'special_needs'       => $linkedGuest->special_needs,
                'notes'               => $linkedGuest->notes,
                'tags'                => $linkedGuest->tags,
                'reservations'        => $linkedGuest->reservations,
                'inquiries'           => $linkedGuest->inquiries,
                'activities'          => $linkedGuest->activities,
            ];
        }

        return response()->json([
            'member'               => $member,
            'stats'                => $stats,
            'recent_transactions'  => $member->pointsTransactions,
            'progress'             => $member->getProgressToNextTier(),
            'linked_guest'         => $guestData,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $member = LoyaltyMember::findOrFail($id);
        $oldTierId = $member->tier_id;

        $validated = $request->validate([
            'is_active'         => 'sometimes|boolean',
            'marketing_consent' => 'sometimes|boolean',
            'tier_id'           => 'sometimes|exists:loyalty_tiers,id',
            'name'              => 'sometimes|string|max:255',
            'email'             => 'sometimes|email|unique:users,email,' . $member->user_id,
            'phone'             => 'nullable|string|max:20',
            'nationality'       => 'nullable|string|max:100',
            'language'          => 'nullable|string|max:10',
            'date_of_birth'     => 'nullable|date',
            'avatar'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:2048',
        ]);

        // Capture old values for audit
        $oldMemberValues = $member->only(['is_active', 'marketing_consent', 'tier_id']);
        $oldUserValues = $member->user->only(['name', 'email', 'phone', 'nationality', 'language', 'date_of_birth']);

        // Update member fields
        $memberFields = array_filter(
            $request->only(['is_active', 'marketing_consent', 'tier_id']),
            fn($v) => $v !== null
        );
        if (!empty($memberFields)) {
            $member->update($memberFields);
        }

        // Update user fields
        $userFields = array_filter(
            $request->only(['name', 'email', 'phone', 'nationality', 'language', 'date_of_birth']),
            fn($v) => $v !== null
        );

        // Handle avatar upload
        if ($request->hasFile('avatar')) {
            $userFields['avatar_url'] = \App\Services\MediaService::upload($request->file('avatar'), 'avatars');
        }

        if (!empty($userFields)) {
            $member->user->update($userFields);
        }

        // Audit: general member update
        $allChanges = array_merge($memberFields, $userFields);
        if (!empty($allChanges)) {
            AuditLog::record('member_updated', $member, $allChanges,
                array_merge($oldMemberValues, $oldUserValues),
                $request->user(), "Member #{$member->member_number} updated"
            );
        }

        // Audit: specific tier override
        if (isset($memberFields['tier_id']) && (int) $memberFields['tier_id'] !== (int) $oldTierId) {
            $oldTierName = LoyaltyTier::find($oldTierId)?->name ?? 'Unknown';
            $newTierName = LoyaltyTier::find($memberFields['tier_id'])?->name ?? 'Unknown';
            AuditLog::record('tier_override', $member,
                ['tier_id' => $memberFields['tier_id'], 'tier_name' => $newTierName],
                ['tier_id' => $oldTierId, 'tier_name' => $oldTierName],
                $request->user(), "Tier override: {$oldTierName} → {$newTierName}"
            );
        }

        AnalyticsService::clearDashboardCache();

        return response()->json([
            'message' => 'Member updated',
            'member'  => $member->fresh(['user', 'tier']),
        ]);
    }

    public function awardPoints(Request $request): JsonResponse
    {
        $staff = \App\Models\Staff::where('user_id', $request->user()->id)->first();
        if ($staff && !$staff->can_award_points) {
            return response()->json(['message' => 'You do not have permission to award points.'], 403);
        }

        $validated = $request->validate([
            'member_id'       => 'required|exists:loyalty_members,id',
            'points'          => 'required|integer|min:1|max:100000',
            'description'     => 'required|string|max:255',
            'type'            => 'nullable|in:earn,bonus,adjust',
            'reason_code'     => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:255',
        ]);

        $member = LoyaltyMember::with('user', 'tier')->findOrFail($validated['member_id']);
        $points = $validated['points'];

        try {
            // Approval workflow: if above threshold, mark as pending
            $approvalStatus = $this->loyaltyService->requiresApproval($points, $request->user())
                ? 'pending_approval'
                : 'auto_approved';

            $transaction = $this->loyaltyService->awardPoints(
                member:         $member,
                points:         $points,
                description:    $validated['description'],
                type:           $validated['type'] ?? 'earn',
                staff:          $request->user(),
                reasonCode:     $validated['reason_code'] ?? null,
                idempotencyKey: $validated['idempotency_key'] ?? null,
                approvalStatus: $approvalStatus,
            );
        } catch (\Throwable $e) {
            \Log::error('awardPoints failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return response()->json([
                'message' => 'Failed to award points: ' . $e->getMessage(),
            ], 500);
        }

        // Side effects — never break the main action if these fail
        try {
            $this->notificationService->sendPointsEarned($member->fresh(), $points);
        } catch (\Throwable $e) {
            \Log::warning('sendPointsEarned failed: ' . $e->getMessage());
        }

        try {
            $this->realtime->dispatch('points', 'Points Awarded',
                "+{$points} pts to " . ($member->user->name ?? 'member'),
                ['id' => $member->id, 'name' => $member->user->name ?? null, 'points' => $points, 'action' => 'award']
            );
        } catch (\Throwable $e) {
            \Log::warning('realtime dispatch failed: ' . $e->getMessage());
        }

        $message = $approvalStatus === 'pending_approval'
            ? 'Points submitted for approval'
            : 'Points awarded';

        return response()->json(['message' => $message, 'transaction' => $transaction]);
    }

    public function redeemPoints(Request $request): JsonResponse
    {
        $staff = \App\Models\Staff::where('user_id', $request->user()->id)->first();
        if ($staff && !$staff->can_redeem_points) {
            return response()->json(['message' => 'You do not have permission to redeem points.'], 403);
        }

        $validated = $request->validate([
            'member_id'       => 'required|exists:loyalty_members,id',
            'points'          => 'required|integer|min:1',
            'description'     => 'required|string|max:255',
            'idempotency_key' => 'nullable|string|max:255',
        ]);

        $member = LoyaltyMember::with('user', 'tier')->findOrFail($validated['member_id']);

        try {
            $transaction = $this->loyaltyService->redeemPoints(
                member:         $member,
                points:         $validated['points'],
                description:    $validated['description'],
                staff:          $request->user(),
                idempotencyKey: $validated['idempotency_key'] ?? null,
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            \Log::error('redeemPoints failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return response()->json(['message' => 'Failed to redeem points: ' . $e->getMessage()], 500);
        }

        try {
            $this->realtime->dispatch('points', 'Points Redeemed',
                "-{$validated['points']} pts from " . ($member->user->name ?? 'member'),
                ['id' => $member->id, 'name' => $member->user->name ?? null, 'points' => $validated['points'], 'action' => 'redeem']
            );
        } catch (\Throwable $e) {
            \Log::warning('realtime dispatch failed: ' . $e->getMessage());
        }

        return response()->json(['message' => 'Points redeemed', 'transaction' => $transaction]);
    }

    public function reverseTransaction(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'transaction_id' => 'required|exists:points_transactions,id',
            'reason'         => 'required|string|max:255',
        ]);

        $transaction = \App\Models\PointsTransaction::findOrFail($validated['transaction_id']);

        try {
            $reversal = $this->loyaltyService->reverseTransaction(
                $transaction,
                $validated['reason'],
                $request->user(),
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Transaction reversed', 'reversal' => $reversal]);
    }

    public function export(Request $request): StreamedResponse
    {
        $query = LoyaltyMember::with(['user:id,name,email,phone', 'tier:id,name'])
            ->when($request->search, function ($q, $search) {
                $q->whereHas('user', fn($u) => $u->where('name', 'ILIKE', "%{$search}%")
                    ->orWhere('email', 'ILIKE', "%{$search}%"))
                  ->orWhere('member_number', 'ILIKE', "%{$search}%");
            })
            ->when($request->tier_id, fn($q, $tierId) => $q->where('tier_id', $tierId))
            ->when($request->tier, fn($q, $tierName) => $q->whereHas('tier', fn($t) => $t->where('name', $tierName)))
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderByDesc('created_at');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['ID','Member Number','Name','Email','Phone','Tier','Current Points','Lifetime Points','Active','Joined']);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $m) {
                    fputcsv($out, [
                        $m->id, $m->member_number, $m->user?->name, $m->user?->email, $m->user?->phone,
                        $m->tier?->name, $m->current_points, $m->lifetime_points,
                        $m->is_active ? 'Yes' : 'No', $m->joined_at?->toDateString(),
                    ]);
                }
            });
            fclose($out);
        }, 'members-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    public function aiInsights(int $id): JsonResponse
    {
        $member = LoyaltyMember::with(['tier', 'bookings', 'pointsTransactions', 'user'])->findOrFail($id);

        $churnScore = $this->openAi->predictChurn($member);
        $personalOffer = $this->openAi->personalizeOffer($member);
        $upsell = $this->openAi->suggestUpsell($member);

        return response()->json([
            'churn_risk'           => $churnScore,
            'personalized_offer'   => $personalOffer,
            'upsell_suggestion'    => $upsell,
        ]);
    }
}
