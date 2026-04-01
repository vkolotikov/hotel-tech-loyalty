<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            // ─── Stripe (Payments) ───────────────────────────
            ['key' => 'stripe_publishable_key', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Publishable Key', 'description' => 'Public key for Stripe.js (starts with pk_)'],
            ['key' => 'stripe_secret_key',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Secret Key',      'description' => 'Secret key for server-side Stripe API (starts with sk_)'],
            ['key' => 'stripe_webhook_secret',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Webhook Secret',  'description' => 'Webhook signing secret (starts with whsec_)'],
            ['key' => 'stripe_currency',         'value' => 'eur', 'type' => 'string', 'group' => 'integrations', 'label' => 'Stripe Currency',     'description' => 'Default currency code (eur, usd, gbp, etc.)'],

            // ─── Twilio (SMS) ────────────────────────────────
            ['key' => 'twilio_account_sid',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Account SID',  'description' => 'Account SID from Twilio Console'],
            ['key' => 'twilio_auth_token',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Auth Token',   'description' => 'Auth token from Twilio Console'],
            ['key' => 'twilio_phone_number', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Twilio Phone Number', 'description' => 'Sender phone number in E.164 format (+1234567890)'],

            // ─── WhatsApp Business (via Meta Cloud API) ──────
            ['key' => 'whatsapp_phone_id',    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Phone Number ID', 'description' => 'Phone Number ID from Meta Business dashboard'],
            ['key' => 'whatsapp_access_token', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Access Token',   'description' => 'Permanent access token from Meta Business'],
            ['key' => 'whatsapp_verify_token', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'WhatsApp Verify Token',   'description' => 'Custom token for webhook verification'],

            // ─── Google Services ─────────────────────────────
            ['key' => 'google_maps_api_key',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Maps API Key',    'description' => 'API key for Maps embed and geocoding'],
            ['key' => 'google_analytics_id',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Analytics ID',    'description' => 'Measurement ID (G-XXXXXXXXXX) for tracking'],
            ['key' => 'google_tag_manager_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Google Tag Manager ID',  'description' => 'Container ID (GTM-XXXXXXX) for tag management'],

            // ─── Zapier / Webhooks ───────────────────────────
            ['key' => 'zapier_webhook_url',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Zapier Webhook URL',  'description' => 'Catch hook URL for sending events to Zapier'],
            ['key' => 'custom_webhook_url',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Custom Webhook URL',  'description' => 'URL to receive POST event notifications'],
            ['key' => 'custom_webhook_secret', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Custom Webhook Secret', 'description' => 'Secret for HMAC signature verification'],
        ];

        foreach ($settings as $s) {
            $exists = DB::table('hotel_settings')
                ->where('key', $s['key'])
                ->exists();

            if (!$exists) {
                DB::table('hotel_settings')->insert(array_merge($s, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
            }
        }
    }

    public function down(): void
    {
        $keys = [
            'stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret', 'stripe_currency',
            'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number',
            'whatsapp_phone_id', 'whatsapp_access_token', 'whatsapp_verify_token',
            'google_maps_api_key', 'google_analytics_id', 'google_tag_manager_id',
            'zapier_webhook_url', 'custom_webhook_url', 'custom_webhook_secret',
        ];
        DB::table('hotel_settings')->whereIn('key', $keys)->delete();
    }
};
