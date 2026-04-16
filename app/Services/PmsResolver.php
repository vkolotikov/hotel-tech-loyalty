<?php

namespace App\Services;

use App\Models\HotelSetting;

/**
 * Detects which PMS / channel manager integration is configured and enabled
 * for the current organization. Returns provider metadata used by sync,
 * dashboard, and booking controllers to act generically.
 *
 * Only Smoobu has a full client implementation today. Other providers are
 * detected as "configured" so the UI can show proper status, but sync
 * will only work for providers with a client class.
 */
class PmsResolver
{
    /**
     * Registry of known PMS providers and the setting key that indicates
     * they are configured (the primary API key / token).
     */
    private const PROVIDERS = [
        'smoobu'          => ['key' => 'booking_smoobu_api_key',      'name' => 'Smoobu',          'syncable' => true],
        'cloudbeds'       => ['key' => 'cloudbeds_api_key',           'name' => 'Cloudbeds',       'syncable' => false],
        'mews'            => ['key' => 'mews_access_token',           'name' => 'Mews',            'syncable' => false],
        'guesty'          => ['key' => 'guesty_api_key',              'name' => 'Guesty',          'syncable' => false],
        'hostaway'        => ['key' => 'hostaway_api_key',            'name' => 'Hostaway',        'syncable' => false],
        'beds24'          => ['key' => 'beds24_api_key',              'name' => 'Beds24',          'syncable' => false],
        'lodgify'         => ['key' => 'lodgify_api_key',             'name' => 'Lodgify',         'syncable' => false],
        'little_hotelier' => ['key' => 'little_hotelier_api_key',     'name' => 'Little Hotelier', 'syncable' => false],
        'roomraccoon'     => ['key' => 'roomraccoon_api_key',         'name' => 'RoomRaccoon',     'syncable' => false],
    ];

    private const CHANNELS = [
        'booking_com' => ['key' => 'booking_com_api_key', 'name' => 'Booking.com'],
        'airbnb'      => ['key' => 'airbnb_api_key',      'name' => 'Airbnb'],
        'expedia'     => ['key' => 'expedia_api_key',      'name' => 'Expedia'],
    ];

    /**
     * Return the first configured & enabled PMS provider, or null.
     *
     * @return array{id: string, name: string, syncable: bool}|null
     */
    public function activePms(): ?array
    {
        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0;
        if (!$orgId) return null;

        foreach (self::PROVIDERS as $id => $meta) {
            if (!IntegrationStatus::isEnabled($id)) continue;
            $val = $this->setting($orgId, $meta['key']);
            if (!empty($val)) {
                return ['id' => $id, 'name' => $meta['name'], 'syncable' => $meta['syncable']];
            }
        }

        return null;
    }

    /**
     * Return all configured & enabled channel integrations (OTAs + PMS).
     *
     * @return array<int, array{id: string, name: string, type: string, syncable: bool}>
     */
    public function activeIntegrations(): array
    {
        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0;
        if (!$orgId) return [];

        $result = [];

        foreach (self::PROVIDERS as $id => $meta) {
            if (!IntegrationStatus::isEnabled($id)) continue;
            $val = $this->setting($orgId, $meta['key']);
            if (!empty($val)) {
                $result[] = ['id' => $id, 'name' => $meta['name'], 'type' => 'pms', 'syncable' => $meta['syncable']];
            }
        }

        foreach (self::CHANNELS as $id => $meta) {
            if (!IntegrationStatus::isEnabled($id)) continue;
            $val = $this->setting($orgId, $meta['key']);
            if (!empty($val)) {
                $result[] = ['id' => $id, 'name' => $meta['name'], 'type' => 'channel', 'syncable' => false];
            }
        }

        return $result;
    }

    private function setting(int $orgId, string $key): string
    {
        try {
            return (string) (HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('key', $key)
                ->value('value') ?? '');
        } catch (\Throwable) {
            return '';
        }
    }
}
