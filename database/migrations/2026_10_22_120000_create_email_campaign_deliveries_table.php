<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per campaign and member: who a send emailed (HexaTech Loyalty release 3 §4).
 *
 * SendEmailCampaignChunk writes a member's row before it hands that member's email to the mailer — an insert that
 * the unique pair turns into a no-op when the row is already there — and only the call that wrote the row sends. A
 * retried chunk therefore passes over every member it already reached, whatever their row says: a member is emailed
 * at most once per send. The row then says `sent`, `failed` (no address, or the mailer threw) or `suppressed` (the
 * transport's suppression listener cancelled it); one left at `pending` is a member whose send was under way when
 * the worker stopped, and is not tried again.
 *
 * A campaign's rows go with it; a member's rows move to the kept member on a merge (MemberMergeService), and go with
 * the member otherwise. Creates a table only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_campaign_deliveries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('campaign_id')->constrained('email_campaigns')->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->string('status', 16)->default('pending'); // pending | sent | failed | suppressed
            $t->timestamps();

            $t->unique(['campaign_id', 'member_id']);
            $t->index('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_campaign_deliveries');
    }
};
