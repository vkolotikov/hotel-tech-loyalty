<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\AnalyticsService;

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
