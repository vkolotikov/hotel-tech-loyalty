<?php

namespace Tests\Feature\Member\Portal;

use App\Mail\BookingConfirmationMail;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\MemberOffer;
use App\Services\Booking\PaymentAlreadyUsed;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\StripeService;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalStayBookingTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const QUOTE = '/api/v1/member/portal/stays/quote';
    private const INTENT = '/api/v1/member/portal/stays/payment-intent';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates(200.0);
    }

    protected function body(array $extra = []): array
    {
        return array_merge(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0], $extra);
    }

    protected function quote(array $extra = [])
    {
        return $this->withToken($this->token)->postJson(self::QUOTE, $this->body($extra));
    }

    protected function holdOf(string $token): BookingHold
    {
        return BookingHold::withoutGlobalScopes()->where('hold_token', $token)->sole();
    }

    protected function intent(string $holdToken, ?string $token = null)
    {
        return $this->withToken($token ?? $this->token)->postJson(self::INTENT, ['hold_token' => $holdToken]);
    }

    public function test_quote_itemises_the_member_price_and_writes_the_member_into_the_hold(): void
    {
        $this->tenPercentOnStays();
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id);
        app()->forgetInstance('current_organization_id');

        $res = $this->quote(['extras' => [['id' => (string) $extra->id, 'quantity' => 2]]])->assertOk();

        $res->assertJsonPath('room.id', '101')->assertJsonPath('nights', 2)
            ->assertJsonPath('lines.room_total', 200)->assertJsonPath('lines.extras_total', 30)
            ->assertJsonPath('lines.extras.0.name', 'Breakfast')->assertJsonPath('lines.extras.0.quantity', 2)->assertJsonPath('lines.extras.0.line_total', 30)
            ->assertJsonPath('list_amount', 230)->assertJsonPath('discount.amount', 23)->assertJsonPath('discount.source', 'tier_benefit')
            ->assertJsonPath('total_amount', 207)->assertJsonPath('currency', 'EUR')
            ->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('policy.cancel_hours', 48)->assertJsonPath('policy.check_in_time', '15:00');

        $payload = $this->holdOf($res->json('hold_token'))->payload_json;
        $this->assertSame($this->member->id, (int) $payload['member_id']);
        $this->assertSame($this->user->id, (int) $payload['user_id']);
        $this->assertEquals(230.0, $payload['list_total']);
        $this->assertEquals(23.0, $payload['discount']);
        $this->assertSame('tier_benefit', $payload['discount_source']);
        $this->assertSame('10% off stays', $payload['discount_label']);
        $this->assertEquals(207.0, $payload['gross_total'], 'what the payment charges and Smoobu is told');
        $this->assertEquals(200.0, $payload['room_total'], 'the list price of the room is kept');
        $this->assertSame('Member portal', $payload['channel_name']);
        $this->assertNull($payload['coupon']);
    }

    public function test_the_extras_lines_add_up_to_the_engines_own_total(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $a = $this->seedStayExtra($this->org->id, ['name' => 'Breakfast', 'price' => 12.35, 'price_type' => 'per_person']);
        $b = $this->seedStayExtra($this->org->id, ['name' => 'Parking', 'price' => 7.10, 'price_type' => 'per_night']);
        app()->forgetInstance('current_organization_id');

        $json = $this->quote(['extras' => [['id' => (string) $a->id, 'quantity' => 3], ['id' => (string) $b->id, 'quantity' => 1]]])->assertOk()->json();

        $this->assertEqualsWithDelta(array_sum(array_column($json['lines']['extras'], 'line_total')), $json['lines']['extras_total'], 0.001);
        $this->assertEqualsWithDelta($json['lines']['room_total'] + $json['lines']['extras_total'], $json['list_amount'], 0.001);
    }

    /** An extra the venue does not offer is refused (the engine would price it as nothing), and no hold is written. */
    public function test_an_unknown_extra_is_refused_and_no_hold_is_written(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $known = $this->seedStayExtra($this->org->id, ['name' => 'Breakfast', 'price' => 12]);
        app()->forgetInstance('current_organization_id');

        $this->quote(['extras' => [['id' => (string) $known->id, 'quantity' => 1], ['id' => '987654', 'quantity' => 1]]])
            ->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());

        $this->quote(['extras' => [['id' => (string) $known->id, 'quantity' => 2]]])->assertOk()->assertJsonPath('lines.extras.0.line_total', 24);
    }

    /** The quote resolves the member once per request. */
    public function test_the_quote_resolves_the_member_once(): void
    {
        $lookups = 0;
        \Illuminate\Support\Facades\DB::listen(function ($q) use (&$lookups) {
            if (str_contains($q->sql, '"loyalty_members"."user_id" = ?')) {
                $lookups++;
            }
        });

        $this->quote()->assertOk();

        $this->assertSame(1, $lookups);
    }

    public function test_a_selected_coupon_beats_the_benefit_or_is_reported_outbid(): void
    {
        $this->tenPercentOnStays();
        $big = $this->claim(50);
        $res = $this->quote(['coupon' => ['member_offer_id' => $big->id]])->assertOk()->assertJsonPath('total_amount', 150)->assertJsonPath('coupon.status', 'applied');
        $this->assertSame(['member_offer_id' => $big->id], $this->holdOf($res->json('hold_token'))->payload_json['coupon']);
        $this->assertSame('offer', $this->holdOf($res->json('hold_token'))->payload_json['discount_source']);

        $small = $this->claim(5);
        $this->quote(['coupon' => ['member_offer_id' => $small->id]])->assertOk()->assertJsonPath('total_amount', 180)->assertJsonPath('coupon.status', 'outbid');
    }

    public function test_a_coupon_for_services_only_is_reported_and_not_applied(): void
    {
        $spa = $this->claim(50, 'fixed_amount', 'services');
        $this->quote(['coupon' => ['member_offer_id' => $spa->id]])->assertOk()->assertJsonPath('total_amount', 200)->assertJsonPath('coupon.status', 'wrong_scope');
    }

    public function test_a_bad_coupon_an_unknown_room_and_a_taken_room_answer_their_codes(): void
    {
        $this->quote(['coupon' => ['member_offer_id' => 424242]])->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
        $this->quote(['unit_id' => '999'])->assertStatus(404)->assertJsonPath('error', 'not_found');

        \App\Models\BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
        ]);
        $this->quote()->assertStatus(409)->assertJsonPath('error', 'room_unavailable');
    }

    public function test_more_guests_than_the_room_holds_and_a_stay_too_short_are_refused(): void
    {
        $this->quote(['adults' => 2, 'children' => 1])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->setting('booking_min_nights', '3');
        $this->quote()->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count(), 'a refused stay holds nothing');
    }

    public function test_an_extra_that_needs_more_notice_is_refused(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $slow = $this->seedStayExtra($this->org->id, ['name' => 'Wedding cake', 'lead_time_hours' => 24 * 30]);
        app()->forgetInstance('current_organization_id');

        $this->quote(['extras' => [['id' => (string) $slow->id, 'quantity' => 1]]])->assertStatus(422)->assertJsonPath('error', 'extra_lead_time');
    }

    public function test_quote_needs_a_membership_row(): void
    {
        \App\Models\LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->delete();
        \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->quote()->assertStatus(422)->assertJsonPath('error', 'no_membership');
    }

    public function test_a_currency_mismatch_and_mock_mode_quote_pay_at_venue(): void
    {
        $this->stripe(true, 'gbp');
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'currency_mismatch');

        $this->stripe(true, 'eur');
        $this->flushHeaders();
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'online');

        $this->setting('booking_mock_mode', 'true');
        $this->flushHeaders();
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'mock_mode');
    }

    public function test_the_room_lookup_mirrors_the_catalogues_own_key(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        // Room B has its own pms_id, so its numeric primary key must never
        // be used as an id fallback — even when that primary key is
        // exactly the search string. Both rooms sleep too few guests for
        // the default 2-adult request, so whichever one the lookup picked
        // names itself in the refusal's own sentence.
        $roomB = $this->seedRoom($this->org->id, ['pms_id' => 'B-999', 'name' => 'Room B', 'max_guests' => 1]);
        $roomA = $this->seedRoom($this->org->id, ['pms_id' => (string) $roomB->id, 'name' => 'Room A', 'max_guests' => 1]);
        app()->forgetInstance('current_organization_id');

        $this->quote(['unit_id' => (string) $roomB->id])
            ->assertStatus(422)->assertJsonPath('error', 'invalid_stay')->assertJsonPath('message', 'Room A sleeps up to 1.');

        $this->quote(['unit_id' => $roomB->id . 'abc'])->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_the_hold_stores_only_the_known_coupon_key(): void
    {
        $this->tenPercentOnStays();
        $big = $this->claim(50);

        $res = $this->quote(['coupon' => ['member_offer_id' => $big->id, 'evil' => 'x', 'redemption_id' => null]])->assertOk();

        $payload = $this->holdOf($res->json('hold_token'))->payload_json;
        $this->assertSame(['member_offer_id' => $big->id], $payload['coupon']);
    }

    public function test_a_non_scalar_extra_id_or_quantity_is_a_validation_error_not_a_crash(): void
    {
        $this->quote(['extras' => [['id' => ['nested' => 'x'], 'quantity' => 1]]])->assertStatus(422);
        $this->quote(['extras' => [['id' => '1', 'quantity' => ['nested' => 'x']]]])->assertStatus(422);
    }

    public function test_a_coupon_refusal_after_the_engine_wrote_its_hold_leaves_no_hold_behind(): void
    {
        $this->quote(['coupon' => ['member_offer_id' => 424242]])->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');

        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());
    }

    /** Price 10, 3 adults, quantity 2 → 60.0 — the engine's own per_guest arithmetic, and the portal's line built from it. */
    public function test_a_per_guest_extra_multiplies_by_adults_then_quantity(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        \App\Models\BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('pms_id', '101')->update(['max_guests' => 5]);
        $extra = $this->seedStayExtra($this->org->id, ['name' => 'Spa pass', 'price' => 10, 'price_type' => 'per_guest']);
        app()->forgetInstance('current_organization_id');

        $json = $this->quote(['adults' => 3, 'children' => 0, 'extras' => [['id' => (string) $extra->id, 'quantity' => 2]]])->assertOk()->json();

        $this->assertEquals(30.0, $json['lines']['extras'][0]['unit_price']);
        $this->assertEquals(60.0, $json['lines']['extras'][0]['line_total']);
        $this->assertEquals(60.0, $json['lines']['extras_total'], "the widget's own calcExtras() total for the same arithmetic");
    }

    /**
     * `loadExtrasConfig()` falls back to the legacy `booking_extras` JSON
     * setting when the booking_extras DB table is empty for this org — a
     * bad import there could carry a non-scalar `name` (e.g. a translation
     * object). That must not fail the quote — a normal string name prices
     * correctly regardless.
     */
    public function test_a_legacy_extra_with_a_non_scalar_stored_name_does_not_fail_the_quote(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $this->setting('booking_extras', json_encode([
            ['id' => 'legacy-1', 'name' => ['en' => 'Breakfast'], 'price' => 15, 'price_type' => 'per_stay'],
        ]));
        app()->forgetInstance('current_organization_id');

        $json = $this->quote(['extras' => [['id' => 'legacy-1', 'quantity' => 1]]])->assertOk()->json();

        $this->assertEquals(15.0, $json['lines']['extras_total'], 'calcExtras() total is unchanged by the bad name');
        $this->assertSame('Extra', $json['lines']['extras'][0]['name']);
    }

    public function test_payment_intent_charges_the_discounted_total_with_the_members_metadata_and_extends_the_hold(): void
    {
        $this->tenPercentOnStays();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->travel(8)->minutes();

        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $meta, array $options) use ($hold) {
            return $amount === 180.0
                && $meta['kind'] === 'portal_stay_booking' && $meta['org_id'] === $this->org->id && $meta['member_id'] === $this->member->id
                && $meta['portal_hold_token'] === $hold && !array_key_exists('hold_token', $meta)
                && $options === ['allow_redirects' => 'never'];
        })->andReturn(['client_secret' => 'pi_1_secret', 'payment_intent_id' => 'pi_1']);

        $this->flushHeaders();
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('amount', 180)->assertJsonPath('currency', 'EUR');
        $this->assertTrue($this->holdOf($hold)->expires_at->greaterThan(now()->addMinutes(14)), 'paying takes time; the hold gets fifteen more minutes');
    }

    /**
     * Review addition: BookingPublicController::rescuePaymentIntentOnConfirmFailure()
     * falls back to the hold payload's `stripe_payment_intent_id` and
     * cancels/refunds whatever intent it finds there — a key the public
     * widget's own holds legitimately carry. If the portal ever wrote the
     * same key onto a member's hold, anyone holding that hold token could
     * cancel the member's payment through the PUBLIC endpoint. The portal
     * must never write that key (or any of it) onto the hold payload.
     */
    public function test_the_hold_payload_never_carries_the_public_widgets_payment_intent_key(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_2_secret', 'payment_intent_id' => 'pi_2']);

        $this->flushHeaders();
        $this->intent($hold)->assertOk();

        $this->assertArrayNotHasKey('stripe_payment_intent_id', $this->holdOf($hold)->payload_json);
    }

    public function test_another_members_hold_answers_404(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        ['token' => $stranger] = $this->member($this->org);

        $this->flushHeaders();
        $this->intent($hold, $stranger)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->flushHeaders();
        $this->intent('no-such-hold')->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
    }

    public function test_a_widget_hold_cannot_be_paid_through_the_portal(): void
    {
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        app()->instance('current_organization_id', $this->org->id);
        $widget = \App\Models\BookingHold::create(['hold_token' => str_repeat('w', 48), 'status' => 'active', 'expires_at' => now()->addMinutes(10), 'payload_json' => ['unit_id' => '101', 'gross_total' => 200.0]]);
        app()->forgetInstance('current_organization_id');

        $this->intent($widget->hold_token)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
    }

    public function test_an_expired_hold_a_changed_price_and_a_free_stay_answer_their_codes(): void
    {
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        // The coupon was used elsewhere since the quote: the hold's price no longer holds.
        $claim->forceFill(['used_at' => now(), 'status' => 'used'])->save();
        $this->flushHeaders();
        $this->intent($hold)->assertStatus(422)->assertJsonPath('error', 'coupon_used');

        $fresh = $this->quote()->assertOk()->json('hold_token');
        $this->tenPercentOnStays(); // a benefit the quote did not have
        $this->flushHeaders();
        $this->intent($fresh)->assertStatus(409)->assertJsonPath('error', 'price_changed');

        $late = $this->quote()->assertOk()->json('hold_token');
        $this->travel(11)->minutes();
        $this->flushHeaders();
        $this->intent($late)->assertStatus(409)->assertJsonPath('error', 'hold_expired');
    }

    public function test_pay_at_venue_and_nothing_to_pay_and_a_stripe_failure(): void
    {
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->flushHeaders();
        $this->intent($hold)->assertStatus(409)->assertJsonPath('error', 'pay_at_venue');

        $stripe = $this->stripe();
        $free = $this->quote(['coupon' => ['member_offer_id' => $this->claim(500)->id]])->assertOk()->assertJsonPath('total_amount', 0)->json('hold_token');
        $this->flushHeaders();
        $this->intent($free)->assertStatus(409)->assertJsonPath('error', 'nothing_to_pay');

        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));
        $again = $this->quote()->assertOk()->json('hold_token');
        $this->flushHeaders();
        $this->intent($again)->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
    }

    private const CONFIRM = '/api/v1/member/portal/stays/confirm';

    protected function confirm(string $holdToken, array $extra = [], ?string $token = null)
    {
        $this->flushHeaders();
        return $this->withToken($token ?? $this->token)->postJson(self::CONFIRM, array_merge(['hold_token' => $holdToken], $extra));
    }

    /** Smoobu says the nights are free at confirm and accepts the reservation. */
    protected function smoobuBooks(array $reservation = []): void
    {
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(array_merge(['id' => 555001, 'reference-id' => 'BK-ABC12345'], $reservation));
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    protected function stayIntent(string $holdToken, array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge(['id' => 'pi_stay', 'status' => 'requires_capture', 'amount' => 20000, 'currency' => 'eur'], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'portal_hold_token' => $holdToken], $meta),
        ]));
    }

    protected function mirrors()
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id);
    }

    public function test_confirm_books_the_stay_for_the_member_at_the_member_price(): void
    {
        $this->smoobuBooks();
        $this->tenPercentOnStays();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $res = $this->confirm($hold, ['special_requests' => 'Quiet room please'])->assertStatus(201);

        $res->assertJsonPath('replayed', false)->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.reference', 'BK-ABC12345')
            ->assertJsonPath('booking.total', 180)->assertJsonPath('booking.payment_status', 'open')->assertJsonPath('booking.status', 'confirmed');

        $m = $this->mirrors()->sole();
        $this->assertSame($this->member->id, (int) $m->member_id);
        $this->assertSame('Member portal', $m->channel_name);
        $this->assertEquals(200.0, (float) $m->list_total);
        $this->assertEquals(20.0, (float) $m->discount_amount);
        $this->assertEquals(180.0, (float) $m->price_total);
        $this->assertSame('pay_at_venue', $m->payment_method);
        $this->assertSame('Quiet room please', $m->notice);
        $this->assertSame('App Member', $m->guest_name);
        $this->assertSame($this->user->email, $m->guest_email);
        $guest = \App\Models\Guest::withoutGlobalScopes()->findOrFail($m->guest_id);
        $this->assertSame($this->member->id, (int) $guest->member_id);

        $holdRow = $this->holdOf($hold);
        $this->assertSame('consumed', $holdRow->status);
        $this->assertSame($m->id, (int) $holdRow->payload_json['mirror_id']);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.portal_confirmed')->where('subject_id', $m->id)->count());
        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $mail) => $mail->hasTo($this->user->email) && $mail->discountAmount === 20.0);
    }

    public function test_confirm_consumes_the_coupon_once_under_the_bookings_own_reference(): void
    {
        $this->smoobuBooks();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(201)->assertJsonPath('booking.total', 150)->assertJsonPath('booking.discount.amount', 50);

        $used = MemberOffer::findOrFail($claim->id);
        $this->assertNotNull($used->used_at);
        // The stay's own mirror id, which no sync rewrites — not the booking reference, which the PMS sync can replace.
        $this->assertSame('BM:' . $this->mirrors()->sole()->id, $used->used_reference, 'not the provisional hold reference');
        $this->assertSame('offer', $this->mirrors()->sole()->discount_source);
        $this->assertSame($claim->id, (int) $this->mirrors()->sole()->discount_source_id);
    }

    public function test_an_outbid_coupon_is_not_consumed(): void
    {
        $this->smoobuBooks();
        $this->tenPercentOnStays();
        $small = $this->claim(5);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $small->id]])->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(201)->assertJsonPath('booking.total', 180);
        $this->assertNull(MemberOffer::findOrFail($small->id)->used_at);
    }

    public function test_a_second_confirm_on_the_same_hold_replays_the_booking(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        $first = $this->confirm($hold)->assertStatus(201)->json('booking.id');
        $again = $this->confirm($hold)->assertOk();

        $again->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $first);
        $this->assertSame(1, $this->mirrors()->count());
        $this->assertSame(1, MemberOffer::whereNotNull('used_at')->count());
        Mail::assertQueued(BookingConfirmationMail::class, 1);
    }

    public function test_another_members_hold_cannot_be_confirmed(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->quote()->assertOk()->json('hold_token');
        ['token' => $stranger] = $this->member($this->org);

        $this->confirm($hold, [], $stranger)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_online_mode_requires_a_payment_intent_and_checks_it(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame('active', $this->holdOf($hold)->status);

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized');

        $m = $this->mirrors()->sole();
        $this->assertSame('pi_stay', $m->stripe_payment_intent_id);
        $this->assertSame('stripe', $m->payment_method);
    }

    public function test_a_payment_for_another_hold_member_or_amount_is_refused(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_other_hold')->andReturn($this->stayIntent('ANOTHER-HOLD', ['id' => 'pi_other_hold']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_other_hold', 'abandoned');
        $this->confirm($hold, ['payment_intent_id' => 'pi_other_hold'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_short')->andReturn($this->stayIntent($hold, ['id' => 'pi_short', 'amount' => 100]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_short', 'abandoned');
        $this->confirm($hold, ['payment_intent_id' => 'pi_short'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stranger')->andReturn($this->stayIntent($hold, ['id' => 'pi_stranger'], ['member_id' => '999999']));
        $stripe->shouldNotReceive('cancelPaymentIntent')->with('pi_stranger', Mockery::any());
        $this->confirm($hold, ['payment_intent_id' => 'pi_stranger'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_payment_already_spent_on_a_booking_is_refused_and_left_alone(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'R-OLD', 'apartment_id' => '202', 'price_total' => 200, 'stripe_payment_intent_id' => 'pi_stay', 'member_id' => $this->member->id, 'arrival_date' => now()->addDays(40)->toDateString(), 'departure_date' => now()->addDays(42)->toDateString()]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(1, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($hold)->status);
    }

    public function test_a_room_taken_since_the_quote_releases_the_hold_on_the_card(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');
        $this->assertSame(1, $this->mirrors()->count());
    }

    public function test_a_coupon_used_since_the_quote_refuses_the_booking_before_smoobu_is_asked(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldNotReceive('createReservation');
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-ELSEWHERE'])->save();

        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'coupon_used');
        $this->assertSame(0, $this->mirrors()->count());
        $this->assertSame('SVC-ELSEWHERE', MemberOffer::findOrFail($claim->id)->used_reference);
    }

    public function test_a_smoobu_rejection_leaves_the_coupon_unused_and_releases_the_payment(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available'));
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold, ['amount' => 15000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');

        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the engine\'s rollback took the consumption with it');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_pms_outage_answers_503_and_releases_the_payment(): void
    {
        $this->smoobu->shouldReceive('getDailyRates')->andThrow(new \RuntimeException('cURL error 28: timed out'));
        $this->smoobu->shouldReceive('getRates')->andReturnUsing(function () {
            static $n = 0;
            if ($n++ === 0) return ['data' => ['101' => ['available' => true, 'price' => 200.0, 'price_per_night' => 100.0, 'min_stay' => 1]]];
            throw new \RuntimeException('cURL error 28: timed out');
        });
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(503)->assertJsonPath('error', 'pms_unavailable');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_failure_after_the_booking_exists_never_releases_the_payment(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));

        // The engine's last write after the commit fails (its success log).
        \App\Models\BookingSubmission::creating(function () {
            throw new \RuntimeException('disk full');
        });

        try {
            $res = $this->confirm($hold, ['payment_intent_id' => 'pi_stay']);
        } finally {
            \App\Models\BookingSubmission::flushEventListeners();
        }

        $res->assertStatus(201)->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.payment_status', 'authorized');
        $this->assertSame(1, $this->mirrors()->count());
    }

    public function test_an_expired_hold_and_a_price_that_moved_answer_their_codes(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->tenPercentOnStays();
        $this->confirm($hold)->assertStatus(409)->assertJsonPath('error', 'price_changed');

        $late = $this->quote()->assertOk()->json('hold_token');
        $this->travel(11)->minutes();
        $this->confirm($late)->assertStatus(409)->assertJsonPath('error', 'hold_expired');
    }

    /**
     * Between this request's own verifyStay() (before any lock) and the
     * moment PortalStayHooks::beforeReservation() takes the pi: lock, a
     * DIFFERENT request's failed confirm could have cancelled this exact
     * intent. The hook re-retrieves it fresh under the lock and refuses on
     * its own account — never a second cancel.
     */
    public function test_a_payment_cancelled_between_verify_and_the_hooks_own_check_is_refused_without_a_second_cancel(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $good = $this->stayIntent($hold, ['amount' => 15000]);
        $cancelled = $this->stayIntent($hold, ['amount' => 15000, 'status' => 'canceled']);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($good, $cancelled);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(0, $this->mirrors()->count());
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the coupon was never consumed — the engine rolled its whole transaction back');
    }

    /**
     * The engine returned but no booking can be found for the hold — the
     * answer stays 500 confirm_failed with nothing released, and an audit
     * row names the hold and the intent for an operator.
     */
    public function test_a_confirm_that_returns_without_a_booking_is_audited_with_the_hold_and_the_intent(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $engine = Mockery::mock(\App\Services\BookingEngineService::class);
        $engine->shouldReceive('confirm')->once()->andReturn(['success' => true]);
        $this->app->instance(\App\Services\BookingEngineService::class, $engine);

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(500)->assertJsonPath('error', 'confirm_failed');

        $holdId = $this->holdOf($hold)->id;
        $row = AuditLog::withoutGlobalScopes()->where('action', 'portal.stay_confirm_lost')->sole();
        $this->assertSame('booking_hold', $row->subject_type);
        $this->assertSame($holdId, (int) $row->subject_id);
        $this->assertSame($holdId, (int) $row->new_values['hold_id']);
        $this->assertSame('pi_stay', $row->new_values['payment_intent']);
    }

    /**
     * The contract with the frontend: a Stripe retrieve that FAILS at the
     * first verify is not a mismatch — 503 payment_check_failed, nothing
     * released or written, the hold and the coupon untouched — and the
     * next confirm with the same intent books.
     */
    public function test_a_payment_that_cannot_be_checked_at_verify_answers_503_and_a_retry_books(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $calls = 0;
        $good = $this->stayIntent($hold, ['amount' => 15000]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturnUsing(function () use (&$calls, $good) {
            if (++$calls === 1) {
                throw new \RuntimeException('Stripe timed out');
            }
            return $good;
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(503)
            ->assertExactJson(['error' => 'payment_check_failed', 'message' => 'We could not check your payment just now. No new payment was made. Please try to confirm once more.']);
        $this->assertSame(0, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(201)->assertJsonPath('replayed', false);
        $this->assertSame('pi_stay', $this->mirrors()->sole()->stripe_payment_intent_id);
    }

    /** The same at the re-check under the pi: lock (PortalStayHooks::beforeReservation()). */
    public function test_a_payment_that_cannot_be_rechecked_under_the_lock_answers_503_and_a_retry_books(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $calls = 0;
        $good = $this->stayIntent($hold, ['amount' => 15000]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturnUsing(function () use (&$calls, $good) {
            if (++$calls === 2) {
                throw new \RuntimeException('Stripe timed out');
            }
            return $good;
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(503)->assertJsonPath('error', 'payment_check_failed');
        $this->assertSame(2, $calls, 'the failure was the re-check under the lock');
        $this->assertSame(0, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the engine rolled the coupon back');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(201);
        $this->assertSame('pi_stay', $this->mirrors()->sole()->stripe_payment_intent_id);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    /**
     * The controller-level assertUnused() pre-check can miss a race the
     * hook's own (locked, authoritative) check catches. Driven with a
     * guard whose assertUnused() answers differently on its two calls —
     * the controller's pre-check, then the hook's.
     */
    public function test_the_hooks_own_check_catches_a_race_the_controllers_pre_check_missed(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $guard = new class(app(StripeService::class)) extends PortalPaymentIntentGuard {
            private int $calls = 0;

            public function assertUnused(string $piId, int $orgId): void
            {
                $this->calls++;
                if ($this->calls === 2) {
                    throw new PaymentAlreadyUsed();
                }
            }
        };
        $this->app->instance(PortalPaymentIntentGuard::class, $guard);

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_replay_with_a_different_intent_releases_it_the_bookings_own_intent_is_never_touched(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_first')->andReturn($this->stayIntent($hold, ['id' => 'pi_first']));
        $this->confirm($hold, ['payment_intent_id' => 'pi_first'])->assertStatus(201);

        // A stale second intent (the client retried and minted a new one).
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_second')->andReturn($this->stayIntent($hold, ['id' => 'pi_second']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_second', 'abandoned');
        $this->confirm($hold, ['payment_intent_id' => 'pi_second'])->assertOk()->assertJsonPath('replayed', true);

        // Replayed again with the booking's own intent: never touched.
        $stripe->shouldNotReceive('cancelPaymentIntent')->with('pi_first', Mockery::any());
        $this->confirm($hold, ['payment_intent_id' => 'pi_first'])->assertOk()->assertJsonPath('replayed', true);

        $this->assertSame(1, $this->mirrors()->count());
    }

    /**
     * Capability can change after the quote. Checked after the replay
     * branch (a booked hold always answers its booking) and before any
     * hold/payment work; a refusal releases.
     */
    public function test_the_venue_switching_stays_off_after_the_quote_refuses_and_releases(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->setting('smoobu_enabled', 'false');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(404)->assertJsonPath('error', 'not_bookable');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_pay_at_venue_hold_with_a_supplied_intent_is_refused_and_released(): void
    {
        $stripe = $this->stripe();
        $this->setting('booking_mock_mode', 'true');
        $hold = $this->quote()->assertOk()->assertJsonPath('payment.mode', 'at_venue')->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stray')->andReturn($this->stayIntent($hold, ['id' => 'pi_stray']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stray', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stray'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, $this->mirrors()->count());
    }

    /**
     * The three readyHold() refusals, each exercised WITH a
     * payment_intent_id: each must still release it.
     */
    public function test_hold_expired_price_changed_and_coupon_used_release_a_supplied_intent(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();

        $hold1 = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_e1')->andReturn($this->stayIntent($hold1, ['id' => 'pi_e1']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_e1', 'abandoned');
        $this->travel(11)->minutes();
        $this->confirm($hold1, ['payment_intent_id' => 'pi_e1'])->assertStatus(409)->assertJsonPath('error', 'hold_expired');

        $hold2 = $this->quote()->assertOk()->json('hold_token');
        $this->tenPercentOnStays(); // a benefit the quote did not have — the price moved
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_e2')->andReturn($this->stayIntent($hold2, ['id' => 'pi_e2']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_e2', 'abandoned');
        $this->confirm($hold2, ['payment_intent_id' => 'pi_e2'])->assertStatus(409)->assertJsonPath('error', 'price_changed');

        $claim = $this->claim(50);
        $hold3 = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $claim->forceFill(['used_at' => now(), 'status' => 'used'])->save();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_e3')->andReturn($this->stayIntent($hold3, ['id' => 'pi_e3']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_e3', 'abandoned');
        $this->confirm($hold3, ['payment_intent_id' => 'pi_e3'])->assertStatus(422)->assertJsonPath('error', 'coupon_used');

        $this->assertSame(0, $this->mirrors()->count());
    }

    /**
     * A coupon that looked valid at readyHold()'s
     * reprice() but is spent by the time PortalStayHooks::beforeReservation()
     * consumes it — the narrowest version of the same race the payment
     * checks guard against. ensureGuestForMember()'s own guest save is the
     * last DB write before that point, so a Guest::saved listener fires at
     * exactly the right moment.
     */
    public function test_a_coupon_spent_between_the_price_check_and_the_hooks_own_consume_is_refused_and_releases_the_payment(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_race')->andReturn($this->stayIntent($hold, ['id' => 'pi_race', 'amount' => 15000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_race', 'abandoned');

        Guest::saved(function () use ($claim) {
            $claim->forceFill(['used_at' => now(), 'status' => 'used'])->save();
        });

        try {
            $res = $this->confirm($hold, ['payment_intent_id' => 'pi_race']);
        } finally {
            Guest::flushEventListeners();
        }

        $res->assertStatus(422)->assertJsonPath('error', 'coupon_used');
        $this->assertSame(0, $this->mirrors()->count());
    }
}
