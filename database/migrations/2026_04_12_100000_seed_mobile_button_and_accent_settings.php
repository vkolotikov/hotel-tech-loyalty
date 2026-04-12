<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $orgIds = DB::table('organizations')->pluck('id');

        $settings = [
            ['key' => 'mobile_button_style', 'value' => 'filled', 'label' => 'Button Style', 'type' => 'string', 'group' => 'mobile_app', 'scope' => 'company'],
            ['key' => 'mobile_accent_intensity', 'value' => 'vibrant', 'label' => 'Accent Intensity', 'type' => 'string', 'group' => 'mobile_app', 'scope' => 'company'],
        ];

        foreach ($orgIds as $orgId) {
            foreach ($settings as $setting) {
                DB::table('hotel_settings')->updateOrInsert(
                    ['organization_id' => $orgId, 'key' => $setting['key']],
                    array_merge($setting, [
                        'organization_id' => $orgId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]),
                );
            }
        }
    }

    public function down(): void
    {
        DB::table('hotel_settings')->whereIn('key', ['mobile_button_style', 'mobile_accent_intensity'])->delete();
    }
};
