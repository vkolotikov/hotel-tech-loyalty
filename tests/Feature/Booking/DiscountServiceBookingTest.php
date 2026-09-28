<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\DiscountService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * DiscountService::quoteForBooking() — the booking flavour of quote():
 * automatic tier benefits filtered by BookingScope, plus the one coupon
 * (a claimed offer or a typed reward redemption) the member explicitly
 * chose. Nothing else is a candidate, best single wins, and an eligible
 * but losing coupon is reported ("outbid" / "wrong_scope") rather than
 * silently dropped.
 */
class DiscountServiceBookingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SeedsDiscountFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpDiscountFixture();
    }

    public function test_only_benefits_admitted_by_the_scope_apply_automatically(): void
    {
        $this->benefit('percent_discount', 10, 'stays');
        $this->benefit('percent_discount', 5, 'services');
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services);
        $this->assertSame(5.0, $q['discount']);
        $this->assertSame('tier_benefit', $q['applied']['source']);
        $this->assertNull($q['coupon']);
    }

    public function test_a_claimed_offer_is_not_a_candidate_unless_selected(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        $svc = app(DiscountService::class);
        $this->assertSame(0.0, $svc->quoteForBooking($this->member, 100, BookingScope::Services)['discount']);
        $q = $svc->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(20.0, $q['discount']);
        $this->assertSame('offer', $q['applied']['source']);
        $this->assertSame('applied', $q['coupon']['status']);
    }

    public function test_an_outbid_coupon_is_reported_and_not_applied(): void
    {
        $this->benefit('percent_discount', 10, 'all');
        $claim = $this->claimedOffer('fixed_amount', 5);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(10.0, $q['discount']);
        $this->assertSame('tier_benefit', $q['applied']['source']);
        $this->assertSame('outbid', $q['coupon']['status']);
        $this->assertSame(5.0, $q['coupon']['discount']);
    }

    public function test_a_typed_reward_code_is_a_coupon_and_an_untyped_one_is_refused(): void
    {
        $typed = $this->redemption('fixed_amount', 15);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(redemptionId: $typed->id));
        $this->assertSame(15.0, $q['discount']);
        $this->assertSame('reward', $q['applied']['source']);

        $untyped = $this->redemption(null, null);
        $this->expectException(CouponException::class);
        $this->expectExceptionMessage('coupon_untyped');
        app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(redemptionId: $untyped->id));
    }

    public function test_the_discount_never_exceeds_the_bill_and_nothing_stacks(): void
    {
        $this->benefit('fixed_amount', 500, 'all');
        $claim = $this->claimedOffer('discount', 50);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 80, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(80.0, $q['discount']);
        $this->assertSame(0.0, $q['total']);
    }

    public function test_a_coupon_that_is_not_the_members_or_already_used_is_refused(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        DB::table('member_offers')->where('id', $claim->id)->update(['used_at' => now(), 'status' => 'used']);
        try {
            app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
            $this->fail('used coupon accepted');
        } catch (CouponException $e) {
            $this->assertSame('coupon_used', $e->errorCode);
        }
        $this->expectException(CouponException::class);
        app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: 999999));
    }

    public function test_a_coupon_outside_the_scope_is_reported_as_wrong_scope(): void
    {
        $claim = $this->claimedOffer('discount', 20, 'stays');
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(0.0, $q['discount']);
        $this->assertSame('wrong_scope', $q['coupon']['status']);
    }
}
