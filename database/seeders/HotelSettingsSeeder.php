<?php

namespace Database\Seeders;

use App\Models\HotelSetting;
use Illuminate\Database\Seeder;

class HotelSettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            // General group
            ['key' => 'hotel_name',     'value' => 'Hotel Loyalty',         'type' => 'string',  'group' => 'general', 'label' => 'Hotel Name',     'description' => 'The name of the hotel displayed throughout the app.'],
            ['key' => 'hotel_email',    'value' => 'info@hotel-loyalty.com', 'type' => 'string',  'group' => 'general', 'label' => 'Hotel Email',    'description' => 'Primary contact email address.'],
            ['key' => 'hotel_phone',    'value' => '',                       'type' => 'string',  'group' => 'general', 'label' => 'Hotel Phone',    'description' => 'Primary contact phone number.'],
            ['key' => 'hotel_address',  'value' => '',                       'type' => 'string',  'group' => 'general', 'label' => 'Hotel Address',  'description' => 'Physical address of the hotel.'],
            ['key' => 'hotel_website',  'value' => '',                       'type' => 'string',  'group' => 'general', 'label' => 'Hotel Website',  'description' => 'Hotel website URL.'],
            ['key' => 'hotel_currency', 'value' => 'USD',                    'type' => 'string',  'group' => 'general', 'label' => 'Currency',       'description' => 'Default currency for monetary values.'],
            ['key' => 'hotel_timezone', 'value' => 'UTC',                    'type' => 'string',  'group' => 'general', 'label' => 'Timezone',       'description' => 'Default timezone for the hotel.'],

            // Points group
            ['key' => 'welcome_bonus_points', 'value' => '500', 'type' => 'integer', 'group' => 'points', 'label' => 'Welcome Bonus Points',  'description' => 'Points awarded to new members upon registration.'],
            ['key' => 'referrer_bonus_points', 'value' => '250', 'type' => 'integer', 'group' => 'points', 'label' => 'Referrer Bonus Points', 'description' => 'Points awarded to the member who referred someone.'],
            ['key' => 'referee_bonus_points', 'value' => '250', 'type' => 'integer', 'group' => 'points', 'label' => 'Referee Bonus Points', 'description' => 'Points awarded to the new member who joined via referral.'],
            ['key' => 'birthday_bonus_points', 'value' => '500', 'type' => 'integer', 'group' => 'points', 'label' => 'Birthday Bonus Points', 'description' => 'Points auto-awarded to members on their birthday by the daily birthday cron. Set to 0 to disable.'],
            ['key' => 'points_per_dollar',    'value' => '10',  'type' => 'integer', 'group' => 'points', 'label' => 'Points Per Dollar',     'description' => 'Number of points earned per dollar spent.'],
            ['key' => 'points_expiry_months', 'value' => '24',  'type' => 'integer', 'group' => 'points', 'label' => 'Points Expiry (Months)','description' => 'Number of months before points expire.'],
            ['key' => 'min_redeem_points',    'value' => '100', 'type' => 'integer', 'group' => 'points', 'label' => 'Min Redeem Points',     'description' => 'Minimum points required to redeem.'],
            ['key' => 'manual_award_approval_threshold', 'value' => '500', 'type' => 'integer', 'group' => 'points', 'label' => 'Manual Award Approval Threshold', 'description' => 'Points above this require manager approval for manual awards.'],
            ['key' => 'daily_staff_adjustment_limit', 'value' => '5000', 'type' => 'integer', 'group' => 'points', 'label' => 'Daily Staff Adjustment Limit', 'description' => 'Maximum total points a staff member can manually award per day.'],
            ['key' => 'tier_qualification_model', 'value' => 'points', 'type' => 'string', 'group' => 'points', 'label' => 'Tier Qualification Model', 'description' => 'How tiers are qualified: points, nights, stays, spend, or hybrid.'],

            // Notifications group
            ['key' => 'push_notifications_enabled',  'value' => 'true', 'type' => 'boolean', 'group' => 'notifications', 'label' => 'Push Notifications',       'description' => 'Enable or disable push notifications.'],
            ['key' => 'email_notifications_enabled',  'value' => 'true', 'type' => 'boolean', 'group' => 'notifications', 'label' => 'Email Notifications',      'description' => 'Enable or disable email notifications.'],
            ['key' => 'welcome_email_enabled',        'value' => 'true', 'type' => 'boolean', 'group' => 'notifications', 'label' => 'Welcome Email',            'description' => 'Send a welcome email to new members.'],
            ['key' => 'points_expiry_reminder_days',  'value' => '30',   'type' => 'integer', 'group' => 'notifications', 'label' => 'Points Expiry Reminder',   'description' => 'Days before expiry to send a reminder notification.'],

            // Appearance group — brand colors
            ['key' => 'primary_color',      'value' => '#c9a84c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Primary Color',     'description' => 'Main brand accent color (buttons, links, highlights).'],
            ['key' => 'secondary_color',    'value' => '#1e1e1e', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Color',   'description' => 'Secondary accent for cards and surfaces.'],
            ['key' => 'accent_color',       'value' => '#32d74b', 'type' => 'string', 'group' => 'appearance', 'label' => 'Accent / Success',  'description' => 'Color for success states, badges, and accents.'],
            ['key' => 'background_color',   'value' => '#0d0d0d', 'type' => 'string', 'group' => 'appearance', 'label' => 'Background',        'description' => 'Page background color for both admin and mobile.'],
            ['key' => 'surface_color',      'value' => '#161616', 'type' => 'string', 'group' => 'appearance', 'label' => 'Surface / Card',    'description' => 'Card and panel background color.'],
            ['key' => 'text_color',         'value' => '#ffffff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Text Color',        'description' => 'Primary text color.'],
            ['key' => 'text_secondary_color','value'=> '#8e8e93', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Text',    'description' => 'Muted / secondary text color.'],
            ['key' => 'border_color',       'value' => '#2c2c2c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Border Color',      'description' => 'Border and divider color.'],
            ['key' => 'error_color',        'value' => '#ff375f', 'type' => 'string', 'group' => 'appearance', 'label' => 'Error / Danger',    'description' => 'Color for error states and destructive actions.'],
            ['key' => 'warning_color',      'value' => '#ffd60a', 'type' => 'string', 'group' => 'appearance', 'label' => 'Warning',           'description' => 'Color for warning states.'],
            ['key' => 'info_color',         'value' => '#0a84ff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Info',              'description' => 'Color for informational elements.'],
            ['key' => 'logo_url',           'value' => '',        'type' => 'string', 'group' => 'appearance', 'label' => 'Logo URL',          'description' => 'URL of the hotel logo image.'],
            ['key' => 'dark_mode_enabled',  'value' => 'true',    'type' => 'boolean','group' => 'appearance', 'label' => 'Dark Mode',         'description' => 'Enable dark mode by default.'],
        ];

        foreach ($settings as $setting) {
            HotelSetting::updateOrCreate(
                ['key' => $setting['key']],
                $setting
            );
        }
    }
}
