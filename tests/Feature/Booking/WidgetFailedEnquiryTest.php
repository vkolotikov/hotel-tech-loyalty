<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingSubmission;
use App\Models\Organization;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * A public widget booking that fails leaves staff a "Booking widget failed" enquiry to rescue the guest, with what the
 * guest asked for (owner, 2026-10-23: "fix it"). Before, the widget's submissions never carried the hold, so the
 * enquiry had no party and PostgreSQL refused its NOT NULL `num_adults`: no enquiry was ever kept. With no hold to read
 * (an expired one) the enquiry takes the columns' own defaults. A payment Stripe could not be asked about at confirm
 * leaves one too (release 6): the widget cannot confirm again with it. The widget's answer and everything it books are
 * unchanged (BookingEngineConfirmTest's "widget" tests).
 */
class WidgetFailedEnquiryTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private $smoobu;
    private BookingEngineService $engine;
    private string $checkIn;
    private string $checkOut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        Mail::fake();
        $this->enquiriesAsProductionHasThem();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);
        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->engine = new BookingEngineService($this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /** The columns the enquiry writes, NOT NULL with production's defaults (2026_03_28 CRM tables). */
    private function enquiriesAsProductionHasThem(): void
    {
        if (!Schema::hasTable('inquiries')) {
            Schema::create('inquiries', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->timestamps();
            });
        }
        $columns = [
            'inquiry_type' => fn ($t) => $t->string('inquiry_type')->nullable(),
            'source' => fn ($t) => $t->string('source')->nullable(),
            'status' => fn ($t) => $t->string('status')->nullable(),
            'priority' => fn ($t) => $t->string('priority')->nullable(),
            'check_in' => fn ($t) => $t->date('check_in')->nullable(),
            'check_out' => fn ($t) => $t->date('check_out')->nullable(),
            'num_adults' => fn ($t) => $t->unsignedSmallInteger('num_adults')->default(1),
            'num_children' => fn ($t) => $t->unsignedSmallInteger('num_children')->default(0),
            'num_rooms' => fn ($t) => $t->unsignedSmallInteger('num_rooms')->default(1),
            'room_type_requested' => fn ($t) => $t->string('room_type_requested', 100)->nullable(),
            'total_value' => fn ($t) => $t->decimal('total_value', 12, 2)->nullable(),
            'notes' => fn ($t) => $t->text('notes')->nullable(),
        ];
        foreach ($columns as $name => $add) {
            if (!Schema::hasColumn('inquiries', $name)) {
                Schema::table('inquiries', $add);
            }
        }
    }

    private function hold(): BookingHold
    {
        return BookingHold::create([
            'hold_token'   => Str::random(48),
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => [
                'unit_id' => '101', 'unit_name' => 'Sea view',
                'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'nights' => 2,
                'adults' => 3, 'children' => 1,
                'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0,
                'currency' => 'EUR', 'price_per_night' => 100.0,
            ],
        ]);
    }

    private function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test', 'phone' => '+37120000000'];
    }

    private function smoobuRefuses(): void
    {
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => $nights]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available'));
    }

    private function enquiries()
    {
        return DB::table('inquiries')->where('organization_id', $this->org->id)->where('source', 'booking_widget_failed')->get();
    }

    public function test_a_failed_widget_booking_leaves_an_enquiry_with_what_the_guest_asked_for(): void
    {
        $this->smoobuRefuses();
        $hold = $this->hold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a refused reservation must throw, as before');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('no longer available', $e->getMessage());
        }

        $enquiry = $this->enquiries()->sole();
        $this->assertSame(3, (int) $enquiry->num_adults);
        $this->assertSame(1, (int) $enquiry->num_children);
        $this->assertSame($this->checkIn, substr((string) $enquiry->check_in, 0, 10));
        $this->assertSame($this->checkOut, substr((string) $enquiry->check_out, 0, 10));
        $this->assertSame('Sea view', $enquiry->room_type_requested);
        $this->assertEquals(200.0, (float) $enquiry->total_value);
        $this->assertNotNull($enquiry->guest_id);
        $this->assertStringStartsWith('Booking widget failed: pms_rejected', (string) $enquiry->notes);

        $failure = BookingSubmission::withoutGlobalScopes()->where('outcome', 'failure')->sole();
        $this->assertSame('Sea view', $failure->unit_name, 'the failure log names what was asked for');
        $this->assertSame(3, (int) $failure->adults);
        $this->assertSame('active', $hold->fresh()->status, 'the hold is left as it was');
    }

    /** A double submit of a booking that went through finds its hold used up: logged, but no "booking failed" lead. */
    public function test_a_hold_already_used_by_a_booking_leaves_no_enquiry(): void
    {
        $hold = $this->hold();
        $hold->forceFill(['status' => 'consumed'])->save();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a used hold must be refused, as before');
        } catch (\RuntimeException) {
        }

        $this->assertCount(0, $this->enquiries());
        $this->assertSame('hold_expired', BookingSubmission::withoutGlobalScopes()->where('outcome', 'failure')->sole()->failure_code);
    }

    /**
     * Release 6 (review): Stripe cannot be asked about the payment under the lock. The widget cannot confirm again
     * with a payment it already confirmed at Stripe, so staff get the enquiry to follow the guest up.
     */
    public function test_a_payment_the_widget_could_not_check_leaves_an_enquiry(): void
    {
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => $nights]);
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andThrow(new \Stripe\Exception\ApiConnectionException('Request timed out'));
        $this->app->instance(\App\Services\StripeService::class, $stripe);
        $hold = $this->hold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_widget_live', 'payment_method' => 'stripe', 'payment_status' => 'authorized']);
            $this->fail('a payment that cannot be checked must not book');
        } catch (\App\Services\Booking\PaymentUnverifiable) {
        }

        $this->assertStringStartsWith('Booking widget failed: payment_check_failed', (string) $this->enquiries()->sole()->notes);
        $this->assertSame('active', $hold->fresh()->status);
    }

    public function test_an_expired_hold_still_leaves_an_enquiry_with_the_default_party(): void
    {
        $hold = $this->hold();
        $hold->forceFill(['expires_at' => now()->subMinute()])->save();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('an expired hold must be refused, as before');
        } catch (\RuntimeException) {
        }

        $enquiry = $this->enquiries()->sole();
        $this->assertSame(1, (int) $enquiry->num_adults, "the column's own default");
        $this->assertSame(0, (int) $enquiry->num_children);
        $this->assertStringStartsWith('Booking widget failed: hold_expired', (string) $enquiry->notes);
    }
}
