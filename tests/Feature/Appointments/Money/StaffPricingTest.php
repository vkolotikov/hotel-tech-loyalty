<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\MemberOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class StaffPricingTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, SeedsDiscountFixture;

    private $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpDiscountTables();
        $this->orgId = $this->org->id;
        Queue::fake();
        $this->client = $this->seedMemberClient();
    }

    private function quote(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('quote?' . http_build_query(array_merge([
            'client_id' => $this->client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra))));
    }

    private function book(array $extra = [], ?string $key = null): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api('bookings'), array_merge([
            'client_id' => $this->client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra), ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    public function test_a_member_is_quoted_and_booked_at_the_member_price(): void
    {
        $this->benefit('percent_discount', 10, 'services');

        $this->quote()->assertOk()
            ->assertJsonPath('member', true)
            ->assertJsonPath('list_amount', 60)
            ->assertJsonPath('total_amount', 54)
            ->assertJsonPath('discount.source', 'tier_benefit');

        $this->book(['expected_total' => 54])->assertStatus(201)
            ->assertJsonPath('booking.price.total', 54)
            ->assertJsonPath('booking.price.list', 60);
    }

    public function test_a_non_member_is_quoted_the_list_price_and_may_not_use_a_coupon(): void
    {
        $this->client = $this->seedClient(['email' => 'nm@example.test', 'email_key' => 'nm@example.test']);
        $this->quote()->assertOk()->assertJsonPath('member', false)->assertJsonPath('total_amount', 60);
        $this->quote(['coupon' => ['member_offer_id' => 1]])->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
    }

    public function test_the_members_coupon_is_listed_applied_and_used_once_on_save(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 15, 'services');

        $this->asStaff()->getJson($this->api("clients/{$this->client->id}/coupons"))->assertOk()
            ->assertJsonPath('coupons.0.coupon.member_offer_id', $claim->id);

        $coupon = ['member_offer_id' => $claim->id];
        $this->quote(['coupon' => $coupon])->assertJsonPath('total_amount', 45);

        $key = (string) Str::uuid();
        $this->book(['coupon' => $coupon, 'expected_total' => 45], $key)->assertStatus(201)->assertJsonPath('booking.price.total', 45);
        $this->book(['coupon' => $coupon, 'expected_total' => 45], $key)->assertOk()->assertJsonPath('replayed', true);

        $this->assertNotNull(MemberOffer::find($claim->id)->used_at);
        $this->asStaff()->getJson($this->api("clients/{$this->client->id}/coupons"))->assertJsonPath('coupons', []);
    }

    public function test_a_price_that_changed_since_the_quote_is_refused_and_nothing_is_used(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 15, 'services');

        $this->book(['coupon' => ['member_offer_id' => $claim->id], 'expected_total' => 50])->assertStatus(409)
            ->assertJsonPath('error', 'price_changed')
            ->assertJsonPath('quote.total_amount', 45);

        $this->assertNull(MemberOffer::find($claim->id)->used_at);
    }

    public function test_a_code_the_client_shows_is_resolved_for_this_member(): void
    {
        $this->redemption('fixed', 5);

        $this->asStaff()->postJson($this->api("clients/{$this->client->id}/coupons/resolve"), ['code' => 'rew-test0001'])->assertOk()
            ->assertJsonPath('coupon.kind', 'reward');
        $this->asStaff()->postJson($this->api("clients/{$this->client->id}/coupons/resolve"), ['code' => 'NOPE'])->assertStatus(422)
            ->assertJsonPath('error', 'coupon_not_found');
    }
}
