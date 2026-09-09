<?php

namespace App\OAuth;

use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;

class PluginIdentity
{
    public static function active(?User $user): bool
    {
        return $user?->isStaff() && $user->organization_id
            && self::organizationAllowed((int) $user->organization_id)
            && Organization::query()->whereKey($user->organization_id)->where('is_active', true)
                ->whereNull('saas_deleted_at')->exists()
            && Staff::withoutGlobalScopes()->where('user_id', $user->id)
                ->where('organization_id', $user->organization_id)->where('is_active', true)->exists();
    }

    public static function organizationAllowed(int $organizationId): bool
    {
        return config('chatgpt.all_organizations', false)
            || in_array($organizationId, array_map('intval', config('chatgpt.organization_ids', [])), true);
    }
}
