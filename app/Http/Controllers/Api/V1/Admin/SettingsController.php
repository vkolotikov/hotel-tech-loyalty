<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    /** Keys that contain secrets — returned masked unless explicitly empty. */
    private const SECRET_KEYS = [
        'ai_openai_api_key', 'ai_anthropic_api_key',
        'booking_smoobu_api_key', 'booking_smoobu_webhook_secret',
        'mail_password', 'expo_access_token',
        'stripe_secret_key', 'stripe_webhook_secret',
        'twilio_auth_token',
        'whatsapp_access_token', 'whatsapp_verify_token',
        'google_maps_api_key',
        'custom_webhook_secret',
        // PMS provider secrets
        'cloudbeds_api_key', 'cloudbeds_client_secret',
        'mews_access_token', 'mews_client_token',
        'guesty_api_key', 'guesty_api_secret',
        'hostaway_api_key',
        'beds24_api_key',
        'lodgify_api_key',
        'little_hotelier_api_key',
        'roomraccoon_api_key',
        // Channel secrets
        'booking_com_api_key',
        'airbnb_api_key',
        'expedia_api_key',
    ];

    /** Env fallback map: setting key → env variable name. */
    private const ENV_FALLBACKS = [
        'ai_openai_api_key'            => 'OPENAI_API_KEY',
        'ai_openai_model'              => 'OPENAI_MODEL',
        'ai_anthropic_api_key'         => 'ANTHROPIC_API_KEY',
        'ai_anthropic_model'           => 'ANTHROPIC_MODEL',
        'booking_smoobu_api_key'       => 'SMOOBU_API_KEY',
        'booking_smoobu_channel_id'    => 'SMOOBU_CHANNEL_ID',
        'booking_smoobu_base_url'      => 'SMOOBU_BASE_URL',
        'booking_smoobu_webhook_secret' => 'SMOOBU_WEBHOOK_SECRET',
        'mail_host'                    => 'MAIL_HOST',
        'mail_port'                    => 'MAIL_PORT',
        'mail_username'                => 'MAIL_USERNAME',
        'mail_password'                => 'MAIL_PASSWORD',
        'mail_from_address'            => 'MAIL_FROM_ADDRESS',
        'mail_from_name'               => 'MAIL_FROM_NAME',
        'expo_access_token'            => 'EXPO_ACCESS_TOKEN',
        'stripe_publishable_key'       => 'STRIPE_PUBLISHABLE_KEY',
        'stripe_secret_key'            => 'STRIPE_SECRET_KEY',
        'stripe_webhook_secret'        => 'STRIPE_WEBHOOK_SECRET',
        'stripe_currency'              => 'STRIPE_CURRENCY',
        'twilio_account_sid'           => 'TWILIO_ACCOUNT_SID',
        'twilio_auth_token'            => 'TWILIO_AUTH_TOKEN',
        'twilio_phone_number'          => 'TWILIO_PHONE_NUMBER',
        'whatsapp_phone_id'            => 'WHATSAPP_PHONE_ID',
        'whatsapp_access_token'        => 'WHATSAPP_ACCESS_TOKEN',
        'whatsapp_verify_token'        => 'WHATSAPP_VERIFY_TOKEN',
        'google_maps_api_key'          => 'GOOGLE_MAPS_API_KEY',
        'google_analytics_id'          => 'GOOGLE_ANALYTICS_ID',
        'google_tag_manager_id'        => 'GOOGLE_TAG_MANAGER_ID',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $staff = $user?->staff;
        $isSuperAdmin = $staff && $staff->role === 'super_admin';

        // Lazy-seed default hotel_settings rows (appearance colors, general) for
        // the current tenant so the Settings UI renders editable inputs and the
        // theme endpoint returns values. Idempotent — only creates missing keys.
        $this->ensureTenantHasDefaultSettings();

        $query = HotelSetting::query();
        // Non-super-admins:
        //   - Only see company-scoped settings (system-scoped are platform-only).
        //   - Don't see the entire `integrations` group AT ALL. Integration
        //     credentials (SMTP username/from-address, Stripe keys, Twilio
        //     SID, WhatsApp tokens etc.) include real platform/admin emails
        //     that a regular staff user has no business knowing about.
        //     This previously leaked the org's mail_from_address /
        //     mail_username to anyone with the staff role.
        if (!$isSuperAdmin) {
            $query->where(function ($q) {
                $q->where('scope', 'company')->orWhereNull('scope');
            });
            $query->where('group', '!=', 'integrations');
        }

        $settings = $query->get()->groupBy('group')->map(function ($group) {
            return $group->map(function ($setting) {
                $value = $setting->typed_value;

                // If DB value is empty, try env fallback
                if (($value === '' || $value === null) && isset(self::ENV_FALLBACKS[$setting->key])) {
                    $envVal = env(self::ENV_FALLBACKS[$setting->key]);
                    if ($envVal !== null && $envVal !== '') {
                        $value = $envVal;
                    }
                }

                // Mask secret keys
                $isSecret = in_array($setting->key, self::SECRET_KEYS);
                $masked = $isSecret && $value ? $this->maskSecret((string) $value) : null;

                return [
                    'id'          => $setting->id,
                    'key'         => $setting->key,
                    'value'       => $isSecret ? '' : $value, // never send raw secrets
                    'masked'      => $masked,
                    'has_value'   => $value !== '' && $value !== null,
                    'source'      => $this->getValueSource($setting),
                    'type'        => $setting->type,
                    'label'       => $setting->label,
                    'description' => $setting->description,
                    'scope'       => $setting->scope ?? 'company',
                ];
            })->values(); // Reset keys so JSON serializes as array, not object
        });

        // Include the org's widget token for the booking embed code
        $widgetToken = null;
        if ($user && $user->organization_id) {
            $org = \App\Models\Organization::find($user->organization_id);
            $widgetToken = $org?->widget_token;
        }

        return response()->json(['settings' => $settings, 'widget_token' => $widgetToken]);
    }

    public function theme(): JsonResponse
    {
        // Public endpoint — bypass tenant scope but only return appearance settings.
        // Resolve org from: tenant context → authenticated user → query param
        $orgId = null;

        if (app()->bound('current_organization_id') && app('current_organization_id')) {
            $orgId = app('current_organization_id');
        }

        if (!$orgId) {
            // Try to resolve from authenticated user (Sanctum token)
            $user = auth('sanctum')->user();
            if ($user) {
                $staff = \App\Models\Staff::withoutGlobalScopes()->where('user_id', $user->id)->first();
                $orgId = $staff?->organization_id ?? $user->organization_id ?? null;
            }
        }

        if (!$orgId) {
            // Try SaaS JWT — tenant users authenticate via SaaS-issued JWT which
            // Sanctum can't resolve. Verify the JWT and look up the local org.
            $authHeader = request()->header('Authorization', '');
            if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
                $token = trim(substr($authHeader, 7));
                if ($token && !str_contains($token, '|')) {
                    $orgId = $this->resolveOrgFromSaasJwt($token);
                }
            }
        }

        if (!$orgId) {
            // Fallback: query param for public widgets
            $orgId = request()->input('org_id');
        }

        $query = HotelSetting::withoutGlobalScopes()->where('group', 'appearance');
        if ($orgId) {
            $query->where('organization_id', $orgId);
        }
        $theme = $query->pluck('value', 'key');

        // Mobile apps consume keys from a separate group so they can be themed
        // independently of the web admin SPA. Both groups are returned here so
        // the same /v1/theme endpoint serves web + mobile.
        $mobileQuery = HotelSetting::withoutGlobalScopes()->where('group', 'mobile_app');
        if ($orgId) {
            $mobileQuery->where('organization_id', $orgId);
        }
        $mobileTheme = $mobileQuery->pluck('value', 'key');

        return response()->json([
            'theme'        => $theme,
            'mobile_theme' => $mobileTheme,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $staff = $user?->staff;
        $isSuperAdmin = $staff && $staff->role === 'super_admin';

        $validated = $request->validate([
            'settings'         => 'required|array',
            'settings.*.key'   => 'required|string',
            'settings.*.value' => 'present',
        ]);

        foreach ($validated['settings'] as $item) {
            $setting = HotelSetting::where('key', $item['key'])->first();

            // Non-super-admins cannot write system-scoped settings.
            if (!$isSuperAdmin && $setting && $setting->scope === 'system') {
                continue;
            }

            // Non-super-admins cannot write integration settings either —
            // matches the read-side filter and prevents staff from
            // overwriting SMTP/Stripe/Twilio credentials.
            if (!$isSuperAdmin && $setting && $setting->group === 'integrations') {
                continue;
            }

            // Skip empty secret submissions (user didn't type a new key)
            if (in_array($item['key'], self::SECRET_KEYS) && ($item['value'] === '' || $item['value'] === null)) {
                continue;
            }

            $oldValue = $setting?->value;
            $newValue = is_array($item['value']) ? json_encode($item['value']) : (string) $item['value'];

            if ($setting) {
                $setting->update(['value' => $newValue]);
            } else {
                // Row doesn't exist for this org yet. Check if the key exists as a
                // template in any other org (fresh orgs have no seeded settings
                // rows until they first save). If it's a known company-scoped key
                // or missing entirely, let the staff user create it for their org.
                $template = HotelSetting::withoutGlobalScopes()->where('key', $item['key'])->first();
                if ($template && $template->scope === 'system' && !$isSuperAdmin) {
                    continue;
                }
                // Infer group/type/label from the template when available
                $group = $template?->group ?? $this->inferGroup($item['key']);
                $isEnabledFlag = str_ends_with($item['key'], '_enabled');
                $type  = $template?->type ?? ($isEnabledFlag ? 'boolean' : 'string');
                $label = $template?->label ?? ucwords(str_replace('_', ' ', $item['key']));
                HotelSetting::create([
                    'key'   => $item['key'],
                    'value' => $newValue,
                    'type'  => $type,
                    'group' => $group,
                    'label' => $label,
                    'scope' => $template?->scope ?? 'company',
                ]);
            }

            AuditLog::record(
                'setting_updated',
                $setting ?? HotelSetting::where('key', $item['key'])->first(),
                ['value' => in_array($item['key'], self::SECRET_KEYS) ? '***' : $item['value']],
                ['value' => in_array($item['key'], self::SECRET_KEYS) ? '***' : $oldValue],
                $request->user(),
                "Setting '{$item['key']}' changed"
            );
        }

        return response()->json(['message' => 'Settings updated']);
    }

    /**
     * Lazy-seed a minimal set of hotel_settings rows for the current tenant.
     * Only creates keys that don't already exist for this org. Safe to call
     * repeatedly — only touches missing rows.
     */
    private function ensureTenantHasDefaultSettings(): void
    {
        if (!app()->bound('current_organization_id') || !app('current_organization_id')) {
            return;
        }

        $existingKeys = HotelSetting::pluck('key')->all();

        $defaults = [
            // Appearance (brand colors) — this is what non-super-admins need
            // for the Branding tab to render editable inputs.
            ['key' => 'primary_color',        'value' => '#c9a84c', 'type' => 'string',  'group' => 'appearance', 'label' => 'Primary Color'],
            ['key' => 'secondary_color',      'value' => '#1e1e1e', 'type' => 'string',  'group' => 'appearance', 'label' => 'Secondary Color'],
            ['key' => 'accent_color',         'value' => '#32d74b', 'type' => 'string',  'group' => 'appearance', 'label' => 'Accent / Success'],
            ['key' => 'background_color',     'value' => '#0d0d0d', 'type' => 'string',  'group' => 'appearance', 'label' => 'Background'],
            ['key' => 'surface_color',        'value' => '#161616', 'type' => 'string',  'group' => 'appearance', 'label' => 'Surface / Card'],
            ['key' => 'text_color',           'value' => '#ffffff', 'type' => 'string',  'group' => 'appearance', 'label' => 'Text Color'],
            ['key' => 'text_secondary_color', 'value' => '#8e8e93', 'type' => 'string',  'group' => 'appearance', 'label' => 'Secondary Text'],
            ['key' => 'border_color',         'value' => '#2c2c2c', 'type' => 'string',  'group' => 'appearance', 'label' => 'Border Color'],
            ['key' => 'error_color',          'value' => '#ff375f', 'type' => 'string',  'group' => 'appearance', 'label' => 'Error / Danger'],
            ['key' => 'warning_color',        'value' => '#ffd60a', 'type' => 'string',  'group' => 'appearance', 'label' => 'Warning'],
            ['key' => 'info_color',           'value' => '#0a84ff', 'type' => 'string',  'group' => 'appearance', 'label' => 'Info'],
            ['key' => 'dark_mode_enabled',    'value' => 'true',    'type' => 'boolean', 'group' => 'appearance', 'label' => 'Dark Mode'],

            // General
            ['key' => 'hotel_currency',       'value' => 'EUR',     'type' => 'string',  'group' => 'general',    'label' => 'Currency'],
            ['key' => 'hotel_timezone',       'value' => 'UTC',     'type' => 'string',  'group' => 'general',    'label' => 'Timezone'],

            // Integrations — PMS
            ['key' => 'booking_smoobu_api_key',       'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu API Key'],
            ['key' => 'booking_smoobu_channel_id',    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu Channel ID'],
            ['key' => 'booking_smoobu_base_url',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu API URL'],
            ['key' => 'booking_smoobu_webhook_secret', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu Webhook Secret'],
            ['key' => 'cloudbeds_api_key',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds API Key'],
            ['key' => 'cloudbeds_property_id',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Property ID'],
            ['key' => 'cloudbeds_client_id',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Client ID'],
            ['key' => 'cloudbeds_client_secret',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Client Secret'],
            ['key' => 'mews_access_token',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews Access Token'],
            ['key' => 'mews_client_token',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews Client Token'],
            ['key' => 'mews_platform_url',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews API URL'],
            ['key' => 'guesty_api_key',               'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty API Key'],
            ['key' => 'guesty_api_secret',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty API Secret'],
            ['key' => 'guesty_account_id',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty Account ID'],
            ['key' => 'hostaway_api_key',             'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Hostaway API Key'],
            ['key' => 'hostaway_account_id',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Hostaway Account ID'],
            ['key' => 'beds24_api_key',               'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Beds24 API Key'],
            ['key' => 'beds24_property_id',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Beds24 Property ID'],
            ['key' => 'lodgify_api_key',              'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Lodgify API Key'],
            ['key' => 'lodgify_property_id',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Lodgify Property ID'],
            ['key' => 'little_hotelier_api_key',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Little Hotelier API Key'],
            ['key' => 'little_hotelier_property_id',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Little Hotelier Property ID'],
            ['key' => 'roomraccoon_api_key',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'RoomRaccoon API Key'],
            ['key' => 'roomraccoon_property_id',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'RoomRaccoon Property ID'],
            // Integrations — OTA / Channels
            ['key' => 'booking_com_hotel_id',         'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Booking.com Hotel ID'],
            ['key' => 'booking_com_api_key',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Booking.com API Key'],
            ['key' => 'airbnb_api_key',               'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Airbnb API Key'],
            ['key' => 'airbnb_listing_ids',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Airbnb Listing IDs'],
            ['key' => 'expedia_api_key',              'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expedia API Key'],
            ['key' => 'expedia_property_id',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expedia Property ID'],
            // Integrations — Payments & Communication
            ['key' => 'stripe_publishable_key',       'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Publishable Key'],
            ['key' => 'stripe_secret_key',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Secret Key'],
            ['key' => 'stripe_webhook_secret',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Webhook Secret'],
            ['key' => 'stripe_currency',              'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Currency'],
            ['key' => 'mail_host',                    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Host'],
            ['key' => 'mail_port',                    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Port'],
            ['key' => 'mail_username',                'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Username'],
            ['key' => 'mail_password',                'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Password'],
            ['key' => 'mail_from_address',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'From Address'],
            ['key' => 'mail_from_name',               'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'From Name'],
            ['key' => 'twilio_account_sid',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Account SID'],
            ['key' => 'twilio_auth_token',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Auth Token'],
            ['key' => 'twilio_phone_number',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Phone Number'],
            ['key' => 'whatsapp_phone_id',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Phone Number ID'],
            ['key' => 'whatsapp_access_token',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Access Token'],
            ['key' => 'whatsapp_verify_token',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Verify Token'],
            ['key' => 'expo_access_token',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expo Push Token'],
            ['key' => 'google_maps_api_key',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Maps API Key'],
            ['key' => 'google_analytics_id',          'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Analytics ID'],
            ['key' => 'google_tag_manager_id',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Tag Manager ID'],
            ['key' => 'zapier_webhook_url',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Zapier Webhook URL'],
            ['key' => 'custom_webhook_url',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Custom Webhook URL'],
            ['key' => 'custom_webhook_secret',        'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Custom Webhook Secret'],
            // Integrations — AI (system scope, seeded here for completeness)
            ['key' => 'ai_openai_api_key',            'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'OpenAI API Key',       'scope' => 'system'],
            ['key' => 'ai_openai_model',              'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'OpenAI Model',          'scope' => 'system'],
            ['key' => 'ai_anthropic_api_key',         'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Anthropic API Key',     'scope' => 'system'],
            ['key' => 'ai_anthropic_model',           'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Anthropic Model',       'scope' => 'system'],
        ];

        foreach ($defaults as $d) {
            if (in_array($d['key'], $existingKeys, true)) {
                continue;
            }
            $scope = $d['scope'] ?? 'company';
            unset($d['scope']);
            HotelSetting::create(array_merge($d, ['scope' => $scope]));
        }
    }

    /**
     * Verify a SaaS-issued JWT and return the local organization_id.
     * Returns null if the token is invalid or the org doesn't exist locally.
     */
    private function resolveOrgFromSaasJwt(string $token): ?int
    {
        $secret = config('services.saas.jwt_secret', '');
        if (!$secret) return null;

        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $payload, $signature] = $parts;
        $expected = rtrim(strtr(base64_encode(
            hash_hmac('sha256', "$header.$payload", $secret, true)
        ), '+/', '-_'), '=');

        if (!hash_equals($expected, $signature)) return null;

        $data = json_decode(base64_decode(str_pad(
            strtr($payload, '-_', '+/'),
            strlen($payload) % 4 ? strlen($payload) + 4 - strlen($payload) % 4 : strlen($payload),
            '='
        )), true);

        if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;

        $saasOrgId = $data['currentOrgId'] ?? null;
        if (!$saasOrgId) return null;

        $org = \App\Models\Organization::where('saas_org_id', $saasOrgId)->first();
        return $org?->id;
    }

    /**
     * Infer the hotel_settings group for a key that has no template row yet.
     * Matches the conventions used in the seeder / frontend so a freshly-created
     * org can save settings without manual seeding.
     */
    private function inferGroup(string $key): string
    {
        $k = strtolower($key);
        // {integration}_enabled toggles live alongside their credentials in the
        // integrations group so the UI can find them next to the section.
        if (str_ends_with($k, '_enabled') && !str_starts_with($k, 'push_')
            && !str_starts_with($k, 'email_') && !str_starts_with($k, 'welcome_')
            && !str_starts_with($k, 'inbox_') && !str_starts_with($k, 'rating_')
            && !str_starts_with($k, 'lead_') && !str_starts_with($k, 'gdpr_')
            && !str_starts_with($k, 'dark_')) {
            return 'integrations';
        }
        if (str_starts_with($k, 'mobile_')) return 'mobile_app';
        if (in_array($k, ['primary_color','background_color','surface_color','secondary_color','text_color','text_secondary_color','border_color','success_color','error_color','warning_color','info_color','accent_color','company_logo','company_name','brand_font'])) return 'appearance';
        if (str_starts_with($k, 'booking_')) return 'booking';
        if (str_starts_with($k, 'mail_')) return 'email';
        if (str_starts_with($k, 'stripe_')) return 'billing';
        return 'general';
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,jpg,webp|max:4096',
        ]);

        $url = \App\Services\MediaService::upload($request->file('logo'), 'logos');

        $setting = HotelSetting::where('key', 'company_logo')->first();
        if ($setting) {
            \App\Services\MediaService::delete($setting->value);
            $setting->update(['value' => $url]);
        } else {
            HotelSetting::create([
                'key'         => 'company_logo',
                'value'       => $url,
                'type'        => 'string',
                'group'       => 'appearance',
                'label'       => 'Company Logo',
                'description' => 'Logo displayed in the app header and member cards',
            ]);
        }

        AuditLog::record('logo_uploaded', HotelSetting::where('key', 'company_logo')->first(),
            ['url' => $url], [], $request->user(), 'Company logo updated');

        return response()->json(['message' => 'Logo uploaded', 'url' => $url]);
    }

    /** Test an integration connection (manager+ only). */
    public function testIntegration(Request $request): JsonResponse
    {
        $staff = $request->user()?->staff;
        if (!$staff || !in_array($staff->role, ['super_admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Insufficient permissions'], 403);
        }

        $type = $request->input('type');

        return match ($type) {
            'openai'    => $this->testOpenAi(),
            'anthropic' => $this->testAnthropic(),
            'smoobu'    => $this->testSmoobu(),
            'mail'      => $this->testMail(),
            'stripe'    => $this->testStripe(),
            'twilio'    => $this->testTwilio(),
            'whatsapp'  => $this->testWhatsApp(),
            'google_maps' => $this->testGoogleMaps(),
            'expo'      => $this->testExpoPush(),
            default     => response()->json(['success' => false, 'message' => 'Unknown integration type']),
        };
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private function maskSecret(string $value): string
    {
        if (strlen($value) <= 8) return '••••••••';
        return substr($value, 0, 4) . str_repeat('•', min(20, strlen($value) - 8)) . substr($value, -4);
    }

    private function getValueSource(HotelSetting $setting): string
    {
        if ($setting->value !== '' && $setting->value !== null) return 'database';
        if (isset(self::ENV_FALLBACKS[$setting->key])) {
            $envVal = env(self::ENV_FALLBACKS[$setting->key]);
            if ($envVal !== null && $envVal !== '') return 'env';
        }
        return 'empty';
    }

    private function resolveKey(string $settingKey, string $envKey): ?string
    {
        $val = HotelSetting::getValue($settingKey);
        if ($val && $val !== '') return $val;
        $env = env($envKey);
        return ($env && $env !== '') ? $env : null;
    }

    private function curlTest(string $url, array $headers, int $timeout = 10): array
    {
        try {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_HTTPHEADER     => $headers,
            ]);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return ['success' => false, 'message' => "Connection failed: {$error}"];
            return ['success' => $code >= 200 && $code < 300, 'message' => ($code >= 200 && $code < 300) ? 'Connected' : "HTTP {$code}"];
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function testOpenAi(): JsonResponse
    {
        $key = $this->resolveKey('ai_openai_api_key', 'OPENAI_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest('https://api.openai.com/v1/models', ["Authorization: Bearer {$key}"]);
        return response()->json($result);
    }

    private function testAnthropic(): JsonResponse
    {
        $key = $this->resolveKey('ai_anthropic_api_key', 'ANTHROPIC_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest('https://api.anthropic.com/v1/models', ["x-api-key: {$key}", "anthropic-version: 2023-06-01"]);
        return response()->json($result);
    }

    private function testSmoobu(): JsonResponse
    {
        $key = $this->resolveKey('booking_smoobu_api_key', 'SMOOBU_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $base = rtrim($this->resolveKey('booking_smoobu_base_url', 'SMOOBU_BASE_URL') ?? 'https://login.smoobu.com/api', '/');

        // Hit page 1 with the largest page_size so admins can see the
        // ACTUAL unit total (page_count × page_size) — pre-fix the test
        // would just say "Connected" while sync silently returned only
        // the first 25 units.
        try {
            $ch = curl_init("{$base}/apartments?page=1&page_size=50");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_HTTPHEADER     => ["Api-Key: {$key}", "Content-Type: application/json"],
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return response()->json(['success' => false, 'message' => "Connection failed: {$error}"]);
            if ($code < 200 || $code >= 300) return response()->json(['success' => false, 'message' => "HTTP {$code}"]);

            $payload = json_decode((string) $body, true) ?: [];
            $units   = is_array($payload['apartments'] ?? null) ? count($payload['apartments']) : 0;
            $total   = (int) ($payload['total_items'] ?? $units);
            $pages   = (int) ($payload['page_count'] ?? 1);

            return response()->json([
                'success' => true,
                'message' => $total > 0 ? "Connected · {$total} unit" . ($total === 1 ? '' : 's') . ' detected' : 'Connected · no units in Smoobu yet',
                'detail'  => [
                    'units_total' => $total,
                    'page_count'  => $pages,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    /**
     * Expo Push API smoke test. We don't need to actually send a push —
     * just verify the access token is well-formed and reaches Expo's
     * push-receipts endpoint without auth errors.
     */
    private function testExpoPush(): JsonResponse
    {
        $token = $this->resolveKey('expo_access_token', 'EXPO_ACCESS_TOKEN');
        if (!$token) return response()->json(['success' => false, 'message' => 'No access token configured']);

        // Expo accepts a POST to /push/getReceipts with an empty array
        // and returns 200 + { data: {} }. Any auth/format error returns
        // 4xx which is what we want to surface here.
        try {
            $ch = curl_init('https://exp.host/--/api/v2/push/getReceipts');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode(['ids' => []]),
                CURLOPT_HTTPHEADER     => [
                    "Authorization: Bearer {$token}",
                    'Content-Type: application/json',
                    'Accept-Encoding: gzip, deflate',
                ],
            ]);
            curl_exec($ch);
            $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return response()->json(['success' => false, 'message' => "Connection failed: {$error}"]);
            return response()->json([
                'success' => $code >= 200 && $code < 300,
                'message' => $code >= 200 && $code < 300 ? 'Connected' : "HTTP {$code}",
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testMail(): JsonResponse
    {
        $host = $this->resolveKey('mail_host', 'MAIL_HOST');
        if (!$host) return response()->json(['success' => false, 'message' => 'No SMTP host configured']);

        $port = (int) ($this->resolveKey('mail_port', 'MAIL_PORT') ?? 587);
        try {
            $conn = @fsockopen($host, $port, $errno, $errstr, 5);
            if ($conn) { fclose($conn); return response()->json(['success' => true, 'message' => "SMTP reachable on {$host}:{$port}"]); }
            return response()->json(['success' => false, 'message' => "Cannot reach {$host}:{$port}: {$errstr}"]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testStripe(): JsonResponse
    {
        $key = $this->resolveKey('stripe_secret_key', 'STRIPE_SECRET_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No secret key configured']);

        $result = $this->curlTest('https://api.stripe.com/v1/balance', ["Authorization: Bearer {$key}"]);
        return response()->json($result);
    }

    private function testTwilio(): JsonResponse
    {
        $sid = $this->resolveKey('twilio_account_sid', 'TWILIO_ACCOUNT_SID');
        $token = $this->resolveKey('twilio_auth_token', 'TWILIO_AUTH_TOKEN');
        if (!$sid || !$token) return response()->json(['success' => false, 'message' => 'Account SID and Auth Token required']);

        try {
            $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$sid}.json");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_USERPWD        => "{$sid}:{$token}",
            ]);
            curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return response()->json(['success' => false, 'message' => "Connection failed: {$error}"]);
            return response()->json(['success' => $code === 200, 'message' => $code === 200 ? 'Connected' : "HTTP {$code}"]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testWhatsApp(): JsonResponse
    {
        $phoneId = $this->resolveKey('whatsapp_phone_id', 'WHATSAPP_PHONE_ID');
        $token = $this->resolveKey('whatsapp_access_token', 'WHATSAPP_ACCESS_TOKEN');
        if (!$phoneId || !$token) return response()->json(['success' => false, 'message' => 'Phone Number ID and Access Token required']);

        $result = $this->curlTest(
            "https://graph.facebook.com/v19.0/{$phoneId}",
            ["Authorization: Bearer {$token}"]
        );
        return response()->json($result);
    }

    private function testGoogleMaps(): JsonResponse
    {
        $key = $this->resolveKey('google_maps_api_key', 'GOOGLE_MAPS_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest(
            "https://maps.googleapis.com/maps/api/geocode/json?address=test&key={$key}",
            []
        );
        return response()->json($result);
    }
}
