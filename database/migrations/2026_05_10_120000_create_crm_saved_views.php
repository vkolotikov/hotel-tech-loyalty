<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CRM Phase 3 — per-user saved views for the Sales Pipeline page.
 *
 * Each row is a named filter combination ("My open high-value deals",
 * "Going cold this week") that the user can save and pin to a chip
 * strip above the table. Per-user; share-with-team is Phase 4+.
 *
 * `filters` is the same JSON shape that the front-end sends to
 * /v1/admin/inquiries query string params. Stored verbatim so the
 * server doesn't need to interpret it on save — only on apply.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('crm_saved_views')) return;

        Schema::create('crm_saved_views', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Which page does this view belong to? Today: 'inquiries'.
            // Reserved so we can hang Tasks / Reservations saved views off
            // the same table later without a new migration.
            $t->string('page', 32)->default('inquiries')->index();

            $t->string('name', 80);
            $t->json('filters'); // verbatim query-string params
            $t->boolean('is_pinned')->default(true);
            $t->unsignedSmallInteger('sort_order')->default(0);

            $t->timestamps();

            $t->index(['organization_id', 'user_id', 'page', 'is_pinned'], 'saved_views_user_page_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_saved_views');
    }
};
