<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /* ───── Extend properties with CRM-specific columns ───── */
        Schema::table('properties', function (Blueprint $table) {
            $table->string('property_type', 50)->default('Hotel')->after('code');
            $table->string('website', 250)->nullable()->after('phone');
            $table->string('gm_name', 150)->nullable()->after('website');
        });

        /* ───── CRM Settings (key-value config store) ───── */
        Schema::create('crm_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->json('value');
            $table->timestamps();
        });

        $defaults = [
            'employees'              => '["Anna","Marco","Sophia","Luca"]',
            'lead_owners'            => '["Anna","Marco","Sophia","Luca"]',
            'account_managers'       => '["Anna","Marco","Sophia","Luca"]',
            'property_types'         => '["Hotel","Resort","Boutique Hotel","Serviced Apartments","Hostel","Villa"]',
            'room_types'             => '["Standard","Superior","Deluxe","Junior Suite","Executive Suite","Presidential Suite","Villa","Family Room","Penthouse"]',
            'meal_plans'             => '["Room Only","Bed & Breakfast","Half Board","Full Board","All Inclusive"]',
            'inquiry_types'          => '["Room Reservation","Group Booking","Event/MICE","Wedding","Conference","Corporate Rate","Long Stay","Tour Package"]',
            'inquiry_statuses'       => '["New","Responded","Site Visit","Proposal Sent","Negotiating","Tentative","Confirmed","Lost"]',
            'closed_statuses'        => '["Confirmed","Lost"]',
            'reservation_statuses'   => '["Confirmed","Checked In","Checked Out","Cancelled","No Show"]',
            'payment_statuses'       => '["Pending","Deposit Paid","Fully Paid","Refunded","Comp"]',
            'payment_methods'        => '["Credit Card","Bank Transfer","Cash","OTA Collect","Corporate Invoice","PayPal"]',
            'booking_channels'       => '["Direct","Phone","Email","Website","Booking.com","Expedia","Airbnb","Hotels.com","Travel Agent","Corporate","Walk-in","Referral"]',
            'lead_sources'           => '["Website","Phone","Email","Walk-in","Booking.com","Expedia","Travel Agent","Referral","Social Media","Google Ads","Event","Corporate"]',
            'vip_levels'             => '["Standard","Silver","Gold","Platinum","Diamond"]',
            'guest_types'            => '["Individual","Corporate","Travel Agent","Group Leader","VIP","Returning"]',
            'salutations'            => '["Mr.","Mrs.","Ms.","Dr.","Prof.","Sir","Madam","Sheikh","H.E."]',
            'lifecycle_statuses'     => '["Prospect","First-Time Guest","Returning Guest","VIP","Corporate","Inactive"]',
            'importance_levels'      => '["Standard","Important","VIP","VVIP"]',
            'task_types'             => '["Call","Email","WhatsApp","Site Visit","Follow-up","Send Proposal","Send Contract","Confirm Details"]',
            'reservation_task_types' => '["Room Assignment","Welcome Amenity","Airport Transfer","Special Setup","VIP Preparation","Billing Review"]',
            'task_urgencies'         => '["Low","Medium","High","Urgent"]',
            'priorities'             => '["Low","Medium","High"]',
            'planner_groups'         => '["Front Office","Housekeeping","F&B","Sales","Events","Maintenance","Management"]',
            'event_types'            => '["Meeting","Conference","Wedding","Gala Dinner","Corporate Retreat","Product Launch","Exhibition","Workshop"]',
            'function_spaces'        => '["Grand Ballroom","Ballroom A","Ballroom B","Conference Room 1","Conference Room 2","Meeting Room","Terrace","Garden","Restaurant PDR"]',
            'industries'             => '["Technology","Finance","Consulting","Pharmaceutical","Automotive","Energy","Government","Airlines","Media","Other"]',
            'rate_types'             => '["Fixed Rate","Percentage Discount","Best Available Rate Minus"]',
            'countries'              => '["Germany","Austria","Switzerland","United Kingdom","France","Italy","Spain","Netherlands","USA","UAE","Saudi Arabia","China","Japan","Russia","India","Brazil","Australia","Sweden","Norway","Denmark","Poland","Czech Republic","Turkey","Egypt","Thailand","Singapore","South Korea","Canada","Mexico","South Africa"]',
            'default_inquiry_value'  => '"0"',
            'currency_symbol'        => '"€"',
            'company_name'           => '"Hotel Group"',
            'date_format'            => '"Y-m-d"',
        ];

        $rows = [];
        $now  = now();
        foreach ($defaults as $key => $value) {
            $rows[] = ['key' => $key, 'value' => $value, 'created_at' => $now, 'updated_at' => $now];
        }
        DB::table('crm_settings')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_settings');

        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['property_type', 'website', 'gm_name']);
        });
    }
};
