<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Proper email broadcast campaigns — superset of the bulk-message
 * "also send as email" checkbox. Distinct because:
 *   - Subject + HTML body + optional plain body, not just a one-line
 *     title + body of the segment composer
 *   - Optional link to a saved member_segment as the audience
 *   - Persistent history (status, sent_at, counts) so admins can see
 *     "what did we send last month" without spelunking AuditLog
 *
 * Status flow: draft → sending → sent (or failed). The send action
 * is synchronous in v1 because the existing audience cap (5000) is
 * within Mail::raw budget for a typical Laravel Cloud worker run.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_campaigns', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('segment_id')->nullable()->constrained('member_segments')->nullOnDelete();
            $t->string('name', 120);
            $t->string('subject', 200);
            $t->text('body_html');
            $t->text('body_text')->nullable();
            $t->string('status', 16)->default('draft'); // draft | sending | sent | failed
            $t->unsignedInteger('recipient_count')->default(0);
            $t->unsignedInteger('sent_count')->default(0);
            $t->unsignedInteger('failed_count')->default(0);
            $t->timestamp('sent_at')->nullable();
            $t->text('error_message')->nullable();
            $t->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('sent_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            $t->index(['organization_id', 'status']);
            $t->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_campaigns');
    }
};
