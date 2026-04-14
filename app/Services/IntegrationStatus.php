<?php

namespace App\Services;

use App\Models\HotelSetting;

/**
 * Per-org enabled/disabled flag for external integrations.
 *
 * Convention: each integration has a boolean setting named `{id}_enabled`
 * (e.g. `smoobu_enabled`, `stripe_enabled`). When unset, integrations
 * default to enabled — preserving the prior behaviour where any saved
 * credentials immediately took effect.
 *
 * Disabling an integration must NOT mutate or delete remote data.
 * Callers should treat `isEnabled() === false` as if the integration
 * were unconfigured: skip API calls, fall back to mock/empty results,
 * and leave the saved credentials in place so re-enabling is instant.
 */
class IntegrationStatus
{
    public static function isEnabled(string $integration): bool
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if (!$orgId) {
            return true;
        }

        $row = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $integration . '_enabled')
            ->value('value');

        if ($row === null) {
            return true;
        }

        return filter_var($row, FILTER_VALIDATE_BOOLEAN);
    }
}
