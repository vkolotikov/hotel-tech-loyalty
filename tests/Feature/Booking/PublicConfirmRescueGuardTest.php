<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\GuestLifecycleService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Database\Events\TransactionRolledBack;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Mockery;
use Stripe\Exception\ApiConnectionException;
use Stripe\Exception\InvalidRequestException;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * POST /api/v1/booking/confirm gives back, on a failed confirm, only a
 * payment that carries THIS request's hold token in its metadata — the
 * public widget's intent for this hold — and that no booking carries.
 * Everything else is left alone and recorded as
 * `booking.confirm.pi_rescue_refused` with a reason: a booking carries it,
 * a member-portal payment, a payment of another kind, another
 * organisation's, one without a hold token (not a widget payment at all),
 * another hold's, and an id from the request body that Stripe cannot read.
 *
 * The caller cannot tell a refusal from a rescue: each refused request is
 * compared, byte for byte, with the same request naming this hold's own
 * payment, which is given back — on the validation path (confirm() never
 * reads the intent there) or on an engine failure (both pass confirm()'s own
 * verification).
 *
 * The honest flow — this hold's own intent, the hold's cached id, a mock id,
 * a PMS outage — is pinned call by call: the same Stripe calls with the same
 * arguments in the same order, the same audit rows and log lines as before
 * the refusal rules existed.
 *
 * The row lock on the hold and the `pi:` advisory lock cannot be shown on
 * sqlite (no row locks, no advisory locks); the order of work — refusals
 * without any transaction, an action inside one that reads the hold, then
 * re-reads "carried", then calls Stripe, with the audit row written after
 * the commit — is shown by the query and transaction trace.
 *
 * Stripe and Smoobu are Mockery mocks; every Stripe call is recorded in order.
 */
class PublicConfirmRescueGuardTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private const URL = '/api/v1/booking/confirm';
    private const TOKEN = 'wtok_rescue_guard';
    private const ROOM_TAKEN = 'This room is no longer available for the selected dates. Please choose another.';
    private const NO_MATCH = 'Payment does not match this booking.';

    protected Organization $org;
    protected string $checkIn;
    protected string $checkOut;
    protected $smoobu;

    /** @var list<array> every Stripe call of the current request, in order: [method, ...arguments as passed] */
    private array $calls = [];

    /** @var list<string> Stripe calls, SQL and transaction events, in order (for the order-of-work test) */
    private array $trace = [];

    /** @var array<string, PaymentIntent|\Throwable> what retrievePaymentIntent() answers per id; an unknown id is Stripe's "no such payment_intent" */
    private array $intents = [];

    /** @var array<string, \Throwable> cancelPaymentIntent() failures per id */
    private array $cancelFails = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        Mail::fake();
        Log::spy();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        $this->org->forceFill(['widget_token' => self::TOKEN])->save();
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
        $this->fakeStripe();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function fakeStripe(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (...$args) {
            $this->calls[] = ['retrieve', ...$args];
            $this->trace[] = 'stripe:retrieve';
            $answer = $this->intents[$args[0]] ?? new InvalidRequestException("No such payment_intent: '{$args[0]}'");
            if ($answer instanceof \Throwable) {
                throw $answer;
            }

            return $answer;
        });
        $stripe->shouldReceive('cancelPaymentIntent')->andReturnUsing(function (...$args) {
            $this->calls[] = ['cancel', ...$args];
            $this->trace[] = 'stripe:cancel';
            if (isset($this->cancelFails[$args[0]])) {
                throw $this->cancelFails[$args[0]];
            }

            return PaymentIntent::constructFrom(['id' => $args[0], 'status' => 'canceled']);
        });
        $stripe->shouldReceive('refund')->andReturnUsing(function (...$args) {
            $this->calls[] = ['refund', ...$args];
            $this->trace[] = 'stripe:refund';

            return Refund::constructFrom(['id' => 're_rescue_1', 'amount' => 20000, 'payment_intent' => $args[0]]);
        });
        $stripe->shouldReceive('capturePaymentIntent')->andReturnUsing(function (...$args) {
            $this->calls[] = ['capture', ...$args];
            $this->trace[] = 'stripe:capture';

            return PaymentIntent::constructFrom(['id' => $args[0], 'status' => 'succeeded']);
        });
        $this->app->instance(StripeService::class, $stripe);
    }

    /** POSTs the confirm with the venue's widget token, exactly as the widget does; the org is bound by the token. */
    private function confirm(array $body)
    {
        $this->calls = [];
        app()->forgetInstance('current_organization_id');
        $res = $this->postJson(self::URL, $body, ['X-Org-Token' => self::TOKEN]);
        app()->instance('current_organization_id', $this->org->id);

        return $res;
    }

    private function intent(string $id, string $status = 'requires_capture', array $metadata = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(['id' => $id, 'object' => 'payment_intent', 'status' => $status, 'amount' => 20000, 'currency' => 'eur', 'metadata' => $metadata]);
    }

    /** The metadata the public widget's paymentIntent() writes for a hold. */
    private function widgetMeta(string $holdToken, ?int $orgId = null): array
    {
        return [
            'hold_token' => $holdToken, 'org_id' => (string) ($orgId ?? $this->org->id),
            'unit_name' => 'Sea view', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut,
        ];
    }

    /** This hold's own widget payment, readable: the one payment the rescue gives back. */
    private function ownIntent(BookingHold $hold, string $status = 'requires_capture'): string
    {
        $id = 'pi_hold_' . $hold->id;
        $this->intents[$id] = $this->intent($id, $status, $this->widgetMeta($hold->hold_token));

        return $id;
    }

    /** A two-night widget hold on room 101, as quote() writes it. */
    private function hold(array $payload = []): BookingHold
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

    /** Somebody else's confirmed stay on room 101 for the same nights: the engine refuses with ROOM_TAKEN. */
    private function roomTaken(): void
    {
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-TAKEN', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
        ]);
    }

    /** A confirmed stay (another room) carrying the intent. */
    private function carryingMirror(string $piId, array $attrs = []): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . $piId, 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '202', 'arrival_date' => now()->addDays(30)->toDateString(), 'departure_date' => now()->addDays(32)->toDateString(),
            'price_total' => 180, 'payment_method' => 'stripe', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => $piId,
            'channel_name' => 'Website',
        ], $attrs));
    }

    /** Smoobu says every night is free and accepts the reservation. */
    private function smoobuAccepts(): void
    {
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => $nights]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
    }

    private function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test'];
    }

    /** @return list<AuditLog> the rescue's audit rows (`booking.confirm.<action>`) about this intent, optionally at one stage */
    private function rescueRows(string $action, string $piId, ?string $stage = null): array
    {
        return AuditLog::withoutGlobalScopes()->where('action', 'booking.confirm.' . $action)->get()
            ->filter(fn (AuditLog $r) => ($r->new_values['payment_intent_id'] ?? null) === $piId
                && ($stage === null || ($r->new_values['confirm_context']['stage'] ?? null) === $stage))
            ->values()->all();
    }

    /** One refusal of this intent at this stage: the exact payload keys (no metadata value but `kind`), the reason, the warning line. */
    private function assertRefused(string $piId, string $reason, string $stage, ?string $kind = null, array $extraKeys = []): void
    {
        $rows = $this->rescueRows('pi_rescue_refused', $piId, $stage);
        $this->assertCount(1, $rows, "one pi_rescue_refused row for {$piId} at {$stage}");
        $row = $rows[0];
        $this->assertSame($this->org->id, (int) $row->organization_id);
        $this->assertSame('stripe_payment', $row->subject_type);
        $this->assertSame("Confirm rescue: pi_rescue_refused on PI {$piId}", $row->description);

        $keys = array_merge(['payment_intent_id', 'original_error', 'original_class', 'confirm_context', 'reason'], $kind !== null ? ['kind'] : [], $extraKeys);
        $this->assertEqualsCanonicalizing($keys, array_keys($row->new_values), 'nothing else is recorded');
        $this->assertSame($reason, $row->new_values['reason']);
        if ($kind !== null) {
            $this->assertSame($kind, $row->new_values['kind']);
        }
        foreach (['pi_cancelled', 'pi_refunded', 'pi_rescue_failed', 'pi_rescue_restricted_key'] as $other) {
            $this->assertSame([], $this->rescueRows($other, $piId), "no {$other} row for {$piId}");
        }

        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context = []) => $message === 'Booking confirm PI rescue: pi_rescue_refused'
            && ($context['payment_intent_id'] ?? null) === $piId && ($context['reason'] ?? null) === $reason
            && ($context['confirm_context']['stage'] ?? null) === $stage)->once();
    }

    private function assertNoMoneyMoved(string $piId): void
    {
        foreach ($this->calls as $call) {
            if (in_array($call[0], ['cancel', 'refund', 'capture'], true)) {
                $this->assertNotSame($piId, $call[1], 'no cancel, refund or capture of ' . $piId);
            }
        }
    }

    /** Status and body byte for byte. */
    private function assertSameAnswer($expected, $actual): void
    {
        $this->assertSame($expected->getStatusCode(), $actual->getStatusCode(), 'same status');
        $this->assertSame($expected->getContent(), $actual->getContent(), 'same body');
    }

    /**
     * On the validation path (confirm() never reads the intent there): the
     * refused request gets the same answer as the same request naming this
     * hold's own payment, which is given back.
     */
    private function assertIndistinguishableOnValidationPath(string $refusedId): BookingHold
    {
        $hold = $this->hold();
        $body = ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => $refusedId];

        $refused = $this->confirm($body);
        $this->assertNoMoneyMoved($refusedId);

        $own = $this->ownIntent($hold);
        $given = $this->confirm(['payment_intent_id' => $own] + $body);
        $this->assertSame([['retrieve', $own], ['cancel', $own]], $this->calls, "this hold's own payment is given back");
        $this->assertCount(1, $this->rescueRows('pi_cancelled', $own));

        $refused->assertStatus(422);
        $this->assertSameAnswer($given, $refused);

        return $hold;
    }

    // ─── Refused ─────────────────────────────────────────────────────

    /** 1. A confirmed member-portal stay's payment. */
    public function test_the_payment_of_a_confirmed_portal_stay_is_left_alone(): void
    {
        $mirror = $this->carryingMirror('pi_portal_stay', ['member_id' => 41, 'channel_name' => 'Member portal']);
        $before = $mirror->fresh()->getAttributes();
        $this->intents['pi_portal_stay'] = $this->intent('pi_portal_stay', 'requires_capture', [
            'kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => '41', 'portal_hold_token' => 'portal-hold-1', 'total' => '180.00',
        ]);

        $this->confirm(['hold_token' => 'no-such-hold', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_portal_stay'])
            ->assertStatus(400)->assertExactJson(['error' => self::NO_MATCH]);
        $this->assertSame([['retrieve', 'pi_portal_stay']], $this->calls, 'the rescue asks Stripe nothing about a carried payment');
        $this->assertRefused('pi_portal_stay', 'carried_by_booking', 'service_runtime');

        $this->assertIndistinguishableOnValidationPath('pi_portal_stay');
        $this->assertRefused('pi_portal_stay', 'carried_by_booking', 'validation');
        $this->assertEquals($before, $mirror->fresh()->getAttributes(), 'the booking is untouched');
    }

    /** 2. A confirmed appointment's payment (a service_bookings row carries it). */
    public function test_the_payment_of_a_confirmed_appointment_is_left_alone(): void
    {
        $id = DB::table('service_bookings')->insertGetId(['organization_id' => $this->org->id, 'stripe_payment_intent_id' => 'pi_appt', 'created_at' => now(), 'updated_at' => now()]);
        $before = (array) DB::table('service_bookings')->find($id);
        $this->intents['pi_appt'] = $this->intent('pi_appt', 'requires_capture', [
            'kind' => 'portal_service_booking', 'org_id' => (string) $this->org->id, 'member_id' => '41', 'service_id' => '7', 'start_at' => '2026-10-20T10:00:00+00:00',
        ]);

        $this->confirm(['hold_token' => 'no-such-hold', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_appt']);
        $this->assertSame([['retrieve', 'pi_appt']], $this->calls);
        $this->assertRefused('pi_appt', 'carried_by_booking', 'service_runtime');

        $this->assertIndistinguishableOnValidationPath('pi_appt');
        $this->assertRefused('pi_appt', 'carried_by_booking', 'validation');
        $this->assertEquals($before, (array) DB::table('service_bookings')->find($id));
    }

    /** 3. A confirmed PUBLIC WIDGET stay's payment, posted with another valid hold of the same venue. */
    public function test_the_payment_of_a_confirmed_widget_stay_is_left_alone(): void
    {
        $spent = $this->hold();
        $spent->update(['status' => 'consumed']);
        $mirror = $this->carryingMirror('pi_widget_done');
        $before = $mirror->fresh()->getAttributes();
        $this->intents['pi_widget_done'] = $this->intent('pi_widget_done', 'requires_capture', $this->widgetMeta($spent->hold_token));

        $this->confirm(['hold_token' => $this->hold()->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_widget_done']);
        $this->assertSame([['retrieve', 'pi_widget_done']], $this->calls);
        $this->assertRefused('pi_widget_done', 'carried_by_booking', 'service_runtime');

        $this->assertIndistinguishableOnValidationPath('pi_widget_done');
        $this->assertRefused('pi_widget_done', 'carried_by_booking', 'validation');
        $this->assertEquals($before, $mirror->fresh()->getAttributes());
    }

    /** 4. A member-portal payment no booking carries yet. */
    public function test_a_portal_payment_is_left_alone(): void
    {
        $this->intents['pi_portal_open'] = $this->intent('pi_portal_open', 'requires_capture', [
            'kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => '41', 'portal_hold_token' => 'portal-hold-2', 'total' => '180.00',
        ]);

        $this->confirm(['hold_token' => 'no-such-hold', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_portal_open']);
        $this->assertSame([['retrieve', 'pi_portal_open'], ['retrieve', 'pi_portal_open']], $this->calls);
        $this->assertRefused('pi_portal_open', 'portal_payment', 'service_runtime', 'portal_stay_booking');

        $this->assertIndistinguishableOnValidationPath('pi_portal_open');
        $this->assertRefused('pi_portal_open', 'portal_payment', 'validation', 'portal_stay_booking');
    }

    /** A portal kind alone, or a portal hold token alone — even with this hold's token — marks a portal payment. */
    public function test_either_portal_mark_alone_is_enough(): void
    {
        $hold = $this->hold();
        $this->intents['pi_kind_only'] = $this->intent('pi_kind_only', 'requires_capture', ['kind' => 'portal_something_new'] + $this->widgetMeta($hold->hold_token));
        $this->intents['pi_hold_only'] = $this->intent('pi_hold_only', 'requires_capture', ['portal_hold_token' => 'portal-hold-3'] + $this->widgetMeta($hold->hold_token));
        $body = ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada']];

        $this->confirm($body + ['payment_intent_id' => 'pi_kind_only']);
        $this->assertNoMoneyMoved('pi_kind_only');
        $this->assertRefused('pi_kind_only', 'portal_payment', 'validation', 'portal_something_new');

        $this->confirm($body + ['payment_intent_id' => 'pi_hold_only']);
        $this->assertNoMoneyMoved('pi_hold_only');
        $this->assertRefused('pi_hold_only', 'portal_payment', 'validation');
    }

    /** Any other `kind` — the public services widget's own intents, say — is not this request's stay payment. */
    public function test_a_payment_of_another_kind_is_left_alone(): void
    {
        $this->intents['pi_service'] = $this->intent('pi_service', 'requires_capture', [
            'kind' => 'service_booking', 'org_id' => (string) $this->org->id, 'service_id' => '7', 'start_at' => '2026-10-20T10:00:00+00:00',
        ]);

        $this->confirm(['hold_token' => 'no-such-hold', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_service']);
        $this->assertSame([['retrieve', 'pi_service'], ['retrieve', 'pi_service']], $this->calls);
        $this->assertRefused('pi_service', 'other_kind', 'service_runtime', 'service_booking');

        $this->assertIndistinguishableOnValidationPath('pi_service');
        $this->assertRefused('pi_service', 'other_kind', 'validation', 'service_booking');
    }

    /** 5. The guest's payment for an EARLIER hold, sent with a newer one. */
    public function test_a_payment_taken_for_another_hold_is_left_alone(): void
    {
        $earlier = $this->hold();
        $this->intents['pi_earlier'] = $this->intent('pi_earlier', 'requires_capture', $this->widgetMeta($earlier->hold_token));

        $this->confirm(['hold_token' => $this->hold()->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_earlier'])
            ->assertStatus(400)->assertExactJson(['error' => self::NO_MATCH]);
        $this->assertSame([['retrieve', 'pi_earlier'], ['retrieve', 'pi_earlier']], $this->calls);
        $this->assertRefused('pi_earlier', 'other_hold', 'service_runtime');

        $this->assertIndistinguishableOnValidationPath('pi_earlier');
        $this->assertRefused('pi_earlier', 'other_hold', 'validation');
    }

    /** A request that names an intent but no hold: nothing ties the payment to it. */
    public function test_a_request_without_a_hold_gives_back_nothing(): void
    {
        $this->intents['pi_some_hold'] = $this->intent('pi_some_hold', 'requires_capture', $this->widgetMeta('some-hold-token'));
        $body = ['guest' => $this->guest(), 'payment_intent_id' => 'pi_some_hold'];

        $refused = $this->confirm($body);
        $this->assertSame([['retrieve', 'pi_some_hold']], $this->calls);
        $this->assertRefused('pi_some_hold', 'other_hold', 'validation');

        $missing = $this->confirm(['payment_intent_id' => 'pi_does_not_exist'] + $body);
        $this->assertRefused('pi_does_not_exist', 'unreadable', 'validation', null, ['retrieve_error']);
        $this->assertSameAnswer($missing, $refused);
    }

    /** 6. Another organisation's payment whose hold token even matches; the engine refuses the stay. */
    public function test_another_organisations_payment_is_left_alone(): void
    {
        $stranger = Organization::create(['name' => 'Other Hotel', 'slug' => 'other-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $hold = $this->hold();
        $this->roomTaken();
        $this->intents['pi_foreign'] = $this->intent('pi_foreign', 'requires_capture', $this->widgetMeta($hold->hold_token, $stranger->id));
        $body = ['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_foreign'];

        $refused = $this->confirm($body);
        $this->assertSame([['retrieve', 'pi_foreign'], ['retrieve', 'pi_foreign']], $this->calls);
        $this->assertNoMoneyMoved('pi_foreign');
        $this->assertRefused('pi_foreign', 'other_organisation', 'service_runtime');

        // On an engine failure both pass confirm()'s verification: this hold's own payment gets the same answer and is given back.
        $own = $this->ownIntent($hold);
        $given = $this->confirm(['payment_intent_id' => $own] + $body);
        $this->assertSame([['retrieve', $own], ['retrieve', $own], ['cancel', $own]], $this->calls);
        $this->assertSameAnswer($given, $refused);
        $refused->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);
    }

    /** 7. The validation-failure path naming a carried payment: nothing is asked of Stripe. */
    public function test_a_validation_failure_naming_a_carried_payment_asks_stripe_nothing(): void
    {
        $this->carryingMirror('pi_portal_stay', ['member_id' => 41, 'channel_name' => 'Member portal']);
        $this->intents['pi_portal_stay'] = $this->intent('pi_portal_stay', 'requires_capture', ['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id]);

        $this->confirm(['hold_token' => $this->hold()->hold_token, 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => 'pi_portal_stay'])->assertStatus(422);

        $this->assertSame([], $this->calls);
        $this->assertRefused('pi_portal_stay', 'carried_by_booking', 'validation');
    }

    /** 8. An id from the request body that Stripe cannot read is not cancelled blind. */
    public function test_an_unreadable_id_from_the_request_is_not_cancelled_blind(): void
    {
        $this->intents['pi_unreachable'] = new ApiConnectionException('Could not connect to Stripe.');

        $this->assertIndistinguishableOnValidationPath('pi_unreachable');
        $this->assertRefused('pi_unreachable', 'unreadable', 'validation', null, ['retrieve_error']);
    }

    /** 8, where confirm() reads the intent itself first: still no blind cancel. */
    public function test_an_unreadable_id_is_not_cancelled_blind_after_confirm_failed_to_read_it(): void
    {
        $this->intents['pi_unreachable'] = new ApiConnectionException('Could not connect to Stripe.');

        $res = $this->confirm(['hold_token' => 'no-such-hold', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_unreachable']);

        $res->assertStatus(400)->assertExactJson(['error' => 'Unable to verify payment: Could not connect to Stripe.']);
        $this->assertSame([['retrieve', 'pi_unreachable'], ['retrieve', 'pi_unreachable']], $this->calls);
        $this->assertRefused('pi_unreachable', 'unreadable', 'service_runtime', null, ['retrieve_error']);
    }

    /** 11. An intent without any of our metadata — a payment link, an invoice, the venue's shop — is not a widget payment, authorised or captured. */
    public function test_a_payment_without_our_metadata_is_left_alone(): void
    {
        $hold = $this->hold();
        $this->intents['pi_bare_auth'] = $this->intent('pi_bare_auth', 'requires_capture');
        $this->intents['pi_bare_paid'] = $this->intent('pi_bare_paid', 'succeeded');

        foreach (['pi_bare_auth', 'pi_bare_paid'] as $id) {
            $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => $id])
                ->assertStatus(400)->assertExactJson(['error' => self::NO_MATCH]);
            $this->assertSame([['retrieve', $id], ['retrieve', $id]], $this->calls, 'no cancel, no refund');
            $this->assertRefused($id, 'not_widget_payment', 'service_runtime');
        }

        $this->assertIndistinguishableOnValidationPath('pi_bare_paid');
        $this->assertRefused('pi_bare_paid', 'not_widget_payment', 'validation');
    }

    /** The hold's cached id, when a booking carries it: refused before Stripe is asked. */
    public function test_the_holds_cached_id_is_left_alone_when_a_booking_carries_it(): void
    {
        $hold = $this->hold(['stripe_payment_intent_id' => 'pi_cached_carried']);
        $this->carryingMirror('pi_cached_carried');
        $this->roomTaken();
        $this->intents['pi_cached_carried'] = $this->intent('pi_cached_carried', 'requires_capture', $this->widgetMeta($hold->hold_token));

        $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()])
            ->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);

        $this->assertSame([], $this->calls);
        $this->assertRefused('pi_cached_carried', 'carried_by_booking', 'service_runtime');
    }

    /** The hold's cached id, readable, carrying another hold's token: refused; with this hold's token it is given back, and the answer is the same. */
    public function test_the_holds_cached_id_is_subject_to_the_same_marks(): void
    {
        $hold = $this->hold(['stripe_payment_intent_id' => 'pi_cached']);
        $this->roomTaken();
        $body = ['hold_token' => $hold->hold_token, 'guest' => $this->guest()];

        $this->intents['pi_cached'] = $this->intent('pi_cached', 'requires_capture', $this->widgetMeta('another-hold-token'));
        $refused = $this->confirm($body);
        $this->assertSame([['retrieve', 'pi_cached']], $this->calls);
        $this->assertRefused('pi_cached', 'other_hold', 'service_runtime');

        $this->intents['pi_cached'] = $this->intent('pi_cached', 'requires_capture', $this->widgetMeta($hold->hold_token));
        $given = $this->confirm($body);
        $this->assertSame([['retrieve', 'pi_cached'], ['cancel', 'pi_cached']], $this->calls);
        $this->assertCount(1, $this->rescueRows('pi_cancelled', 'pi_cached'));
        $this->assertSameAnswer($given, $refused);
    }

    /** The engine commits the booking and then throws: the rescue never gives that booking's payment back. */
    public function test_a_booking_committed_before_the_failure_keeps_its_payment(): void
    {
        $this->smoobuAccepts();
        $lifecycle = Mockery::mock(GuestLifecycleService::class);
        $lifecycle->shouldReceive('recordActivity')->andThrow(new \RuntimeException('Lifecycle service unavailable'));
        $this->app->instance(GuestLifecycleService::class, $lifecycle);
        $hold = $this->hold();
        $own = $this->ownIntent($hold);

        $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => $own])
            ->assertStatus(400)->assertExactJson(['error' => 'Lifecycle service unavailable']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('stripe_payment_intent_id', $own)->sole();
        $this->assertSame('authorized', $mirror->payment_status, 'the booking stands, its payment authorised');
        $this->assertSame([['retrieve', $own]], $this->calls, 'only confirm() read it; nothing was cancelled');
        $this->assertRefused($own, 'carried_by_booking', 'service_runtime');
    }

    // ─── Rescued exactly as before ───────────────────────────────────

    /** 9. This hold's own widget payment, authorised; the engine refuses the stay. */
    public function test_the_holds_own_authorised_payment_is_cancelled_as_before(): void
    {
        $hold = $this->hold();
        $this->roomTaken();
        $this->intents['pi_own'] = $this->intent('pi_own', 'requires_capture', $this->widgetMeta($hold->hold_token));

        $res = $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_own']);

        $res->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);
        $this->assertSame([['retrieve', 'pi_own'], ['retrieve', 'pi_own'], ['cancel', 'pi_own']], $this->calls);
        $this->assertOutcome('pi_cancelled', 'pi_own', "Confirm failed — PI pi_own cancelled to release held funds", [
            'payment_intent_id' => 'pi_own',
            'original_error'    => self::ROOM_TAKEN,
            'original_class'    => \RuntimeException::class,
            'confirm_context'   => ['stage' => 'service_runtime', 'message' => self::ROOM_TAKEN],
            'pre_cancel_status' => 'requires_capture',
        ], 'warning');
    }

    /** 10. The same, already captured: refunded in full. */
    public function test_the_holds_own_captured_payment_is_refunded_as_before(): void
    {
        $hold = $this->hold();
        $this->roomTaken();
        $this->intents['pi_own'] = $this->intent('pi_own', 'succeeded', $this->widgetMeta($hold->hold_token));

        $res = $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_own']);

        $res->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);
        $this->assertSame([['retrieve', 'pi_own'], ['retrieve', 'pi_own'], ['refund', 'pi_own', null, 'requested_by_customer']], $this->calls);
        $this->assertOutcome('pi_refunded', 'pi_own', "Confirm failed — PI pi_own refunded (already captured)", [
            'payment_intent_id' => 'pi_own',
            'original_error'    => self::ROOM_TAKEN,
            'original_class'    => \RuntimeException::class,
            'confirm_context'   => ['stage' => 'service_runtime', 'message' => self::ROOM_TAKEN],
            'refund_id'         => 're_rescue_1',
            'amount'            => 200,
        ], 'warning');
    }

    /** The PMS is down (the engine answers 503, the `service_http` call site): this hold's own payment is cancelled as before. */
    public function test_the_holds_own_payment_is_cancelled_as_before_when_the_pms_is_down(): void
    {
        // A transport failure (not the engine's own RuntimeException): the engine turns it into a 503.
        $this->smoobu->shouldReceive('getDailyRates')->andThrow(new \Exception('cURL error 28: Operation timed out'));
        $this->smoobu->shouldReceive('getRates')->andThrow(new \Exception('cURL error 28: Operation timed out'));
        $hold = $this->hold();
        $own = $this->ownIntent($hold);

        $res = $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => $own]);

        $res->assertStatus(503)->assertExactJson(['error' => 'PMS is temporarily unavailable. Please try again in a moment.', 'code' => 'pms_unavailable']);
        $this->assertSame([['retrieve', $own], ['retrieve', $own], ['cancel', $own]], $this->calls);
        $this->assertOutcome('pi_cancelled', $own, "Confirm failed — PI {$own} cancelled to release held funds", [
            'payment_intent_id' => $own,
            'original_error'    => 'PMS is temporarily unavailable. Please try again in a moment.',
            'original_class'    => HttpException::class,
            'confirm_context'   => ['stage' => 'service_http', 'status' => 503],
            'pre_cancel_status' => 'requires_capture',
        ], 'warning');
    }

    /** 12. No id in the request, the hold's own cached id, unreadable: the blind cancel still happens. */
    public function test_the_holds_cached_id_is_still_cancelled_blind_when_unreadable(): void
    {
        $hold = $this->hold(['stripe_payment_intent_id' => 'pi_hold_own']);
        $this->roomTaken();
        $this->intents['pi_hold_own'] = new ApiConnectionException('Could not connect to Stripe.');
        $body = ['hold_token' => $hold->hold_token, 'guest' => $this->guest()];

        $blind = $this->confirm($body);

        $blind->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);
        $this->assertSame([['retrieve', 'pi_hold_own'], ['cancel', 'pi_hold_own']], $this->calls);
        $this->assertOutcome('pi_cancelled', 'pi_hold_own', "Confirm failed — PI pi_hold_own cancelled to release held funds", [
            'payment_intent_id' => 'pi_hold_own',
            'original_error'    => self::ROOM_TAKEN,
            'original_class'    => \RuntimeException::class,
            'confirm_context'   => ['stage' => 'service_runtime', 'message' => self::ROOM_TAKEN],
            'note'              => 'cancel issued without status check (retrieve failed)',
        ], 'warning');

        // The same request with a cached id that does not exist at Stripe: the same answer.
        $payload = $hold->fresh()->payload_json;
        $payload['stripe_payment_intent_id'] = 'pi_hold_missing';
        $hold->fresh()->update(['payload_json' => $payload]);
        $this->cancelFails['pi_hold_missing'] = new InvalidRequestException("No such payment_intent: 'pi_hold_missing'");

        $missing = $this->confirm($body);
        $this->assertSame([['retrieve', 'pi_hold_missing'], ['cancel', 'pi_hold_missing']], $this->calls);
        $this->assertCount(1, $this->rescueRows('pi_rescue_failed', 'pi_hold_missing'));
        $this->assertSameAnswer($missing, $blind);
    }

    /** 13. A mock intent never touched Stripe: nothing to give back. (Mock intents exist only in test mode.) */
    public function test_a_mock_intent_is_left_alone_as_before(): void
    {
        $this->testMode();
        $hold = $this->hold();
        $this->roomTaken();

        $res = $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_mock_abc123']);

        $res->assertStatus(400)->assertExactJson(['error' => self::ROOM_TAKEN]);
        $this->assertSame([], $this->calls);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'like', 'booking.confirm.pi_%')->count());
    }

    /** 13b. A `pi_mock_…` id counts only while the venue's test mode is on; with it off it is a made-up payment (2026-10-07). */
    public function test_a_mock_intent_with_test_mode_off_is_refused_and_nothing_is_booked(): void
    {
        $hold = $this->hold();

        $res = $this->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_mock_forged']);

        $res->assertStatus(400)->assertExactJson(['error' => 'Payment has not been completed.']);
        $this->assertSame([], $this->calls);
        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->count());
    }

    /** The venue's booking test mode switched on (the setting the full admin writes). */
    private function testMode(): void
    {
        $row = new \App\Models\HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'booking_mock_mode';
        $row->value = 'true';
        $row->group = 'booking';
        $row->save();
        \App\Models\HotelSetting::flushCacheFor($this->org->id);
    }

    // ─── Order of work, and the checks themselves failing ────────────

    /**
     * A refusal takes no lock and opens no transaction. An action opens one,
     * reads (on Postgres: locks) the request's hold, re-reads "carried",
     * then calls Stripe; the audit row is written after the commit.
     */
    public function test_refusals_take_no_lock_and_an_action_locks_before_it_decides(): void
    {
        $this->app['events']->listen(TransactionBeginning::class, fn () => $this->trace[] = 'begin');
        $this->app['events']->listen(TransactionCommitted::class, fn () => $this->trace[] = 'commit');
        $this->app['events']->listen(TransactionRolledBack::class, fn () => $this->trace[] = 'rollback');
        DB::listen(fn ($q) => $this->trace[] = 'sql:' . $q->sql);

        $hold = $this->hold();
        $this->intents['pi_bare'] = $this->intent('pi_bare');
        $body = ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada']];

        $this->trace = [];
        $this->confirm($body + ['payment_intent_id' => 'pi_bare']);
        $this->assertRefused('pi_bare', 'not_widget_payment', 'validation');
        $this->assertNotContains('begin', $this->trace, 'a refusal opens no transaction');

        $own = $this->ownIntent($hold);
        $this->trace = [];
        $this->confirm($body + ['payment_intent_id' => $own]);
        $t = $this->trace;

        $begin = array_search('begin', $t, true);
        $this->assertNotFalse($begin, 'the action runs in a transaction');
        $after = fn (int $from, callable $match) => collect($t)->slice($from + 1)->search(fn ($e) => $match($e));
        $holdRead = $after($begin, fn ($e) => str_starts_with($e, 'sql:') && str_contains($e, 'booking_holds') && str_contains($e, 'hold_token'));
        $this->assertNotFalse($holdRead, 'the hold row is read inside the transaction');
        $carried = $after($holdRead, fn ($e) => str_starts_with($e, 'sql:') && str_contains($e, 'service_bookings'));
        $this->assertNotFalse($carried, '"carried" is read again after the hold');
        $cancel = array_search('stripe:cancel', $t, true);
        $this->assertGreaterThan($carried, $cancel, 'Stripe is called after the re-read');
        $commit = $after($cancel, fn ($e) => $e === 'commit');
        $this->assertNotFalse($commit, 'then the transaction commits');
        $this->assertNotFalse($after($commit, fn ($e) => str_starts_with($e, 'sql:insert into "audit_logs"')), 'the audit row is written after the commit');
        $this->assertFalse(collect($t)->slice($begin, $commit - $begin)->contains(fn ($e) => str_starts_with($e, 'sql:insert into "audit_logs"')), 'and not inside it');
        $this->assertCount(1, $this->rescueRows('pi_cancelled', $own));
    }

    /** 14. The carried lookup throws (the database is gone): nothing is given back, nothing escapes, one error line. */
    public function test_when_the_checks_cannot_run_the_payment_is_left_alone(): void
    {
        $hold = $this->hold();
        $own = $this->ownIntent($hold);
        $body = ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => $own];
        $missing = $this->confirm(['payment_intent_id' => 'pi_does_not_exist'] + $body);

        Schema::drop('service_bookings');
        $res = $this->confirm($body);

        $this->assertSame([], $this->calls, 'Stripe is not asked, nothing is cancelled');
        $this->assertSameAnswer($missing, $res);
        $res->assertStatus(422);
        foreach (['pi_cancelled', 'pi_refunded', 'pi_rescue_failed', 'pi_rescue_refused'] as $action) {
            $this->assertSame([], $this->rescueRows($action, $own));
        }
        Log::shouldHaveReceived('error')->once();
        Log::shouldHaveReceived('error')->withArgs(fn ($message, $context = []) => $message === 'Booking confirm PI rescue: pi_rescue_checks_failed'
            && ($context['payment_intent_id'] ?? null) === $own
            && ($context['confirm_context']['stage'] ?? null) === 'validation'
            && ($context['payment_left_alone'] ?? null) === true
            && str_contains((string) ($context['error'] ?? ''), 'service_bookings'))->once();
    }

    /** With no organisation bound (no widget token), a booking of any organisation carries the payment. */
    public function test_without_an_organisation_a_booking_of_any_organisation_counts(): void
    {
        $this->carryingMirror('pi_portal_stay', ['member_id' => 41, 'channel_name' => 'Member portal']);
        $this->intents['pi_portal_stay'] = $this->intent('pi_portal_stay');
        $this->calls = [];
        app()->forgetInstance('current_organization_id');

        $this->postJson(self::URL, ['hold_token' => 'no-such-hold', 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => 'pi_portal_stay'])->assertStatus(422);

        $this->assertFalse(app()->bound('current_organization_id'));
        $this->assertSame([], $this->calls);
        $rows = $this->rescueRows('pi_rescue_refused', 'pi_portal_stay');
        $this->assertCount(1, $rows);
        $this->assertNull($rows[0]->organization_id);
        $this->assertSame('carried_by_booking', $rows[0]->new_values['reason']);
    }

    /** The same audit row and the same log line as the rescue has always written. */
    private function assertOutcome(string $action, string $piId, string $description, array $newValues, string $level): void
    {
        $rows = $this->rescueRows($action, $piId);
        $this->assertCount(1, $rows);
        $this->assertSame($this->org->id, (int) $rows[0]->organization_id);
        $this->assertSame('stripe_payment', $rows[0]->subject_type);
        $this->assertNull($rows[0]->subject_id);
        $this->assertSame($description, $rows[0]->description);
        $this->assertEquals($newValues, $rows[0]->new_values);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'like', 'booking.confirm.pi_%')->count(), 'no other rescue row');

        Log::shouldHaveReceived($level)->withArgs(fn ($message, $context = []) => $message === "Booking confirm PI rescue: {$action}" && $context == $newValues)->once();
        Log::shouldNotHaveReceived('error');
    }
}
