<?php

namespace Tests\Feature\Booking;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The database rule that one payment pays for one service booking: a partial
 * unique index on service_bookings (organization_id, stripe_payment_intent_id)
 * that leaves NULL and '' out. Runs the real migration on sqlite, which
 * supports partial unique indexes with the same statement PostgreSQL does.
 */
class ServiceBookingsUniquePaymentMigrationTest extends TestCase
{
    private const INDEX = 'service_bookings_org_pi_unique';

    private function migration(): object
    {
        return require base_path('database/migrations/2026_10_01_100000_service_bookings_unique_payment.php');
    }

    private function table(): void
    {
        Schema::create('service_bookings', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('stripe_payment_intent_id')->nullable();
            $t->timestamps();
        });
    }

    private function row(int $orgId, ?string $pi): void
    {
        DB::table('service_bookings')->insert(['organization_id' => $orgId, 'stripe_payment_intent_id' => $pi, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function hasIndex(): bool
    {
        return collect(Schema::getIndexes('service_bookings'))->contains(fn ($i) => ($i['name'] ?? null) === self::INDEX);
    }

    public function test_it_creates_the_index_and_the_database_refuses_a_second_booking_on_one_payment(): void
    {
        $this->table();
        $this->migration()->up();

        $this->assertTrue($this->hasIndex());
        $index = collect(Schema::getIndexes('service_bookings'))->firstWhere('name', self::INDEX);
        $this->assertTrue($index['unique']);
        $this->assertSame(['organization_id', 'stripe_payment_intent_id'], $index['columns']);

        $this->row(1, 'pi_one');
        try {
            $this->row(1, 'pi_one');
            $this->fail('A second booking on the same payment in the same organisation must be refused.');
        } catch (UniqueConstraintViolationException) {
            // the database's own answer
        }
        $this->assertSame(1, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_one')->count());

        $this->row(2, 'pi_one'); // another organisation: its own booking, its own rule
        $this->assertSame(2, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_one')->count());
    }

    public function test_bookings_without_a_payment_never_collide(): void
    {
        $this->table();
        $this->migration()->up();

        foreach ([null, null, '', ''] as $pi) {
            $this->row(1, $pi);
        }

        $this->assertSame(4, DB::table('service_bookings')->where('organization_id', 1)->count());
    }

    public function test_empty_references_already_there_do_not_stop_the_index(): void
    {
        $this->table();
        foreach ([null, null, '', ''] as $pi) {
            $this->row(1, $pi);
        }
        $this->row(1, 'pi_kept');

        $this->migration()->up();

        $this->assertTrue($this->hasIndex());
        $this->assertSame(2, DB::table('service_bookings')->where('stripe_payment_intent_id', '')->count(), 'the migration never edits a payment reference');
    }

    public function test_repeated_references_already_there_leave_the_table_alone_and_are_logged(): void
    {
        $this->table();
        foreach ([7, 7, 8, 8, 8] as $orgId) {
            $this->row($orgId, 'pi_same');
        }
        $this->row(9, 'pi_single');
        $this->row(9, '');
        $this->row(9, '');
        Log::spy();

        $this->migration()->up(); // must not throw

        $this->assertFalse($this->hasIndex());
        $this->assertSame(5, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_same')->count(), 'the migration never edits a payment reference');
        Log::shouldHaveReceived('warning')->once()->withArgs(function (string $message, array $context) {
            $orgs = array_map('intval', $context['organizations']);
            sort($orgs);

            return str_contains($message, 'the unique index was not created')
                && $orgs === [7, 8]
                && $context['count'] === 2;
        });

        $this->row(7, 'pi_same');
        $this->assertSame(6, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_same')->count(), 'without the index nothing refuses the insert');
    }

    public function test_the_warning_names_at_most_twenty_organisations(): void
    {
        $this->table();
        foreach (range(1, 25) as $orgId) {
            $this->row($orgId, 'pi_shared');
            $this->row($orgId, 'pi_shared');
        }
        Log::spy();

        $this->migration()->up();

        $this->assertFalse($this->hasIndex());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message, array $context) => count($context['organizations']) === 20);
    }

    /**
     * A CREATE that fails after the scan passed is logged and does not fail
     * the migration; run inside a transaction the way the migrator runs it,
     * the rest of that transaction still commits. (sqlite refuses an index
     * whose name a table already holds.)
     */
    public function test_a_create_that_fails_is_logged_and_does_not_fail_the_deploy(): void
    {
        $this->table();
        Schema::create(self::INDEX, fn ($t) => $t->id());
        Log::spy();

        DB::transaction(function () {
            $this->migration()->up();
            $this->row(1, 'pi_after');
        });

        $this->assertFalse($this->hasIndex());
        $this->assertSame(1, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_after')->count());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message) => str_contains($message, 'creating the unique index failed'));
    }

    public function test_down_removes_the_index_and_up_twice_is_harmless(): void
    {
        $this->table();
        $m = $this->migration();
        $m->up();
        $m->up();
        $this->assertTrue($this->hasIndex());

        $m->down();
        $this->assertFalse($this->hasIndex());
        $m->down(); // nothing left to drop

        $this->row(1, 'pi_again');
        $this->row(1, 'pi_again');
        $this->assertSame(2, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_again')->count());
    }

    public function test_a_database_without_the_table_or_the_column_is_left_alone(): void
    {
        $m = $this->migration();
        $m->up();
        $m->down();
        $this->assertFalse(Schema::hasTable('service_bookings'));

        Schema::create('service_bookings', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
        });
        $m->up();
        $this->assertFalse($this->hasIndex());
    }
}
