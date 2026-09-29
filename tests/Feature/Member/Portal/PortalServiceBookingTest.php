<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceExtra;
use App\Models\ServiceMaster;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Services\Booking\ServiceQuoteBuilder;
use App\Services\Booking\SlotTakenException;
use App\Services\StripeService;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalServiceBookingTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SeedsDiscountFixture;

    private Organization $org;
    private string $token;
    // $member is declared by SeedsDiscountFixture (protected LoyaltyMember $member).
    private Service $service;
    private ServiceMaster $master;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
    }

    private function setting(string $key, string $value): void
    {
        // organization_id is deliberately absent from HotelSetting::$fillable
        // (BelongsToOrganization sets it from the bound tenant on create, to
        // stop request data from escaping the tenant) — mass-assigning it via
        // updateOrCreate()'s $attributes array is silently dropped, so it is
        // set directly on the model instead.
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first() ?? new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function body(array $extra = []): array
    {
        return array_merge(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1], $extra);
    }

    private function tenPercent(): void
    {
        $def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off treatments', 'code' => 'ten', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
    }

    private function claim(float $value, string $type = 'fixed_amount'): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => $type, 'value' => $value, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true]);
        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }

    /** Stripe enabled in EUR with a mock that records what it was asked to create. */
    private function stripe(bool $enabled = true, string $currency = 'eur'): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        $stripe->shouldReceive('currency')->andReturn($currency);
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        // The real conversion (it reads the mocked currency() above when the intent names none).
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $this->app->instance(StripeService::class, $stripe);
        return $stripe;
    }

    /**
     * A Stripe\PaymentIntent test double. Defaults name this member's own
     * intent, sized and slotted for body()'s default 10:00 booking with no
     * discount (60.00 EUR = 6000); pass $meta overrides to make it name
     * another org/member/service/slot, and $top to change status/amount/id.
     */
    private function pi(array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge([
            'id' => 'pi_ok', 'status' => 'requires_capture', 'amount' => 6000, 'currency' => 'eur',
        ], $top, [
            'metadata' => array_merge([
                'org_id'     => (string) $this->org->id,
                'member_id'  => (string) $this->member->id,
                'service_id' => (string) $this->service->id,
                'start_at'   => now()->setTime(10, 0)->toIso8601String(),
            ], $meta),
        ]));
    }

    private function pendingReward(float $value, string $type = 'fixed_amount'): RewardRedemption
    {
        $reward = Reward::create(['organization_id' => $this->org->id, 'name' => 'Spa reward', 'points_cost' => 100, 'discount_type' => $type, 'discount_value' => $value, 'is_active' => true]);
        return RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-' . strtoupper(uniqid()), 'status' => RewardRedemption::STATUS_PENDING]);
    }

    public function test_quote_itemises_the_member_price_and_reports_pay_at_venue_without_stripe(): void
    {
        $this->tenPercent();
        $res = $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertOk();
        $res->assertJsonPath('list_amount', 60)->assertJsonPath('discount.amount', 6)->assertJsonPath('discount.source', 'tier_benefit')->assertJsonPath('total_amount', 54)->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'payments_off')->assertJsonPath('currency', 'EUR')->assertJsonPath('master.id', $this->master->id);
    }

    /** Final review, escalated Minor 6: quote answers no_membership like payment-intent and confirm do. */
    public function test_quote_needs_a_membership_row(): void
    {
        \App\Models\LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->delete();
        \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())
            ->assertStatus(422)->assertJsonPath('error', 'no_membership');
    }

    public function test_a_selected_coupon_beats_the_benefit_or_is_reported_outbid(): void
    {
        $this->tenPercent();
        $big = $this->claim(20);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['coupon' => ['member_offer_id' => $big->id]]))->assertOk()->assertJsonPath('total_amount', 40)->assertJsonPath('coupon.status', 'applied');
        $small = $this->claim(2);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['coupon' => ['member_offer_id' => $small->id]]))->assertOk()->assertJsonPath('total_amount', 54)->assertJsonPath('coupon.status', 'outbid');
    }

    public function test_a_taken_slot_and_a_bad_coupon_answer_their_codes(): void
    {
        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(10, 0), 'end_at' => now()->setTime(10, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid']);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => now()->setTime(11, 0)->toIso8601String(), 'coupon' => ['member_offer_id' => 424242]]))->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
    }

    public function test_a_currency_mismatch_quotes_pay_at_venue(): void
    {
        $this->setting('booking_payment_enabled', 'true');
        $this->stripe(true, 'gbp');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'currency_mismatch');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertStatus(409)->assertJsonPath('error', 'pay_at_venue');
    }

    public function test_payment_intent_is_created_for_the_discounted_total_with_the_members_metadata(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        // The portal has nowhere to read a redirect-method's `?payment_intent=...` return to — the fourth
        // argument keeps the PI to payment methods that never navigate the browser away.
        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $meta, array $options) {
            return $amount === 54.0 && $meta['org_id'] === $this->org->id && $meta['member_id'] === $this->member->id && $meta['kind'] === 'portal_service_booking'
                && $options === ['allow_redirects' => 'never'];
        })->andReturn(['client_secret' => 'pi_1_secret', 'payment_intent_id' => 'pi_1']);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('amount', 54);
    }

    public function test_stripe_failure_at_payment_intent_answers_503(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
    }

    public function test_an_extra_from_another_venue_is_not_priced(): void
    {
        $other = $this->tenant('Other Venue');
        $foreignExtra = ServiceExtra::withoutGlobalScopes()->create([
            'organization_id' => $other->id, 'name' => 'Hot stones', 'price' => 15, 'price_type' => 'per_booking',
            'duration_minutes' => 10, 'lead_time_hours' => 0, 'currency' => 'EUR', 'is_active' => true,
        ]);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['extras' => [['id' => $foreignExtra->id]]]))
            ->assertOk()
            ->assertJsonPath('lines.extras', [])
            ->assertJsonPath('list_amount', 60);
    }

    /** Review fix round 1, finding 1: a failure that is not the scheduler's own "slot taken" must not be reported as one. */
    public function test_a_failure_that_is_not_a_taken_slot_is_not_reported_as_one(): void
    {
        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->andThrow(new \RuntimeException('boom'));
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())
            ->assertStatus(500);
    }

    /** Review fix round 1, finding 2: reserveSlot() enforces no lead time on its own; the quote must. */
    public function test_a_time_inside_the_lead_window_or_in_the_past_is_refused(): void
    {
        $this->setting('services_lead_minutes', '120');

        // Clock is 08:00 (setUp's travelTo); a 09:00 slot today is inside the two-hour lead window.
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => now()->setTime(9, 0)->toIso8601String()]))
            ->assertStatus(422)->assertJsonPath('error', 'too_soon');

        // Yesterday is trivially inside any lead window too.
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => now()->subDay()->setTime(10, 0)->toIso8601String()]))
            ->assertStatus(422);
    }

    public function test_a_time_beyond_the_booking_window_is_refused(): void
    {
        $this->setting('services_max_advance_days', '7');

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => now()->addDays(8)->setTime(10, 0)->toIso8601String()]))
            ->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');
    }

    public function test_mock_mode_quotes_pay_at_venue_with_its_reason(): void
    {
        $this->setting('booking_mock_mode', 'true');
        $this->stripe(true, 'eur');

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())
            ->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'mock_mode');
    }

    public function test_a_booking_fully_covered_by_a_coupon_has_nothing_to_pay_online(): void
    {
        $this->stripe();
        $offer = $this->claim(100);

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['coupon' => ['member_offer_id' => $offer->id]]))
            ->assertOk()->assertJsonPath('total_amount', 0);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body(['coupon' => ['member_offer_id' => $offer->id]]))
            ->assertStatus(409)->assertJsonPath('error', 'nothing_to_pay');
    }

    private function confirm(array $body, string $key = 'idem-key-0001')
    {
        return $this->withToken($this->token)->withHeader('Idempotency-Key', $key)->postJson('/api/v1/member/portal/services/confirm', $body);
    }

    public function test_confirm_writes_the_member_guest_source_and_discount_and_consumes_the_coupon_once(): void
    {
        $this->tenPercent();
        $claim = $this->claim(20);
        $res = $this->confirm($this->body(['coupon' => ['member_offer_id' => $claim->id], 'notes' => 'Window seat']))->assertStatus(201);
        $res->assertJsonPath('replayed', false)->assertJsonPath('booking.kind', 'service')->assertJsonPath('booking.total', 40)->assertJsonPath('booking.discount.amount', 20)->assertJsonPath('booking.status', 'confirmed')->assertJsonPath('booking.payment_status', 'unpaid');

        $b = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame($this->member->id, (int) $b->member_id);
        $this->assertNotNull($b->guest_id);
        $this->assertSame('member_portal', $b->source);
        $this->assertSame('offer', $b->discount_source);
        $this->assertSame(60.0, (float) $b->list_amount);
        $this->assertSame('Window seat', $b->customer_notes);
        $this->assertSame($b->booking_reference, MemberOffer::find($claim->id)->used_reference);
    }

    public function test_replay_returns_the_same_booking_and_consumes_once(): void
    {
        $claim = $this->claim(20);
        $body = $this->body(['coupon' => ['member_offer_id' => $claim->id]]);
        $first = $this->confirm($body)->assertStatus(201)->json('booking.id');
        $again = $this->confirm($body)->assertOk();
        $this->assertSame($first, $again->json('booking.id'));
        $this->assertTrue($again->json('replayed'));
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertSame(1, MemberOffer::whereNotNull('used_at')->count());
    }

    /**
     * Final review, Minor 4: two requests with the same key and body — the
     * second's pre-lock replay lookup runs before the first commits, so it
     * waits on the lock and then used to try the (now taken) slot and answer
     * slot_taken. Inside the lock it must replay the first booking instead.
     *
     * Simulated in one process: the first confirm books for real; its
     * success row is then parked under another key so the second request's
     * pre-lock lookup misses it, and the builder double's first (pre-lock)
     * build() puts it back — the moment the "other" request commits —
     * returning a quote computed while the slot was still free.
     */
    public function test_a_same_key_request_that_waited_on_the_lock_replays_the_first_booking(): void
    {
        $real = $this->app->make(ServiceQuoteBuilder::class);
        $this->app->instance('current_organization_id', $this->org->id); // the scheduler's queries are tenant-scoped
        $freeSlotQuote = $real->build($this->service, $this->master->id, $this->body()['start_at'], 1, []);

        $first = $this->confirm($this->body(), 'idem-race-0001')->assertStatus(201)->json('booking');
        $submission = \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'success')->firstOrFail();
        $submission->forceFill(['idempotency_key' => 'parked-while-in-flight'])->save();

        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->once()->andReturnUsing(function () use ($submission, $freeSlotQuote) {
            $submission->forceFill(['idempotency_key' => 'idem-race-0001'])->save();
            return $freeSlotQuote;
        });
        $builder->shouldReceive('build')->andReturnUsing(fn (...$args) => $real->build(...$args));
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->confirm($this->body(), 'idem-race-0001')->assertOk()
            ->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $first['id']);
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_replayed_key_with_a_different_body_is_refused(): void
    {
        $this->confirm($this->body())->assertStatus(201);
        $this->confirm($this->body(['start_at' => now()->setTime(12, 0)->toIso8601String()]))->assertStatus(409)->assertJsonPath('error', 'idempotency_conflict');
    }

    public function test_an_outbid_coupon_is_not_consumed_at_confirm(): void
    {
        $this->tenPercent();
        $small = $this->claim(2);
        $this->confirm($this->body(['coupon' => ['member_offer_id' => $small->id]]))->assertStatus(201)->assertJsonPath('booking.total', 54);
        $this->assertNull(MemberOffer::find($small->id)->used_at);
    }

    public function test_a_slot_race_answers_409_and_writes_nothing(): void
    {
        $this->confirm($this->body(), 'key-a-race')->assertStatus(201);
        $this->confirm($this->body(), 'key-b-race')->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_staff_confirmation_setting_makes_the_booking_pending(): void
    {
        $this->setting('services_require_staff_confirmation', 'true');
        $this->confirm($this->body())->assertStatus(201)->assertJsonPath('booking.status', 'pending');
    }

    public function test_online_mode_requires_a_payment_intent_and_checks_it(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $this->confirm($this->body())->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($this->pi(['amount' => 5400]));
        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']))->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized');
        $this->assertSame('pi_ok', ServiceBooking::withoutGlobalScopes()->first()->stripe_payment_intent_id);
    }

    public function test_a_payment_intent_for_another_org_member_or_amount_is_refused(): void
    {
        $stripe = $this->stripe();
        // Only the member's OWN intent (right org, right member) is ever
        // cancelled — the org and member mismatches must leave the
        // stranger's/foreign intent untouched (RULING / finding M6).
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_amount', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_org')->andReturn($this->pi(['id' => 'pi_org'], ['org_id' => '999']));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_member')->andReturn($this->pi(['id' => 'pi_member'], ['member_id' => '999']));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_amount')->andReturn($this->pi(['id' => 'pi_amount', 'amount' => 100]));
        foreach (['pi_org', 'pi_member', 'pi_amount'] as $i => $id) {
            $this->confirm($this->body(['payment_intent_id' => $id]), "key-mismatch-$i")->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        }
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_an_intent_made_for_another_slot_or_service_is_refused(): void
    {
        $stripe = $this->stripe();
        // Own intent (org/member both match) but for a different slot — the
        // guard cancels it, unlike a stranger's intent (see the test above).
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_wrong_slot', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_wrong_slot')->andReturn(
            $this->pi(['id' => 'pi_wrong_slot'], ['start_at' => now()->setTime(12, 0)->toIso8601String()]),
        );
        $this->confirm($this->body(['payment_intent_id' => 'pi_wrong_slot']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_one_payment_intent_cannot_pay_for_two_bookings(): void
    {
        $stripe = $this->stripe();
        // Fix round 2: the intent already pays for the first booking, so
        // it must never be cancelled here — that would void a payment the
        // member already holds a confirmed booking against.
        $stripe->shouldNotReceive('cancelPaymentIntent');
        // Mockery serves these in call order: #1 is the first confirm's
        // verify() (must name the 10:00 slot to pass); #2 is the second
        // confirm's verify() (must name the 12:00 slot to pass its own
        // pre-lock check, so the failure is assertUnused()'s reuse guard,
        // not a slot mismatch). release() is never reached for the intent
        // — PortalPaymentIntentGuard::assertUnused() throws PaymentAlreadyUsed,
        // which the controller does not release for — so no third return
        // value is needed.
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn(
            $this->pi([], ['start_at' => now()->setTime(10, 0)->toIso8601String()]),
            $this->pi([], ['start_at' => now()->setTime(12, 0)->toIso8601String()]),
        );

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']), 'key-first-slot')->assertStatus(201);
        $this->confirm($this->body(['start_at' => now()->setTime(12, 0)->toIso8601String(), 'payment_intent_id' => 'pi_ok']), 'key-second-slot')
            ->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
        $first = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame('authorized', $first->payment_status);
        $this->assertSame('pi_ok', $first->stripe_payment_intent_id);
    }

    /** Fix round 2, the Important finding: a booking's own intent must survive even a mismatched reuse attempt against it, not just the definitive assertUnused() reuse check. */
    public function test_an_intent_that_already_pays_for_a_booking_is_never_cancelled_on_a_mismatch(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        // First confirm's verify() must match the 10:00 slot to succeed;
        // the second confirm's verify() is made to MISMATCH its own slot
        // (still 10:00 in the metadata, while the request itself asks for
        // 12:00) so the failure comes from verify()'s own mismatch-cancel
        // branch, not assertUnused() — and that branch must also refuse to
        // cancel an intent a real booking already carries.
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn(
            $this->pi([], ['start_at' => now()->setTime(10, 0)->toIso8601String()]),
            $this->pi([], ['start_at' => now()->setTime(10, 0)->toIso8601String()]),
        );

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']), 'key-first-slot')->assertStatus(201);
        $this->confirm($this->body(['start_at' => now()->setTime(12, 0)->toIso8601String(), 'payment_intent_id' => 'pi_ok']), 'key-second-slot')
            ->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
        $first = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame('authorized', $first->payment_status);
        $this->assertSame('pi_ok', $first->stripe_payment_intent_id);
    }

    /**
     * Between this request's own verify() (before any lock) and the moment
     * writeBooking() takes the pi: lock, a DIFFERENT request's failed
     * confirm — or the orphan-hold sweeper — could have cancelled this
     * exact intent. Re-checked fresh under the lock (assertStillPayable());
     * refused without a second cancel attempt on an intent that is already
     * dead, and without consuming the coupon.
     */
    public function test_a_payment_cancelled_between_verify_and_the_locked_recheck_is_refused_without_a_second_cancel(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $claim = $this->claim(20);
        // Discounted total is 40.00 EUR = 4000 — both retrieves must carry
        // that amount so the FIRST (verify(), pre-lock) call passes every
        // check; only the SECOND (assertStillPayable(), under the lock)
        // reports the intent gone.
        $good = $this->pi(['amount' => 4000]);
        $cancelled = $this->pi(['amount' => 4000, 'status' => 'canceled']);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($good, $cancelled);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok', 'coupon' => ['member_offer_id' => $claim->id]]))
            ->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the coupon was never consumed — nothing after assertStillPayable() ran');
        // This in-lock refusal writes the same failed submission row its
        // neighbouring in-lock refusals do — the direct return bypasses
        // confirm()'s own catch(PaymentMismatch), which is where
        // logFailure() is normally called from.
        $row = \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'failed')->firstOrFail();
        $this->assertSame('payment_not_payable', $row->error_message);
    }

    /**
     * The contract with the frontend: a Stripe retrieve that FAILS — at the
     * first verify() or at the re-check under the pi: lock — answers 503
     * payment_check_failed with a failure row; nothing is released, no
     * booking written, the coupon untouched; the next confirm with the same
     * intent and key books.
     */
    public function test_a_payment_that_cannot_be_checked_at_verify_answers_503_and_a_retry_books(): void
    {
        $this->paymentCheckFailsOnCall(1);
    }

    public function test_a_payment_that_cannot_be_rechecked_under_the_lock_answers_503_and_a_retry_books(): void
    {
        $this->paymentCheckFailsOnCall(2);
    }

    /** Retrieve call 1 is verify() (before any lock), call 2 is writeBooking()'s assertStillPayable() under the pi: lock. */
    private function paymentCheckFailsOnCall(int $failingCall): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $claim = $this->claim(20);
        $calls = 0;
        $good = $this->pi(['amount' => 4000]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturnUsing(function () use (&$calls, $good, $failingCall) {
            if (++$calls === $failingCall) {
                throw new \RuntimeException('Stripe timed out');
            }
            return $good;
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $body = $this->body(['payment_intent_id' => 'pi_ok', 'coupon' => ['member_offer_id' => $claim->id]]);

        $this->confirm($body)->assertStatus(503)
            ->assertExactJson(['error' => 'payment_check_failed', 'message' => 'We could not check your payment just now. No new payment was made. Please try to confirm once more.']);
        $this->assertSame($failingCall, $calls);
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
        $row = \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'failed')->sole();
        $this->assertSame('payment_check_failed', $row->error_message);

        $this->confirm($body)->assertStatus(201)->assertJsonPath('replayed', false);
        $this->assertSame('pi_ok', ServiceBooking::withoutGlobalScopes()->sole()->stripe_payment_intent_id);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_an_intent_made_for_another_service_is_refused(): void
    {
        $other = Service::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'name' => 'Other Service', 'duration_minutes' => 30,
            'buffer_after_minutes' => 0, 'price' => 60, 'currency' => 'EUR', 'is_active' => true,
        ]);
        $stripe = $this->stripe();
        // The member's own intent, carried by no booking — the guard must
        // still cancel it, unlike the "already used" case above.
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_wrong_service', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_wrong_service')->andReturn(
            $this->pi(['id' => 'pi_wrong_service'], ['service_id' => (string) $other->id]),
        );
        $this->confirm($this->body(['payment_intent_id' => 'pi_wrong_service']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_another_members_intent_is_refused_but_not_cancelled(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_other')->andReturn($this->pi(['id' => 'pi_other'], ['member_id' => '999']));
        $this->confirm($this->body(['payment_intent_id' => 'pi_other']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_the_hold_is_released_when_the_slot_is_lost_after_payment(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_ok', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($this->pi());

        // First buildQuote() call (pre-lock, for the quote and the PI
        // check) delegates to the real builder and succeeds; the second
        // (inside the lock, the definitive re-check) is where the lost
        // slot is discovered.
        $real = $this->app->make(ServiceQuoteBuilder::class);
        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->once()->andReturnUsing(fn (...$args) => $real->build(...$args));
        $builder->shouldReceive('build')->once()->andThrow(new SlotTakenException('That time was just taken.'));
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']))->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    /**
     * Fix round 2, finding S1: the usual race is caught by the PRE-lock quote (`confirm()`'s own
     * `buildQuote()` call, before the advisory lock is even attempted), not by the in-lock re-check the
     * test above exercises. The client's `afterConfirmError()` treats `slot_taken` as "the hold is
     * released" regardless of which of the two catches answered it — so this one must release too.
     */
    public function test_a_slot_taken_before_the_lock_releases_the_hold(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_early', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_early')->andReturn($this->pi(['id' => 'pi_early']));

        // Someone else's booking already sits on the slot — buildQuote() throws SlotTakenException before
        // confirm() ever reaches the lock.
        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(10, 0), 'end_at' => now()->setTime(10, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid']);

        $this->confirm($this->body(['payment_intent_id' => 'pi_early']))->assertStatus(409)->assertJsonPath('error', 'slot_taken');
    }

    /** Fix round 2, finding S1: a booking-window failure is the same pre-lock buildQuote() catch as the slot-taken case above — one release() call covers both. */
    public function test_a_time_outside_the_window_at_confirm_releases_the_hold(): void
    {
        $this->setting('services_max_advance_days', '7');
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_far', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_far')->andReturn($this->pi(['id' => 'pi_far']));

        $this->confirm($this->body(['start_at' => now()->addDays(8)->setTime(10, 0)->toIso8601String(), 'payment_intent_id' => 'pi_far']))
            ->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');
    }

    /** Fix round 2, finding S1: the pre-lock release must respect the SAME "never cancel an intent a booking carries" guarantee as every in-lock catch already does. */
    public function test_an_early_error_never_cancels_an_intent_a_booking_carries(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($this->pi());

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']), 'key-first')->assertStatus(201);

        // Second confirm, same intent id, same slot the first one just booked: the pre-lock buildQuote()
        // throws slot_taken before the lock — release() must see pi_ok is now carried by the first booking
        // and refuse to cancel it.
        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']), 'key-second')
            ->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
        $first = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame('pi_ok', $first->stripe_payment_intent_id);
    }

    /**
     * Fix round 3, minor A: quoteError() rethrows anything it doesn't recognise (its own default case) —
     * calling it for an unexpected failure would propagate past fail() before the release ever ran. The
     * pre-lock catch must answer and release the same way the in-lock catch-all already does.
     */
    public function test_an_unexpected_error_before_the_lock_releases_the_hold(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_boom', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_boom')->andReturn($this->pi(['id' => 'pi_boom']));

        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->once()->andThrow(new \RuntimeException('boom'));
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->confirm($this->body(['payment_intent_id' => 'pi_boom']))->assertStatus(500)->assertJsonPath('error', 'confirm_failed');
    }

    /**
     * Final review, Minor 2: `service_booking_submissions.error_message` is
     * varchar(255); a longer exception message made the failure log itself
     * fail on PostgreSQL (swallowed, so the failure went unrecorded).
     */
    public function test_a_failed_confirm_logs_an_error_message_that_fits_its_column(): void
    {
        $real = $this->app->make(ServiceQuoteBuilder::class);
        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->once()->andReturnUsing(fn (...$args) => $real->build(...$args));
        $builder->shouldReceive('build')->once()->andThrow(new \RuntimeException(str_repeat('database said no. ', 30)));
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->confirm($this->body())->assertStatus(500)->assertJsonPath('error', 'confirm_failed');

        $row = \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'failed')->firstOrFail();
        $this->assertSame(255, mb_strlen($row->error_message));
        $this->assertStringStartsWith('database said no.', $row->error_message);
    }

    public function test_a_price_change_inside_the_lock_refuses_the_payment(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_ok', 'abandoned')->once();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($this->pi());

        // First buildQuote() (pre-lock) prices at the list total (no
        // discount yet), matching the intent's amount; the second (inside
        // the lock) creates a tier benefit just before pricing runs, so the
        // recomputed total no longer matches what the intent paid for.
        $real = $this->app->make(ServiceQuoteBuilder::class);
        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldReceive('build')->once()->andReturnUsing(fn (...$args) => $real->build(...$args));
        $builder->shouldReceive('build')->once()->andReturnUsing(function (...$args) use ($real) {
            $this->tenPercent();
            return $real->build(...$args);
        });
        $this->app->instance(ServiceQuoteBuilder::class, $builder);

        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_captured_intent_marks_the_booking_paid(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn($this->pi(['status' => 'succeeded', 'amount' => 5400]));
        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']))->assertStatus(201)->assertJsonPath('booking.payment_status', 'paid');
    }

    public function test_a_reward_code_is_fulfilled_at_confirm(): void
    {
        $red = $this->pendingReward(15);
        $res = $this->confirm($this->body(['coupon' => ['redemption_id' => $red->id]]))->assertStatus(201);
        $res->assertJsonPath('booking.discount.amount', 15);

        $b = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame('reward', $b->discount_source);

        $red->refresh();
        $this->assertSame(RewardRedemption::STATUS_FULFILLED, $red->status);
        $this->assertStringContainsString($b->booking_reference, (string) $red->notes);
    }

    public function test_the_idempotency_key_is_required(): void
    {
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/confirm', $this->body())
            ->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
    }

    public function test_an_intent_is_refused_when_the_venue_takes_payment_at_the_venue(): void
    {
        $stripe = $this->stripe(false);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stale')->andThrow(new \RuntimeException('no such payment_intent'));
        $this->confirm($this->body(['payment_intent_id' => 'pi_stale']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_widget_replay_never_returns_a_portal_booking(): void
    {
        $key = 'widget-replay-test-key';
        $portal = $this->confirm($this->body(), $key)->assertStatus(201);
        $reference = (string) $portal->json('booking.reference');

        $widgetBody = [
            'service_id'         => $this->service->id,
            'service_master_id'  => $this->master->id,
            'start_at'           => now()->setTime(15, 0)->toIso8601String(),
            'customer_name'      => 'Widget Guest',
            'customer_email'     => 'widget-guest@example.test',
        ];
        $res = $this->withHeader('Idempotency-Key', $key)
            ->postJson('/api/v1/services/confirm?org=' . $this->org->fresh()->widget_token, $widgetBody);

        // The widget's own confirm cannot actually complete on sqlite (its
        // lock statement is Postgres-only); the only thing under test is
        // that the replay branch never fires for a portal-sourced row, so
        // no assertion is made on the resulting status code.
        $this->assertStringNotContainsString($reference, $res->getContent());
        $this->assertNotTrue($res->json('replayed'));
    }

    public function test_the_bookings_list_shows_the_new_booking_with_its_discount(): void
    {
        $this->tenPercent();
        $this->confirm($this->body())->assertStatus(201);
        // GET /bookings (phase 1, untouched) answers with JSON_PRESERVE_ZERO_FRACTION
        // so a whole-number float decodes as 6.0/54.0, not 6/54 — see
        // PortalBookingController::index()'s own comment on the point.
        $this->withToken($this->token)->getJson('/api/v1/member/portal/bookings?scope=upcoming')->assertOk()->assertJsonPath('data.0.discount.amount', 6.0)->assertJsonPath('data.0.total', 54.0);
    }

    public function test_confirm_queues_the_confirmation_mail_with_the_discount_and_notifies_the_venue(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $this->tenPercent();
        $this->setting('services_cancellation_policy', 'Free cancellation up to 24 hours before.');
        $this->confirm($this->body())->assertStatus(201);
        \Illuminate\Support\Facades\Mail::assertQueued(\App\Mail\ServiceBookingConfirmationMail::class, function ($mail) {
            $html = $mail->render();
            return str_contains($html, 'Free cancellation up to 24 hours before.') && str_contains($html, '10% off treatments') && str_contains($html, 'Pay at the venue');
        });
    }

    public function test_the_old_member_service_booking_endpoint_is_gone(): void
    {
        $this->withToken($this->token)->postJson('/api/v1/member/service-bookings', $this->body())->assertStatus(404);
    }

    // ─── Appointment times are the venue's wall clock ──────────────────────

    /**
     * The venue's zone, set before any request (AppointmentClock memoises it
     * for the container's scoped lifetime), and the clock frozen at $utc.
     * setUp's master works 09:00–17:00 every day on the venue's clock.
     */
    private function venueIn(string $zone, string $utc): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) {
            \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        \Illuminate\Support\Facades\DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => $zone]);
        $this->travelTo(\Carbon\CarbonImmutable::parse($utc, 'UTC'));
    }

    /** The digits the row holds, straight from the column. */
    private function storedStart(): string
    {
        return (string) \Illuminate\Support\Facades\DB::table('service_bookings')->value('start_at');
    }

    /** The scheduler's own spelling of a slot (and so the public widget's): the digits in the app zone. */
    private function schedulerForm(string $digits): string
    {
        return \Carbon\CarbonImmutable::parse($digits)->toIso8601String();
    }

    /** What the public widget stores for the same slot (POST /api/v1/services/confirm with the scheduler's string). */
    private function widgetStoredStart(string $digits): string
    {
        $this->org->update(['widget_token' => 'wt-task25-' . uniqid()]);
        $this->flushHeaders();
        $this->withHeader('Idempotency-Key', 'widget-task25-' . uniqid())->postJson('/api/v1/services/confirm?org=' . $this->org->fresh()->widget_token, [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'start_at' => $this->schedulerForm($digits),
            'party_size' => 1, 'customer_name' => 'Walk In', 'customer_email' => 'walkin@example.test',
        ])->assertSuccessful();
        app()->forgetInstance('current_organization_id');
        $row = \Illuminate\Support\Facades\DB::table('service_bookings')->where('customer_email', 'walkin@example.test')->first();
        \Illuminate\Support\Facades\DB::table('service_bookings')->where('id', $row->id)->delete();
        return (string) $row->start_at;
    }

    /**
     * 03:30 on 2026-03-29 never happens in Riga (the clocks go from 03:00
     * to 04:00). A hand-built request for it is refused as an unavailable
     * slot at quote, payment-intent and confirm — before the scheduler
     * reserves anything, before any PaymentIntent, no booking.
     */
    public function test_a_start_the_venues_clock_skips_is_refused_before_anything_is_reserved(): void
    {
        $this->venueIn('Europe/Riga', '2026-03-28 08:00:00');
        $builder = Mockery::mock(ServiceQuoteBuilder::class);
        $builder->shouldNotReceive('build');
        $this->app->instance(ServiceQuoteBuilder::class, $builder);
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $body = $this->body(['start_at' => '2026-03-29T03:30:00+02:00']);

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $body)->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $body)->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->confirm($body, 'dst-gap-key-0001')->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    /**
     * A new tab sends the venue-offset string it was given; an older tab
     * still sends the `+00:00` one. Both store 14:00 — the digits the
     * public widget stores for the same slot — and answer with the venue's
     * offset. The other form with the same key is the idempotent replay;
     * with another key it is a taken slot. Never a second booking.
     */
    public function test_either_form_of_a_riga_slot_stores_the_widgets_digits_and_books_once(): void
    {
        $this->venueIn('Europe/Riga', '2026-10-01 06:00:00'); // 09:00 in Riga
        $widget = $this->widgetStoredStart('2026-10-02 14:00:00');
        $this->flushHeaders();

        $new = $this->confirm($this->body(['start_at' => '2026-10-02T14:00:00+03:00']), 'riga-key-0001')->assertStatus(201);
        $new->assertJsonPath('booking.starts_at', '2026-10-02T14:00:00+03:00')->assertJsonPath('booking.ends_at', '2026-10-02T14:45:00+03:00');
        $this->assertSame($widget, $this->storedStart(), 'the portal stores exactly what the widget stores');
        $this->assertStringStartsWith('2026-10-02 14:00:00', $this->storedStart());

        $this->flushHeaders();
        $replay = $this->confirm($this->body(['start_at' => '2026-10-02T14:00:00+00:00']), 'riga-key-0001')->assertOk();
        $this->assertTrue($replay->json('replayed'));
        $this->assertSame($new->json('booking.id'), $replay->json('booking.id'));

        $this->flushHeaders();
        $this->confirm($this->body(['start_at' => '2026-10-02T14:00:00+00:00']), 'riga-key-0002')->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_an_old_tab_books_the_same_riga_slot(): void
    {
        $this->venueIn('Europe/Riga', '2026-10-01 06:00:00');

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => '2026-10-02T14:00:00+00:00']))
            ->assertOk()->assertJsonPath('start_at', '2026-10-02T14:00:00+03:00')->assertJsonPath('end_at', '2026-10-02T14:45:00+03:00');
        $this->flushHeaders();
        $this->confirm($this->body(['start_at' => '2026-10-02T14:00:00+00:00']))->assertStatus(201)->assertJsonPath('booking.starts_at', '2026-10-02T14:00:00+03:00');
        $this->assertStringStartsWith('2026-10-02 14:00:00', $this->storedStart());
        $this->assertSame('2026-10-02T14:00:00+00:00', \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'success')->first()->request_payload['start_at'], 'the stored form enters the submission row');
    }

    /**
     * A booking confirmed under the old, unnormalised format stored the
     * hash of the raw body, whose start was the scheduler's `+00:00`
     * string. fromClient() returns that string unchanged, so the same
     * request still replays it.
     */
    public function test_a_booking_confirmed_before_this_change_still_replays(): void
    {
        $this->venueIn('Europe/Riga', '2026-10-01 06:00:00');
        $body = $this->body(['start_at' => '2026-10-02T14:00:00+00:00']);
        $booking = ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'member_id' => $this->member->id, 'customer_name' => 'App Member', 'customer_email' => $this->member->user->email, 'start_at' => '2026-10-02 14:00:00', 'end_at' => '2026-10-02 14:45:00', 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'member_portal']);
        $old = $body;
        ksort($old); // the controller's canonical(): key-sorted, the raw validated body
        \App\Models\ServiceBookingSubmission::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'idempotency_key' => 'pre-task25-key', 'source' => 'member_portal', 'outcome' => 'success',
            'service_booking_id' => $booking->id, 'customer_email' => $this->member->user->email, 'customer_name' => 'App Member',
            'request_payload' => $body + ['_hash' => hash('sha256', json_encode($old))], 'response_payload' => [],
        ]);

        $res = $this->confirm($body, 'pre-task25-key')->assertOk();
        $this->assertTrue($res->json('replayed'));
        $this->assertSame($booking->id, $res->json('booking.id'));
        $this->assertSame('2026-10-02T14:00:00+03:00', $res->json('booking.starts_at'));
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    /**
     * too_soon is decided on the true instant. At 11:00 in Riga (08:00 UTC)
     * a 10:00 Riga start has passed, though "10:00 UTC" would be two hours
     * ahead; in New York (-04:00) at 08:00 (12:00 UTC) a 10:00 start is two
     * hours ahead, though "10:00 UTC" has passed.
     */
    public function test_too_soon_is_decided_on_the_venues_clock(): void
    {
        $this->setting('services_lead_minutes', '60');
        $this->venueIn('Europe/Riga', '2026-10-01 08:00:00');
        foreach (['2026-10-01T10:00:00+00:00', '2026-10-01T10:00:00+03:00'] as $start) {
            $this->flushHeaders();
            $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => $start]))
                ->assertStatus(422)->assertJsonPath('error', 'too_soon');
        }
    }

    public function test_west_of_utc_a_later_morning_slot_is_not_too_soon(): void
    {
        $this->setting('services_lead_minutes', '60');
        $this->venueIn('America/New_York', '2026-10-01 12:00:00');
        foreach (['2026-10-01T10:00:00+00:00', '2026-10-01T10:00:00-04:00'] as $start) {
            $this->flushHeaders();
            $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => $start]))
                ->assertOk()->assertJsonPath('start_at', '2026-10-01T10:00:00-04:00');
        }
        $this->flushHeaders();
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => '2026-10-01T08:30:00-04:00']))
            ->assertStatus(422)->assertJsonPath('error', 'too_soon');
    }

    public static function clientForms(): array
    {
        return ['the venue offset (a new tab)' => ['2026-10-02T14:00:00+03:00'], 'plus zero (an old tab)' => ['2026-10-02T14:00:00+00:00']];
    }

    /**
     * The PaymentIntent's metadata carries the scheduler's own `+00:00`
     * string, byte for byte the same regardless of which form the client
     * sent, and the intent verifies at confirm whichever form the client
     * sends back.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('clientForms')]
    public function test_a_payment_intent_for_a_riga_slot_verifies_whichever_form_comes_back(string $confirmForm): void
    {
        $this->venueIn('Europe/Riga', '2026-10-01 06:00:00');
        $stripe = $this->stripe();
        $meta = null;
        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $m) use (&$meta) {
            $meta = $m;
            return true;
        })->andReturn(['client_secret' => 'pi_riga_secret', 'payment_intent_id' => 'pi_riga']);

        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body(['start_at' => '2026-10-02T14:00:00+03:00']))->assertOk();
        $this->assertSame($this->schedulerForm('2026-10-02 14:00:00'), $meta['start_at']);
        $this->assertSame('2026-10-02T14:00:00+00:00', $meta['start_at']);

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_riga')->andReturn(PaymentIntent::constructFrom([
            'id' => 'pi_riga', 'status' => 'requires_capture', 'amount' => 6000, 'currency' => 'eur', 'metadata' => $meta,
        ]));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->flushHeaders();
        $this->confirm($this->body(['start_at' => $confirmForm, 'payment_intent_id' => 'pi_riga']))->assertStatus(201)
            ->assertJsonPath('booking.payment_status', 'authorized')->assertJsonPath('booking.starts_at', '2026-10-02T14:00:00+03:00');
        $this->assertStringStartsWith('2026-10-02 14:00:00', $this->storedStart());
    }
}
