<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\GuestMemberLinkService;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use App\Services\OpenAiService;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class MemberAdminController extends Controller
{
    public function __construct(
        protected LoyaltyService $loyaltyService,
        protected NotificationService $notificationService,
        protected OpenAiService $openAi,
        protected QrCodeService $qrCode,
        protected GuestMemberLinkService $linkService,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'phone'    => 'nullable|string|max:20',
            'tier_id'  => 'nullable|exists:loyalty_tiers,id',
            'nfc_uid'  => 'nullable|string|max:100',
        ]);

        $user = User::create([
            'name'      => $validated['name'],
            'email'     => $validated['email'],
            'password'  => Hash::make($validated['password']),
            'phone'     => $validated['phone'] ?? null,
            'user_type' => 'member',
        ]);

        $tier = !empty($validated['tier_id'])
            ? LoyaltyTier::find($validated['tier_id'])
            : LoyaltyTier::where('name', 'Bronze')->first();

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

        // Regenerate proper QR token now that the member exists
        $this->qrCode->generateToken($member);

        // Link NFC card if UID provided
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

        // Award welcome bonus
        $this->loyaltyService->awardPoints($member, (int) HotelSetting::getValue('welcome_bonus_points', 500), 'Welcome bonus — registered by staff', 'bonus');

        // Auto-link existing CRM guests by email
        $this->linkService->linkMemberToGuests($member);

        return response()->json([
            'message' => 'Member created successfully',
            'member'  => $member->load(['user', 'tier']),
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $query = LoyaltyMember::with(['user:id,name,email,phone,avatar_url', 'tier:id,name,color_hex'])
            ->when($request->search, function ($q, $search) {
                $q->whereHas('user', fn($u) => $u->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"))
                  ->orWhere('member_number', 'like', "%{$search}%");
            })
            ->when($request->tier_id, fn($q, $tierId) => $q->where('tier_id', $tierId))
            ->when($request->is_active !== null, fn($q) => $q->where('is_active', $request->boolean('is_active')));

        return response()->json(
            $query->orderByDesc('created_at')->paginate($request->get('per_page', 25))
        );
    }

    public function show(int $id): JsonResponse
    {
        $member = LoyaltyMember::with([
            'user', 'tier',
            'pointsTransactions' => fn($q) => $q->latest()->limit(20),
            'bookings'           => fn($q) => $q->latest()->limit(10),
            'nfcCards',
            'guests' => fn($q) => $q->with([
                'reservations' => fn($r) => $r->with('property:id,name,code')->latest('check_in')->limit(10),
                'inquiries'    => fn($r) => $r->with('property:id,name,code')->latest()->limit(10),
            ]),
        ])->findOrFail($id);

        $stats = [
            'total_bookings' => $member->bookings->count(),
            'total_spent'    => $member->bookings->sum('total_amount'),
        ];

        // Aggregate CRM guest data for linked guests
        $linkedGuest = $member->guests->first();
        $guestData = null;
        if ($linkedGuest) {
            $guestData = [
                'id'              => $linkedGuest->id,
                'full_name'       => $linkedGuest->full_name,
                'vip_level'       => $linkedGuest->vip_level,
                'total_stays'     => $linkedGuest->total_stays,
                'total_nights'    => $linkedGuest->total_nights,
                'total_revenue'   => $linkedGuest->total_revenue,
                'last_stay_date'  => $linkedGuest->last_stay_date,
                'company'         => $linkedGuest->company,
                'nationality'     => $linkedGuest->nationality,
                'reservations'    => $linkedGuest->reservations,
                'inquiries'       => $linkedGuest->inquiries,
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
            $path = $request->file('avatar')->store('avatars', 'public');
            $userFields['avatar_url'] = '/storage/' . $path;
        }

        if (!empty($userFields)) {
            $member->user->update($userFields);
        }

        return response()->json([
            'message' => 'Member updated',
            'member'  => $member->fresh(['user', 'tier']),
        ]);
    }

    public function awardPoints(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'member_id'       => 'required|exists:loyalty_members,id',
            'points'          => 'required|integer|min:1|max:100000',
            'description'     => 'required|string|max:255',
            'type'            => 'nullable|in:earn,bonus,adjust',
            'reason_code'     => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:255',
        ]);

        $member = LoyaltyMember::findOrFail($validated['member_id']);
        $points = $validated['points'];

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

        $this->notificationService->sendPointsEarned($member->fresh(), $points);

        $message = $approvalStatus === 'pending_approval'
            ? 'Points submitted for approval'
            : 'Points awarded';

        return response()->json(['message' => $message, 'transaction' => $transaction]);
    }

    public function redeemPoints(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'member_id'       => 'required|exists:loyalty_members,id',
            'points'          => 'required|integer|min:1',
            'description'     => 'required|string|max:255',
            'idempotency_key' => 'nullable|string|max:255',
        ]);

        $member = LoyaltyMember::findOrFail($validated['member_id']);

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
