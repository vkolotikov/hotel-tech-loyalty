<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;
use App\Models\Referral;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;

/**
 * Referrals (release 7, spec 2026-10-25 §4.5): a friend who joins with a member's code, and the two bonuses for it.
 *
 * - At sign-up (`signedUp()`, inside the registration's transaction) the `referrals` row is written `pending`. A venue
 *   whose `referral_reward_on` is `signup` pays both bonuses there and then, as sign-up always did; with `first_visit`
 *   (the default) nothing is paid yet.
 * - The friend's first visit (`qualify()`, VisitRecorder calls it on every visit) pays both: the referrer's
 *   `referrer_bonus_points` and the friend's `referee_bonus_points`, type `referral`, keys `referral_{id}_referrer` and
 *   `referral_{id}_referee`; the row is stamped `qualified_at` and `rewarded_at` and ends `rewarded`.
 * - `referral_enabled` off: sign-up ignores a code (`referrerFor()` finds nobody), and a pending referral waits — it is
 *   paid at a visit once referrals are on again.
 *
 * A referral pays once: the row is taken from `pending` by one conditional update, and each bonus has its own key. A
 * referee who is the referrer, a referrer or referee outside the organisation, or a second referral of a referee
 * already rewarded pays nothing. The `referrals` row's own organisation column is not relied on: both members are
 * looked up in the organisation. Points only through LoyaltyService.
 */
class ReferralRewards
{
    public const PENDING = 'pending';
    public const QUALIFIED = 'qualified';
    public const REWARDED = 'rewarded';

    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    /**
     * The member whose code a new member signs up with: this organisation's, while the venue's referrals are on. Null
     * for no code, an unknown one, or referrals off — sign-up then ignores the code.
     */
    public function referrerFor(int $orgId, ?string $code): ?LoyaltyMember
    {
        $code = trim((string) $code);
        if ($code === '' || !ProgrammeOptions::get($orgId, 'referral_enabled')) {
            return null;
        }

        return LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('referral_code', $code)
            ->first();
    }

    /**
     * A new member joined with the referrer's code: the referral row, paid at once when the venue rewards at sign-up.
     * Called inside the registration's transaction, so a failed bonus undoes the sign-up as before.
     */
    public function signedUp(LoyaltyMember $referee, LoyaltyMember $referrer): ?Referral
    {
        $orgId = (int) $referee->organization_id;
        if ((int) $referrer->id === (int) $referee->id || (int) $referrer->organization_id !== $orgId) {
            return null;
        }

        $referral = $this->underOrg($orgId, fn () => Referral::create([
            'organization_id'         => $orgId,
            'referrer_id'             => $referrer->id,
            'referee_id'              => $referee->id,
            'status'                  => self::PENDING,
            'referrer_points_awarded' => 0,
            'referee_points_awarded'  => 0,
        ]));

        if (ProgrammeOptions::get($orgId, 'referral_reward_on') === 'signup') {
            $this->reward($referral, $orgId, 'signup');
        }

        return $referral->fresh();
    }

    /**
     * The referee's visit qualifies their pending referral: both bonuses paid. True when one was rewarded now.
     *
     * Cheap on every visit: a member who joined with nobody's code (`referred_by` empty) costs no query, and one who
     * did costs one lookup by the (referrer, referee) unique index. Every statement runs inside a transaction (a
     * savepoint in a caller's), so on PostgreSQL a failing one never aborts the caller's.
     */
    public function qualify(LoyaltyMember $member, Visit $visit): bool
    {
        $referrerId = (int) $member->referred_by;
        if ($referrerId === 0 || $referrerId === (int) $member->id) {
            return false;
        }
        $orgId = (int) $member->organization_id;

        return (bool) DB::transaction(function () use ($member, $referrerId, $orgId) {
            $referral = Referral::withoutGlobalScopes()
                ->where('referrer_id', $referrerId)
                ->where('referee_id', $member->id)
                ->where('status', self::PENDING)
                ->first();
            if ($referral === null || !ProgrammeOptions::get($orgId, 'referral_enabled')) {
                return false;
            }

            return $this->reward($referral, $orgId, 'first_visit');
        });
    }

    /**
     * Pays a pending referral's two bonuses and marks it rewarded, in one transaction: the referee's row locked first,
     * the referral taken from `pending` by a conditional update (a second visit at the same moment finds it taken),
     * then each bonus under its own key. Nothing is paid for a referral of a member to themselves, across
     * organisations, or for a referee already rewarded through another referral.
     */
    private function reward(Referral $referral, int $orgId, string $on): bool
    {
        return $this->underOrg($orgId, fn () => DB::transaction(function () use ($referral, $orgId, $on) {
            $referee = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($referral->referee_id)
                ->lockForUpdate()->first();
            $referrer = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($referral->referrer_id)->first();
            if (!$referee || !$referrer || (int) $referee->id === (int) $referrer->id) {
                return false;
            }
            $already = Referral::withoutGlobalScopes()
                ->where('referee_id', $referee->id)
                ->where('id', '!=', $referral->id)
                ->whereIn('status', [self::QUALIFIED, self::REWARDED])
                ->exists();
            if ($already) {
                return false;
            }

            $taken = Referral::withoutGlobalScopes()->whereKey($referral->id)->where('status', self::PENDING)
                ->update(['status' => self::QUALIFIED, 'qualified_at' => now()]);
            if ($taken === 0) {
                return false;
            }

            $options = ProgrammeOptions::for($orgId);
            $referrerBonus = (int) $options['referrer_bonus_points'];
            $refereeBonus = (int) $options['referee_bonus_points'];
            $name = (string) ($referee->user?->name ?? 'A friend');

            if ($referrerBonus > 0) {
                $this->loyalty->awardPoints(
                    $referrer,
                    $referrerBonus,
                    $on === 'signup' ? "Referral: {$name} joined" : "Referral: {$name}'s first visit",
                    'referral',
                    referenceType: 'referral',
                    referenceId: (int) $referral->id,
                    reasonCode: 'referral',
                    idempotencyKey: "referral_{$referral->id}_referrer",
                );
            }
            if ($refereeBonus > 0) {
                $this->loyalty->awardPoints(
                    $referee,
                    $refereeBonus,
                    $on === 'signup' ? 'Referral bonus for joining via referral' : 'Referral bonus for your first visit',
                    'referral',
                    referenceType: 'referral',
                    referenceId: (int) $referral->id,
                    reasonCode: 'referral',
                    idempotencyKey: "referral_{$referral->id}_referee",
                );
            }

            Referral::withoutGlobalScopes()->whereKey($referral->id)->update([
                'status'                  => self::REWARDED,
                'referrer_points_awarded' => max(0, $referrerBonus),
                'referee_points_awarded'  => max(0, $refereeBonus),
                'rewarded_at'             => now(),
            ]);

            return true;
        }));
    }

    /** Run $fn with the organisation bound (the ledger's rows take it), then restore whatever was bound before. */
    private function underOrg(int $orgId, callable $fn): mixed
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if ((int) $prior === $orgId) {
            return $fn();
        }
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            if ($prior !== null) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }
}
