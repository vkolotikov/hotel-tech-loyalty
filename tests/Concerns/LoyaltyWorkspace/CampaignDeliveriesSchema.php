<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The record of who a campaign emailed (spec 2026-10-22 release 3 §4), in sqlite, as the migration
 * 2026_10_22_120000_create_email_campaign_deliveries_table builds it: one row per campaign and member, unique on the
 * pair. The foreign keys are left out here (the tests' hand-built tables carry none, and sqlite would enforce them
 * against tables another suite built narrower); the unique pair, which the job's insert-or-skip rests on, is kept.
 *
 * Called as buildCampaignDeliveriesSchema(), not setUp…(): Laravel calls setUp<TraitName>() itself, before the base
 * tables exist.
 */
trait CampaignDeliveriesSchema
{
    protected function buildCampaignDeliveriesSchema(): void
    {
        if (!Schema::hasTable('email_campaign_deliveries')) {
            Schema::create('email_campaign_deliveries', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('campaign_id');
                $t->unsignedBigInteger('member_id');
                $t->string('status', 16)->default('pending');
                $t->timestamps();
                $t->unique(['campaign_id', 'member_id']);
                $t->index('member_id');
            });
        }
    }
}
