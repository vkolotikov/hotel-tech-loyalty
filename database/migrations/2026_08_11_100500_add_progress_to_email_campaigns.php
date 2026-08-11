<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Let a running campaign show progress, and be stoppable.
 *
 * Sending is now chunked across queued jobs, so a campaign can legitimately
 * sit in SENDING for a while. Without a heartbeat there is no way to tell
 * "working through 5 000 recipients" from "stuck since Tuesday", and with
 * no cancelled state the only escape from a wedged campaign was to
 * duplicate it — which duplicates the deliveries too.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('email_campaigns')) {
            return;
        }

        Schema::table('email_campaigns', function (Blueprint $t) {
            if (!Schema::hasColumn('email_campaigns', 'last_progress_at')) {
                $t->timestamp('last_progress_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('email_campaigns') || !Schema::hasColumn('email_campaigns', 'last_progress_at')) {
            return;
        }

        Schema::table('email_campaigns', function (Blueprint $t) {
            $t->dropColumn('last_progress_at');
        });
    }
};
