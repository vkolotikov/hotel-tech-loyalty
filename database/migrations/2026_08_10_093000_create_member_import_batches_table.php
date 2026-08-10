<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Resumable state for a member CSV import.
 *
 * A 5 000-member migration is roughly twelve minutes of database work:
 * each member is an insert, a membership row, an opening-balance award and
 * — where they had already spent points — a redemption, all through
 * LoyaltyService so the ledger and expiry buckets are real. No HTTP request
 * survives that, and the previous synchronous endpoint didn't try to: it
 * quietly kept the first 500 rows and reported success.
 *
 * Rather than stand up queue infrastructure (no jobs table, no worker, no
 * Procfile in this app), the import is driven in chunks by the client. Each
 * call processes a bounded slice and returns progress, so the operator gets
 * a real progress bar, a tab-close is recoverable, and the work runs
 * anywhere the app already runs.
 *
 * The uploaded file is kept for the life of the batch and re-parsed per
 * chunk — parsing 5 000 rows costs ~40ms, far cheaper than storing every
 * parsed row and keeping it consistent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_import_batches', function (Blueprint $t) {
            $t->id();
            $t->uuid('uuid')->unique();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $t->string('original_filename', 255)->nullable();
            $t->string('stored_path', 500)->nullable();

            // Every data row in the file, including ones that will fail.
            // Reported to the operator verbatim so a partial import can
            // never be mistaken for a complete one.
            $t->unsignedInteger('file_rows')->default(0);
            // Rows the parser could turn into candidate members.
            $t->unsignedInteger('total_rows')->default(0);

            $t->unsignedInteger('processed')->default(0);
            $t->unsignedInteger('ok_count')->default(0);
            $t->unsignedInteger('skip_count')->default(0);
            $t->unsignedInteger('error_count')->default(0);
            $t->unsignedBigInteger('points_awarded')->default(0);

            // pending → running → completed | cancelled | failed
            $t->string('status', 16)->default('pending');
            $t->text('error_message')->nullable();

            // Per-row verdicts, appended chunk by chunk. Bounded on read so
            // a 25 000-row file can't build a response nothing can render.
            $t->jsonb('results')->nullable();
            // Columns we recognised / ignored, surfaced in the preview so
            // silently-dropped data is impossible.
            $t->jsonb('columns_used')->nullable();
            $t->jsonb('columns_ignored')->nullable();

            $t->timestamp('started_at')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->timestamps();

            $t->index(['organization_id', 'created_at']);
            $t->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_import_batches');
    }
};
