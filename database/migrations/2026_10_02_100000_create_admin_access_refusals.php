<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the admin access map refused, or would have refused in report mode:
 * one row per day, organisation, person, rule, method, reason and mode, with
 * a hit count (AccessRecorder). No request body, query or answer is kept.
 * Read by `php artisan admin-access:report`. Additive and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('admin_access_refusals')) {
            return;
        }

        Schema::create('admin_access_refusals', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->string('role', 32)->nullable();
            $table->string('rule', 191);
            $table->string('method', 10);
            $table->string('reason', 32);
            $table->boolean('enforced')->default(false);
            $table->unsignedInteger('hits')->default(1);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->index(['day', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_access_refusals');
    }
};
