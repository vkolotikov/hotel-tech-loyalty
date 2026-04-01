<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            // ─── AI ───────────────────────────────────────────
            ['key' => 'ai_openai_api_key',    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'OpenAI API Key',     'description' => 'API key for GPT models (chatbot, insights, offers)'],
            ['key' => 'ai_openai_model',      'value' => 'gpt-4o', 'type' => 'string', 'group' => 'integrations', 'label' => 'OpenAI Model', 'description' => 'Model ID: gpt-4o, gpt-4o-mini, gpt-4-turbo, etc.'],
            ['key' => 'ai_anthropic_api_key',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Anthropic API Key',  'description' => 'API key for Claude models (CRM AI chat)'],
            ['key' => 'ai_anthropic_model',    'value' => 'claude-sonnet-4-20250514', 'type' => 'string', 'group' => 'integrations', 'label' => 'Anthropic Model', 'description' => 'Model ID: claude-sonnet-4-20250514, claude-haiku-4-5-20251001, etc.'],

            // ─── PMS / Smoobu ─────────────────────────────────
            ['key' => 'booking_smoobu_api_key',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu API Key',   'description' => 'API key from Smoobu PMS settings'],
            ['key' => 'booking_smoobu_channel_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu Channel ID', 'description' => 'Your Smoobu channel/property ID'],
            ['key' => 'booking_smoobu_base_url',   'value' => 'https://login.smoobu.com/api', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu API URL', 'description' => 'Base URL for Smoobu API'],
            ['key' => 'booking_smoobu_webhook_secret', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Smoobu Webhook Secret', 'description' => 'Secret for validating Smoobu webhooks'],

            // ─── Mail / SMTP ──────────────────────────────────
            ['key' => 'mail_host',       'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Host',     'description' => 'Mail server hostname (e.g. smtp.mailgun.org)'],
            ['key' => 'mail_port',       'value' => '587', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Port',   'description' => '587 (TLS) or 465 (SSL)'],
            ['key' => 'mail_username',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Username', 'description' => 'Mail authentication username'],
            ['key' => 'mail_password',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'SMTP Password', 'description' => 'Mail authentication password'],
            ['key' => 'mail_from_address', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'From Address', 'description' => 'Default sender email address'],
            ['key' => 'mail_from_name',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'From Name',    'description' => 'Default sender display name'],

            // ─── Push Notifications ───────────────────────────
            ['key' => 'expo_access_token', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expo Push Token', 'description' => 'Access token for Expo push notifications'],

            // ─── Booking Config ───────────────────────────────
            ['key' => 'booking_units',     'value' => '[]', 'type' => 'json', 'group' => 'booking', 'label' => 'Booking Units',     'description' => 'JSON array of bookable unit configurations'],
            ['key' => 'booking_extras',    'value' => '[]', 'type' => 'json', 'group' => 'booking', 'label' => 'Booking Extras',    'description' => 'JSON array of bookable extras (cleaning fee, etc.)'],
            ['key' => 'booking_policies',  'value' => '{}', 'type' => 'json', 'group' => 'booking', 'label' => 'Booking Policies',  'description' => 'JSON object with cancellation/check-in/check-out policies'],
            ['key' => 'booking_currency',  'value' => 'EUR', 'type' => 'string', 'group' => 'booking', 'label' => 'Booking Currency', 'description' => 'Currency code for booking prices'],
            ['key' => 'booking_min_nights', 'value' => '1', 'type' => 'integer', 'group' => 'booking', 'label' => 'Min Nights',     'description' => 'Minimum nights per booking'],
            ['key' => 'booking_max_nights', 'value' => '30', 'type' => 'integer', 'group' => 'booking', 'label' => 'Max Nights',    'description' => 'Maximum nights per booking'],
            ['key' => 'booking_mock_mode',  'value' => 'true', 'type' => 'boolean', 'group' => 'booking', 'label' => 'Mock Mode',   'description' => 'Use mock PMS data instead of real Smoobu API'],
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
            'ai_openai_api_key', 'ai_openai_model', 'ai_anthropic_api_key', 'ai_anthropic_model',
            'booking_smoobu_api_key', 'booking_smoobu_channel_id', 'booking_smoobu_base_url', 'booking_smoobu_webhook_secret',
            'mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_from_address', 'mail_from_name',
            'expo_access_token',
            'booking_units', 'booking_extras', 'booking_policies', 'booking_currency',
            'booking_min_nights', 'booking_max_nights', 'booking_mock_mode',
        ];
        DB::table('hotel_settings')->whereIn('key', $keys)->delete();
    }
};
