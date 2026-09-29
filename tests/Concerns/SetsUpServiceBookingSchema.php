<?php

namespace Tests\Concerns;

use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The tables a service booking touches end to end, shaped like the real
 * migrations (2026_04_18_100001_create_service_reservation_tables,
 * 2026_04_29_120000_add_lead_time_hours_to_extras,
 * 2026_05_10_100003_add_brand_id_to_booking_property_tables and
 * 2026_09_25_100000_member_portal_phase_2), so a test can run the portal's
 * quote and confirm against sqlite. Builds on setUpServiceCatalogSchema().
 *
 * Column names here are NOT the brief's draft — they are read from the real
 * migrations and from ServiceSchedulingService::workingWindowsForDate(),
 * which is the actual consumer of service_master_schedules /
 * service_master_time_off: the weekday column is `day_of_week` (not
 * `weekday`), and time-off is `date` + `start_time`/`end_time`/`reason`
 * (not `start_at`/`end_at`).
 */
trait SetsUpServiceBookingSchema
{
    protected function setUpServiceBookingSchema(): void
    {
        $this->setUpServiceCatalogSchema();

        // Recurring weekly schedule per master — ServiceSchedulingService::
        // workingWindowsForDate() queries `day_of_week` + `is_active`.
        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_master_id');
                $t->unsignedTinyInteger('day_of_week');
                $t->time('start_time');
                $t->time('end_time');
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        // One-off exceptions — workingWindowsForDate() queries `date` and,
        // when both are null, treats the row as a full day off.
        if (!Schema::hasTable('service_master_time_off')) {
            Schema::create('service_master_time_off', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_master_id');
                $t->date('date');
                $t->time('start_time')->nullable();
                $t->time('end_time')->nullable();
                $t->string('reason')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('service_extras')) {
            Schema::create('service_extras', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->decimal('price', 10, 2)->default(0);
                $t->string('price_type')->default('per_booking');
                $t->integer('duration_minutes')->default(0);
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

        if (!Schema::hasTable('service_bookings')) {
            Schema::create('service_bookings', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('booking_reference', 20)->unique();
                $t->unsignedBigInteger('service_id');
                $t->unsignedBigInteger('service_master_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('member_id')->nullable();
                $t->string('customer_name');
                $t->string('customer_email');
                $t->string('customer_phone')->nullable();
                $t->integer('party_size')->default(1);
                $t->dateTime('start_at');
                $t->dateTime('end_at');
                $t->integer('duration_minutes');
                $t->decimal('service_price', 10, 2)->default(0);
                $t->decimal('extras_total', 10, 2)->default(0);
                $t->decimal('total_amount', 10, 2)->default(0);
                $t->string('currency', 10)->default('EUR');
                $t->string('status', 30)->default('pending');
                $t->string('payment_status', 30)->default('unpaid');
                $t->string('stripe_payment_intent_id')->nullable();
                $t->string('source', 30)->default('widget');
                $t->text('customer_notes')->nullable();
                $t->text('staff_notes')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->string('cancellation_reason')->nullable();
                $t->json('meta')->nullable();
                // Task 1 (member-portal phase 2, migration 2026_09_25_100000).
                $t->decimal('list_amount', 10, 2)->nullable();
                $t->decimal('discount_amount', 10, 2)->default(0);
                $t->string('discount_source', 20)->nullable();
                $t->unsignedBigInteger('discount_source_id')->nullable();
                $t->string('discount_label', 120)->nullable();
                $t->timestamp('points_awarded_at')->nullable();
                // Phase 3 (2026_09_30_100000).
                $t->decimal('refunded_amount', 10, 2)->nullable();
                $t->timestamp('refunded_at')->nullable();
                $t->string('last_refund_id')->nullable();
                $t->timestamps();
            });
        }

        // A skeletal `service_bookings` may already exist from another
        // helper (e.g. setUpCapturePendingSchema's minimal table) — add
        // whatever this trait needs that isn't there yet, guarded.
        if (Schema::hasTable('service_bookings')) {
            $this->addColumnsIfMissing('service_bookings', [
                'brand_id'           => fn (Blueprint $t) => $t->unsignedBigInteger('brand_id')->nullable(),
                'booking_reference'  => fn (Blueprint $t) => $t->string('booking_reference', 20)->nullable(),
                'service_id'         => fn (Blueprint $t) => $t->unsignedBigInteger('service_id')->nullable(),
                'service_master_id'  => fn (Blueprint $t) => $t->unsignedBigInteger('service_master_id')->nullable(),
                'guest_id'           => fn (Blueprint $t) => $t->unsignedBigInteger('guest_id')->nullable(),
                'member_id'          => fn (Blueprint $t) => $t->unsignedBigInteger('member_id')->nullable(),
                'customer_name'      => fn (Blueprint $t) => $t->string('customer_name')->nullable(),
                'customer_email'     => fn (Blueprint $t) => $t->string('customer_email')->nullable(),
                'customer_phone'     => fn (Blueprint $t) => $t->string('customer_phone')->nullable(),
                'party_size'         => fn (Blueprint $t) => $t->integer('party_size')->default(1),
                'start_at'           => fn (Blueprint $t) => $t->dateTime('start_at')->nullable(),
                'end_at'             => fn (Blueprint $t) => $t->dateTime('end_at')->nullable(),
                'duration_minutes'   => fn (Blueprint $t) => $t->integer('duration_minutes')->nullable(),
                'service_price'      => fn (Blueprint $t) => $t->decimal('service_price', 10, 2)->default(0),
                'extras_total'       => fn (Blueprint $t) => $t->decimal('extras_total', 10, 2)->default(0),
                'total_amount'       => fn (Blueprint $t) => $t->decimal('total_amount', 10, 2)->default(0),
                'currency'           => fn (Blueprint $t) => $t->string('currency', 10)->default('EUR'),
                'status'             => fn (Blueprint $t) => $t->string('status', 30)->default('pending'),
                'payment_status'     => fn (Blueprint $t) => $t->string('payment_status', 30)->default('unpaid'),
                'stripe_payment_intent_id' => fn (Blueprint $t) => $t->string('stripe_payment_intent_id')->nullable(),
                'source'             => fn (Blueprint $t) => $t->string('source', 30)->default('widget'),
                'customer_notes'     => fn (Blueprint $t) => $t->text('customer_notes')->nullable(),
                'staff_notes'        => fn (Blueprint $t) => $t->text('staff_notes')->nullable(),
                'cancelled_at'       => fn (Blueprint $t) => $t->timestamp('cancelled_at')->nullable(),
                'cancellation_reason' => fn (Blueprint $t) => $t->string('cancellation_reason')->nullable(),
                'meta'               => fn (Blueprint $t) => $t->json('meta')->nullable(),
                'list_amount'        => fn (Blueprint $t) => $t->decimal('list_amount', 10, 2)->nullable(),
                'discount_amount'    => fn (Blueprint $t) => $t->decimal('discount_amount', 10, 2)->default(0),
                'discount_source'    => fn (Blueprint $t) => $t->string('discount_source', 20)->nullable(),
                'discount_source_id' => fn (Blueprint $t) => $t->unsignedBigInteger('discount_source_id')->nullable(),
                'discount_label'     => fn (Blueprint $t) => $t->string('discount_label', 120)->nullable(),
                'points_awarded_at'  => fn (Blueprint $t) => $t->timestamp('points_awarded_at')->nullable(),
                'refunded_amount'    => fn (Blueprint $t) => $t->decimal('refunded_amount', 10, 2)->nullable(),
                'refunded_at'        => fn (Blueprint $t) => $t->timestamp('refunded_at')->nullable(),
                'last_refund_id'     => fn (Blueprint $t) => $t->string('last_refund_id')->nullable(),
            ]);
        }

        if (!Schema::hasTable('service_booking_extras')) {
            Schema::create('service_booking_extras', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_booking_id');
                $t->unsignedBigInteger('service_extra_id');
                $t->string('name');
                $t->decimal('unit_price', 10, 2)->default(0);
                $t->integer('quantity')->default(1);
                $t->decimal('line_total', 10, 2)->default(0);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('service_booking_submissions')) {
            Schema::create('service_booking_submissions', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->string('idempotency_key', 80)->nullable();
                $t->string('source', 30)->default('widget');
                $t->string('outcome', 30)->default('pending');
                $t->unsignedBigInteger('service_booking_id')->nullable();
                $t->string('customer_email')->nullable();
                $t->string('customer_name')->nullable();
                $t->json('request_payload')->nullable();
                $t->json('response_payload')->nullable();
                $t->string('error_message')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('group', 32)->nullable();
                $t->string('label')->nullable();
                $t->text('description')->nullable();
                $t->string('scope', 16)->default('company');
                $t->timestamps();
                $t->index(['organization_id', 'key']);
            });
        }
    }

    /** @param array<string, callable(Blueprint):void> $columns */
    private function addColumnsIfMissing(string $table, array $columns): void
    {
        $missing = array_filter(
            array_keys($columns),
            fn (string $column) => !Schema::hasColumn($table, $column),
        );
        if ($missing === []) return;

        Schema::table($table, function (Blueprint $t) use ($columns, $missing) {
            foreach ($missing as $column) {
                $columns[$column]($t);
            }
        });
    }

    /** @return array{service: Service, master: ServiceMaster} */
    protected function seedBookableService(int $orgId, array $overrides = []): array
    {
        $service = Service::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'name' => 'Deep Tissue Massage', 'duration_minutes' => 45,
            'buffer_after_minutes' => 0, 'price' => 60, 'currency' => 'EUR', 'is_active' => true,
        ], $overrides));
        $master = ServiceMaster::withoutGlobalScopes()->create([
            'organization_id' => $orgId, 'name' => 'Mara Ilves', 'is_active' => true,
        ]);
        DB::table('service_master_service')->insert([
            'organization_id' => $orgId, 'service_id' => $service->id, 'service_master_id' => $master->id,
            'price_override' => null, 'duration_override_minutes' => null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $dayOfWeek) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $orgId, 'service_master_id' => $master->id,
                'day_of_week' => $dayOfWeek, 'start_time' => '09:00:00', 'end_time' => '17:00:00',
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        return ['service' => $service, 'master' => $master];
    }
}
