<?php

namespace App\Services\Loyalty\Members;

use App\Models\LoyaltyMember;
use App\Models\User;

/**
 * Whether a membership's sign-in account is this organisation's own member account (security review, 2026-11-04).
 *
 * Before that review, `GuestMemberLinkService::ensureMemberForGuest()` wrapped ANY account with the guest's address in a
 * membership here — another venue's member, or a staff login of any organisation (`users` has no tenant scope). Editing,
 * erasing or merging such a member then changed, anonymised or deleted an account that is not this venue's: an
 * organisation could change another organisation's owner's email, reset its password and sign in as them. Every writer
 * of a member's account asks this first, and `php artisan loyalty:foreign-accounts` lists (and detaches) such links.
 */
final class OwnAccount
{
    public static function holds(LoyaltyMember $member): bool
    {
        $user = $member->relationLoaded('user') ? $member->user : $member->user()->first();

        return $user instanceof User && self::is($user, (int) $member->getAttribute('organization_id'));
    }

    /** A member account (never a staff login) of this organisation. */
    public static function is(User $user, int $organizationId): bool
    {
        return $user->user_type === 'member' && (int) $user->organization_id === $organizationId;
    }
}
