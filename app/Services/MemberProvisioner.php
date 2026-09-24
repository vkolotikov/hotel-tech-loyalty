<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Finds or creates the loyalty_member row a member-type user should have.
 *
 * Both the portal bootstrap and the profile endpoint call this on every
 * request; most calls just find the existing row. The row is missing only
 * for legacy accounts that predate the transactional register flow, or a
 * User an admin created without enrolling — that path creates it.
 * loyalty_members.user_id carries no unique constraint, so two first
 * requests arriving together (portal startup and the mobile app's profile
 * call, say) could otherwise both insert; the creation path re-checks
 * under a per-user lock before writing.
 */
final class MemberProvisioner
{
    public function __construct(private QrCodeService $qr)
    {
    }

    /** Null when the user isn't a member, or the organisation has no active tier. */
    public function ensureForUser(User $user): ?LoyaltyMember
    {
        if ($user->user_type !== 'member' || !$user->organization_id) {
            return null;
        }

        if (!app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $member = $user->loyaltyMember()->first();
        if ($member) {
            return $member->fresh(['tier', 'user']);
        }

        $lock = Cache::lock("member-provision:{$user->id}", 10);
        try {
            $lock->block(5);

            // Another request may have created the row while we waited.
            $member = $user->loyaltyMember()->first();
            if ($member) {
                return $member->fresh(['tier', 'user']);
            }

            $tier = LoyaltyTier::withoutGlobalScopes()
                ->where('organization_id', $user->organization_id)
                ->where('is_active', true)
                ->orderBy('min_points')
                ->first();

            if (!$tier) {
                return null;
            }

            $member = LoyaltyMember::create([
                'user_id'       => $user->id,
                'tier_id'       => $tier->id,
                'member_number' => $this->qr->generateMemberNumber(),
                'qr_code_token' => hash_hmac('sha256', $user->id . now()->timestamp, config('app.key')),
                'referral_code' => $this->qr->generateReferralCode(),
                'joined_at'     => $user->created_at ?? now(),
                'is_active'     => true,
            ]);

            // A bare create() result only carries what we set — fresh()
            // reloads it so the first payload has the DB's own defaults
            // (current_points 0, not null) and the tier/user relations.
            return $member->fresh(['tier', 'user']);
        } finally {
            optional($lock)->release();
        }
    }
}
