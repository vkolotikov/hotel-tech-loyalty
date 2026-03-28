<?php

namespace App\Services;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\User;

class GuestMemberLinkService
{
    /**
     * Try to link a guest to a loyalty member by email match.
     * Called when a guest is created or updated.
     */
    public function linkGuestToMember(Guest $guest): bool
    {
        if ($guest->member_id) return false; // already linked

        $email = Guest::normalizeEmailKey($guest->email);
        if (!$email) return false;

        $user = User::where('email', $email)->where('user_type', 'member')->first();
        if (!$user) return false;

        $member = $user->loyaltyMember;
        if (!$member) return false;

        $guest->update([
            'member_id'   => $member->id,
            'loyalty_tier' => $member->tier?->name,
            'loyalty_id'  => $member->member_number,
        ]);

        return true;
    }

    /**
     * Try to link existing guests to a newly created member by email match.
     * Called when a member registers or is created by admin.
     */
    public function linkMemberToGuests(LoyaltyMember $member): int
    {
        $user = $member->user;
        if (!$user || !$user->email) return 0;

        $emailKey = Guest::normalizeEmailKey($user->email);
        if (!$emailKey) return 0;

        $count = Guest::whereNull('member_id')
            ->where('email_key', $emailKey)
            ->update([
                'member_id'   => $member->id,
                'loyalty_tier' => $member->tier?->name,
                'loyalty_id'  => $member->member_number,
            ]);

        return $count;
    }

    /**
     * Backfill: link all unlinked guests that have matching member emails.
     */
    public function backfillAll(): array
    {
        $linked = 0;
        $checked = 0;

        $unlinkedGuests = Guest::whereNull('member_id')
            ->whereNotNull('email_key')
            ->where('email_key', '!=', '')
            ->get();

        $checked = $unlinkedGuests->count();

        // Build lookup of member emails
        $membersByEmail = User::where('user_type', 'member')
            ->whereHas('loyaltyMember')
            ->with('loyaltyMember.tier')
            ->get()
            ->keyBy(fn($u) => strtolower(trim($u->email)));

        foreach ($unlinkedGuests as $guest) {
            $user = $membersByEmail->get($guest->email_key);
            if ($user && $user->loyaltyMember) {
                $guest->update([
                    'member_id'   => $user->loyaltyMember->id,
                    'loyalty_tier' => $user->loyaltyMember->tier?->name,
                    'loyalty_id'  => $user->loyaltyMember->member_number,
                ]);
                $linked++;
            }
        }

        return ['checked' => $checked, 'linked' => $linked];
    }
}
