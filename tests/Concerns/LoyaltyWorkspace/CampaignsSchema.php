<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use App\Models\MemberSegment;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The tables HexaTech Loyalty's segments and campaigns read and write (spec 2026-10-21 release 2 §6), in sqlite, as
 * the migrations build them (member_segments 2026_05_12_220000; email_campaigns 2026_05_12_240000 with
 * body_blocks 2026_05_13 and last_progress_at 2026_08_11; email_suppressions 2026_08_14; and since release 3 the
 * record of who a send emailed, email_campaign_deliveries 2026_10_22, CampaignDeliveriesSchema). Every table and column
 * is guarded, so a narrower table another suite built first is widened rather than replaced. Used beside
 * SetsUpLoyaltyWorkspace; `campaignsOn()` gives the organisation the plan's `campaigns` feature.
 */
trait CampaignsSchema
{
    use CampaignDeliveriesSchema;

    protected function setUpCampaignsSchema(): void
    {
        if (!Schema::hasTable('member_segments')) {
            Schema::create('member_segments', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name', 120);
                $t->text('description')->nullable();
                $t->text('definition');
                $t->unsignedInteger('member_count_cached')->nullable();
                $t->timestamp('member_count_computed_at')->nullable();
                $t->unsignedBigInteger('created_by_user_id')->nullable();
                $t->timestamp('last_sent_at')->nullable();
                $t->unsignedInteger('total_sent_count')->default(0);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('email_campaigns')) {
            Schema::create('email_campaigns', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('segment_id')->nullable();
                $t->string('name', 120);
                $t->string('subject', 200);
                $t->text('body_html');
                $t->text('body_text')->nullable();
                $t->string('status', 16)->default('draft');
                $t->unsignedInteger('recipient_count')->default(0);
                $t->unsignedInteger('sent_count')->default(0);
                $t->unsignedInteger('failed_count')->default(0);
                $t->timestamp('sent_at')->nullable();
                $t->text('error_message')->nullable();
                $t->unsignedBigInteger('created_by_user_id')->nullable();
                $t->unsignedBigInteger('sent_by_user_id')->nullable();
                $t->timestamps();
            });
        }
        // Release 4's send later adds scheduled_at (2026_10_23_150100).
        foreach (['body_blocks' => 'text', 'last_progress_at' => 'timestamp', 'scheduled_at' => 'timestamp'] as $column => $type) {
            if (!Schema::hasColumn('email_campaigns', $column)) {
                Schema::table('email_campaigns', fn (Blueprint $t) => $t->{$type}($column)->nullable());
            }
        }

        if (!Schema::hasTable('email_suppressions')) {
            Schema::create('email_suppressions', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('email', 191);
                $t->string('reason', 32);
                $t->string('source', 32)->default('manual');
                $t->text('detail')->nullable();
                $t->unsignedSmallInteger('failure_count')->default(1);
                $t->timestamp('last_failed_at')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'email']);
            });
        }

        $this->buildCampaignDeliveriesSchema();
    }

    /** The plan's `campaigns` feature, which the campaigns routes need (`feature:campaigns`). */
    protected function campaignsOn(bool $on = true): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['plan_features' => json_encode(['campaigns' => $on])]);
    }

    /** A saved segment of this organisation. */
    protected function makeSegment(string $name, array $definition): MemberSegment
    {
        return MemberSegment::create(['name' => $name, 'definition' => $definition]);
    }
}
