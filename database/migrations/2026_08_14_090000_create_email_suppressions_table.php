<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Addresses we must not email, and why.
 *
 * Until now nothing recorded a bad address. A hard bounce was retried on every
 * subsequent campaign and a spam complaint was invisible, which is the fastest
 * way to lose a shared sending reputation — the platform sends every tenant's
 * mail from one domain, so one tenant's stale list degrades delivery for all of
 * them.
 *
 * Scope: `organization_id` NULL means platform-wide (a hard bounce or a spam
 * complaint is a property of the ADDRESS, not of who mailed it, and a mailbox
 * that does not exist does not exist for anyone). A non-null value scopes the
 * row to one tenant, which is what an opt-out is: unsubscribing from one venue
 * must not silence another.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_suppressions', function (Blueprint $table) {
            $table->id();

            // NULL = platform-wide. Deliberately nullable, and deliberately NOT
            // a foreign key with cascade: a suppression must outlive the org
            // that caused it, or deleting a tenant would silently resurrect
            // every address they burned.
            $table->unsignedBigInteger('organization_id')->nullable()->index();

            // Stored lowercased and trimmed — see EmailSuppression::normalise.
            // Address comparison is case-insensitive in practice, and a
            // suppression that misses because of a capital letter is worthless.
            $table->string('email', 191);

            // hard_bounce | complaint | soft_bounce_threshold | unsubscribe | manual | invalid
            $table->string('reason', 32)->index();

            // Where it came from: 'ses', 'manual', 'import', 'app'. Keeps the
            // audit trail honest when several inputs can suppress.
            $table->string('source', 32)->default('manual');

            // Provider payload snippet / operator note. NOT the message body —
            // this table must not become an accidental PII store.
            $table->text('detail')->nullable();

            // Bounce counting for soft bounces, which only suppress after
            // repeated failures.
            $table->unsignedSmallInteger('failure_count')->default(1);
            $table->timestamp('last_failed_at')->nullable();

            $table->timestamps();

            // One row per address per scope. The send-time check is a lookup on
            // this, so it has to be exact and fast.
            $table->unique(['organization_id', 'email'], 'email_suppressions_scope_unique');
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_suppressions');
    }
};
