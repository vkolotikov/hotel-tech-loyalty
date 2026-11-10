<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\LoyaltyService;
use App\Support\SharedCache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Manual membership assignment, not a payment record. Existing levels own their benefits. */
final class MembershipAssignment
{
    public const MODES = ['assigned', 'earned'];

    public function __construct(private MembershipValidity $validity, private MemberDetails $details, private LoyaltyService $loyalty) {}

    /** @param array<string, mixed> $data @return array{member: LoyaltyMember, replayed: bool} */
    public function assign(LoyaltyMember $member, array $data, User $by, string $key): array
    {
        LoyaltyAccess::requireManager($by);
        $mode = self::checkedMode($data['membership_mode'] ?? null);
        $orgId = (int) $member->organization_id;
        $cacheKey = "loyalty-membership:{$orgId}:{$member->id}:" . hash('sha256', $key);
        $wanted = array_intersect_key($data, array_flip(['membership_mode', 'tier_id', 'valid_from', 'valid_until', 'confirm_replace']));
        ksort($wanted);
        $hash = hash('sha256', (string) json_encode($wanted));

        $replayed = DB::transaction(function () use ($member, $data, $mode, $orgId, $by, $cacheKey, $hash) {
            $locked = LoyaltyMember::query()->whereKey($member->id)->where('organization_id', $orgId)->lockForUpdate()->firstOrFail();
            if (MemberErasure::isErased($locked) || MemberErasure::isSelfDeleted($locked)) {
                throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
            }
            if (is_array($seen = SharedCache::store()->get($cacheKey))) {
                if (($seen['hash'] ?? null) !== $hash) {
                    throw new LoyaltyRefused('key_reused', 'This retry key was used for another assignment.', 409);
                }
                return true;
            }
            $tier = $mode === 'assigned' ? LoyaltyTier::query()->where('organization_id', $orgId)->where('is_active', true)->find($data['tier_id'] ?? 0) : null;
            if ($mode === 'assigned' && $tier === null) {
                throw ValidationException::withMessages(['tier_id' => ['Choose an active membership level.']]);
            }
            $today = VenueClock::today($orgId);
            $start = array_key_exists('valid_from', $data) ? MembershipValidity::checkedStart($data['valid_from']) : MembershipValidity::startOf($locked);
            $end = array_key_exists('valid_until', $data) ? ($data['valid_until'] ?: null) : MembershipValidity::endOf($locked);
            MembershipValidity::assertInterval($start, $end);
            if ($start !== null && $start > $today && MembershipValidity::validOn($locked, $today) && !($data['confirm_replace'] ?? false)) {
                throw ValidationException::withMessages(['confirm_replace' => ['Confirm that the future period replaces current access immediately.']]);
            }
            $old = ['membership_mode' => $locked->getAttribute('membership_mode') ?? 'earned', 'tier_id' => $locked->tier_id]
                + MembershipValidity::summaryFor($locked);
            $dates = array_intersect_key($data, array_flip(['valid_from', 'valid_until']));
            if ($dates !== []) {
                $locked = $this->validity->change($locked, $dates, $by)['member'];
            }
            self::setMode($locked, $mode);
            if ($tier !== null) {
                $this->details->changeTier($locked, $tier, null, $by);
            } else {
                $this->details->update($locked, ['tier_override_until' => null], [], $by);
                $this->loyalty->assessTier($locked, $by, 'membership_assignment_released');
            }
            AuditLog::record('member.membership_assigned', $locked,
                ['membership_mode' => $mode, 'tier_id' => $locked->tier_id] + MembershipValidity::summaryFor($locked), $old, $by);
            SharedCache::store()->put($cacheKey, ['hash' => $hash], MembershipValidity::REPLAY_SECONDS);

            return false;
        });

        return ['member' => LoyaltyMember::query()->with(['user', 'tier'])->findOrFail($member->id), 'replayed' => $replayed];
    }

    public static function checkedMode(mixed $mode): string
    {
        if (!in_array($mode, self::MODES, true)) {
            throw ValidationException::withMessages(['membership_mode' => ['Choose assigned or earned membership.']]);
        }

        return $mode;
    }

    public static function assertMergeCompatible(LoyaltyMember $winner, LoyaltyMember $loser): void
    {
        $a = $winner->getAttribute('membership_mode') ?? 'earned';
        $b = $loser->getAttribute('membership_mode') ?? 'earned';
        if (($a === 'assigned' || $b === 'assigned') && ($a !== $b || (int) $winner->tier_id !== (int) $loser->tier_id)) {
            throw new LoyaltyRefused('membership_assignment_conflict', 'Choose the intended membership assignment before merging these accounts.', 409);
        }
    }

    /** Called inside enrolment before the welcome bonus can assess a different level. */
    public static function onCreate(LoyaltyMember $member, string $mode, User $by): void
    {
        LoyaltyAccess::requireManager($by);
        self::setMode($member, self::checkedMode($mode));
    }

    private static function setMode(LoyaltyMember $member, string $mode): void
    {
        $values = ['membership_mode' => $mode, 'tier_locked' => $mode === 'assigned'];
        if ($mode === 'assigned' && \Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', 'membership_period_enforced')) $values['membership_period_enforced'] = true;
        $member->forceFill($values)->save();
    }
}
