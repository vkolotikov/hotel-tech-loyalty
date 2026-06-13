<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\Schema;

/**
 * Test-only schema builder for the small set of tables needed by
 * tenant-boundary tests.
 *
 * Why this exists: the production migration set has 137 files heavy
 * with Postgres-only features (jsonb, partial unique indexes, ILIKE,
 * GIN indexes) that don't run on the in-memory sqlite test DB the
 * audit asked for. Building the full schema piece by piece in sqlite
 * would be a multi-day port with limited value.
 *
 * This trait gives a tightly-scoped alternative: declare the columns
 * the test actually touches, in sqlite-safe SQL. Tests that need more
 * than these 3 tables can extend this trait or define their own.
 *
 * Once a real test-Postgres setup is wired in (cf. AUDIT-2026-06-13.md
 * testing recommendation), this trait can be retired in favour of
 * RefreshDatabase against the real migrations. Until then, this is
 * the canonical foundation for cross-tenant boundary tests.
 */
trait SetsUpMinimalSchema
{
    protected function setUpMinimalSchema(): void
    {
        if (!Schema::hasTable('organizations')) {
            Schema::create('organizations', function ($table) {
                $table->bigIncrements('id');
                $table->string('name')->nullable();
                $table->string('slug')->nullable();
                $table->string('saas_org_id')->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->string('industry', 32)->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('users')) {
            Schema::create('users', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->string('name')->nullable();
                $table->string('email')->unique();
                $table->string('password')->nullable();
                $table->string('user_type')->default('staff');
                $table->string('phone')->nullable();
                $table->string('language', 8)->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('guests')) {
            Schema::create('guests', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('member_id')->nullable();
                $table->string('first_name')->nullable();
                $table->string('last_name')->nullable();
                $table->string('full_name')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('company')->nullable();
                $table->string('country', 64)->nullable();
                $table->string('lifecycle_status', 32)->nullable();
                $table->string('importance', 16)->nullable();
                $table->string('lead_source', 64)->nullable();
                $table->string('owner_name')->nullable();
                $table->text('notes')->nullable();
                $table->text('custom_data')->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }
    }
}
