<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds mobile_app theme settings for every organization.
 *
 * These keys are intentionally separate from the web `appearance` group so the
 * mobile apps (loyalty member + loyalty staff) can be styled independently of
 * the admin web SPA. The mobile apps fetch them from the existing /v1/theme
 * endpoint which now also returns the mobile_app group.
 */
return new class extends Migration
{
    public function up(): void
    {
        $defaults = [
            ['key' => 'mobile_primary_color',        'value' => '#c9a84c', 'label' => 'Primary / Accent',     'description' => 'Main brand color used on buttons, tabs, highlights, and the loyalty card'],
            ['key' => 'mobile_background_color',     'value' => '#0d0d0d', 'label' => 'Background',           'description' => 'App-wide background color'],
            ['key' => 'mobile_surface_color',        'value' => '#161616', 'label' => 'Surface',              'description' => 'Card and header surface color'],
            ['key' => 'mobile_secondary_color',      'value' => '#1e1e1e', 'label' => 'Secondary Surface',    'description' => 'Inputs, list rows, secondary cards'],
            ['key' => 'mobile_text_color',           'value' => '#ffffff', 'label' => 'Text — Primary',       'description' => 'Main text color'],
            ['key' => 'mobile_text_secondary_color', 'value' => '#8e8e93', 'label' => 'Text — Secondary',     'description' => 'Subdued text, captions, labels'],
            ['key' => 'mobile_border_color',         'value' => '#2c2c2c', 'label' => 'Border',               'description' => 'Dividers and card borders'],
            ['key' => 'mobile_success_color',        'value' => '#32d74b', 'label' => 'Success',              'description' => 'Success badges and confirmations'],
            ['key' => 'mobile_error_color',          'value' => '#ff375f', 'label' => 'Error',                'description' => 'Errors and destructive actions'],
            ['key' => 'mobile_warning_color',        'value' => '#ffd60a', 'label' => 'Warning',              'description' => 'Warnings and pending states'],
            ['key' => 'mobile_info_color',           'value' => '#0a84ff', 'label' => 'Info',                 'description' => 'Informational badges and links'],
            ['key' => 'mobile_card_style',           'value' => 'gradient','label' => 'Loyalty Card Style',   'description' => 'Visual style of the member loyalty card: gradient, solid, or glass'],
            ['key' => 'mobile_radius',               'value' => '16',      'label' => 'Corner Radius',        'description' => 'Default border radius in pixels for cards and buttons'],
        ];

        $orgIds = DB::table('organizations')->pluck('id');
        if ($orgIds->isEmpty()) return;

        foreach ($orgIds as $orgId) {
            foreach ($defaults as $s) {
                $exists = DB::table('hotel_settings')
                    ->where('organization_id', $orgId)
                    ->where('key', $s['key'])
                    ->exists();

                if (!$exists) {
                    DB::table('hotel_settings')->insert([
                        'organization_id' => $orgId,
                        'key'             => $s['key'],
                        'value'           => $s['value'],
                        'type'            => $s['key'] === 'mobile_radius' ? 'integer' : 'string',
                        'group'           => 'mobile_app',
                        'label'           => $s['label'],
                        'description'     => $s['description'],
                        'scope'           => 'company',
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        DB::table('hotel_settings')->where('group', 'mobile_app')->delete();
    }
};
