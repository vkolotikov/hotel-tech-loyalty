<?php

namespace App\Services\Loyalty\Staff;

use App\Models\BenefitEntitlement;
use App\Models\Organization;
use App\Models\RewardRedemption;
use App\Models\StaffDevice;
use App\Services\NotificationService;
use App\Services\Loyalty\LoyaltyAccess;
use App\Support\AdminAccess\AccessMap;
use App\Support\SharedCache;
use Illuminate\Support\Collection;

/**
 * Request alerts on staff phones (owner 2026-10-31): when a member asks for a benefit or claims a reward, the
 * HexaTech Staff app's phones that may act on it hear of it. A benefit request goes to every active staff member (any
 * of them may approve it, as the workspace's queue); a claimed reward to managers and staff with `can_redeem_points`
 * (who may hand it over). Only while the organisation has HexaTech Loyalty (its workspace on, in its plan), only to
 * phones with alerts switched on that the app reported within `STALE_DAYS`, each in its own language. A phone Expo
 * says is gone (`DeviceNotRegistered`) is forgotten. Nothing here throws: an alert that cannot be sent is a missed
 * alert, never a failed request. Each request is alerted at most once.
 */
final class StaffAlerts
{
    public const APP = 'loyalty_staff';
    public const STALE_DAYS = 60;
    /** What the app reads from a push's data to open Requests. */
    public const TYPE = 'staff_request';

    public function __construct(private readonly NotificationService $push) {}

    /** @return int how many phones Expo accepted the alert for */
    public function benefitRequested(int $orgId, int $entitlementId): int
    {
        $request = BenefitEntitlement::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($entitlementId)
            ->with(['member' => fn ($q) => $q->withoutGlobalScopes()->with('user:id,name'), 'benefit' => fn ($q) => $q->withoutGlobalScopes()])
            ->first();
        if (!$request || !$request->benefit) {
            return 0;
        }

        return $this->alert($orgId, null, 'benefit', [
            'member'  => self::name($request->member?->user?->name),
            'benefit' => self::name($request->benefit->name),
        ], (int) $request->id);
    }

    /** @return int how many phones Expo accepted the alert for */
    public function rewardClaimed(int $orgId, int $redemptionId): int
    {
        $redemption = RewardRedemption::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($redemptionId)
            ->with(['member' => fn ($q) => $q->withoutGlobalScopes()->with('user:id,name'), 'reward' => fn ($q) => $q->withoutGlobalScopes()])
            ->first();
        if (!$redemption || !$redemption->reward) {
            return 0;
        }

        return $this->alert($orgId, LoyaltyAccess::REDEEM, 'reward', [
            'member' => self::name($redemption->member?->user?->name),
            'reward' => self::name($redemption->reward->name),
        ], (int) $redemption->id);
    }

    /**
     * The phones that hear an alert: this organisation's, alerts on, seen lately, whose person is active staff here
     * (and, for `$flag`, a manager or holds that capability).
     *
     * @return Collection<int, StaffDevice>
     */
    public static function audience(int $orgId, ?string $flag): Collection
    {
        $org = Organization::withoutGlobalScopes()->find($orgId);
        if (!$org || !$org->workspaceEnabled('loyalty') || Organization::isAppointmentsOnly($orgId)) {
            return collect();
        }

        return StaffDevice::query()
            ->where('staff_devices.organization_id', $orgId)
            ->where('staff_devices.app', self::APP)
            ->where('staff_devices.alerts', true)
            ->where('staff_devices.last_seen_at', '>=', now()->subDays(self::STALE_DAYS))
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('staff')
                ->whereColumn('staff.user_id', 'staff_devices.user_id')
                ->where('staff.organization_id', $orgId)
                ->where('staff.is_active', true)
                ->when($flag, fn ($q) => $q->where(fn ($w) => $w->whereIn('staff.role', AccessMap::MANAGER_ROLES)->orWhere("staff.{$flag}", true))))
            ->orderBy('staff_devices.id')
            ->get(['staff_devices.*']);
    }

    /** @param array<string, string> $words the placeholders of `staff_alerts.{kind}_*` */
    private function alert(int $orgId, ?string $flag, string $kind, array $words, int $id): int
    {
        $devices = self::audience($orgId, $flag);
        // At most once per request, whoever asks twice (a long-lived process runs its after-response work again).
        if ($devices->isEmpty() || !SharedCache::store()->add("staff-alert:{$kind}:{$id}", 1, now()->addDay())) {
            return 0;
        }

        $accepted = 0;
        foreach ($devices->chunk(100) as $chunk) {
            $chunk = $chunk->values();
            $messages = $chunk->map(fn (StaffDevice $device) => [
                'to'    => $device->token,
                'title' => __("staff_alerts.{$kind}_title", $words, $device->language),
                'body'  => __("staff_alerts.{$kind}_body", $words, $device->language),
                'data'  => ['type' => self::TYPE, 'kind' => $kind, 'id' => $id, 'organization_id' => $orgId],
            ])->all();

            foreach ($this->push->pushMany($messages) as $i => $ticket) {
                if ($ticket['ok']) {
                    $accepted++;
                } elseif ($ticket['error'] === 'DeviceNotRegistered') {
                    // Only while the token is still the one refused: a phone that registered again meanwhile stays.
                    StaffDevice::query()->whereKey($chunk[$i]->id)->where('token', $chunk[$i]->token)->delete();
                }
            }
        }

        return $accepted;
    }

    /** A name as an alert shows it: trimmed and short, never empty. */
    private static function name(?string $name): string
    {
        $name = trim((string) $name);

        return $name === '' ? '—' : mb_substr($name, 0, 60);
    }
}
