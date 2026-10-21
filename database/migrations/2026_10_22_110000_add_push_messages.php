<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Push messages from HexaTech Loyalty (release 3 §5). A push message is a row of the existing notification_campaigns
 * (so push_notifications.campaign_id links each member's inbox row to it), marked by four new nullable columns:
 *
 *  - `source`: `loyalty` for a message made in the workspace; NULL for the full admin's campaigns, which the
 *    workspace neither lists nor touches;
 *  - `category`: the member opt-out category it is sent under (offers, points, tier, stays), so opt-outs apply;
 *  - `member_segment_id`: the segment (member_segments, the segments both admins build) it is sent to. The older
 *    `segment_id` column points at the separate, older `campaign_segments`, so it is left alone;
 *  - `sent_by_user_id`: who pressed Send.
 *
 * push_message_deliveries holds one row per message and member, unique on the pair: the job writes a member's row
 * before it pushes, and a retried chunk passes over every member whose row is already there, so no member is pushed
 * twice. The row then says `sent` (Expo accepted it), `failed` (Expo refused it, or could not be reached; `reason`
 * says which), `inbox_only` (kept in the inbox, no push: switched off or no device by then) or `skipped` (opted out
 * or deactivated by then; nothing written); one left at `pending` was under way when the worker stopped and is not
 * tried again. (Not a unique index on push_notifications: its live rows may already hold duplicates.) A message's
 * rows go with it; a member's move to the kept member on a merge (MemberMergeService) and go with the member
 * otherwise.
 *
 * Nullable columns and one new table only: safe with `migrate --force` on a live database (no default, no rewrite;
 * the two foreign keys are checked against a small table whose new columns are all NULL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_campaigns', function (Blueprint $t) {
            $t->string('source', 20)->nullable();
            $t->string('category', 20)->nullable();
            $t->foreignId('member_segment_id')->nullable()->constrained('member_segments')->nullOnDelete();
            $t->foreignId('sent_by_user_id')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('push_message_deliveries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('campaign_id')->constrained('notification_campaigns')->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->string('status', 16)->default('pending'); // pending | sent | failed | inbox_only | skipped
            $t->string('reason', 40)->nullable();
            $t->timestamps();

            $t->unique(['campaign_id', 'member_id']);
            $t->index('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_message_deliveries');

        Schema::table('notification_campaigns', function (Blueprint $t) {
            $t->dropConstrainedForeignId('sent_by_user_id');
            $t->dropConstrainedForeignId('member_segment_id');
            $t->dropColumn(['source', 'category']);
        });
    }
};
