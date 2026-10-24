<?php

namespace Tests\Feature\Member\Portal;

use App\Http\Controllers\Api\V1\Member\Portal\PortalServiceBookingController;
use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Services\Booking\PayAtVenueFallback;
use App\Services\Portal\AppointmentClock;
use App\Services\StripeService;
use App\Support\SharedCache;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 4, part C — appointments: one hold per card (a second
 * `payment-intent` call for the same slot reuses or releases the first
 * intent) and paying at the venue when Stripe cannot be reached
 * (PayAtVenueFallback). Stripe is a Mockery mock; no network call is made.
 */
class PortalServicePaymentsTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SeedsDiscountFixture;

    private const INTENT = '/api/v1/member/portal/services/payment-intent';
    private const CONFIRM = '/api/v1/member/portal/services/confirm';

    private Organization $org;
    private string $token;
    private Service $service;
    private ServiceMaster $master;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->setUpBookingRefundSchema(); // audit_logs
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
    }

    private function setting(string $key, string $value): void
    {
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first() ?? new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        // NOT NULL in production: the type the settings registry gives such a value (BookingRules::write()).
        $row->type ??= match (true) { in_array($value, ['true', 'false'], true) => 'boolean', ctype_digit($value) => 'integer', default => 'string' };
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function body(array $extra = []): array
    {
        return array_merge(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1], $extra);
    }

    private function stripe(): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    /** Records each intent the controller asks for (amount and metadata) and answers pi_1, pi_2, … */
    private function minting(Mockery\MockInterface $stripe, array &$made): void
    {
        $stripe->shouldReceive('createPaymentIntent')->andReturnUsing(function (float $amount, string $desc, array $meta) use (&$made) {
            $id = 'pi_' . (count($made) + 1);
            $made[$id] = ['amount' => $amount, 'meta' => $meta];

            return ['client_secret' => "{$id}_secret", 'payment_intent_id' => $id];
        });
    }

    /** The intent Stripe answers for $id: what was made, in $status, with any overrides. */
    private function made(array $made, string $id, string $status = 'requires_payment_method', array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge([
            'id' => $id, 'status' => $status, 'amount' => (int) round($made[$id]['amount'] * 100), 'currency' => 'eur', 'client_secret' => "{$id}_secret",
        ], $top, ['metadata' => array_map('strval', array_merge($made[$id]['meta'], $meta))]));
    }

    /** The payment-intent call as the Pay step makes it: with the visit's Idempotency-Key (null: an older client, none). */
    private function intent(array $body, ?string $key = 'idem-key-0002')
    {
        $this->flushHeaders();
        $req = $this->withToken($this->token);

        return ($key !== null ? $req->withHeader('Idempotency-Key', $key) : $req)->postJson(self::INTENT, $body);
    }

    /** Stripe not answering at all — the one kind of failure the pay-at-venue fallback is for. */
    private function outage(): \Stripe\Exception\ApiConnectionException
    {
        return \Stripe\Exception\ApiConnectionException::factory('Could not connect to Stripe');
    }

    private function target(string $key, ?string $start = null): string
    {
        return PayAtVenueFallback::serviceTarget($this->service->id, AppointmentClock::fromClient($start ?? $this->body()['start_at']), $key);
    }

    private function confirm(array $body, string $key = 'idem-key-0001')
    {
        $this->flushHeaders();

        return $this->withToken($this->token)->withHeader('Idempotency-Key', $key)->postJson(self::CONFIRM, $body);
    }

    private function claim(float $value): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => 'fixed_amount', 'value' => $value, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true]);

        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }

    private function slotKey(): string
    {
        return PortalServiceBookingController::slotIntentKey($this->org->id, $this->member->id, $this->service->id, AppointmentClock::fromClient($this->body()['start_at']));
    }

    // ─── One hold per card ──────────────────────────────────────────────────

    public function test_a_second_call_for_the_same_slot_hands_back_the_intent_that_can_still_be_paid(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('reused', false);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(fn () => $this->made($made, 'pi_1'));
        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('client_secret', 'pi_1_secret')->assertJsonPath('reused', true);

        $this->assertCount(1, $made, 'one intent for one slot');
    }

    public function test_a_changed_booking_or_a_card_already_held_releases_the_earlier_intent_first(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1');

        // The member picked a coupon: another amount, another booking — pi_1 released, pi_2 made.
        $claim = $this->claim(20);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(fn () => $this->made($made, 'pi_1'));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'abandoned');
        $this->intent($this->body(['coupon' => ['member_offer_id' => $claim->id]]))->assertOk()->assertJsonPath('payment_intent_id', 'pi_2')->assertJsonPath('amount', 40);
        $this->assertSame('offer:' . $claim->id, $made['pi_2']['meta']['coupon']);

        // The card for pi_2 was authorised but the page was reloaded: pi_2 released, pi_3 made.
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_2')->andReturnUsing(fn () => $this->made($made, 'pi_2', 'requires_capture'));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_2', 'abandoned');
        $this->intent($this->body(['coupon' => ['member_offer_id' => $claim->id]]))->assertOk()->assertJsonPath('payment_intent_id', 'pi_3');

        // Another person at the same time: the same amount but another booking — pi_3 released.
        $other = ServiceMaster::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'name' => 'Ilse', 'is_active' => true]);
        \Illuminate\Support\Facades\DB::table('service_master_service')->insert(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $other->id, 'created_at' => now(), 'updated_at' => now()]);
        foreach (range(0, 6) as $d) {
            \Illuminate\Support\Facades\DB::table('service_master_schedules')->insert(['organization_id' => $this->org->id, 'service_master_id' => $other->id, 'day_of_week' => $d, 'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_3')->andReturnUsing(fn () => $this->made($made, 'pi_3'));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_3', 'abandoned');
        $this->intent($this->body(['master_id' => $other->id, 'coupon' => ['member_offer_id' => $claim->id]]))->assertOk()->assertJsonPath('payment_intent_id', 'pi_4');
        $this->assertSame((string) $other->id, $made['pi_4']['meta']['master_id']);
    }

    public function test_an_intent_a_booking_carries_or_another_members_is_never_touched(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        // The slot's last intent pays for a booking already (a booking at another time of the same member).
        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(14, 0), 'end_at' => now()->setTime(14, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_carried']);
        SharedCache::store()->put($this->slotKey(), 'pi_carried', now()->addHour());
        $stripe->shouldNotReceive('retrievePaymentIntent')->with('pi_carried');
        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1');

        // Another member's intent under this key: read, never cancelled, never handed out.
        SharedCache::store()->put($this->slotKey(), 'pi_stranger', now()->addHour());
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stranger')->andReturn(PaymentIntent::constructFrom([
            'id' => 'pi_stranger', 'status' => 'requires_payment_method', 'amount' => 6000, 'currency' => 'eur', 'client_secret' => 'pi_stranger_secret',
            'metadata' => array_map('strval', array_merge($made['pi_1']['meta'], ['member_id' => '999999'])),
        ]));
        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_2')->assertJsonPath('reused', false);
    }

    public function test_an_earlier_intent_stripe_cannot_read_stops_a_second_one_being_made(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $this->intent($this->body())->assertOk();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andThrow($this->outage());
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->intent($this->body())->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
        $this->assertCount(1, $made);
    }

    public function test_the_metadata_names_everything_the_return_needs_and_never_the_widgets_key(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $claim = $this->claim(5);

        $this->intent($this->body(['party_size' => 2, 'coupon' => ['member_offer_id' => $claim->id]]))->assertOk();
        $meta = $made['pi_1']['meta'];
        $this->assertSame(['portal_service_booking', $this->org->id, $this->member->id, $this->service->id], [$meta['kind'], $meta['org_id'], $meta['member_id'], $meta['service_id']]);
        $this->assertSame([(string) $this->master->id, '2', '[]', 'offer:' . $claim->id], [$meta['master_id'], $meta['party_size'], $meta['extras'], $meta['coupon']]);
        $this->assertArrayNotHasKey('hold_token', $meta);
    }

    // ─── Paying at the venue when Stripe cannot be reached ──────────────────

    public function test_stripe_down_with_the_setting_off_answers_503_as_before(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));

        $this->intent($this->body())->assertStatus(503)->assertJsonPath('error', 'payment_unavailable')->assertJsonMissingPath('pay_at_venue_grant');
        $this->confirm($this->body())->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_stripe_down_with_the_setting_on_books_the_appointment_to_pay_at_the_venue(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow($this->outage());

        $grant = $this->intent($this->body())->assertStatus(409)->assertJsonPath('error', 'pay_at_venue')->assertJsonPath('reason', 'payment_unavailable')->json('pay_at_venue_grant');
        $this->assertIsString($grant);

        $this->confirm($this->body())->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $res = $this->confirm($this->body(['pay_at_venue_grant' => $grant]), 'idem-key-0002')->assertStatus(201)
            ->assertJsonPath('booking.payment_status', 'unpaid')->assertJsonPath('booking.paid_online', false);
        $b = ServiceBooking::withoutGlobalScopes()->sole();
        $this->assertNull($b->stripe_payment_intent_id);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'portal.pay_at_venue_fallback')->where('subject_type', 'service_booking')->where('subject_id', $b->id)->count());

        // The grant is not part of the booking: the same key replays the booking with or without it.
        $this->confirm($this->body(), 'idem-key-0002')->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $res->json('booking.id'));
        $this->assertArrayNotHasKey('pay_at_venue_grant', \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'success')->sole()->request_payload);
    }

    public function test_a_grant_works_only_for_its_own_slot_and_while_the_setting_is_on(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $this->stripe();

        $grant = fn (string $key) => PayAtVenueFallback::grant('service', $this->org->id, $this->member->id, $this->target($key));
        $this->confirm($this->body(['start_at' => now()->setTime(11, 0)->toIso8601String(), 'pay_at_venue_grant' => $grant('idem-key-0003')]), 'idem-key-0003')->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $stay = PayAtVenueFallback::grant('stay', $this->org->id, $this->member->id, $this->target('idem-key-0004'));
        $this->confirm($this->body(['pay_at_venue_grant' => $stay]), 'idem-key-0004')->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $this->setting(PayAtVenueFallback::SETTING, 'false');
        $this->confirm($this->body(['pay_at_venue_grant' => $grant('idem-key-0005')]), 'idem-key-0005')->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $late = $grant('idem-key-0006');
        $this->travel(31)->minutes();
        $this->confirm($this->body(['pay_at_venue_grant' => $late]), 'idem-key-0006')->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_venue_without_online_payment_needs_no_grant(): void
    {
        // Stripe off: the ordinary at-venue booking, exactly as before.
        $this->confirm($this->body())->assertStatus(201)->assertJsonPath('booking.payment_status', 'unpaid');
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'portal.pay_at_venue_fallback')->count());
    }

    public function test_with_the_setting_on_and_stripe_answering_the_card_is_still_required(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);

        $this->intent($this->body())->assertOk()->assertJsonMissingPath('pay_at_venue_grant');
        $this->confirm($this->body())->assertStatus(422)->assertJsonPath('error', 'payment_required');
    }

    /** A discount does not change any of this; kept apart so a failure says which rule broke. */
    public function test_the_reused_intent_charges_the_discounted_total(): void
    {
        $def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off', 'code' => 'ten', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);

        $this->intent($this->body())->assertOk()->assertJsonPath('amount', 54);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(fn () => $this->made($made, 'pi_1'));
        $this->intent($this->body())->assertOk()->assertJsonPath('reused', true)->assertJsonPath('amount', 54);
    }

    // ─── Review fixes ───────────────────────────────────────────────────────

    /** Finding 5: a grant is for the one booking the Pay visit's Idempotency-Key makes. */
    public function test_a_grant_books_one_appointment_only_under_its_own_key(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow($this->outage());
        $grant = $this->intent($this->body(), 'visit-key-0001')->assertStatus(409)->json('pay_at_venue_grant');

        // Another key — another booking — is not covered.
        $this->confirm($this->body(['pay_at_venue_grant' => $grant]), 'other-key-0002')->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $id = $this->confirm($this->body(['pay_at_venue_grant' => $grant]), 'visit-key-0001')->assertStatus(201)->json('booking.id');
        // The same key replays the booking it made; a second unpaid booking at another time is refused.
        $this->confirm($this->body(['pay_at_venue_grant' => $grant]), 'visit-key-0001')->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $id);
        $this->confirm($this->body(['start_at' => now()->setTime(12, 0)->toIso8601String(), 'pay_at_venue_grant' => $grant]), 'other-key-0003')->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    /** Finding 5: a client that sends no key (an older bundle) is offered no grant — the 503, as before. */
    public function test_a_payment_intent_call_without_a_key_is_offered_no_grant(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow($this->outage());

        $this->intent($this->body(), null)->assertStatus(503)->assertJsonPath('error', 'payment_unavailable')->assertJsonMissingPath('pay_at_venue_grant');
    }

    /** Finding 4: a revoked key or an amount Stripe refuses is not "unavailable". */
    public function test_only_an_unreachable_or_overloaded_stripe_offers_the_venue(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        foreach ([
            [\Stripe\Exception\AuthenticationException::factory('Invalid API Key provided', 401), 503],
            [\Stripe\Exception\InvalidRequestException::factory('Amount must be at least €0.50', 400), 503],
            [\Stripe\Exception\RateLimitException::factory('Too many requests', 429), 409],
            [\Stripe\Exception\UnknownApiErrorException::factory('Internal error', 502), 409],
        ] as $i => [$error, $status]) {
            $stripe = $this->stripe();
            $stripe->shouldReceive('createPaymentIntent')->andThrow($error);
            $res = $this->intent($this->body(['start_at' => now()->setTime(10 + $i, 0)->toIso8601String()]));
            $this->assertSame($status, $res->status(), get_class($error));
            $this->assertSame($status === 409, is_string($res->json('pay_at_venue_grant')), get_class($error));
        }
    }

    /** Finding 2: an earlier intent Stripe will not cancel has an unknown fate — nothing is minted beside it. */
    public function test_an_earlier_intent_that_cannot_be_released_stops_a_second_one_being_made(): void
    {
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $this->intent($this->body())->assertOk();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(fn () => $this->made($made, 'pi_1', 'requires_capture'));
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_1', 'abandoned')->andThrow(\Stripe\Exception\InvalidRequestException::factory('This PaymentIntent cannot be canceled', 400));

        $this->intent($this->body())->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
        $this->assertCount(1, $made);
        $this->assertSame('pi_1', SharedCache::store()->get($this->slotKey()));
    }

    /** Finding 3: the slot's record lives in the shared cache every container sees, not the per-container default. */
    public function test_the_slot_record_lives_in_the_shared_cache(): void
    {
        config(['cache.stores.portal_shared_test' => ['driver' => 'array'], 'cache.shared' => 'portal_shared_test']);
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);

        $this->intent($this->body())->assertOk();
        $this->assertSame('pi_1', Cache::store('portal_shared_test')->get($this->slotKey()));
        $this->assertNull(Cache::get($this->slotKey()), 'never the default (per-container) store');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(fn () => $this->made($made, 'pi_1'));
        $this->intent($this->body())->assertOk()->assertJsonPath('reused', true);
    }

    /** Finding 6: an appointment booked to pay at the venue releases the intent its slot recorded, and forgets it. */
    public function test_a_pay_at_venue_appointment_releases_the_intent_its_slot_recorded(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $made = [];
        $this->minting($stripe, $made);
        $this->intent($this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1');

        $calls = 0;
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturnUsing(function () use (&$calls, $made) {
            if (++$calls === 1) {
                throw $this->outage();
            }

            return $this->made($made, 'pi_1');
        });
        $grant = $this->intent($this->body())->assertStatus(409)->json('pay_at_venue_grant');

        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'abandoned');
        $this->confirm($this->body(['pay_at_venue_grant' => $grant]), 'idem-key-0002')->assertStatus(201)->assertJsonPath('booking.payment_status', 'unpaid');
        $this->assertNull(SharedCache::store()->get($this->slotKey()));
        $this->assertCount(1, $made);
    }

    /** Finding 6: an intent a booking carries is never released after an at-venue booking. */
    public function test_a_pay_at_venue_appointment_never_releases_an_intent_a_booking_carries(): void
    {
        // Stripe off: the venue's ordinary at-venue booking; the slot still records an intent another booking carries.
        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(14, 0), 'end_at' => now()->setTime(14, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_carried']);
        SharedCache::store()->put($this->slotKey(), 'pi_carried', now()->addHour());
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(false);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('publishableKey')->andReturn('');
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->app->instance(StripeService::class, $stripe);

        $this->confirm($this->body())->assertStatus(201)->assertJsonPath('booking.payment_status', 'unpaid');
    }
}
