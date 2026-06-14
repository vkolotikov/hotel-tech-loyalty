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
     * Knowledge service schema — opt-in extension for tests that
     * exercise KnowledgeService::searchRelevantItems +
     * tokeniseQuery. Adds knowledge_items table + brands (for
     * BelongsToBrand) on top of setUpMinimalSchema.
     */
    protected function setUpKnowledgeSchema(): void
    {
        $this->setUpMinimalSchema();

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

        if (!Schema::hasTable('knowledge_items')) {
            Schema::create('knowledge_items', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('category_id')->nullable();
                $table->text('question');
                $table->text('answer');
                $table->text('keywords')->nullable(); // array-cast
                $table->integer('priority')->default(0);
                $table->integer('use_count')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index('organization_id');
            });
        }
    }

    /**
     * Engagement schema — opt-in extension for tests that
     * exercise EngagementDailySummaryService + EngagementFeedService
     * (the parts that need DB access). Adds chat_conversations +
     * visitors + adds the timezone column to organizations.
     */
    protected function setUpEngagementSchema(): void
    {
        $this->setUpMinimalSchema();

        // Organizations needs a timezone column for orgNow().
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', function ($table) {
                $table->string('timezone', 64)->nullable();
            });
        }

        if (!Schema::hasTable('visitors')) {
            Schema::create('visitors', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->boolean('is_lead')->default(false);
                $table->string('current_page')->nullable();
                $table->string('display_name')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('chat_conversations')) {
            Schema::create('chat_conversations', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('status', 16)->default('active');
                $table->boolean('ai_enabled')->default(true);
                $table->unsignedBigInteger('assigned_to')->nullable();
                $table->string('visitor_name')->nullable();
                $table->string('visitor_email')->nullable();
                $table->timestamp('last_message_at')->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }
    }

    /**
     * Notification service schema — opt-in extension for tests
     * that exercise NotificationService::send. Adds push_notifications
     * table + the push columns on loyalty_members.
     */
    protected function setUpNotificationSchema(): void
    {
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('push_notifications')) {
            Schema::create('push_notifications', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('member_id');
                $table->string('type');
                $table->string('title');
                $table->text('body')->nullable();
                $table->text('data')->nullable();
                $table->string('channel', 16)->default('push');
                $table->boolean('is_sent')->default(false);
                $table->timestamps();
                $table->index('member_id');
            });
        }

        // Add the push-related columns to loyalty_members if missing.
        if (!Schema::hasColumn('loyalty_members', 'expo_push_token')) {
            Schema::table('loyalty_members', function ($table) {
                $table->string('expo_push_token')->nullable();
            });
        }
        if (!Schema::hasColumn('loyalty_members', 'notification_preferences')) {
            Schema::table('loyalty_members', function ($table) {
                $table->text('notification_preferences')->nullable();
            });
        }
    }

    /**
     * Capture-pending cron schema — opt-in extension for tests
     * that exercise CapturePendingPaymentIntents. Builds on
     * booking_mirror + audit_logs + realtime_events and adds
     * service_bookings (the cron queries both surfaces).
     */
    protected function setUpCapturePendingSchema(): void
    {
        $this->setUpBookingRefundSchema();
        $this->setUpRealtimeEventsSchema();

        // ReleasesScheduleLock trait runs a shutdown DELETE on
        // cache_locks. Provide the table so the warning path
        // (which can fail at shutdown when the Log facade is
        // unbootable) doesn't fire.
        if (!Schema::hasTable('cache_locks')) {
            Schema::create('cache_locks', function ($table) {
                $table->string('key')->primary();
                $table->string('owner');
                $table->integer('expiration');
            });
        }

        if (!Schema::hasTable('service_bookings')) {
            Schema::create('service_bookings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('payment_status', 32)->nullable();
                $table->string('stripe_payment_intent_id')->nullable();
                $table->decimal('price_total', 12, 2)->default(0);
                $table->decimal('price_paid', 12, 2)->nullable();
                $table->string('internal_status', 32)->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }
    }

    /**
     * Realtime events schema — opt-in extension for tests that
     * exercise RealtimeEventService::dispatch / since / cleanup.
     */
    protected function setUpRealtimeEventsSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('realtime_events')) {
            Schema::create('realtime_events', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->string('type');
                $table->string('title');
                $table->text('body')->nullable();
                $table->text('data')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->index(['organization_id', 'id']);
                $table->index('created_at');
            });
        }
    }

    /**
     * Booking admin controller schema — opt-in extension for
     * tests that exercise BookingAdminController::updateStatus.
     * Adds booking_submissions + booking_notes + booking_price_elements
     * tables so the controller's show() helper (called after a
     * successful update) doesn't blow up on missing tables.
     */
    protected function setUpBookingAdminSchema(): void
    {
        $this->setUpBookingRefundSchema();

        if (!Schema::hasTable('booking_submissions')) {
            Schema::create('booking_submissions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('reservation_id')->nullable();
                $table->string('booking_reference')->nullable();
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('booking_notes')) {
            Schema::create('booking_notes', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('booking_mirror_id');
                $table->string('reservation_id')->nullable();
                $table->unsignedBigInteger('staff_id')->nullable();
                $table->text('body')->nullable();
                $table->timestamps();
                $table->index('booking_mirror_id');
            });
        }

        if (!Schema::hasTable('booking_price_elements')) {
            Schema::create('booking_price_elements', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('booking_mirror_id');
                $table->string('type')->nullable();
                $table->string('name')->nullable();
                $table->decimal('amount', 12, 2)->default(0);
                $table->timestamps();
                $table->index('booking_mirror_id');
            });
        }
    }

    /**
     * Loyalty preset schema — opt-in extension for tests that
     * exercise LoyaltyPresetService::apply(). Builds on
     * setUpOrgSetupSchema (loyalty_tiers + loyalty_members +
     * benefit_definitions + hotel_settings) and adds crm_settings
     * (where the active preset key + members_preset stamp live).
     */
    protected function setUpLoyaltyPresetSchema(): void
    {
        $this->setUpOrgSetupSchema();

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
     * Member merge schema — opt-in extension for tests that
     * exercise MemberMergeService::merge(). Builds on
     * setUpLoyaltyAwardSchema (loyalty_members + points_transactions
     * + tier_assessments + point_expiry_buckets for assessTier
     * inside merge) and adds the merge-specific extras:
     *   - member_merges (the audit table)
     *   - referred_by + nfc_uid + nfc_card_issued_at + referral_code
     *     columns on loyalty_members
     */
    protected function setUpMemberMergeSchema(): void
    {
        $this->setUpLoyaltyAwardSchema();

        $extraMemberCols = [
            ['referred_by',          'unsignedBigInteger', true],
            ['nfc_uid',              'string',             true],
            ['nfc_card_issued_at',   'timestamp',          true],
            ['referral_code',        'string',             true],
        ];
        Schema::table('loyalty_members', function ($table) use ($extraMemberCols) {
            foreach ($extraMemberCols as [$col, $type, $nullable]) {
                if (Schema::hasColumn('loyalty_members', $col)) continue;
                $colDef = $table->{$type}($col);
                if ($nullable) $colDef->nullable();
            }
        });

        if (!Schema::hasTable('member_merges')) {
            Schema::create('member_merges', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('surviving_member_id');
                $table->unsignedBigInteger('merged_member_id');
                $table->text('merged_data')->nullable();
                $table->unsignedBigInteger('performed_by')->nullable();
                $table->text('reason')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Guest merge schema — opt-in extension for tests that
     * exercise GuestMergeService::merge(). Extends the minimal
     * guests table with the columns merge() touches (notes,
     * stays counters, etc.) and adds a single PLAIN_TABLES
     * target (inquiries) for the re-pointing tests. audit_logs
     * comes from setUpBookingRefundSchema.
     */
    protected function setUpGuestMergeSchema(): void
    {
        $this->setUpBookingRefundSchema();

        $extraGuestCols = [
            ['mobile',              'string',             true],
            ['position_title',      'string',             true],
            ['nationality',         'string',             true],
            ['city',                'string',             true],
            ['address',             'string',             true],
            ['postal_code',         'string',             true],
            ['date_of_birth',       'date',               true],
            ['passport_no',         'string',             true],
            ['id_number',           'string',             true],
            ['salutation',          'string',             true],
            ['preferred_language',  'string',             true],
            ['preferred_room_type', 'string',             true],
            ['preferred_floor',     'string',             true],
            ['dietary_preferences', 'text',               true],
            ['special_needs',       'text',               true],
            ['vip_level',           'string',             true],
            ['email_key',           'string',             true],
            ['phone_key',           'string',             true],
            ['total_stays',         'integer',            true],
            ['total_nights',        'integer',            true],
            ['total_revenue',       'decimal',            true],
            ['first_stay_date',     'date',               true],
            ['last_activity_at',    'timestamp',          true],
        ];
        Schema::table('guests', function ($table) use ($extraGuestCols) {
            foreach ($extraGuestCols as [$col, $type, $nullable]) {
                if (Schema::hasColumn('guests', $col)) continue;
                $colDef = match ($type) {
                    'decimal' => $table->decimal($col, 12, 2),
                    default   => $table->{$type}($col),
                };
                if ($nullable) $colDef->nullable();
            }
        });

        if (!Schema::hasTable('inquiries')) {
            Schema::create('inquiries', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('guest_id')->nullable();
                $table->unsignedBigInteger('pipeline_id')->nullable();
                $table->unsignedBigInteger('pipeline_stage_id')->nullable();
                $table->string('status')->nullable();
                $table->timestamps();
                $table->index('guest_id');
            });
        } elseif (!Schema::hasColumn('inquiries', 'guest_id')) {
            Schema::table('inquiries', function ($table) {
                $table->unsignedBigInteger('guest_id')->nullable();
            });
        }
    }

    /**
     * Loyalty service award/redeem schema — opt-in extension for
     * tests that exercise LoyaltyService::awardPoints and
     * redeemPoints. Adds the side-effect tables both methods
     * touch: domain_events, point_expiry_buckets, tier_assessments,
     * plus the soft_landing column on loyalty_tiers (used by
     * assessTier which fires from inside awardPoints).
     */
    protected function setUpLoyaltyAwardSchema(): void
    {
        $this->setUpLoyaltySchema();

        if (!Schema::hasColumn('loyalty_tiers', 'soft_landing')) {
            Schema::table('loyalty_tiers', function ($table) {
                $table->boolean('soft_landing')->default(false);
            });
        }
        // assessTier reads qualification_window from the current tier
        // (calendar_year/anniversary_year/rolling_12) and reads
        // invitation_only via getTierForPoints to skip those tiers
        // from auto-assignment.
        if (!Schema::hasColumn('loyalty_tiers', 'qualification_window')) {
            Schema::table('loyalty_tiers', function ($table) {
                $table->string('qualification_window', 32)->nullable();
            });
        }
        if (!Schema::hasColumn('loyalty_tiers', 'invitation_only')) {
            Schema::table('loyalty_tiers', function ($table) {
                $table->boolean('invitation_only')->default(false);
            });
        }
        // Tier-lookup thresholds: max_points + per-model min_*
        // columns (nights/stays/spend). All nullable — only present
        // for tiers using the relevant qualification model.
        $extraCols = [
            ['max_points', 'integer'],
            ['min_nights', 'integer'],
            ['min_stays',  'integer'],
            ['min_spend',  'decimal'],
        ];
        Schema::table('loyalty_tiers', function ($table) use ($extraCols) {
            foreach ($extraCols as [$col, $type]) {
                if (Schema::hasColumn('loyalty_tiers', $col)) continue;
                $colDef = match ($type) {
                    'decimal' => $table->decimal($col, 12, 2),
                    default   => $table->{$type}($col),
                };
                $colDef->nullable();
            }
        });

        if (!Schema::hasTable('domain_events')) {
            Schema::create('domain_events', function ($table) {
                $table->bigIncrements('id');
                $table->string('event_type');
                $table->string('aggregate_type');
                $table->unsignedBigInteger('aggregate_id');
                $table->text('payload')->nullable();
                $table->unsignedBigInteger('property_id')->nullable();
                $table->boolean('is_processed')->default(false);
                $table->timestamp('processed_at')->nullable();
                $table->timestamps();
                $table->index(['aggregate_type', 'aggregate_id']);
            });
        }

        if (!Schema::hasTable('point_expiry_buckets')) {
            Schema::create('point_expiry_buckets', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('member_id');
                $table->unsignedBigInteger('transaction_id')->nullable();
                $table->integer('original_points');
                $table->integer('remaining_points');
                $table->date('earned_at');
                $table->date('expires_at');
                $table->boolean('is_expired')->default(false);
                $table->timestamps();
                $table->index(['member_id', 'is_expired', 'expires_at']);
            });
        }

        if (!Schema::hasTable('tier_assessments')) {
            Schema::create('tier_assessments', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('member_id');
                $table->unsignedBigInteger('old_tier_id')->nullable();
                $table->unsignedBigInteger('new_tier_id')->nullable();
                $table->string('reason')->nullable();
                $table->integer('qualifying_points_at_assessment')->nullable();
                $table->integer('qualifying_nights_at_assessment')->nullable();
                $table->integer('qualifying_stays_at_assessment')->nullable();
                $table->decimal('qualifying_spend_at_assessment', 12, 2)->nullable();
                $table->date('assessment_window_start')->nullable();
                $table->date('assessment_window_end')->nullable();
                $table->unsignedBigInteger('assessed_by')->nullable();
                $table->timestamps();
                $table->index('member_id');
            });
        }
    }

    /**
     * Organization setup schema — opt-in extension for tests that
     * exercise OrganizationSetupService::setupDefaults().
     *
     * Builds on top of setUpLoyaltySchema (brands + loyalty_tiers +
     * loyalty_members + booking_mirror + hotel_settings) and adds
     * the remaining tables setupDefaults() touches: properties (with
     * the GLOBALLY-unique `code` column the property-code auto-
     * suffix exercises), benefit_definitions, and review_forms.
     */
    protected function setUpOrgSetupSchema(): void
    {
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('code')->unique(); // globally unique per CLAUDE.md
                $table->string('property_type')->nullable();
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('website')->nullable();
                $table->string('gm_name')->nullable();
                $table->string('image_url')->nullable();
                $table->string('address')->nullable();
                $table->string('city')->nullable();
                $table->string('country')->nullable();
                $table->string('timezone')->nullable();
                $table->string('currency', 8)->nullable();
                $table->integer('star_rating')->nullable();
                $table->integer('room_count')->nullable();
                $table->string('pms_type')->nullable();
                $table->string('pms_property_id')->nullable();
                $table->text('settings')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index('organization_id');
            });
        }

        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('code'); // NOT globally unique — per-org
                $table->text('description')->nullable();
                $table->string('category')->nullable();
                $table->string('fulfillment_mode')->nullable();
                $table->integer('usage_limit_per_stay')->nullable();
                $table->integer('usage_limit_per_year')->nullable();
                $table->boolean('requires_active_stay')->default(false);
                $table->text('operational_constraints')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->unique(['organization_id', 'code']);
            });
        }

        if (!Schema::hasTable('review_forms')) {
            Schema::create('review_forms', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('name');
                $table->string('type', 32)->nullable();
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->text('config')->nullable();
                $table->string('embed_key', 64)->nullable();
                $table->timestamps();
                $table->index('organization_id');
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
                $table->string('icon')->nullable();
                $table->text('perks')->nullable(); // array-cast on the model
                $table->string('qualification_model', 32)->nullable();
                $table->boolean('is_active')->default(true);
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
