<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give every member a stable, unguessable unsubscribe handle.
 *
 * There was no unsubscribe mechanism anywhere in the app — no token, no
 * route, no footer, no `List-Unsubscribe` header — while three bulk paths
 * sent commercial mail. With a plain SMTP transport nothing upstream adds
 * one for you, so the first campaign to a real list would have been a
 * deliverability and compliance incident.
 *
 * The token is per-member and never expires: an unsubscribe link has to
 * keep working in a mail someone opens a year later. It is generated
 * lazily rather than backfilled, so a member who has never been mailed
 * carries no token at all.
 *
 * `unsubscribed_at` records WHEN, which `email_notifications` alone cannot
 * — that flag is also toggled by the member in their own preferences, and
 * the two need telling apart when handling a complaint.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('loyalty_members')) {
            return;
        }

        Schema::table('loyalty_members', function (Blueprint $t) {
            if (!Schema::hasColumn('loyalty_members', 'unsubscribe_token')) {
                $t->string('unsubscribe_token', 64)->nullable()->unique();
            }
            if (!Schema::hasColumn('loyalty_members', 'unsubscribed_at')) {
                $t->timestamp('unsubscribed_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('loyalty_members')) {
            return;
        }

        Schema::table('loyalty_members', function (Blueprint $t) {
            if (Schema::hasColumn('loyalty_members', 'unsubscribe_token')) {
                $t->dropUnique(['unsubscribe_token']);
                $t->dropColumn('unsubscribe_token');
            }
            if (Schema::hasColumn('loyalty_members', 'unsubscribed_at')) {
                $t->dropColumn('unsubscribed_at');
            }
        });
    }
};
