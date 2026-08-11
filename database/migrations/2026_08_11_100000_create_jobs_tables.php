<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The queue tables this app has been missing.
 *
 * `config/queue.php` falls back to `sync`, there is no jobs table, no
 * `app/Jobs/` and no worker — so every `->queue()` call in the codebase
 * has silently run inline, inside the web request, since day one. Nothing
 * failed loudly; requests just took as long as the work did.
 *
 * That is survivable for a welcome email and not survivable for a campaign
 * to 5 000 people: `EmailCampaignController::send` flips the campaign to
 * SENDING and only advances to SENT after the whole synchronous SMTP loop,
 * so a timeout leaves it stuck in SENDING with no way back — `send`,
 * `update` and `destroy` all refuse a non-draft row.
 *
 * `failed_jobs` already exists (Laravel's default migration), so only the
 * live tables are created here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('jobs')) {
            Schema::create('jobs', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('queue')->index();
                $table->longText('payload');
                $table->unsignedTinyInteger('attempts');
                $table->unsignedInteger('reserved_at')->nullable();
                $table->unsignedInteger('available_at');
                $table->unsignedInteger('created_at');
            });
        }

        // Used by Bus::batch(). Not required by the campaign sender, but
        // creating it here means the next batched job doesn't need another
        // migration on a production database.
        if (!Schema::hasTable('job_batches')) {
            Schema::create('job_batches', function (Blueprint $table) {
                $table->string('id')->primary();
                $table->string('name');
                $table->integer('total_jobs');
                $table->integer('pending_jobs');
                $table->integer('failed_jobs');
                $table->longText('failed_job_ids');
                $table->mediumText('options')->nullable();
                $table->integer('cancelled_at')->nullable();
                $table->integer('created_at');
                $table->integer('finished_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('job_batches');
        Schema::dropIfExists('jobs');
    }
};
