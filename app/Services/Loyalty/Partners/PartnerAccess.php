<?php
namespace App\Services\Loyalty\Partners;

use App\Models\AccessPlace;
use App\Models\Staff;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Support\Collection;

/** Explicit server boundary, independent of role/capability report mode. */
final class PartnerAccess
{
    public static function restricted(?Staff $staff): bool { return (bool) ($staff->loyalty_scan_only ?? false); }

    public static function allowedRoute(string $uri, string $method): bool
    {
        return ($uri === 'api/v1/admin/loyalty/partner/context' && in_array($method, ['GET', 'HEAD'], true))
            || ($uri === 'api/v1/admin/loyalty/partner/scan' && $method === 'POST');
    }

    public static function staff(User $user): Staff
    {
        $staff = Staff::where('user_id', $user->id)->where('is_active', true)->first();
        if (!$staff || !self::restricted($staff)) {
            throw new LoyaltyRefused('scan_only', 'This scanner is for invited partner staff.', 403);
        }
        return $staff;
    }

    /** @return Collection<int, AccessPlace> */
    public static function places(Staff $staff): Collection
    {
        return AccessPlace::where('organization_id', $staff->organization_id)
            ->whereIn('id', $staff->loyalty_place_ids ?? [])->where('is_active', true)
            ->orderBy('sort_order')->orderBy('name')->get();
    }

    public static function place(User $user, int $id): AccessPlace
    {
        $place = self::places(self::staff($user))->firstWhere('id', $id);
        if (!$place) { throw new LoyaltyRefused('place_not_allowed', 'This place is not assigned to your account.', 403); }
        return $place;
    }

    public static function authHint(User $user): bool
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('staff', 'loyalty_scan_only')) { return false; }
        return $user->isStaff() && Staff::withoutGlobalScopes()->where('organization_id', $user->organization_id)
            ->where('user_id', $user->id)->where('loyalty_scan_only', true)->exists();
    }
}
