<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\Loyalty\Credit\CreditLedger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Deleting a member, which anonymises rather than removes (spec 2026-10-21 release 2 §4.1, owner decision R2-4): the
 * one writer the full admin's `MemberAdminController@destroy` and HexaTech Loyalty's Delete call. Moved here from the
 * controller.
 *
 * What goes: the person's name (now "Deleted Member"), email (a stub that can never receive mail), phone, nationality,
 * photo, date of birth (R2-4: the full admin kept it before), password, every sign-in token, the push token, the QR
 * token and the NFC cards; the account is switched off. What stays: the member number, the referral code, the points
 * history, bookings and the CRM guest link, so the ledger and the reports still add up. Release 7: the cashback credit
 * ledger stays too, and its balance is forfeited (a line to zero, audited).
 *
 * A member is recognised as deleted by that stub email, which names the member's own id and nothing else can carry
 * (`isErased`). The audit row is written once the deletion has succeeded (the full admin wrote it before, and kept it
 * when the deletion failed).
 */
final class MemberErasure
{
    public const ERASED_NAME = 'Deleted Member';

    /** The stub address a deleted member's account carries. */
    public static function stubEmail(int $memberId): string
    {
        return "deleted-member-{$memberId}@deleted.local";
    }

    public static function isErased(LoyaltyMember $member): bool
    {
        return $member->user !== null && $member->user->email === self::stubEmail((int) $member->id);
    }

    /**
     * The stub address a member's own account deletion (the app's and the portal's `DELETE member/account`) gives the
     * account: it names the user's own id and the moment, and can never receive mail.
     */
    public static function selfDeletedEmail(int $userId): string
    {
        return "deleted-{$userId}-" . time() . '@deleted.local';
    }

    /**
     * Whether the member deleted their own account (release 7: cashback credit is forfeited then, and earns, spends and
     * is corrected no more). Recognised by that stub address with the account's own user id — the form self-deletion has
     * always written — whatever happened to the membership after it. Not isErased(): the workspace's screens keep
     * treating such a member as they always have.
     */
    public static function isSelfDeleted(LoyaltyMember $member): bool
    {
        $email = $member->user?->email;

        return is_string($email) && $member->user_id !== null
            && preg_match('/^deleted-' . (int) $member->user_id . '-\d+@deleted\.local$/', $email) === 1;
    }

    public function erase(LoyaltyMember $member, User $by): LoyaltyMember
    {
        $user = $member->user;
        $number = $member->member_number;
        $email = $user?->email;
        $name = $user?->name;

        DB::transaction(function () use ($user, $member, $by) {
            // Release 7 (spec 2026-10-25 §3): the cashback credit is forfeited — an `adjust` line to zero, audited
            // `credit.forfeited_on_erasure` — and its ledger rows stay (money records). The ledger writes it, under the
            // member row's lock, in a savepoint of this transaction: an erasure that fails keeps the balance.
            if (Schema::hasTable('credit_transactions') && Schema::hasColumn('loyalty_members', 'credit_balance')) {
                app(CreditLedger::class)->forfeitOnErasure($member, $by);
            }

            // Every session and API token: the member app's sign-in answers 401 from now on.
            if ($user) {
                try {
                    $user->tokens()->delete();
                } catch (\Throwable) {
                }
            }

            // Physical cards must not open the anonymised account any more.
            try {
                NfcCard::where('member_id', $member->id)->delete();
            } catch (\Throwable) {
            }

            $member->update([
                'is_active'       => false,
                // NOT NULL and unique in production (2024_01_01_000003): a fresh random value, so the old QR code and
                // wallet pass stop naming the member (null was refused by PostgreSQL and the erasure failed).
                'qr_code_token'   => 'erased-' . Str::random(48),
                'expo_push_token' => null,
            ]);

            $user?->forceFill([
                'name'          => self::ERASED_NAME,
                'email'         => self::stubEmail((int) $member->id),
                'phone'         => null,
                'nationality'   => null,
                'avatar_url'    => null,
                'date_of_birth' => null,
                'password'      => bcrypt(Str::random(40)),
            ])->save();
        });

        AuditLog::record('member_deleted', $member, [],
            ['member_number' => $number, 'email' => $email, 'name' => $name],
            $by, "Member #{$number} ({$email}) anonymised");
        // Release 9: the places the member held at events go back (EventSignUp, the only writer of sign-ups). After the
        // erasure, never failing it: a sign-up left standing only holds a place.
        try {
            app(\App\Services\Loyalty\Events\EventSignUp::class)->releaseAll($member, \App\Services\Loyalty\Events\EventSignUp::STAFF, $by);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('member erasure: event sign-ups not released', ['member_id' => $member->id, 'error' => $e->getMessage()]);
        }
        AnalyticsService::clearDashboardCache();

        return $member;
    }
}
