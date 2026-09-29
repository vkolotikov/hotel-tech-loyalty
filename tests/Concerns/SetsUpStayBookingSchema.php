<?php

namespace Tests\Concerns;

use App\Models\BookingExtra;
use App\Models\BookingRoom;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables a stay touches end to end — quote, hold, confirm, mirror,
 * price elements, submission log, sync — shaped like the real migrations
 * (2026_04_01_200001_create_booking_engine_tables and the additions listed
 * in stays-engine-facts.md §3, plus 2026_09_30_100000_member_portal_phase_3),
 * so a test can run BookingEngineService::confirm() against sqlite.
 *
 * Requires the consumer to also `use SetsUpMinimalSchema`.
 */
trait SetsUpStayBookingSchema
{
    protected function setUpStayBookingSchema(): void
    {
        $this->setUpBookingConfirmSchema();   // booking_mirror (thin), booking_holds, booking_idempotency_keys, audit_logs, hotel_settings
        $this->setUpAvailabilitySchema();     // brands, booking_rooms
        $this->setUpBookingAdminSchema();     // booking_submissions, booking_notes, booking_price_elements (thin)
        $this->setUpRealtimeEventsSchema();

        // setUpBookingAdminSchema() (SetsUpMinimalSchema, shared by other suites)
        // builds THIN booking_price_elements/booking_submissions tables — no NOT
        // NULLs, `type` instead of `element_type`, no currency default. Neither
        // table holds any rows yet at this point in a test's setUp(), so replace
        // both outright with the production shape (2026_04_01_200001) rather than
        // layering columns onto the thin one: sqlite can't add a NOT NULL column
        // without a default to an existing table, and a looser-than-production
        // schema hides real NOT NULL bugs: a required column the engine
        // forgets would pass silently on sqlite and break every first
        // confirm on Postgres.
        Schema::dropIfExists('booking_price_elements');
        Schema::create('booking_price_elements', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('booking_mirror_id');
            $table->string('reservation_id', 30);
            $table->string('remote_price_element_id', 30)->nullable();
            $table->string('element_type', 40)->nullable();
            $table->string('name', 180)->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->integer('quantity')->default(1);
            $table->decimal('tax', 8, 2)->nullable();
            $table->string('currency_code', 3)->default('EUR');
            $table->smallInteger('sort_order')->default(0);
            $table->text('raw_json')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
            $table->index('booking_mirror_id');
            $table->index('organization_id');
        });

        Schema::dropIfExists('booking_submissions');
        Schema::create('booking_submissions', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('request_id', 64)->nullable();
            $table->string('idempotency_key', 128)->nullable();
            $table->string('outcome', 20);
            $table->string('failure_code', 60)->nullable();
            $table->text('failure_message')->nullable();
            $table->string('booking_reference', 60)->nullable();
            $table->string('reservation_id', 60)->nullable();
            $table->unsignedBigInteger('guest_id')->nullable();
            $table->string('guest_name', 180)->nullable();
            $table->string('guest_email', 180)->nullable();
            $table->string('guest_phone', 40)->nullable();
            $table->string('unit_id', 20)->nullable();
            $table->string('unit_name', 120)->nullable();
            $table->date('check_in')->nullable();
            $table->date('check_out')->nullable();
            $table->smallInteger('adults')->nullable();
            $table->smallInteger('children')->nullable();
            $table->decimal('gross_total', 12, 2)->nullable();
            $table->string('payment_method', 40)->nullable();
            $table->string('payment_status', 40)->nullable();
            $table->text('payload_json')->nullable();
            $table->timestamps();
            $table->index('organization_id');
            $table->index('created_at');
        });

        $this->ensureStayColumns('booking_mirror', [
            'booking_type'       => fn (Blueprint $t) => $t->string('booking_type', 40)->nullable(),
            'channel_id'         => fn (Blueprint $t) => $t->string('channel_id', 20)->nullable(),
            'channel_name'       => fn (Blueprint $t) => $t->string('channel_name', 80)->nullable(),
            'guest_id'           => fn (Blueprint $t) => $t->unsignedBigInteger('guest_id')->nullable(),
            'guest_language'     => fn (Blueprint $t) => $t->string('guest_language', 10)->nullable(),
            'adults'             => fn (Blueprint $t) => $t->smallInteger('adults')->nullable(),
            'children'           => fn (Blueprint $t) => $t->smallInteger('children')->nullable(),
            'check_in_time'      => fn (Blueprint $t) => $t->time('check_in_time')->nullable(),
            'check_out_time'     => fn (Blueprint $t) => $t->time('check_out_time')->nullable(),
            'prepayment_amount'  => fn (Blueprint $t) => $t->decimal('prepayment_amount', 12, 2)->nullable(),
            'prepayment_paid'    => fn (Blueprint $t) => $t->boolean('prepayment_paid')->default(false),
            'deposit_amount'     => fn (Blueprint $t) => $t->decimal('deposit_amount', 12, 2)->nullable(),
            'deposit_paid'       => fn (Blueprint $t) => $t->boolean('deposit_paid')->default(false),
            'notice'             => fn (Blueprint $t) => $t->text('notice')->nullable(),
            'assistant_notice'   => fn (Blueprint $t) => $t->text('assistant_notice')->nullable(),
            'guest_app_url'      => fn (Blueprint $t) => $t->string('guest_app_url', 512)->nullable(),
            'invoice_state'      => fn (Blueprint $t) => $t->string('invoice_state', 40)->default('none'),
            'source_created_at'  => fn (Blueprint $t) => $t->timestamp('source_created_at')->nullable(),
            'source_updated_at'  => fn (Blueprint $t) => $t->timestamp('source_updated_at')->nullable(),
            'synced_at'          => fn (Blueprint $t) => $t->timestamp('synced_at')->nullable(),
            'lifecycle_counted_at' => fn (Blueprint $t) => $t->timestamp('lifecycle_counted_at')->nullable(),
            'raw_json'           => fn (Blueprint $t) => $t->text('raw_json')->nullable(),
            'extras_json'        => fn (Blueprint $t) => $t->text('extras_json')->nullable(),
            'pms_sync_attempts'  => fn (Blueprint $t) => $t->integer('pms_sync_attempts')->default(0),
            'pms_sync_last_attempt_at' => fn (Blueprint $t) => $t->timestamp('pms_sync_last_attempt_at')->nullable(),
            'pms_sync_last_error' => fn (Blueprint $t) => $t->text('pms_sync_last_error')->nullable(),
            // Phase 3 (2026_09_30_100000).
            'member_id'          => fn (Blueprint $t) => $t->unsignedBigInteger('member_id')->nullable(),
            'list_total'         => fn (Blueprint $t) => $t->decimal('list_total', 12, 2)->nullable(),
            'discount_amount'    => fn (Blueprint $t) => $t->decimal('discount_amount', 12, 2)->default(0),
            'discount_source'    => fn (Blueprint $t) => $t->string('discount_source', 20)->nullable(),
            'discount_source_id' => fn (Blueprint $t) => $t->unsignedBigInteger('discount_source_id')->nullable(),
            'discount_label'     => fn (Blueprint $t) => $t->string('discount_label', 120)->nullable(),
            'points_awarded_at'  => fn (Blueprint $t) => $t->timestamp('points_awarded_at')->nullable(),
            'cancelled_at'       => fn (Blueprint $t) => $t->timestamp('cancelled_at')->nullable(),
            'cancellation_reason' => fn (Blueprint $t) => $t->string('cancellation_reason', 60)->nullable(),
        ]);

        // booking_price_elements and booking_submissions are built in full,
        // production-shaped, above — no ensureStayColumns() top-up needed.

        // linkOrCreateGuest() writes guest_type; GuestLifecycleService writes the counters.
        $this->ensureStayColumns('guests', [
            'guest_type'       => fn (Blueprint $t) => $t->string('guest_type', 32)->nullable(),
            'last_activity_at' => fn (Blueprint $t) => $t->timestamp('last_activity_at')->nullable(),
            'total_stays'      => fn (Blueprint $t) => $t->integer('total_stays')->default(0),
            'total_nights'     => fn (Blueprint $t) => $t->integer('total_nights')->default(0),
            'total_revenue'    => fn (Blueprint $t) => $t->decimal('total_revenue', 12, 2)->default(0),
            'first_stay_date'  => fn (Blueprint $t) => $t->date('first_stay_date')->nullable(),
            'last_stay_date'   => fn (Blueprint $t) => $t->date('last_stay_date')->nullable(),
        ]);

        // PortalPaymentIntentGuard::carried() checks BOTH booking surfaces
        // for an intent already spent — a stay
        // fixture never otherwise touches service_bookings, so give it the
        // minimal shape SetsUpMinimalSchema::setUpCapturePendingSchema()
        // already uses for the same table.
        if (!Schema::hasTable('service_bookings')) {
            Schema::create('service_bookings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('stripe_payment_intent_id')->nullable();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        if (!Schema::hasTable('booking_extras')) {
            Schema::create('booking_extras', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->decimal('price', 10, 2)->default(0);
                $t->string('price_type')->default('per_stay');
                $t->unsignedSmallInteger('lead_time_hours')->default(0);
                $t->string('currency', 10)->default('EUR');
                $t->string('image')->nullable();
                $t->string('icon')->nullable();
                $t->string('category')->nullable();
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    /** @param array<string, callable(Blueprint):void> $columns */
    private function ensureStayColumns(string $table, array $columns): void
    {
        $missing = array_filter(array_keys($columns), fn (string $c) => !Schema::hasColumn($table, $c));
        if ($missing === []) return;
        Schema::table($table, function (Blueprint $t) use ($columns, $missing) {
            foreach ($missing as $c) $columns[$c]($t);
        });
    }

    protected function seedRoom(int $orgId, array $overrides = []): BookingRoom
    {
        return BookingRoom::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'pms_id' => '101', 'name' => 'Sea view', 'slug' => 'sea-view',
            'max_guests' => 2, 'bedrooms' => 1, 'base_price' => 100, 'inventory_count' => 1,
            'currency' => 'EUR', 'is_active' => true, 'sort_order' => 0,
        ], $overrides));
    }

    protected function seedStayExtra(int $orgId, array $overrides = []): BookingExtra
    {
        return BookingExtra::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'name' => 'Breakfast', 'price' => 15, 'price_type' => 'per_stay',
            'lead_time_hours' => 0, 'currency' => 'EUR', 'is_active' => true, 'sort_order' => 0,
        ], $overrides));
    }
}
