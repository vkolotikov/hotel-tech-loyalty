<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add scope column to distinguish system vs company settings
        if (!Schema::hasColumn('hotel_settings', 'scope')) {
            Schema::table('hotel_settings', function (Blueprint $table) {
                $table->string('scope', 20)->default('company')->after('description');
            });
        }

        // 2. Mark AI provider settings as system-only
        DB::table('hotel_settings')
            ->whereIn('key', [
                'ai_openai_api_key', 'ai_openai_model',
                'ai_anthropic_api_key', 'ai_anthropic_model',
            ])
            ->update(['scope' => 'system']);

        // 3. Seed popular PMS / booking engine integrations
        $settings = [
            // ─── Cloudbeds ───────────────────────────────────
            ['key' => 'cloudbeds_api_key',     'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds API Key',     'description' => 'API key from Cloudbeds Marketplace', 'scope' => 'company'],
            ['key' => 'cloudbeds_property_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Property ID', 'description' => 'Your property ID in Cloudbeds', 'scope' => 'company'],
            ['key' => 'cloudbeds_client_id',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Client ID',   'description' => 'OAuth Client ID for Cloudbeds API', 'scope' => 'company'],
            ['key' => 'cloudbeds_client_secret','value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Cloudbeds Client Secret','description' => 'OAuth Client Secret for Cloudbeds API', 'scope' => 'company'],

            // ─── Mews ────────────────────────────────────────
            ['key' => 'mews_access_token',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews Access Token',  'description' => 'Access token from Mews Marketplace connector', 'scope' => 'company'],
            ['key' => 'mews_client_token',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews Client Token',  'description' => 'Client token for your Mews property', 'scope' => 'company'],
            ['key' => 'mews_platform_url',  'value' => 'https://api.mews.com', 'type' => 'string', 'group' => 'integrations', 'label' => 'Mews API URL', 'description' => 'Mews API base URL (use demo for testing)', 'scope' => 'company'],

            // ─── Guesty ──────────────────────────────────────
            ['key' => 'guesty_api_key',    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty API Key',    'description' => 'API key from Guesty Developer settings', 'scope' => 'company'],
            ['key' => 'guesty_api_secret', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty API Secret', 'description' => 'API secret for Guesty authentication', 'scope' => 'company'],
            ['key' => 'guesty_account_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Guesty Account ID', 'description' => 'Your Guesty account ID', 'scope' => 'company'],

            // ─── Hostaway ────────────────────────────────────
            ['key' => 'hostaway_api_key',    'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Hostaway API Key',    'description' => 'API key from Hostaway Settings', 'scope' => 'company'],
            ['key' => 'hostaway_account_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Hostaway Account ID', 'description' => 'Your Hostaway account ID', 'scope' => 'company'],

            // ─── Beds24 ─────────────────────────────────────
            ['key' => 'beds24_api_key',     'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Beds24 API Key',     'description' => 'API key from Beds24 Settings > API', 'scope' => 'company'],
            ['key' => 'beds24_property_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Beds24 Property ID', 'description' => 'Property ID in Beds24', 'scope' => 'company'],

            // ─── Lodgify ─────────────────────────────────────
            ['key' => 'lodgify_api_key',     'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Lodgify API Key',     'description' => 'API key from Lodgify > Integrations', 'scope' => 'company'],
            ['key' => 'lodgify_property_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Lodgify Property ID', 'description' => 'Your Lodgify property ID', 'scope' => 'company'],

            // ─── Little Hotelier ─────────────────────────────
            ['key' => 'little_hotelier_api_key',     'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Little Hotelier API Key',     'description' => 'API key from Little Hotelier > Settings', 'scope' => 'company'],
            ['key' => 'little_hotelier_property_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Little Hotelier Property ID', 'description' => 'Your property ID in Little Hotelier', 'scope' => 'company'],

            // ─── RoomRaccoon ─────────────────────────────────
            ['key' => 'roomraccoon_api_key',     'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'RoomRaccoon API Key',     'description' => 'API key from RoomRaccoon developer portal', 'scope' => 'company'],
            ['key' => 'roomraccoon_property_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'RoomRaccoon Property ID', 'description' => 'Your property ID in RoomRaccoon', 'scope' => 'company'],

            // ─── Channel Integrations ────────────────────────
            ['key' => 'booking_com_hotel_id', 'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Booking.com Hotel ID', 'description' => 'Your property ID on Booking.com', 'scope' => 'company'],
            ['key' => 'booking_com_api_key',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Booking.com API Key',  'description' => 'Connectivity partner API key', 'scope' => 'company'],
            ['key' => 'airbnb_api_key',       'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Airbnb API Key',       'description' => 'Host API key from Airbnb developer account', 'scope' => 'company'],
            ['key' => 'airbnb_listing_ids',   'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Airbnb Listing IDs',   'description' => 'Comma-separated listing IDs to sync', 'scope' => 'company'],
            ['key' => 'expedia_api_key',      'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expedia API Key',      'description' => 'EPS API key from Expedia Partner Central', 'scope' => 'company'],
            ['key' => 'expedia_property_id',  'value' => '', 'type' => 'string', 'group' => 'integrations', 'label' => 'Expedia Property ID',  'description' => 'Your property ID on Expedia', 'scope' => 'company'],
        ];

        foreach ($settings as $s) {
            if (!DB::table('hotel_settings')->where('key', $s['key'])->exists()) {
                DB::table('hotel_settings')->insert(array_merge($s, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
            }
        }
    }

    public function down(): void
    {
        Schema::table('hotel_settings', function (Blueprint $table) {
            if (Schema::hasColumn('hotel_settings', 'scope')) {
                $table->dropColumn('scope');
            }
        });

        $keys = [
            'cloudbeds_api_key', 'cloudbeds_property_id', 'cloudbeds_client_id', 'cloudbeds_client_secret',
            'mews_access_token', 'mews_client_token', 'mews_platform_url',
            'guesty_api_key', 'guesty_api_secret', 'guesty_account_id',
            'hostaway_api_key', 'hostaway_account_id',
            'beds24_api_key', 'beds24_property_id',
            'lodgify_api_key', 'lodgify_property_id',
            'little_hotelier_api_key', 'little_hotelier_property_id',
            'roomraccoon_api_key', 'roomraccoon_property_id',
            'booking_com_hotel_id', 'booking_com_api_key',
            'airbnb_api_key', 'airbnb_listing_ids',
            'expedia_api_key', 'expedia_property_id',
        ];
        DB::table('hotel_settings')->whereIn('key', $keys)->delete();
    }
};
