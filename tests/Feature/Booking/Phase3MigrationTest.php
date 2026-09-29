<?php

namespace Tests\Feature\Booking;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class Phase3MigrationTest extends TestCase
{
    use SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private function migration(): object
    {
        return require base_path('database/migrations/2026_09_30_100000_member_portal_phase_3.php');
    }

    private function baseTables(): void
    {
        $this->setUpMinimalSchema();
        Schema::create('booking_mirror', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('reservation_id', 30)->nullable(); $t->decimal('price_total', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('service_bookings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->decimal('total_amount', 10, 2)->default(0); $t->string('stripe_payment_intent_id')->nullable(); $t->timestamps(); });
        Schema::create('member_offers', function ($t) { $t->id(); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('offer_id'); $t->timestamp('used_at')->nullable(); $t->string('used_reference', 32)->nullable(); $t->timestamps(); });
    }

    private function hasIndex(string $table, string $name): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($i) => ($i['name'] ?? null) === $name);
    }

    public function test_it_adds_every_phase_3_column_and_is_idempotent(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->up(); // guarded: a second run must not throw

        foreach ([
            'booking_mirror'   => ['member_id', 'list_total', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at', 'cancelled_at', 'cancellation_reason'],
            'service_bookings' => ['refunded_amount', 'refunded_at', 'last_refund_id'],
        ] as $table => $cols) {
            foreach ($cols as $col) {
                $this->assertTrue(Schema::hasColumn($table, $col), "$table.$col");
            }
        }
        $this->assertTrue($this->hasIndex('booking_mirror', 'booking_mirror_org_member_index'));
    }

    public function test_a_sixty_character_reference_fits_after_the_migration(): void
    {
        $this->baseTables();
        $this->migration()->up();
        $ref = str_repeat('R', 60);
        DB::table('member_offers')->insert(['member_id' => 1, 'offer_id' => 1, 'used_reference' => $ref, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame($ref, DB::table('member_offers')->value('used_reference'));
    }

    /**
     * The migration adds no unique constraint on service_bookings' payment
     * reference — one would change what the public services confirm stores
     * and answers for a second booking on the same payment — so repeated
     * references already there are left exactly as they are.
     */
    public function test_repeated_payment_references_are_left_alone_and_stay_insertable(): void
    {
        $this->baseTables();
        foreach ([1, 2] as $n) {
            DB::table('service_bookings')->insert(['organization_id' => 7, 'stripe_payment_intent_id' => 'pi_same', 'created_at' => now(), 'updated_at' => now()]);
        }

        $this->migration()->up(); // must not throw

        $this->assertFalse($this->hasIndex('service_bookings', 'service_bookings_org_pi_unique'));
        $this->assertSame(2, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_same')->count(), 'the migration never edits a payment reference');
        $this->assertTrue(Schema::hasColumn('service_bookings', 'refunded_amount'), 'the columns are still added');

        DB::table('service_bookings')->insert(['organization_id' => 7, 'stripe_payment_intent_id' => 'pi_same', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame(3, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_same')->count(), 'what the public services confirm may store is unchanged');
    }

    public function test_down_removes_what_up_added_and_nothing_else(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->down();
        $this->assertFalse(Schema::hasColumn('booking_mirror', 'member_id'));
        $this->assertFalse(Schema::hasColumn('service_bookings', 'refunded_amount'));
        $this->assertTrue(Schema::hasColumn('booking_mirror', 'price_total'));
        $this->assertTrue(Schema::hasColumn('member_offers', 'used_reference'));
    }

    public function test_the_stay_test_schema_holds_everything_the_models_write(): void
    {
        $this->setUpStayBookingSchema();

        foreach ((new \App\Models\BookingMirror())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_mirror', $col), "booking_mirror.$col");
        }
        foreach ((new \App\Models\BookingSubmission())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_submissions', $col), "booking_submissions.$col");
        }
        foreach ((new \App\Models\BookingPriceElement())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_price_elements', $col), "booking_price_elements.$col");
        }
        foreach ((new \App\Models\BookingExtra())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_extras', $col), "booking_extras.$col");
        }
    }
}
