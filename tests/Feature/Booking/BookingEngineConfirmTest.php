<?php

namespace Tests\Feature\Booking;

use App\Mail\AdminBookingNotificationMail;
use App\Mail\BookingConfirmationMail;
use App\Mail\BookingMembershipMail;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\BookingSubmission;
use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use App\Services\BookingEngineService;
use App\Services\Booking\StayConfirmHooks;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * BookingEngineService::confirm() past its pre-flight checks: what a
 * confirmed stay writes and sends. Every Smoobu call is a Mockery mock.
 *
 * The tests named "widget" pin what the public booking widget gets today;
 * they must keep passing, unchanged, through every later change to the
 * engine.
 */
class BookingEngineConfirmTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    protected Organization $org;
    protected $smoobu;
    protected BookingEngineService $engine;
    protected string $checkIn;
    protected string $checkOut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        Mail::fake();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->engine = new BookingEngineService($this->smoobu);

        // The hand-rolled loyalty schema predates `welcomed_at` and never
        // carried `email_verification_codes` — both are needed by the
        // "no set-your-password to a member" tests. Shaped like the real
        // migrations (2026_04_25_120000, 2026_04_01_100003).
        if (!\Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', 'welcomed_at')) {
            \Illuminate\Support\Facades\Schema::table('loyalty_members', fn ($table) => $table->timestamp('welcomed_at')->nullable());
        }
        if (!\Illuminate\Support\Facades\Schema::hasTable('email_verification_codes')) {
            \Illuminate\Support\Facades\Schema::create('email_verification_codes', function ($table) {
                $table->id();
                $table->string('email')->index();
                $table->string('code', 6);
                $table->timestamp('expires_at');
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /** A two-night hold on room 101 for 200.00, as BookingEngineService::quote() writes it. */
    protected function hold(array $payload = []): BookingHold
    {
        return BookingHold::create([
            'hold_token'   => Str::random(48),
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => array_merge([
                'unit_id' => '101', 'unit_name' => 'Sea view',
                'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'nights' => 2,
                'adults' => 2, 'children' => 0,
                'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0,
                'currency' => 'EUR', 'price_per_night' => 100.0,
            ], $payload),
        ]);
    }

    /** Smoobu says every night is free and accepts the reservation. */
    protected function smoobuAccepts(array $reservation = []): void
    {
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => $nights]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(array_merge(['id' => 555001, 'reference-id' => 'BK-ABC12345'], $reservation));
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    protected function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test', 'phone' => '+37120000000'];
    }

    public function test_widget_confirm_writes_the_mirror_consumes_the_hold_and_answers_the_reference(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertTrue($res['success']);
        $this->assertSame('BK-ABC12345', $res['booking_reference']);
        $this->assertSame('555001', $res['reservation_id']);
        $this->assertEquals(200.0, $res['gross_total']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('Website', $mirror->channel_name);
        $this->assertSame('confirmed', $mirror->internal_status);
        $this->assertSame('confirmed', $mirror->booking_state);
        $this->assertSame('101', (string) $mirror->apartment_id);
        $this->assertEquals(200.0, (float) $mirror->price_total);
        $this->assertNull($mirror->payment_status);
        $this->assertNull($mirror->stripe_payment_intent_id);
        $this->assertSame('ada@example.test', $mirror->guest_email);
        $this->assertNotNull($mirror->guest_id, 'the widget links or creates a CRM guest by email');
        $this->assertNull($mirror->member_id);
        $this->assertEquals(0.0, (float) $mirror->discount_amount);
        $this->assertNull($mirror->notice);

        $this->assertSame('consumed', $hold->fresh()->status);
    }

    public function test_widget_confirm_sends_smoobu_the_gross_total_and_an_itemised_receipt(): void
    {
        $this->smoobuAccepts();
        $extra = $this->seedStayExtra($this->org->id);
        $hold = $this->hold(['extras' => [['id' => (string) $extra->id, 'quantity' => 2]], 'extras_total' => 30.0, 'gross_total' => 230.0]);

        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555002, 'reference-id' => 'BK-WIDGET02']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'special_requests' => 'Late arrival']);

        $this->assertSame(101, $sent['apartmentId']);
        $this->assertEquals(230.0, $sent['price']);
        $this->assertEquals(0.0, $sent['price-paid']);
        $this->assertSame(7, $sent['channelId']);
        $this->assertSame('Late arrival', $sent['notice']);
        $this->assertStringContainsString('Booked via: Website / Direct widget', $sent['assistant-notice']);
        $this->assertStringNotContainsString('discount', strtolower($sent['assistant-notice']));
        $this->assertSame(['basePrice', 'addon'], array_column($sent['priceElements'], 'type'));
        $this->assertEquals(200.0, $sent['priceElements'][0]['amount']);
        $this->assertEquals(30.0, $sent['priceElements'][1]['amount']);
    }

    public function test_widget_confirm_stores_the_line_items_the_log_the_audit_row_and_queues_the_mail(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, 'req-1', '203.0.113.9');

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation'], $rows->pluck('element_type')->all());
        $this->assertEquals(100.0, (float) $rows[0]->amount);
        $this->assertSame(2, (int) $rows[0]->quantity);

        $this->assertSame(1, BookingSubmission::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('outcome', 'success')->count());
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirmed')->where('subject_id', $mirror->id)->count());
        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $m) => $m->hasTo('ada@example.test') && $m->grossTotal === 200.0);
    }

    /**
     * The venue's notification for a booking without a member carries the
     * hold payload's `special_requests` (absent from a widget hold, so
     * null), never the mirror's own `notice` column — even when the
     * mirror the mail is built from already carries one (written by the
     * Smoobu sync, say).
     */
    public function test_widget_venue_mail_note_is_what_it_was_before_the_portal(): void
    {
        User::create(['name' => 'Front desk', 'email' => 'desk@seaside.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff', 'organization_id' => $this->org->id]);
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => '555001', 'booking_reference' => 'BK-ABC12345',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101',
            'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200, 'notice' => 'Late arrival',
        ]);
        $payload = $this->hold()->payload_json;

        $this->engine->sendBookingEmails($this->guest(), $payload, ['booking_reference' => 'BK-ABC12345', 'reservation_id' => '555001'], $this->org->id);

        Mail::assertQueued(AdminBookingNotificationMail::class, fn (AdminBookingNotificationMail $m) => $m->hasTo('desk@seaside.test') && $m->specialRequests === null);
    }

    /** An empty string in a hold without a member is passed on as it is. */
    public function test_widget_venue_mail_note_passes_an_empty_payload_note_on_unchanged(): void
    {
        $this->smoobuAccepts();
        User::create(['name' => 'Front desk', 'email' => 'desk@seaside.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff', 'organization_id' => $this->org->id]);
        $hold = $this->hold(['special_requests' => '']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'special_requests' => 'Cot please']);

        Mail::assertQueued(AdminBookingNotificationMail::class, fn (AdminBookingNotificationMail $m) => $m->specialRequests === '');
    }

    public function test_a_paid_widget_confirm_stores_the_payment_and_tells_smoobu_it_is_paid(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555003, 'reference-id' => 'BK-PAID0003']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_widget_1', 'payment_method' => 'stripe', 'payment_status' => 'authorized']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('authorized', $mirror->payment_status);
        $this->assertSame('stripe', $mirror->payment_method);
        $this->assertSame('pi_widget_1', $mirror->stripe_payment_intent_id);
        $this->assertEquals(200.0, $sent['price-paid']);
        $this->assertSame(1, $sent['priceStatus']);
    }

    public function test_a_smoobu_rejection_writes_nothing_and_leaves_the_hold_active(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available'));
        $hold = $this->hold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a rejected reservation must throw');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('no longer available', $e->getMessage());
        }

        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status);
    }

    public function test_a_transient_smoobu_failure_writes_a_local_mirror_for_the_retry_job(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('cURL error 28: Operation timed out'));
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('pending_pms_sync', $mirror->internal_status);
        $this->assertStringStartsWith('LOCAL-', $mirror->reservation_id);
        $this->assertStringStartsWith('LOC-', $res['booking_reference']);
    }

    public function test_a_room_already_booked_for_the_dates_is_refused(): void
    {
        $this->smoobuAccepts();
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
        ]);
        $hold = $this->hold();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('no longer available for the selected dates');
        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
    }

    /** A price-breakdown failure after commit must not fail the confirm — pins Log::warning() being reachable (the facade must stay imported). */
    public function test_a_price_breakdown_failure_after_commit_does_not_fail_the_confirm(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('getPriceElements')->once()->andThrow(new \RuntimeException('Smoobu API error: 500'));
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertTrue($res['success']);
        $this->assertSame(1, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
    }

    /** A hold as the portal's quote writes it: 10% member discount on 200.00. */
    private function memberHold(array $payload = []): BookingHold
    {
        return $this->hold(array_merge([
            'member_id' => 41, 'list_total' => 200.0, 'discount' => 20.0, 'discount_source' => 'tier_benefit',
            'discount_source_id' => 9, 'discount_label' => 'Gold: 10% off stays', 'gross_total' => 180.0,
            'channel_name' => 'Member portal',
        ], $payload));
    }

    private function recordingHooks(array &$calls, ?\Throwable $failBefore = null): StayConfirmHooks
    {
        return new class($calls, $failBefore) implements StayConfirmHooks {
            public function __construct(private array &$calls, private ?\Throwable $failBefore) {}
            public function beforeReservation(array $payload): void
            {
                $this->calls[] = 'before';
                if ($this->failBefore) throw $this->failBefore;
            }
            public function afterMirror(BookingMirror $mirror, array $payload): void
            {
                $this->calls[] = 'after:' . $mirror->id;
            }
        };
    }

    /**
     * These member-hold tests exercise confirm() directly — they stand for
     * a caller that has already run the portal's own checks, which the
     * guard below models as "any hooks at all". A no-op hooks object
     * changes none of their assertions.
     */
    private function memberHooks(): StayConfirmHooks
    {
        $calls = [];

        return $this->recordingHooks($calls);
    }

    public function test_a_member_hold_stamps_the_member_the_discount_the_channel_and_the_notes(): void
    {
        $this->smoobuAccepts();
        $guest = Guest::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'first_name' => 'Ada', 'last_name' => 'Lovelace', 'full_name' => 'Ada Lovelace', 'email' => 'other-address@example.test', 'member_id' => 41]);
        $hold = $this->memberHold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'guest_id' => $guest->id, 'special_requests' => 'Quiet room please', 'payment_status' => 'open', 'payment_method' => 'pay_at_venue'], null, null, null, $this->memberHooks());

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('Member portal', $mirror->channel_name);
        $this->assertSame(41, (int) $mirror->member_id);
        $this->assertSame($guest->id, (int) $mirror->guest_id, 'the member\'s own guest, not one found by email');
        $this->assertEquals(200.0, (float) $mirror->list_total);
        $this->assertEquals(20.0, (float) $mirror->discount_amount);
        $this->assertSame('tier_benefit', $mirror->discount_source);
        $this->assertSame(9, (int) $mirror->discount_source_id);
        $this->assertSame('Gold: 10% off stays', $mirror->discount_label);
        $this->assertEquals(180.0, (float) $mirror->price_total);
        $this->assertSame('Quiet room please', $mirror->notice);
        $this->assertSame('open', $mirror->payment_status);
        $this->assertSame('pay_at_venue', $mirror->payment_method);
        $this->assertSame(1, Guest::withoutGlobalScopes()->where('organization_id', $this->org->id)->count(), 'no second guest is created for the email');
    }

    public function test_smoobu_gets_the_discounted_price_and_a_receipt_that_adds_up(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555010, 'reference-id' => 'BK-MEMBER10']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->memberHooks());

        $this->assertEquals(180.0, $sent['price']);
        $this->assertStringContainsString('Booked via: Member portal', $sent['assistant-notice']);
        $this->assertStringContainsString('Gold: 10% off stays', $sent['assistant-notice']);
        $this->assertStringContainsString('-€20.00', $sent['assistant-notice']);
        $this->assertStringContainsString('Total: €180.00', $sent['assistant-notice']);
        $this->assertEquals(180.0, array_sum(array_column($sent['priceElements'], 'amount')), 'Smoobu adds the elements up; they must equal the price');
        $this->assertEquals(180.0, $sent['priceElements'][0]['amount']);
    }

    public function test_a_discount_larger_than_the_room_total_sends_no_price_elements(): void
    {
        $this->smoobuAccepts();
        $extra = $this->seedStayExtra($this->org->id, ['price' => 300]);
        $hold = $this->memberHold(['extras' => [['id' => (string) $extra->id, 'quantity' => 1]], 'extras_total' => 300.0, 'list_total' => 500.0, 'discount' => 250.0, 'gross_total' => 250.0]);
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555011, 'reference-id' => 'BK-MEMBER11']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->memberHooks());

        $this->assertEquals(250.0, $sent['price']);
        $this->assertArrayNotHasKey('priceElements', $sent, 'a base price below zero is never sent; the top-level price is the truth');
    }

    public function test_the_stored_line_items_carry_the_discount_as_a_negative_row(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->memberHooks());

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation', 'discount'], $rows->pluck('element_type')->all());
        $this->assertEquals(-20.0, (float) $rows[1]->amount);
        $this->assertSame('Gold: 10% off stays', $rows[1]->name);
    }

    public function test_the_hooks_run_inside_the_transaction_in_order(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();
        $calls = [];

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->recordingHooks($calls));

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame(['before', 'after:' . $mirror->id], $calls);
    }

    public function test_a_hook_that_refuses_stops_the_booking_before_smoobu_is_asked(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->memberHold();
        $calls = [];

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->recordingHooks($calls, new \DomainException('coupon gone')));
            $this->fail('the hook\'s exception must reach the caller');
        } catch (\DomainException $e) {
            $this->assertSame('coupon gone', $e->getMessage());
        }

        $this->assertSame(['before'], $calls);
        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status);
    }

    /**
     * Only the portal's own confirm attaches hooks. A member hold reaching
     * confirm() with none must be refused exactly like an unknown hold,
     * not booked at the member's price with the coupon never consumed —
     * the public widget's own endpoints separately refuse a member hold
     * before they ever reach here (see PublicEndpointsRefuseMemberHoldsTest).
     */
    public function test_a_member_hold_confirmed_without_hooks_is_refused_like_an_unknown_hold(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->memberHold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a member hold confirmed without hooks must be refused');
        } catch (\RuntimeException $e) {
            $this->assertSame('Hold expired or not found', $e->getMessage());
        }

        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status, 'the member can still finish this hold in the portal');
    }

    public function test_a_members_own_line_items_survive_the_post_confirm_smoobu_price_pull(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('getPriceElements')->never();
        $hold = $this->memberHold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->memberHooks());

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation', 'discount'], $rows->pluck('element_type')->all());
    }

    /** Pins the widget side: it still replaces its own line items with Smoobu's breakdown. */
    public function test_widget_confirm_still_replaces_its_line_items_with_smoobus_own_breakdown(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();
        $this->smoobu->shouldReceive('getPriceElements')->once()->andReturn([
            ['id' => 9001, 'type' => 'basePrice', 'name' => 'Sea view', 'amount' => 200.0, 'quantity' => 2, 'currency' => 'EUR'],
        ]);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->get();
        $this->assertSame(['basePrice'], $rows->pluck('element_type')->all());
    }

    public function test_a_guest_id_from_another_organisation_is_ignored_and_resolved_by_email(): void
    {
        $this->smoobuAccepts();
        $otherOrg = Organization::create(['name' => 'Other Hotel', 'slug' => 'other-' . uniqid()]);
        // BelongsToOrganization forces organization_id from the CURRENT tenant
        // binding on create, ignoring an explicit attribute — so the foreign
        // guest must be created while that binding actually points at the
        // other org, then the binding is restored for the rest of the test.
        app()->instance('current_organization_id', $otherOrg->id);
        $foreignGuest = Guest::withoutGlobalScopes()->create(['first_name' => 'Bob', 'last_name' => 'X', 'full_name' => 'Bob X', 'email' => 'bob@example.test']);
        app()->instance('current_organization_id', $this->org->id);
        $hold = $this->hold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'guest_id' => $foreignGuest->id]);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertNotEquals($foreignGuest->id, $mirror->guest_id);
        $localGuest = Guest::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('email', 'ada@example.test')->first();
        $this->assertNotNull($localGuest);
        $this->assertSame($localGuest->id, $mirror->guest_id);
    }

    /** A member of this venue who has never been sent the "set your password" mail. */
    private function unwelcomedMember(string $email): LoyaltyMember
    {
        $tier = LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 0, 'is_active' => true]);
        $user = User::create(['name' => 'Ada Lovelace', 'email' => $email, 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->org->id]);
        return LoyaltyMember::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-' . uniqid(), 'current_points' => 0]);
    }

    public function test_a_member_booking_mail_carries_the_discount_and_no_membership_invitation(): void
    {
        $this->smoobuAccepts();
        $member = $this->unwelcomedMember('ada@example.test');
        $hold = $this->memberHold(['member_id' => $member->id]);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->memberHooks());

        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $m) => $m->grossTotal === 180.0 && $m->discountAmount === 20.0 && $m->discountLabel === 'Gold: 10% off stays');
        Mail::assertNotQueued(BookingMembershipMail::class);
        $this->assertNull($member->fresh()->welcomed_at, 'a portal booking is not the member\'s welcome');
    }

    public function test_a_widget_booking_by_a_new_member_still_gets_the_invitation(): void
    {
        $this->smoobuAccepts();
        $this->unwelcomedMember('ada@example.test');
        $hold = $this->hold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        Mail::assertQueued(BookingMembershipMail::class);
    }
}
