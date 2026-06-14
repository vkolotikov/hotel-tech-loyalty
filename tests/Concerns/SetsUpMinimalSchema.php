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
                // plan_features holds the cached entitlement map from
                // SaasAuthMiddleware. Stored as TEXT here (cast to array
                // by the Organization model) instead of jsonb because
                // sqlite has no jsonb. featureValue() works identically
                // since it just reads keys off the cast array.
                $table->text('plan_features')->nullable();
                $table->string('subscription_status', 16)->nullable();
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
                // Polymorphic causer columns — AuditLog::record stamps
                // these via the morph helper. Distinct from user_id
                // which only fires for staff-initiated writes.
                $table->string('causer_type')->nullable();
                $table->unsignedBigInteger('causer_id')->nullable();
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

        // hotel_settings — BookingRefundMail's constructor reads from
        // here for booking_currency / company_name / mail_from_address.
        // Without the table, the Mail::queue() call inside
        // sendRefundEmail() throws → swallowed by the try/catch →
        // email_sent stays false (silently). Including it here keeps
        // every Mail-touching code path testable.
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->string('type', 32)->nullable();
                $table->string('group', 32)->nullable();
                $table->string('label')->nullable();
                $table->text('description')->nullable();
                $table->string('scope', 16)->default('company');
                $table->timestamps();
                $table->index(['organization_id', 'key']);
            });
        }
    }

    /**
     * Planner preset schema — opt-in extension for tests that
     * exercise PlannerPresetService::apply(). Smaller surface than
     * the CRM preset: just crm_settings (for planner_groups +
     * planner_preset keys) and planner_templates (the seeded
     * library).
     */
    protected function setUpPlannerPresetSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->timestamps();
                $table->unique(['organization_id', 'key']);
            });
        }

        if (!Schema::hasTable('planner_templates')) {
            Schema::create('planner_templates', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('title')->nullable();
                $table->string('task_group')->nullable();
                $table->string('task_category')->nullable();
                $table->string('priority', 16)->nullable();
                $table->integer('duration_minutes')->nullable();
                $table->text('description')->nullable();
                $table->string('category')->nullable();
                $table->integer('sort_order')->default(0);
                $table->timestamps();
                $table->index(['organization_id', 'name']);
            });
        }
    }

    /**
     * CRM preset schema — opt-in extension for tests that exercise
     * IndustryPresetService::apply(). Builds the minimal table set
     * the service writes to: pipelines + pipeline_stages +
     * inquiry_lost_reasons + inquiries (for stage migration) +
     * crm_settings + brands (Inquiry uses BelongsToBrand).
     *
     * The chatbot_behavior_configs write is best-effort in
     * production (wrapped in try/catch) so we skip its table —
     * the service logs a warning and continues.
     */
    protected function setUpCrmPresetSchema(): void
    {
        $this->setUpCustomFieldsSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('logo_url')->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->softDeletes();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('pipelines')) {
            Schema::create('pipelines', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('slug')->nullable();
                $table->text('description')->nullable();
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('pipeline_stages')) {
            Schema::create('pipeline_stages', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('pipeline_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('color', 16)->nullable();
                $table->string('kind', 16); // open / won / lost
                $table->integer('sort_order')->default(0);
                $table->integer('default_win_probability')->nullable();
                $table->timestamps();
                $table->index(['organization_id', 'pipeline_id']);
            });
        }

        if (!Schema::hasTable('inquiry_lost_reasons')) {
            Schema::create('inquiry_lost_reasons', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('label');
                $table->string('slug')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        // Minimal inquiries table — only the columns the preset
        // service writes / reads during stage migration.
        if (!Schema::hasTable('inquiries')) {
            Schema::create('inquiries', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('pipeline_id')->nullable();
                $table->unsignedBigInteger('pipeline_stage_id')->nullable();
                $table->unsignedBigInteger('lost_reason_id')->nullable();
                $table->string('status')->nullable();
                $table->timestamps();
                $table->index('organization_id');
                $table->index('pipeline_stage_id');
            });
        }

        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->timestamps();
                $table->unique(['organization_id', 'key']);
            });
        }
    }

    /**
     * Custom fields schema — opt-in extension for tests that exercise
     * CustomFieldService (validate / generateKey / applyPreset).
     */
    protected function setUpCustomFieldsSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('custom_fields')) {
            Schema::create('custom_fields', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('entity', 32);
                $table->string('key', 100);
                $table->string('label');
                $table->string('type', 32);
                $table->text('config')->nullable();
                $table->text('help_text')->nullable();
                $table->boolean('required')->default(false);
                $table->boolean('is_active')->default(true);
                $table->boolean('show_in_list')->default(false);
                $table->integer('sort_order')->default(0);
                $table->timestamps();
                $table->index(['organization_id', 'entity']);
                $table->unique(['organization_id', 'entity', 'key']);
            });
        }
    }

    /**
     * Availability schema — opt-in extension for tests that exercise
     * AvailabilityService::check() and its 3-tier acceptance logic.
     *
     * Adds `booking_rooms` (the primary room catalog, used by getRooms)
     * + the `brands` table (BookingRoom uses BelongsToBrand and would
     * otherwise hit "no such table: brands" during the default-brand
     * lookup on row create). booking_mirror comes from the underlying
     * BookingRefundSchema (used by bookedCountForRoom inventory checks).
     */
    protected function setUpAvailabilitySchema(): void
    {
        $this->setUpBookingRefundSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('logo_url')->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->softDeletes();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('booking_rooms')) {
            Schema::create('booking_rooms', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('pms_id')->nullable();
                $table->string('name');
                $table->string('slug')->nullable();
                $table->text('description')->nullable();
                $table->text('short_description')->nullable();
                $table->integer('max_guests')->default(2);
                $table->integer('bedrooms')->default(1);
                $table->string('bed_type')->nullable();
                $table->decimal('base_price', 12, 2)->default(0);
                $table->integer('inventory_count')->default(1);
                $table->string('currency', 8)->default('EUR');
                $table->string('image')->nullable();
                $table->text('gallery')->nullable();
                $table->text('amenities')->nullable();
                $table->text('tags')->nullable();
                $table->string('size')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->text('meta')->nullable();
                $table->timestamps();
                $table->index('organization_id');
                $table->index(['organization_id', 'pms_id']);
            });
        }
    }

    /**
     * Loyalty schema — opt-in extension for tests that exercise
     * LoyaltyService (award/redeem/reverse) and the tier ladder.
     * Includes a richer points_transactions schema covering every
     * column the reverseTransaction code path writes, plus the
     * loyalty_members + loyalty_tiers tables needed for the inline
     * assessTier() call on reversal.
     */
    protected function setUpLoyaltySchema(): void
    {
        $this->setUpBookingRefundSchema();

        // The base points_transactions table from setUpBookingRefundSchema
        // is sufficient for the BookingRefundService pre-flight tests
        // (they short-circuit before any row writes). LoyaltyService's
        // reverseTransaction body writes ~10 more columns; add them
        // here so the real code path doesn't blow up on "no such column".
        $missingPtxCols = [
            ['property_id',     'unsignedBigInteger', true],
            ['qualifying_points', 'integer',          true],
            ['balance_after',   'integer',            true],
            ['source_type',     'string',             true],
            ['source_id',       'unsignedBigInteger', true],
            ['staff_id',        'unsignedBigInteger', true],
            ['amount_spent',    'decimal',            true],
            ['earn_rate',       'decimal',            true],
            ['reversal_of_id',  'unsignedBigInteger', true],
            ['reason_code',     'string',             true],
            ['approval_status', 'string',             true],
            ['approved_by',     'unsignedBigInteger', true],
            ['approved_at',     'timestamp',          true],
            ['expiry_bucket_id','unsignedBigInteger', true],
            ['expires_at',      'timestamp',          true],
            ['brand_id',        'unsignedBigInteger', true],
            ['outlet_id',       'unsignedBigInteger', true],
        ];
        Schema::table('points_transactions', function ($table) use ($missingPtxCols) {
            foreach ($missingPtxCols as [$col, $type, $nullable]) {
                if (Schema::hasColumn('points_transactions', $col)) continue;
                $colDef = match ($type) {
                    'decimal'   => $table->decimal($col, 12, 2),
                    default     => $table->{$type}($col),
                };
                if ($nullable) $colDef->nullable();
            }
        });

        if (!Schema::hasTable('loyalty_tiers')) {
            Schema::create('loyalty_tiers', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->integer('min_points')->default(0);
                $table->decimal('earn_rate', 6, 2)->default(1.0);
                $table->integer('sort_order')->default(0);
                $table->string('color_hex', 8)->nullable();
                $table->string('qualification_model', 32)->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        // BelongsToBrand's creating hook queries `brands` for the default
        // brand on every PointsTransaction create. The trait is "softer"
        // than TenantScope (no-ops when no brand bound) but still hits
        // the table during default-resolution — needs to exist in sqlite
        // or PointsTransaction::create blows up. Soft-delete column +
        // is_default flag match the production schema.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->boolean('is_default')->default(false);
                $table->softDeletes();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('loyalty_members')) {
            Schema::create('loyalty_members', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedBigInteger('tier_id')->nullable();
                $table->string('member_number', 32)->nullable();
                $table->integer('lifetime_points')->default(0);
                $table->integer('current_points')->default(0);
                $table->integer('qualifying_points')->default(0);
                $table->date('tier_review_date')->nullable();
                $table->date('tier_effective_from')->nullable();
                $table->date('tier_effective_until')->nullable();
                $table->string('tier_qualification_model', 32)->nullable();
                $table->integer('qualifying_nights')->default(0);
                $table->integer('qualifying_stays')->default(0);
                $table->decimal('qualifying_spend', 12, 2)->default(0);
                $table->boolean('tier_locked')->default(false);
                $table->timestamp('tier_override_until')->nullable();
                $table->unsignedBigInteger('property_id')->nullable();
                $table->date('points_expiry_date')->nullable();
                $table->boolean('is_active')->default(true);
                $table->boolean('marketing_consent')->default(false);
                $table->boolean('email_notifications')->default(true);
                $table->boolean('push_notifications')->default(true);
                $table->timestamp('joined_at')->nullable();
                $table->timestamp('last_activity_at')->nullable();
                $table->timestamps();
                $table->index('organization_id');
                $table->index('tier_id');
                $table->index('user_id');
            });
        }
    }

    /**
     * Booking-confirm schema — opt-in extension for tests that exercise
     * BookingEngineService::confirm()'s pre-flight branches (orphan
     * recovery, idempotency replay, hold validation).
     *
     * Adds `booking_holds` + `booking_idempotency_keys` on top of the
     * BookingRefundSchema's `booking_mirror`. None of these tables
     * need Postgres-specific features for the pre-flight branches —
     * sqlite-compatible columns only.
     *
     * The downstream `confirm()` body (Smoobu createReservation,
     * advisory lock, price-element persistence) is OUT OF SCOPE here
     * — tests using this schema must mock the SmoobuClient surface
     * and short-circuit before the transaction body executes.
     */
    protected function setUpBookingConfirmSchema(): void
    {
        $this->setUpBookingRefundSchema();

        // Organization::booted()'s `created` hook auto-creates a
        // default Brand on every new org. Without the brands table
        // the hook hits "no such table: brands" because the
        // Schema::hasTable() short-circuit at the top of the hook
        // returns TRUE once any prior test cached the schema. Match
        // the production schema's columns + the soft-delete column
        // the hook's Brand::where() depends on.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->string('logo_url')->nullable();
                $table->string('widget_token', 64)->nullable();
                $table->boolean('is_default')->default(false);
                $table->integer('sort_order')->default(0);
                $table->softDeletes();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('booking_holds')) {
            Schema::create('booking_holds', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('hold_token', 64);
                $table->string('status', 16)->default('active');
                $table->timestamp('expires_at')->nullable();
                $table->text('payload_json')->nullable();
                $table->timestamps();
                $table->unique(['organization_id', 'hold_token']);
            });
        }

        if (!Schema::hasTable('booking_idempotency_keys')) {
            Schema::create('booking_idempotency_keys', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('idempotency_key', 128);
                $table->string('request_hash', 64)->nullable();
                $table->text('response_json')->nullable();
                $table->integer('status_code')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
                $table->unique(['organization_id', 'idempotency_key']);
            });
        }
    }

    /**
     * AI usage ledger schema — opt-in extension for tests that exercise
     * AiUsageService. AiUsageLog has `$timestamps = false` and is
     * append-only — recordUsage() writes the row without setting
     * created_at, so the column needs `useCurrent()` for the default
     * to fire in sqlite (matches Postgres `DEFAULT CURRENT_TIMESTAMP`).
     */
    protected function setUpAiUsageSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('ai_usage_logs')) {
            Schema::create('ai_usage_logs', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('model', 100)->nullable();
                $table->string('kind', 32)->default('chat');
                $table->string('feature', 60)->nullable();
                $table->integer('input_tokens')->default(0);
                $table->integer('output_tokens')->default(0);
                $table->integer('cost_cents')->default(0);
                $table->timestamp('created_at')->useCurrent();
                $table->index(['organization_id', 'created_at']);
                $table->index(['organization_id', 'model']);
                $table->index(['organization_id', 'feature']);
            });
        }
    }
}
