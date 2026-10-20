<?php

namespace App\Support;

use App\Models\HotelSetting;

/**
 * An organisation's accent colour as its settings hold it (`primary_color`): `#rrggbb`, lowercase, or null. Read across
 * tenants by id: the public bio page has no tenant bound. For a colour text can be read on, see Accent.
 */
final class OrgAccent
{
    public static function of(int $orgId): ?string
    {
        $value = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'primary_color')->value('value');
        $value = is_string($value) ? strtolower(trim($value)) : '';

        return preg_match('/^#[0-9a-f]{6}$/', $value) === 1 ? $value : null;
    }
}
