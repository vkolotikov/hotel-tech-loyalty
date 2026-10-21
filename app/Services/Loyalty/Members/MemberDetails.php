<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\MediaService;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;

/**
 * A member's details and tier: the one writer the full admin's `MemberAdminController@update` and HexaTech Loyalty's
 * Edit details and Change tier call (spec 2026-10-21 release 2 §4.3). Moved here unchanged from the controller, which
 * keeps its avatar upload and its answer.
 *
 * A tier change resets the tier's dates (from today, until and reviewed a year on), so the app's progress and expiry
 * are not left on the old tier's schedule, and is audited twice: `member_updated` with every field written and
 * `tier_override` naming both tiers. A tier is looked up through the tenant scope: the full admin's `exists:` rule
 * passes another organisation's id.
 */
final class MemberDetails
{
    /** The member's own fields this writer takes (`loyalty_members`). */
    public const MEMBER_FIELDS = ['is_active', 'marketing_consent', 'tier_id', 'tier_override_until'];
    /** The person's fields (`users`); name and email are never cleared, the others may be. */
    public const USER_FIELDS = ['name', 'email', 'phone', 'nationality', 'language', 'date_of_birth'];
    /** The languages the workspace offers for a member (the member portal's and the workspace's five). */
    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    /**
     * Write what was sent. `$member` holds only keys of MEMBER_FIELDS, `$user` of USER_FIELDS (a key present with
     * null clears the field); the avatar, when given, is uploaded after the tier is checked.
     *
     * @throws LoyaltyRefused `bad_tier` (422) for a tier that is not this organisation's
     */
    public function update(LoyaltyMember $target, array $member, array $user, User $by, ?UploadedFile $avatar = null): LoyaltyMember
    {
        $oldTierId = $target->tier_id;
        $target->loadMissing('user');
        $oldMemberValues = $target->only(self::MEMBER_FIELDS);
        $oldUserValues = $target->user?->only(self::USER_FIELDS) ?? [];

        if (isset($member['tier_id']) && !LoyaltyTier::find($member['tier_id'])) {
            throw new LoyaltyRefused('bad_tier', 'Invalid tier for this organization.', 422);
        }
        $tierChanged = isset($member['tier_id']) && (int) $member['tier_id'] !== (int) $oldTierId;
        if ($tierChanged) {
            $member['tier_effective_from'] = now()->toDateString();
            $member['tier_effective_until'] = now()->addYear()->toDateString();
            $member['tier_review_date'] = now()->addYear()->toDateString();
        }

        if ($member !== []) {
            $target->update($member);
        }

        if ($avatar) {
            $user['avatar_url'] = MediaService::upload($avatar, 'avatars');
        }
        if ($user !== [] && $target->user) {
            $target->user->update($user);
        }

        $changes = array_merge($member, $user);
        if ($changes !== []) {
            AuditLog::record('member_updated', $target, $changes, array_merge($oldMemberValues, $oldUserValues),
                $by, "Member #{$target->member_number} updated");
        }
        if ($tierChanged) {
            $oldName = LoyaltyTier::find($oldTierId)?->name ?? 'Unknown';
            $newName = LoyaltyTier::find($member['tier_id'])?->name ?? 'Unknown';
            AuditLog::record('tier_override', $target,
                ['tier_id' => $member['tier_id'], 'tier_name' => $newName],
                ['tier_id' => $oldTierId, 'tier_name' => $oldName],
                $by, "Tier override: {$oldName} → {$newName}");
        }

        AnalyticsService::clearDashboardCache();

        return $target;
    }

    /**
     * A manager's tier for a member (release 2 §4.1, Change tier). Kept until the end of `$keepUntil` (a day on the
     * venue's clock): the tier review then leaves a downgrade alone until that day has passed (LoyaltyService
     * assessTier honours `tier_override_until`). Without a day any earlier hold is cleared, and the next review may
     * move the member again. An upgrade the member earns always applies.
     */
    public function changeTier(LoyaltyMember $target, LoyaltyTier $tier, ?string $keepUntil, User $by): LoyaltyMember
    {
        return $this->update($target, [
            'tier_id'             => $tier->id,
            'tier_override_until' => $keepUntil === null ? null : self::endOfVenueDay($keepUntil, (int) $target->organization_id),
        ], [], $by);
    }

    /** The last moment of a venue day (`Y-m-d`), as the instant it is. */
    public static function endOfVenueDay(string $day, int $orgId): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $day, VenueClock::zone($orgId))->endOfDay()->utc();
    }
}
