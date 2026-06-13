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

    /**
     * Booking-side schema — opt-in extension for tests that touch
     * BookingMirror, RefundAttempt, AuditLog, or PointsTransaction.
     *
     * Kept separate from setUpMinimalSchema() so tenant-scope tests
     * don't pay the cost of provisioning tables they don't read.
     * Note: BookingMirror table is SINGULAR (`booking_mirror`) —
     * CLAUDE.md flags this as a footgun and every migration on this
     * table must use the singular form.
     */
    protected function setUpBookingRefundSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('booking_mirror')) {
            Schema::create('booking_mirror', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('booking_group_id', 36)->nullable();
                $table->string('reservation_id')->nullable();
                $table->string('booking_reference')->nullable();
                $table->string('booking_state', 32)->nullable();
                $table->unsignedBigInteger('apartment_id')->nullable();
                $table->string('apartment_name')->nullable();
                $table->string('guest_name')->nullable();
                $table->string('guest_email')->nullable();
                $table->string('guest_phone')->nullable();
                $table->date('arrival_date')->nullable();
                $table->date('departure_date')->nullable();
                $table->decimal('price_total', 12, 2)->default(0);
                $table->decimal('price_paid', 12, 2)->nullable();
                $table->decimal('refunded_amount', 12, 2)->nullable();
                $table->timestamp('refunded_at')->nullable();
                $table->string('last_refund_id')->nullable();
                $table->string('payment_method', 32)->nullable();
                $table->string('payment_status', 32)->nullable();
                $table->string('stripe_payment_intent_id')->nullable();
                $table->string('internal_status', 32)->nullable();
                $table->timestamps();
                $table->index('organization_id');
                $table->index(['organization_id', 'stripe_payment_intent_id']);
            });
        }

        if (!Schema::hasTable('refund_attempts')) {
            Schema::create('refund_attempts', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('mirror_id');
                $table->string('payment_intent_id');
                $table->string('refund_id')->nullable();
                $table->timestamp('requested_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->text('error')->nullable();
                $table->timestamps();
                $table->index(['mirror_id', 'requested_at']);
            });
        }

        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('action')->nullable();
                $table->string('subject_type')->nullable();
                $table->unsignedBigInteger('subject_id')->nullable();
                $table->text('description')->nullable();
                $table->text('old_values')->nullable();
                $table->text('new_values')->nullable();
                $table->string('ip_address')->nullable();
                $table->string('user_agent')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('points_transactions')) {
            Schema::create('points_transactions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('member_id')->nullable();
                $table->integer('points')->default(0);
                $table->string('type', 32)->nullable();
                $table->string('reference_type', 64)->nullable();
                $table->unsignedBigInteger('reference_id')->nullable();
                $table->boolean('is_reversed')->default(false);
                $table->string('idempotency_key')->nullable();
                $table->text('description')->nullable();
                $table->timestamps();
                $table->index(['reference_type', 'reference_id']);
            });
        }
    }
}
