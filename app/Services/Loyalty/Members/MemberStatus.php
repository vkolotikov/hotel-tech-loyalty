<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\Loyalty\LoyaltyRefused;

/**
 * Switching a member's account off and on again (spec 2026-10-21 release 2 §4.1): the one writer HexaTech Loyalty's
 * Deactivate and Reactivate and the full admin's toggle (`MemberAdminController@deactivate`) call. Each is idempotent:
 * asking for the state the member is already in writes nothing and audits nothing. A change is audited as the full
 * admin always audited it (`member_deactivated` / `member_reactivated`, the member's number in the sentence).
 *
 * Off, the member keeps everything; the app and the desk's Scan refuse them (`inactive`) until they are on again.
 */
final class MemberStatus
{
    /**
     * A switched-off member's own requests that spend or earn something — redeeming a reward, claiming an offer,
     * asking for a benefit — are refused, as the desk refuses them (security review, 2026-11-04: before then the app
     * and the portal still let them). Reading their card, points and history stays open.
     *
     * @throws LoyaltyRefused `member_inactive` (403)
     */
    public static function assertActive(?LoyaltyMember $member): void
    {
        if ($member !== null && !$member->is_active) {
            throw new LoyaltyRefused('member_inactive', 'This membership is switched off. Please contact the venue.', 403);
        }
    }

    public static function assertMembershipBenefits(?LoyaltyMember $member): void
    {
        self::assertActive($member);
        if ($member !== null && !MembershipValidity::benefitsAvailable($member)) {
            $scheduled = MembershipValidity::summaryFor($member)['state'] === MembershipValidity::SCHEDULED;
            throw new LoyaltyRefused($scheduled ? 'membership_not_started' : 'membership_expired',
                $scheduled ? 'This membership has not started yet.' : 'This membership has ended.', 403);
        }
    }

    public function deactivate(LoyaltyMember $member, User $by): LoyaltyMember
    {
        return $this->set($member, false, $by);
    }

    public function reactivate(LoyaltyMember $member, User $by): LoyaltyMember
    {
        return $this->set($member, true, $by);
    }

    private function set(LoyaltyMember $member, bool $active, User $by): LoyaltyMember
    {
        $was = (bool) $member->is_active;
        if ($was === $active) {
            return $member;
        }

        $member->update(['is_active' => $active]);

        AuditLog::record(
            $active ? 'member_reactivated' : 'member_deactivated',
            $member,
            ['is_active' => $active],
            ['is_active' => $was],
            $by,
            "Member #{$member->member_number} " . ($active ? 'reactivated' : 'deactivated'),
        );
        AnalyticsService::clearDashboardCache();

        return $member;
    }
}
