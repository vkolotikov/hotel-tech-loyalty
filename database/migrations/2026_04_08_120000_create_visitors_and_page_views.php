<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Visitors are persistent identities for everyone who hits the chat widget.
 * One visitor can span many ChatConversation rows (different sessions/tabs).
 *
 * The fingerprint is a sha256 of (org_id|visitor_ip|truncated_user_agent|cookie_id?)
 * which lets us recognise a returning visitor without storing PII directly in the
 * lookup key. The unique constraint is per-organisation so the same IP at two
 * different tenants stays isolated.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('visitors', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->index();
            $table->string('visitor_key', 64);             // sha256 fingerprint
            $table->string('visitor_ip', 45)->nullable();  // IPv6-safe
            $table->string('user_agent', 500)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('referrer', 500)->nullable();
            $table->string('current_page', 1000)->nullable();
            $table->string('current_page_title', 300)->nullable();
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->integer('visit_count')->default(1);
            $table->integer('page_views_count')->default(0);
            $table->integer('messages_count')->default(0);
            $table->boolean('is_lead')->default(false);
            $table->unsignedBigInteger('guest_id')->nullable();
            $table->string('display_name', 150)->nullable(); // visitor_name once captured
            $table->string('email', 180)->nullable();
            $table->string('phone', 40)->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'visitor_key']);
            $table->index(['organization_id', 'last_seen_at']);
            $table->index(['organization_id', 'is_lead']);
            $table->index('guest_id');
        });

        Schema::create('visitor_page_views', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->index();
            $table->unsignedBigInteger('visitor_id');
            $table->text('url');
            $table->string('title', 500)->nullable();
            $table->text('referrer')->nullable();
            $table->integer('duration_seconds')->nullable();
            $table->timestamp('viewed_at');
            $table->timestamps();

            $table->index(['visitor_id', 'viewed_at']);
            $table->foreign('visitor_id')->references('id')->on('visitors')->cascadeOnDelete();
        });

        // Link existing chat_conversations to the new visitor identity.
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->unsignedBigInteger('visitor_id')->nullable()->after('member_id');
            $table->index('visitor_id');
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropIndex(['visitor_id']);
            $table->dropColumn('visitor_id');
        });
        Schema::dropIfExists('visitor_page_views');
        Schema::dropIfExists('visitors');
    }
};
