<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            ['key' => 'booking_widget_theme',         'value' => 'light',   'type' => 'string',  'group' => 'booking', 'label' => 'Widget Theme',       'description' => 'Light or dark theme for booking widget'],
            ['key' => 'booking_widget_color',         'value' => '#2d6a4f', 'type' => 'string',  'group' => 'booking', 'label' => 'Widget Color',       'description' => 'Primary brand color for booking widget'],
            ['key' => 'booking_widget_radius',        'value' => '12',      'type' => 'integer', 'group' => 'booking', 'label' => 'Border Radius',      'description' => 'Border radius in pixels for widget elements'],
            ['key' => 'booking_widget_show_name',     'value' => 'true',    'type' => 'boolean', 'group' => 'booking', 'label' => 'Show Property Name', 'description' => 'Display property name in widget header'],
            ['key' => 'booking_widget_property_name', 'value' => '',        'type' => 'string',  'group' => 'booking', 'label' => 'Property Name',      'description' => 'Display name shown in booking widget header'],
            ['key' => 'booking_widget_show_logo',     'value' => 'false',   'type' => 'boolean', 'group' => 'booking', 'label' => 'Show Logo',          'description' => 'Display logo in booking widget header'],
            ['key' => 'booking_widget_logo_url',      'value' => '',        'type' => 'string',  'group' => 'booking', 'label' => 'Widget Logo URL',    'description' => 'URL of logo image for booking widget'],
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
            'booking_widget_theme', 'booking_widget_color', 'booking_widget_radius',
            'booking_widget_show_name', 'booking_widget_property_name',
            'booking_widget_show_logo', 'booking_widget_logo_url',
        ];
        DB::table('hotel_settings')->whereIn('key', $keys)->delete();
    }
};
