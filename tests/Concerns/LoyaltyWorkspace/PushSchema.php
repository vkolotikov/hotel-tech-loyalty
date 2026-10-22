<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The tables the member inbox and HexaTech Loyalty's push messages read and write (spec 2026-10-22 release 3 §3, §5),
 * in sqlite, as the migrations build them: push_notifications (2024_01_01_000011, with its campaign link), the push
 * columns of loyalty_members (2024_01_01_000003, 2026_05_12_190000), notification_campaigns (2024_01_01_000012 and
 * the columns later migrations added, with this release's 2026_10_22_110000) and push_message_deliveries (the same
 * migration, with release 4's Expo receipt columns, 2026_10_23_150200). Every table and column is guarded, so a narrower table another suite built first is widened rather
 * than replaced. No foreign keys: the tests' hand-built tables carry none; the unique pair the job's insert-or-skip
 * rests on is kept.
 *
 * Called as buildPushSchema(), not setUp…(): Laravel calls setUp<TraitName>() itself, before the base tables exist.
 * `pushOn()` gives the organisation the plan's `push_notifications` feature.
 */
trait PushSchema
{
    protected function buildPushSchema(): void
    {
        if (!Schema::hasTable('push_notifications')) {
            Schema::create('push_notifications', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('member_id');
                $t->string('type', 100);
                $t->string('title');
                $t->text('body');
                $t->text('data')->nullable();
                $t->string('channel', 20)->default('push');
                $t->unsignedBigInteger('campaign_id')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->timestamp('read_at')->nullable();
                $t->boolean('is_sent')->default(false);
                $t->timestamps();
                $t->index('member_id');
            });
        }
        $this->pushColumns('push_notifications', [
            'campaign_id' => fn (Blueprint $t) => $t->unsignedBigInteger('campaign_id')->nullable(),
            'sent_at'     => fn (Blueprint $t) => $t->timestamp('sent_at')->nullable(),
            'read_at'     => fn (Blueprint $t) => $t->timestamp('read_at')->nullable(),
        ]);

        $this->pushColumns('loyalty_members', [
            'push_notifications'       => fn (Blueprint $t) => $t->boolean('push_notifications')->default(true),
            'expo_push_token'          => fn (Blueprint $t) => $t->string('expo_push_token')->nullable(),
            'notification_preferences' => fn (Blueprint $t) => $t->text('notification_preferences')->nullable(),
        ]);

        if (!Schema::hasTable('notification_campaigns')) {
            Schema::create('notification_campaigns', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('name');
                $t->text('segment_rules')->nullable();
                $t->string('title');
                $t->text('body');
                $t->text('data')->nullable();
                $t->string('channel', 20)->default('push');
                $t->unsignedBigInteger('email_template_id')->nullable();
                $t->string('email_subject')->nullable();
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->integer('target_count')->default(0);
                $t->integer('sent_count')->default(0);
                $t->integer('email_sent_count')->default(0);
                $t->integer('opened_count')->default(0);
                $t->string('status', 20)->default('draft');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->unsignedBigInteger('segment_id')->nullable();
                $t->timestamps();
            });
        }
        // This release's columns (2026_10_22_110000).
        $this->pushColumns('notification_campaigns', [
            'source'            => fn (Blueprint $t) => $t->string('source', 20)->nullable(),
            'category'          => fn (Blueprint $t) => $t->string('category', 20)->nullable(),
            'member_segment_id' => fn (Blueprint $t) => $t->unsignedBigInteger('member_segment_id')->nullable(),
            'sent_by_user_id'   => fn (Blueprint $t) => $t->unsignedBigInteger('sent_by_user_id')->nullable(),
        ]);

        if (!Schema::hasTable('push_message_deliveries')) {
            Schema::create('push_message_deliveries', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('campaign_id');
                $t->unsignedBigInteger('member_id');
                $t->string('status', 16)->default('pending');
                $t->string('reason', 40)->nullable();
                $t->timestamps();
                $t->unique(['campaign_id', 'member_id']);
                $t->index('member_id');
            });
        }
        // Release 4's Expo receipts (2026_10_23_150200).
        $this->pushColumns('push_message_deliveries', [
            'ticket_id'  => fn (Blueprint $t) => $t->string('ticket_id', 64)->nullable(),
            'token_hash' => fn (Blueprint $t) => $t->string('token_hash', 64)->nullable(),
            'receipt_at' => fn (Blueprint $t) => $t->timestamp('receipt_at')->nullable(),
        ]);
    }

    /** The plan's `push_notifications` feature, which the push routes need (`feature:push_notifications`). */
    protected function pushOn(bool $on = true): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['plan_features' => json_encode(['push_notifications' => $on])]);
    }

    /** @param array<string, \Closure(Blueprint): mixed> $add */
    private function pushColumns(string $table, array $add): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        foreach ($add as $column => $define) {
            if (!Schema::hasColumn($table, $column)) {
                Schema::table($table, $define);
            }
        }
    }
}
