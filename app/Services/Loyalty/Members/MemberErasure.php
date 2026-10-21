<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\User;
use App\Services\AnalyticsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Deleting a member, which anonymises rather than removes (spec 2026-10-21 release 2 §4.1, owner decision R2-4): the
 * one writer the full admin's `MemberAdminController@destroy` and HexaTech Loyalty's Delete call. Moved here from the
 * controller.
 *
 * What goes: the person's name (now "Deleted Member"), email (a stub that can never receive mail), phone, nationality,
 * photo, date of birth (R2-4: the full admin kept it before), password, every sign-in token, the push token, the QR
 * token and the NFC cards; the account is switched off. What stays: the member number, the referral code, the points
 * history, bookings and the CRM guest link, so the ledger and the reports still add up.
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

    public function erase(LoyaltyMember $member, User $by): LoyaltyMember
    {
        $user = $member->user;
        $number = $member->member_number;
        $email = $user?->email;
        $name = $user?->name;

        DB::transaction(function () use ($user, $member) {
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
                'qr_code_token'   => null,
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
        AnalyticsService::clearDashboardCache();

        return $member;
    }
}
