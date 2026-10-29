<?php

namespace App\Support;

/** Canonical keys and authority for the generic settings endpoint, independent of stored row metadata. */
final class SettingRegistry
{
    public const SECRET_KEYS = [
        'ai_openai_api_key', 'ai_anthropic_api_key',
        'booking_smoobu_api_key', 'booking_smoobu_webhook_secret',
        'expo_access_token',
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
    private const EXTRA = [
        'booking_min_nights' => ['group' => 'booking', 'type' => 'integer'],
        'booking_max_nights' => ['group' => 'booking', 'type' => 'integer'],
        'booking_mock_mode' => ['group' => 'booking', 'type' => 'boolean'],
        'booking_payment_enabled' => ['group' => 'booking', 'type' => 'boolean'],
        'booking_currency' => ['group' => 'booking', 'type' => 'string'],
        'booking_units' => ['group' => 'booking', 'type' => 'json'],
        'booking_extras' => ['group' => 'booking', 'type' => 'json'],
        'booking_policies' => ['group' => 'booking', 'type' => 'json'],
        'booking_widget_color' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_logo_url' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_property_name' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_radius' => ['group' => 'booking', 'type' => 'integer'],
        'booking_widget_show_logo' => ['group' => 'booking', 'type' => 'boolean'],
        'booking_widget_show_name' => ['group' => 'booking', 'type' => 'boolean'],
        'booking_widget_theme' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_font' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_button_style' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_bg_color' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_text_color' => ['group' => 'booking', 'type' => 'string'],
        'booking_widget_custom_css' => ['group' => 'booking', 'type' => 'text'],
        'services_slot_step' => ['group' => 'booking', 'type' => 'integer'],
        'services_lead_minutes' => ['group' => 'booking', 'type' => 'integer'],
        'services_max_advance_days' => ['group' => 'booking', 'type' => 'integer'],
        'services_allow_master_choice' => ['group' => 'booking', 'type' => 'boolean'],
        'services_require_deposit' => ['group' => 'booking', 'type' => 'boolean'],
        'services_deposit_percent' => ['group' => 'booking', 'type' => 'integer'],
        'services_cancellation_policy' => ['group' => 'booking', 'type' => 'text'],
        'services_widget_color' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_logo_url' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_property_name' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_radius' => ['group' => 'booking', 'type' => 'integer'],
        'services_widget_show_logo' => ['group' => 'booking', 'type' => 'boolean'],
        'services_widget_show_name' => ['group' => 'booking', 'type' => 'boolean'],
        'services_widget_theme' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_font' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_button_style' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_bg_color' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_text_color' => ['group' => 'booking', 'type' => 'string'],
        'services_widget_custom_css' => ['group' => 'booking', 'type' => 'text'],
        'brand_font' => ['group' => 'appearance', 'type' => 'string'],
        'company_logo' => ['group' => 'appearance', 'type' => 'string'],
        'company_name' => ['group' => 'appearance', 'type' => 'string'],
        'currency_symbol' => ['group' => 'general', 'type' => 'text'],
        'daily_staff_adjustment_limit' => ['group' => 'points', 'type' => 'integer'],
        'email_notifications_enabled' => ['group' => 'notifications', 'type' => 'boolean'],
        'hotel_address' => ['group' => 'general', 'type' => 'string'],
        'hotel_email' => ['group' => 'general', 'type' => 'string'],
        'hotel_name' => ['group' => 'general', 'type' => 'text'],
        'hotel_phone' => ['group' => 'general', 'type' => 'string'],
        'hotel_website' => ['group' => 'general', 'type' => 'string'],
        'logo_url' => ['group' => 'appearance', 'type' => 'string'],
        'manual_award_approval_threshold' => ['group' => 'points', 'type' => 'integer'],
        'min_redeem_points' => ['group' => 'points', 'type' => 'integer'],
        'mobile_accent_intensity' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_background_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_border_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_button_style' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_card_style' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_error_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_info_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_preset_name' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_primary_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_radius' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_secondary_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_success_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_surface_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_text_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_text_secondary_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'mobile_warning_color' => ['group' => 'mobile_app', 'type' => 'string'],
        'points_expiry_months' => ['group' => 'points', 'type' => 'integer'],
        'points_expiry_reminder_days' => ['group' => 'notifications', 'type' => 'integer'],
        'points_per_currency' => ['group' => 'loyalty', 'type' => 'number'],
        'points_per_dollar' => ['group' => 'points', 'type' => 'integer'],
        'push_notifications_enabled' => ['group' => 'notifications', 'type' => 'boolean'],
        'referee_bonus_points' => ['group' => 'points', 'type' => 'integer'],
        'referrer_bonus_points' => ['group' => 'points', 'type' => 'integer'],
        'theme_mood' => ['group' => 'appearance', 'type' => 'string'],
        'theme_preset_name' => ['group' => 'appearance', 'type' => 'string'],
        'theme_style' => ['group' => 'appearance', 'type' => 'string'],
        'tier_qualification_model' => ['group' => 'points', 'type' => 'string'],
        'welcome_bonus_points' => ['group' => 'points', 'type' => 'integer'],
        'welcome_email_enabled' => ['group' => 'notifications', 'type' => 'boolean'],
    ];

    public static function get(string $key): ?array
    {
        $defaults = array_column(self::defaults(), null, 'key');
        $definition = $defaults[$key] ?? self::EXTRA[$key] ?? null;
        if ($definition === null && in_array($key, array_map(fn ($id) => $id . '_enabled', [
            'smoobu', 'cloudbeds', 'mews', 'guesty', 'hostaway', 'beds24', 'lodgify', 'little_hotelier',
            'roomraccoon', 'booking_com', 'airbnb', 'expedia', 'stripe', 'mail', 'twilio', 'whatsapp',
            'expo', 'google', 'webhooks', 'openai', 'anthropic',
        ]), true)) {
            $definition = ['group' => 'integrations', 'type' => 'boolean'];
        }
        if ($definition === null && isset(\App\Services\Loyalty\Programme\ProgrammeOptions::OPTIONS[$key]) && $key !== 'programme_setup_completed_at') {
            $type = \App\Services\Loyalty\Programme\ProgrammeOptions::OPTIONS[$key][0];
            $definition = ['group' => 'loyalty', 'type' => match ($type) {
                'bool' => 'boolean', 'int', 'reward' => 'integer', 'decimal' => 'number', default => 'string',
            }];
        }
        return $definition === null ? null : $definition + [
            'key' => $key, 'scope' => 'company', 'label' => ucwords(str_replace('_', ' ', $key)),
        ];
    }

    public static function ownerOnly(string $key): bool
    {
        $definition = self::get($key);
        return $definition === null || $definition['group'] === 'integrations' || $definition['scope'] === 'system';
    }

    public static function defaults(): array
    {
        return [
            // Appearance (brand colors) — this is what non-super-admins need
            // for the Branding tab to render editable inputs.
            ['key' => 'primary_color',        'value' => '#3b82f6', 'type' => 'string',  'group' => 'appearance', 'label' => 'Primary Color'],
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

            // Points — backfilled here so the row appears on the Loyalty
            // tab for orgs created before this key was seeded.
            ['key' => 'birthday_bonus_points', 'value' => '500',    'type' => 'integer', 'group' => 'points',     'label' => 'Birthday Bonus Points', 'description' => 'Points auto-awarded on each member\'s birthday. 0 disables.'],

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
            // Sender identity a venue can safely control. The SMTP host /
            // port / username / password rows that used to live here were
            // deleted (see 2026_08_14_100000): nothing ever read them, and a
            // server-side SMTP client aimed at a tenant-supplied host is an
            // SSRF vector. A venue sends as itself by verifying a DOMAIN in
            // SES, not by handing us a password.
            //
            // From ADDRESS is deliberately absent too — it must stay on the
            // platform's authenticated domain or DMARC alignment breaks.
            ['key' => 'mail_from_name',               'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Sender name',      'description' => 'The name recipients see on email from your venue. Defaults to your organisation name.'],
            ['key' => 'mail_reply_to',                'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Reply-to address', 'description' => 'Where replies go. Defaults to your organisation email.'],
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

            // Member portal (phase 2) — booking + loyalty behaviour the
            // portal reads at booking/cancel/confirm time.
            ['key' => 'services_require_staff_confirmation', 'value' => 'false', 'type' => 'boolean', 'group' => 'booking', 'label' => 'Member portal bookings need staff confirmation'],
            ['key' => 'points_on_bookings',                  'value' => 'true',  'type' => 'boolean', 'group' => 'loyalty', 'label' => 'Award points when a booking is completed'],
            ['key' => 'services_cancel_hours',               'value' => '24',    'type' => 'integer', 'group' => 'booking', 'label' => 'Free cancellation window for appointments (hours)'],
            ['key' => 'booking_cancel_hours',                'value' => '48',    'type' => 'integer', 'group' => 'booking', 'label' => 'Free cancellation window for stays (hours)'],
            ['key' => 'portal_enabled',                      'value' => 'true',  'type' => 'boolean', 'group' => 'loyalty', 'label' => 'Member web portal'],
        ];

    }
}
