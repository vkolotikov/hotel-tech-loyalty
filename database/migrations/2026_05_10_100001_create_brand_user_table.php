<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pivot table for per-brand staff permissions.
 *
 * Decision #3 in MULTI_BRAND_PLAN.md: staff users sit at the org level but
 * can be granted access to specific brands only. A staff with no rows here
 * defaults to "all brands access" (preserves existing single-brand behaviour
 * — every existing user keeps full visibility until an admin restricts them).
 *
 * `role` is the brand-level role (admin / manager / staff). The org-level
 * role from Spatie Permissions still gates feature access; this pivot only
 * answers "can this user see/edit data scoped to brand X?".
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('brand_user')) {
            return;
        }

        Schema::create('brand_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 32)->default('staff');
            $table->timestamps();

            $table->unique(['brand_id', 'user_id'], 'brand_user_unique');
            $table->index('user_id', 'brand_user_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('brand_user');
    }
};
