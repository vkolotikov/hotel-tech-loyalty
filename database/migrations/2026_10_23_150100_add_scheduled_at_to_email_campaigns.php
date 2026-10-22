<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Send later for email campaigns (HexaTech Loyalty release 4 §5): the instant (UTC) a scheduled campaign is due,
 * chosen on the venue's clock. A scheduled campaign has the status `scheduled` and `sent_by_user_id` names who
 * scheduled it; the scheduler (`php artisan loyalty:send-scheduled`, every minute) starts it then through
 * Campaigns\CampaignStart, once. (notification_campaigns already has its own `scheduled_at`, which push messages use;
 * sms_campaigns is created with one.)
 *
 * One nullable column: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_campaigns', function (Blueprint $t) {
            $t->timestamp('scheduled_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('email_campaigns', function (Blueprint $t) {
            $t->dropColumn('scheduled_at');
        });
    }
};
