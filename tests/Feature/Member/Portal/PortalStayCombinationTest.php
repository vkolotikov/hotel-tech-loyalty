<?php

namespace Tests\Feature\Member\Portal;

use App\Mail\BookingConfirmationMail;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\MemberOffer;
use App\Services\Booking\StayCombination;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 4, part D: a party larger than one room books two or three rooms
 * in one go — one hold, one payment, one booking kept as one mirror row per
 * room (StayCombination), written by BookingEngineService::confirmCombo()
 * through the portal's hooks with every room locked and re-checked.
 *
 * The fixture's hotel has two rooms that sleep two each: 101 "Sea view"
 * (200.00 for the two nights) and 102 "Garden" (160.00). A party of four
 * fits neither alone. Smoobu is a mock that answers from $this->live, which
 * a test changes to make a room go between the quote and the confirm.
 */
class PortalStayCombinationTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const AVAILABILITY = '/api/v1/member/portal/stays/availability';
    private const QUOTE = '/api/v1/member/portal/stays/quote';
    private const INTENT = '/api/v1/member/portal/stays/payment-intent';
    private const CONFIRM = '/api/v1/member/portal/stays/confirm';

    /** What Smoobu says each room costs for the stay; null = Smoobu says it is taken. */
    private array $live = ['101' => 200.0, '102' => 160.0];

    /** The reservations Smoobu was asked to create, in order. */
    private array $reservations = [];

    private int $nextReservation = 700001;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden', 'max_guests' => 2, 'base_price' => 80, 'sort_order' => 1]);
        app()->forgetInstance('current_organization_id');

        $this->smoobu->shouldReceive('getDailyRates')->byDefault()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->byDefault()->andReturnUsing(function ($in, $out, array $ids) {
            $data = [];
            foreach ($ids as $id) {
                $id = (string) $id;
                if (!array_key_exists($id, $this->live)) {
                    continue;
                }
                $price = $this->live[$id];
                $data[$id] = $price === null
                    ? ['available' => false, 'price' => 0]
                    : ['available' => true, 'price' => $price, 'price_per_night' => round($price / 2, 2), 'min_stay' => 1, 'currency' => 'EUR'];
            }

            return ['data' => $data];
        });
        $this->smoobu->shouldReceive('checkAvailability')->byDefault()->andReturn(['available' => [], 'prices' => []]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->byDefault()->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturnUsing(function (array $p) {
            $this->reservations[] = $p;
            $id = $this->nextReservation++;

            return ['id' => $id, 'reference-id' => 'BK-' . $id];
        });
    }

    /** A request as $token's member: headers and the guard's cached user reset first. */
    private function as(?string $token = null)
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token ?? $this->token);
    }

    private function body(array $extra = []): array
    {
        return array_merge(['unit_ids' => ['101', '102'], 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 4, 'children' => 0], $extra);
    }

    private function quote(array $extra = [], ?string $token = null)
    {
        return $this->as($token)->postJson(self::QUOTE, $this->body($extra));
    }

    private function confirm(string $hold, array $extra = [], ?string $token = null)
    {
        return $this->as($token)->postJson(self::CONFIRM, array_merge(['hold_token' => $hold], $extra));
    }

    private function intentFor(string $hold, array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge(['id' => 'pi_combo', 'status' => 'requires_capture', 'amount' => 36000, 'currency' => 'eur'], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'portal_hold_token' => $hold], $meta),
        ]));
    }

    private function mirrors()
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->orderBy('id');
    }

    private function holdOf(string $token): BookingHold
    {
        return BookingHold::withoutGlobalScopes()->where('hold_token', $token)->sole();
    }

    private function occupy(string $unit): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . $unit, 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => $unit, 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 100,
        ]);
    }

    // ─── Availability ─────────────────────────────────────────────────────

    public function test_availability_offers_rooms_together_when_no_single_room_sleeps_the_party(): void
    {
        $this->tenPercentOnStays();
        $json = $this->as()->getJson(self::AVAILABILITY . "?check_in={$this->checkIn}&check_out={$this->checkOut}&adults=4&children=0")->assertOk()->json();

        $this->assertSame([], $json['rooms']);
        $this->assertTrue($json['party_too_large']);
        $this->assertCount(1, $json['combinations']);
        $combo = $json['combinations'][0];
        $ids = array_column($combo['rooms'], 'id');
        sort($ids);
        $this->assertSame(['101', '102'], $ids);
        $this->assertEquals(360.0, $combo['total_price']);
        $this->assertEquals(324.0, $combo['member_total'], 'the member price, on the combined total');
        $this->assertSame(4, $combo['sleeps']);
        $this->assertSame('EUR', $combo['currency']);
    }

    public function test_availability_offers_no_combination_that_cannot_put_an_adult_in_every_room(): void
    {
        $json = $this->as()->getJson(self::AVAILABILITY . "?check_in={$this->checkIn}&check_out={$this->checkOut}&adults=1&children=3")->assertOk()->json();

        $this->assertSame([], $json['rooms']);
        $this->assertSame([], $json['combinations']);
    }

    public function test_a_party_one_room_sleeps_is_offered_rooms_not_combinations(): void
    {
        $json = $this->as()->getJson(self::AVAILABILITY . "?check_in={$this->checkIn}&check_out={$this->checkOut}&adults=2&children=0")->assertOk()->json();

        $this->assertCount(2, $json['rooms']);
        $this->assertFalse($json['party_too_large']);
        $this->assertSame([], $json['combinations']);
    }

    // ─── Quote ────────────────────────────────────────────────────────────

    public function test_a_combination_quote_prices_the_rooms_together_for_the_member_and_shares_out_the_party(): void
    {
        $this->tenPercentOnStays();

        $res = $this->quote()->assertOk();

        $res->assertJsonPath('room.name', 'Sea view + Garden')->assertJsonPath('nights', 2)->assertJsonPath('adults', 4)
            ->assertJsonPath('rooms.0.id', '101')->assertJsonPath('rooms.0.name', 'Sea view')->assertJsonPath('rooms.0.room_total', 200)
            ->assertJsonPath('rooms.0.adults', 2)->assertJsonPath('rooms.0.children', 0)
            ->assertJsonPath('rooms.1.id', '102')->assertJsonPath('rooms.1.room_total', 160)->assertJsonPath('rooms.1.adults', 2)
            ->assertJsonPath('lines.room_total', 360)->assertJsonPath('list_amount', 360)
            ->assertJsonPath('discount.amount', 36)->assertJsonPath('total_amount', 324);

        $payload = $this->holdOf($res->json('hold_token'))->payload_json;
        $this->assertTrue($payload['is_combo']);
        $this->assertSame($this->member->id, (int) $payload['member_id']);
        $this->assertEquals(324.0, $payload['gross_total'], 'what the one payment charges');
        $this->assertSame('Member portal', $payload['channel_name']);
        $this->assertSame('Sea view + Garden', $payload['unit_name']);
        $this->assertSame([2, 2], array_column($payload['rooms'], 'adults'));
        $this->assertArrayNotHasKey('stripe_payment_intent_id', $payload);
    }

    public function test_a_combination_quote_refuses_what_it_cannot_sell_and_holds_nothing(): void
    {
        $this->quote(['unit_ids' => ['101']])->assertStatus(422);
        $this->quote(['unit_ids' => ['101', '102', '101', '102']])->assertStatus(422);
        $this->quote(['unit_id' => '101'])->assertStatus(422);
        $this->quote(['unit_ids' => ['101', ['nested']]])->assertStatus(422);
        $this->quote(['unit_ids' => ['101', '999']])->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->quote(['adults' => 5])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->quote(['adults' => 1, 'children' => 2])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->quote(['unit_ids' => ['101', '101'], 'adults' => 3])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');

        $this->occupy('102');
        $this->quote()->assertStatus(409)->assertJsonPath('error', 'room_unavailable');

        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count(), 'a refused combination holds nothing');
    }

    public function test_another_organisations_room_is_not_found(): void
    {
        $other = $this->tenant('Hill Hotel');
        app()->instance('current_organization_id', $other->id);
        $this->seedRoom($other->id, ['pms_id' => '201', 'name' => 'Hill room']);
        app()->forgetInstance('current_organization_id');

        $this->quote(['unit_ids' => ['101', '201']])->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());
    }

    // ─── Payment intent ───────────────────────────────────────────────────

    public function test_one_payment_intent_charges_the_whole_combination_with_the_portals_own_marks(): void
    {
        $this->tenPercentOnStays();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $meta) use ($hold) {
            return $amount === 324.0 && str_contains($desc, 'Sea view + Garden')
                && $meta['kind'] === 'portal_stay_booking' && $meta['org_id'] === $this->org->id && $meta['member_id'] === $this->member->id
                && $meta['portal_hold_token'] === $hold && !array_key_exists('hold_token', $meta);
        })->andReturn(['client_secret' => 'pi_combo_secret', 'payment_intent_id' => 'pi_combo']);

        $this->as()->postJson(self::INTENT, ['hold_token' => $hold])
            ->assertOk()->assertJsonPath('payment_intent_id', 'pi_combo')->assertJsonPath('amount', 324);
    }

    // ─── Confirm ──────────────────────────────────────────────────────────

    public function test_two_rooms_book_as_one_booking_at_the_member_price(): void
    {
        $this->tenPercentOnStays();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $res = $this->confirm($hold, ['special_requests' => 'Rooms next to each other'])->assertStatus(201);

        $rows = $this->mirrors()->get();
        $this->assertCount(2, $rows);
        [$lead, $second] = [$rows[0], $rows[1]];
        $res->assertJsonPath('replayed', false)->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.id', $lead->id)
            ->assertJsonPath('booking.title', 'Sea view + Garden')->assertJsonPath('booking.total', 324)->assertJsonPath('booking.guests', 4)
            ->assertJsonPath('booking.discount.amount', 36)->assertJsonPath('booking.payment_status', 'open')->assertJsonPath('booking.can_cancel', true)
            ->assertJsonPath('booking.rooms.0.title', 'Sea view')->assertJsonPath('booking.rooms.1.title', 'Garden');

        $this->assertNotNull($lead->booking_group_id);
        $this->assertSame($lead->booking_group_id, $second->booking_group_id);
        foreach ($rows as $m) {
            $this->assertSame($this->member->id, (int) $m->member_id);
            $this->assertSame('Member portal', $m->channel_name);
            $this->assertSame('pay_at_venue', $m->payment_method);
            $this->assertSame('open', (string) $m->payment_status);
            $this->assertSame('confirmed', $m->internal_status);
            $this->assertSame('Rooms next to each other', $m->notice);
        }
        $this->assertSame(['101', '102'], [(string) $lead->apartment_id, (string) $second->apartment_id]);
        $this->assertSame([2, 2], [(int) $lead->adults, (int) $second->adults]);
        // The shares add up to the one price, to the cent; each room's discount is its share.
        $this->assertEquals([180.0, 144.0], [(float) $lead->price_total, (float) $second->price_total]);
        $this->assertEquals([200.0, 160.0], [(float) $lead->list_total, (float) $second->list_total]);
        $this->assertEquals([20.0, 16.0], [(float) $lead->discount_amount, (float) $second->discount_amount]);
        $this->assertSame(['700001', '700002'], [$lead->reservation_id, $second->reservation_id]);

        // The PMS was told each room's own share and party.
        $this->assertCount(2, $this->reservations);
        $this->assertSame([101, 102], array_column($this->reservations, 'apartmentId'));
        $this->assertEquals([180.0, 144.0], array_column($this->reservations, 'price'));
        $this->assertSame([2, 2], array_column($this->reservations, 'adults'));
        $this->assertSame([0, 0], array_column($this->reservations, 'priceStatus'), 'nothing paid online');
        $this->assertSame(7, $this->reservations[0]['channelId']);
        $this->assertEquals(180.0, $this->reservations[0]['priceElements'][0]['amount'], 'the share of the discount comes off the accommodation line');
        $this->assertStringContainsString('Combination ' . $lead->booking_group_id . ' — room 2 of 2', $this->reservations[1]['assistant-notice']);

        $holdRow = $this->holdOf($hold);
        $this->assertSame('consumed', $holdRow->status);
        $this->assertSame($lead->id, (int) $holdRow->payload_json['mirror_id']);
        $this->assertSame(2, BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $lead->id)->count(), 'accommodation and the discount share');
        Mail::assertQueued(BookingConfirmationMail::class, 1);
        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $mail) => $mail->hasTo($this->user->email) && $mail->unitName === 'Sea view + Garden' && $mail->grossTotal === 324.0);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.portal_confirmed')->where('subject_id', $lead->id)->count());
        $this->assertSame(2, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirmed')->count());
    }

    public function test_an_online_combination_carries_its_one_payment_on_every_room_and_replays(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold));

        $first = $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized')->json('booking.id');

        $rows = $this->mirrors()->get();
        $this->assertCount(2, $rows);
        foreach ($rows as $m) {
            $this->assertSame('pi_combo', $m->stripe_payment_intent_id, 'one PaymentIntent pays for the one booking — every room carries it');
            $this->assertSame('stripe', $m->payment_method);
            $this->assertSame('authorized', (string) $m->payment_status);
        }
        $this->assertSame([1, 1], array_column($this->reservations, 'priceStatus'));
        $this->assertEquals([200.0, 160.0], array_column($this->reservations, 'price-paid'));

        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertOk()->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $first);
        $this->assertCount(2, $this->reservations, 'a replay asks the PMS nothing');
        $this->assertSame(2, $this->mirrors()->count());
    }

    /**
     * The existing money paths see a combination as one booking with one
     * payment: the capture job captures the intent once and marks every room
     * paid; the member's cancellation refunds it once and cancels every room.
     */
    public function test_a_booked_combination_is_captured_once_and_then_cancelled_whole_with_one_refund(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $status = 'requires_capture';
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function () use (&$status, $hold) {
            return $this->intentFor($hold, ['status' => $status]);
        });
        $lead = $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(201)->json('booking.id');

        $this->travel(10)->minutes();
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_combo')->andReturnUsing(function () use (&$status) {
            $status = 'succeeded';
            return PaymentIntent::constructFrom(['id' => 'pi_combo', 'status' => 'succeeded']);
        });
        $this->artisan('bookings:capture-pending-pis', ['--org' => $this->org->id])->assertExitCode(0);
        $this->assertSame(['paid', 'paid'], $this->mirrors()->pluck('payment_status')->map(fn ($s) => (string) $s)->all());

        $stripe->shouldReceive('refund')->once()->withArgs(fn (string $pi, ?float $amount = null) => $pi === 'pi_combo' && $amount === null)
            ->andReturn(\Stripe\Refund::constructFrom(['id' => 're_combo', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        $this->as()->postJson("/api/v1/member/portal/bookings/stay/{$lead}/cancel")->assertOk()
            ->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 360.0)->assertJsonPath('booking.status', 'cancelled');
        $this->assertSame(['refunded', 'refunded'], $this->mirrors()->pluck('payment_status')->map(fn ($s) => (string) $s)->all());
        $this->assertSame(2, $this->mirrors()->whereNotNull('cancelled_at')->count());
    }

    public function test_the_payment_of_a_booked_combination_cannot_pay_for_another_hold(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold));
        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(201);

        BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['arrival_date' => now()->addDays(40)->toDateString(), 'departure_date' => now()->addDays(42)->toDateString()]);
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $again = $this->quote()->assertOk()->json('hold_token');

        $this->confirm($again, ['payment_intent_id' => 'pi_combo'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(2, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($again)->status);
    }

    public function test_a_coupon_is_taken_once_for_the_whole_combination_under_the_lead_rooms_reference(): void
    {
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->assertJsonPath('total_amount', 310)->json('hold_token');

        $this->confirm($hold)->assertStatus(201)->assertJsonPath('booking.total', 310)->assertJsonPath('booking.discount.amount', 50);

        $rows = $this->mirrors()->get();
        $this->assertEqualsWithDelta(310.0, $rows->sum(fn ($m) => (float) $m->price_total), 0.001);
        $this->assertEqualsWithDelta(50.0, $rows->sum(fn ($m) => (float) $m->discount_amount), 0.001);
        $used = MemberOffer::findOrFail($claim->id);
        $this->assertNotNull($used->used_at);
        $this->assertSame('BM:' . $rows[0]->id, $used->used_reference);
    }

    public function test_a_room_booked_since_the_quote_writes_nothing_and_releases_the_payment(): void
    {
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $taken = $this->occupy('102');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold, ['amount' => 31000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_combo', 'abandoned');
        $this->smoobu->shouldNotReceive('createReservation');

        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');

        $this->assertSame([$taken->id], $this->mirrors()->pluck('id')->all(), 'no room of the combination was written');
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_a_room_sold_on_another_channel_since_the_quote_is_refused_under_the_lock(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->live['102'] = null;
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_combo', 'abandoned');
        $this->smoobu->shouldNotReceive('createReservation');

        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_the_pms_refusing_the_second_room_cancels_the_first_and_releases_the_payment(): void
    {
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $calls = 0;
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function () use (&$calls) {
            if (++$calls === 2) {
                throw new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available');
            }
            return ['id' => 700001, 'reference-id' => 'BK-700001'];
        });
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('700001')->andReturn([]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold, ['amount' => 31000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_combo', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');

        $this->assertSame(0, $this->mirrors()->count(), 'all or nothing');
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the rollback took the coupon with it');
    }

    public function test_a_write_that_fails_after_the_pms_said_yes_cancels_every_reservation_and_audits_an_orphan(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_combo', 'abandoned');
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('700001')->andReturn([]);
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('700002')->andThrow(new \RuntimeException('Smoobu down'));

        BookingPriceElement::creating(function () {
            throw new \LogicException('disk full');
        });
        try {
            $res = $this->confirm($hold, ['payment_intent_id' => 'pi_combo']);
        } finally {
            BookingPriceElement::flushEventListeners();
        }

        $res->assertStatus(500)->assertJsonPath('error', 'confirm_failed');
        $this->assertSame(0, $this->mirrors()->count());
        $orphan = AuditLog::withoutGlobalScopes()->where('action', 'booking.combo.orphan_smoobu_reservation')->sole();
        $this->assertSame(['700002'], $orphan->new_values['orphan_smoobu_ids']);
    }

    public function test_a_transient_pms_error_on_one_room_keeps_that_room_for_the_retry_job(): void
    {
        $hold = $this->quote()->assertOk()->json('hold_token');
        $calls = 0;
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function () use (&$calls) {
            if (++$calls === 2) {
                throw new \RuntimeException('cURL error 28: Operation timed out');
            }
            return ['id' => 700001, 'reference-id' => 'BK-700001'];
        });

        $this->confirm($hold)->assertStatus(201);

        $rows = $this->mirrors()->get();
        $this->assertSame(['confirmed', 'pending_pms_sync'], $rows->pluck('internal_status')->all());
        $this->assertStringStartsWith('LOCAL-', $rows[1]->reservation_id);
    }

    public function test_a_payment_cancelled_before_the_lock_is_refused_before_the_pms_is_asked(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn($this->intentFor($hold), $this->intentFor($hold, ['status' => 'canceled']));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->smoobu->shouldNotReceive('createReservation');

        $this->confirm($hold, ['payment_intent_id' => 'pi_combo'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_the_widget_cannot_confirm_a_members_combination(): void
    {
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->smoobu->shouldNotReceive('createReservation');

        $this->flushHeaders();
        app()->instance('current_organization_id', $this->org->id);
        try {
            // BookingEngineService::confirm() refuses a hold naming a member when no hooks come with it — before the combination branch.
            $this->postJson('/api/v1/booking/confirm', [
                'hold_token' => $hold,
                'guest' => ['first_name' => 'Eve', 'last_name' => 'Widget', 'email' => 'eve@example.test'],
            ])->assertStatus(400)->assertJsonPath('error', 'Hold expired or not found');
        } finally {
            app()->forgetInstance('current_organization_id');
        }

        $this->assertSame(0, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($hold)->status);
    }

    // ─── Whose ────────────────────────────────────────────────────────────

    public function test_another_member_can_neither_pay_confirm_see_nor_cancel_the_combination(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        ['token' => $stranger] = $this->member($this->org);

        $this->as($stranger)->postJson(self::INTENT, ['hold_token' => $hold])->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->confirm($hold, [], $stranger)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->assertSame(0, $this->mirrors()->count());

        $this->setting('booking_mock_mode', 'true');
        $lead = $this->confirm($hold)->assertStatus(201)->json('booking.id');
        $second = $this->mirrors()->get()[1]->id;
        foreach ([$lead, $second] as $id) {
            $this->as($stranger)->getJson("/api/v1/member/portal/bookings/stay/{$id}")->assertStatus(404);
            $this->as($stranger)->postJson("/api/v1/member/portal/bookings/stay/{$id}/cancel")->assertStatus(404)->assertJsonPath('error', 'not_found');
        }
        $this->assertSame(0, $this->mirrors()->whereNotNull('cancelled_at')->count());
    }

    public function test_another_organisations_member_cannot_reach_the_combination(): void
    {
        $hold = $this->quote()->assertOk()->json('hold_token');
        $other = $this->tenant('Hill Hotel');
        app()->instance('current_organization_id', $other->id);
        $this->seedRoom($other->id, ['pms_id' => '201', 'name' => 'Hill room']);
        app()->forgetInstance('current_organization_id');
        ['token' => $foreign] = $this->member($other);

        $this->confirm($hold, [], $foreign)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');

        $lead = $this->confirm($hold)->assertStatus(201)->json('booking.id');
        $this->as($foreign)->postJson("/api/v1/member/portal/bookings/stay/{$lead}/cancel")->assertStatus(404);
        $this->assertSame(0, $this->mirrors()->whereNotNull('cancelled_at')->count());
    }

    // ─── Order of locks (structural: sqlite never runs an advisory lock) ──

    public function test_the_room_locks_are_each_room_once_in_ascending_order(): void
    {
        $this->assertSame(['room:5:9', 'room:5:101', 'room:5:102'], StayCombination::roomLockKeys(5, ['102', '101', '102', 9]));
        $this->assertSame(StayCombination::roomLockKeys(5, ['101', '102']), StayCombination::roomLockKeys(5, ['102', '101']), 'two confirms sharing rooms lock them in one order');
    }

    public function test_the_combination_confirm_locks_rooms_then_the_hold_then_the_payment_and_never_a_booking_row(): void
    {
        $body = $this->methodBody(app_path('Services/BookingEngineService.php'), 'confirmMemberCombo');

        $order = ['StayCombination::roomLockKeys(', 'AdvisoryLock::within($roomLock)', 'lockForUpdate()', 'assertComboRoomStillFree(', '$hooks->beforeReservation(', 'createReservation(', 'BookingMirror::create(', '$hooks->afterMirror('];
        $at = array_map(fn (string $needle) => strpos($body, $needle), $order);
        foreach ($at as $i => $pos) {
            $this->assertNotFalse($pos, "{$order[$i]} not found in confirmMemberCombo()");
        }
        $sorted = $at;
        sort($sorted);
        $this->assertSame($sorted, $at, 'room locks, the hold row, the re-checks, the payment (in the hook), the PMS, the rows — in that order');
        $this->assertSame(1, substr_count($body, 'lockForUpdate('), 'only the hold row is locked; no booking row');

        $cancel = $this->methodBody(app_path('Services/Booking/MemberCancellation.php'), 'cancelCombination');
        $this->assertLessThan(strpos($cancel, "AdvisoryLock::within('pi:'"), strpos($cancel, 'lockCombination('), 'every room row first, then pi:');

        $intent = $this->methodBody(app_path('Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php'), 'paymentIntent');
        $this->assertStringContainsString('StayCombination::roomLockKeys(', $intent, "the payment-intent call takes a combination's room locks in the confirm's order");
    }

    private function methodBody(string $file, string $method): string
    {
        $source = (string) file_get_contents($file);
        $start = strpos($source, "function {$method}(");
        $this->assertNotFalse($start, "{$method}() not found");
        $ends = array_filter([
            strpos($source, "\n    private function ", $start + 1),
            strpos($source, "\n    public function ", $start + 1),
            strpos($source, "\n    protected function ", $start + 1),
        ], fn ($p) => $p !== false);

        return substr($source, $start, ($ends ? min($ends) : strlen($source)) - $start);
    }
}
