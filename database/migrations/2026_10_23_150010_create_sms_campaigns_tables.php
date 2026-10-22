<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SMS campaigns from HexaTech Loyalty (release 4 §5, R4-4): a text sent to a segment's members who turned "Offers by
 * SMS" on and have a phone number in international form, through the venue's own Twilio account.
 *
 * Their own table rather than rows of notification_campaigns: that table is the full admin's push and email campaigns'
 * (its Notifications page lists every row, and a channel it does not know would show there as a push campaign), its
 * title column is required, and an SMS has no inbox row to link (push_notifications.campaign_id).
 *
 * sms_campaigns: draft → scheduled (send later) → sending (one conditional update) → sent, or cancelled (while
 * sending), or failed (a chunk gave up, the Twilio account refused the credentials, or a scheduled one could not start;
 * `error_message` holds the reason's code). `scheduled_at` is an instant (UTC), chosen on the venue's clock.
 *
 * sms_campaign_deliveries: one row per campaign and member, unique on the pair, written before the member's SMS is
 * handed to Twilio: a retried chunk passes over every member whose row is already there, so no member is texted twice.
 * The row then says `sent` (Twilio accepted it; `twilio_sid` and `segments`, the parts Twilio counted), `failed`
 * (`reason`: Twilio's error code, the HTTP status, or `unreachable`) or `skipped` (by then switched off, without
 * consent or without a valid number); one left `pending` was under way when the worker stopped and is not tried again.
 * A campaign's rows go with it; a member's move to the kept member on a merge (MemberMergeService) and go with the
 * member otherwise.
 *
 * New tables only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_campaigns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('member_segment_id')->nullable()->constrained('member_segments')->nullOnDelete();
            $t->string('name', 120);
            $t->text('body');
            $t->string('status', 16)->default('draft'); // draft | scheduled | sending | sent | cancelled | failed
            $t->unsignedInteger('recipient_count')->default(0);
            $t->timestamp('scheduled_at')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->string('error_message', 64)->nullable();
            $t->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('sent_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            $t->index(['organization_id', 'created_at']);
            $t->index(['status', 'scheduled_at']);
        });

        Schema::create('sms_campaign_deliveries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('campaign_id')->constrained('sms_campaigns')->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->string('status', 16)->default('pending'); // pending | sent | failed | skipped
            $t->string('reason', 40)->nullable();
            $t->string('twilio_sid', 64)->nullable();
            $t->unsignedSmallInteger('segments')->nullable();
            $t->timestamps();

            $t->unique(['campaign_id', 'member_id']);
            $t->index('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_campaign_deliveries');
        Schema::dropIfExists('sms_campaigns');
    }
};
