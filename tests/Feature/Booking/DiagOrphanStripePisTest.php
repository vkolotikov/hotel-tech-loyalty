<?php

namespace Tests\Feature\Booking;

use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class DiagOrphanStripePisTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    public function test_a_payment_a_service_booking_carries_is_not_an_orphan(): void
    {
        $this->setUpCapturePendingSchema();
        $this->setUpServiceBookingSchema();
        $org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        DB::table('booking_mirror')->insert(['organization_id' => $org->id, 'reservation_id' => 'R-1', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => $org->id, 'booking_reference' => 'SVC-1', 'service_id' => 1, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'start_at' => now(), 'end_at' => now(), 'duration_minutes' => 45, 'stripe_payment_intent_id' => 'pi_service', 'created_at' => now(), 'updated_at' => now()]);

        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('listPaymentIntents')->once()->andReturn(array_map(
            fn (string $id) => PaymentIntent::constructFrom(['id' => $id, 'status' => 'requires_capture', 'amount' => 5400, 'currency' => 'eur', 'created' => now()->subHour()->timestamp, 'metadata' => ['kind' => 'portal_service_booking']]),
            ['pi_stay', 'pi_service', 'pi_orphan'],
        ));
        $this->app->instance(StripeService::class, $stripe);

        Artisan::call('diag:orphan-stripe-pis', ['--org' => $org->id, '--json' => true]);
        $report = json_decode(Artisan::output(), true);

        $this->assertSame(3, $report['scanned']);
        $this->assertSame(['pi_orphan'], array_column($report['orphans'], 'pi_id'));
        $this->assertSame('portal_service_booking', $report['orphans'][0]['metadata']['kind']);
    }
}
