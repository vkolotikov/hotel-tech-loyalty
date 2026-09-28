<?php

namespace Tests\Feature\Booking;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponSelection;
use App\Services\Booking\MemberPricing;
use App\Services\GuestMemberLinkService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * MemberPricing wraps DiscountService::quoteForBooking() in the booking's
 * own currency and exposes the columns a booking row persists plus the
 * coupon-consume call that happens inside the confirm transaction.
 *
 * Also covers GuestMemberLinkService::ensureGuestForMember() — every member
 * gets exactly one linked guest, and creating that guest never triggers a
 * second membership enrolment via Guest::created.
 */
class MemberPricingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SeedsDiscountFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpDiscountFixture();
    }

    public function test_it_quotes_in_the_bookings_currency_and_maps_the_persisted_columns(): void
    {
        $this->benefit('percent_discount', 10, 'services');
        $p = app(MemberPricing::class)->quote($this->member, 80, 'GBP', BookingScope::Services);
        $this->assertSame('GBP', $p->currency);
        $this->assertSame(72.0, $p->total);
        $cols = app(MemberPricing::class)->columns($p);
        $this->assertSame(['list_amount' => 80.0, 'discount_amount' => 8.0, 'discount_source' => 'tier_benefit', 'total_amount' => 72.0], array_intersect_key($cols, array_flip(['list_amount', 'discount_amount', 'discount_source', 'total_amount'])));
        $this->assertNotNull($cols['discount_source_id']);
    }

    public function test_consume_marks_an_applied_offer_used_and_leaves_an_outbid_one(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        $pricing = app(MemberPricing::class);
        $applied = $pricing->quote($this->member, 100, 'EUR', BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $pricing->consume($applied, 'SVC-TEST0001');
        $this->assertSame('SVC-TEST0001', MemberOffer::find($claim->id)->used_reference);

        $this->benefit('percent_discount', 50, 'all');
        $claim2 = $this->claimedOffer('discount', 5);
        $outbid = $pricing->quote($this->member, 100, 'EUR', BookingScope::Services, new CouponSelection(memberOfferId: $claim2->id));
        $this->assertSame('outbid', $outbid->coupon['status']);
        $pricing->consume($outbid, 'SVC-TEST0002');
        $this->assertNull(MemberOffer::find($claim2->id)->used_at);
    }

    public function test_a_member_without_a_tier_gets_the_list_price(): void
    {
        $this->member->forceFill(['tier_id' => null])->save();
        $p = app(MemberPricing::class)->quote($this->member->fresh(), 50, 'EUR', BookingScope::Services);
        $this->assertSame(0.0, $p->discount);
        $this->assertSame(50.0, $p->total);
    }

    public function test_ensure_guest_for_member_links_by_email_then_creates_once(): void
    {
        $svc = app(GuestMemberLinkService::class);
        $existing = Guest::withoutEvents(fn () => Guest::create(['organization_id' => $this->orgId, 'first_name' => 'Ada', 'last_name' => 'L', 'email' => 'ADA@example.test']));
        $g1 = $svc->ensureGuestForMember($this->member);
        $this->assertSame($existing->id, $g1->id);
        $this->assertSame($this->member->id, (int) $g1->member_id);
        $g2 = $svc->ensureGuestForMember($this->member);
        $this->assertSame($g1->id, $g2->id);
        $this->assertSame(1, Guest::withoutGlobalScopes()->where('organization_id', $this->orgId)->count());
    }

    public function test_creating_a_guest_for_a_member_never_enrols_a_second_membership(): void
    {
        // No existing guest at all (by member_id or by email) — the service
        // must create a fresh one. Because the create sets member_id up
        // front, Guest::created's auto-Bronze hook (see Guest::booted())
        // must see a linked guest and skip ensureMemberForGuest() entirely.
        $before = LoyaltyMember::where('organization_id', $this->orgId)->count();

        $svc = app(GuestMemberLinkService::class);
        $guest = $svc->ensureGuestForMember($this->member);

        $this->assertSame($this->member->id, (int) $guest->member_id);
        $this->assertSame($before, LoyaltyMember::where('organization_id', $this->orgId)->count());
    }

    /**
     * Task 21 (eyes first): on PostgreSQL `guests.full_name` is NOT NULL, and
     * the guest this service created carried only first/last name — so every
     * portal confirm by a member with no guest row yet failed with
     * `confirm_failed`. (The sqlite test schema declares the column nullable,
     * which is why nothing caught it; this asserts the value instead.)
     */
    public function test_a_created_guest_carries_the_members_full_name(): void
    {
        $this->member->user->forceFill(['name' => 'Clara Voss', 'email' => 'clara.t21@example.test'])->save();
        $guest = app(GuestMemberLinkService::class)->ensureGuestForMember($this->member->fresh());
        $this->assertSame('Clara Voss', $guest->full_name);
    }

    /**
     * Final review, Minor 1: `users.name` is longer than the guest columns
     * (first/last 100, full 200, email 150, phone 50 in
     * 2026_03_28_100001_create_crm_tables). PostgreSQL refuses an over-long
     * value, so an overlong name failed confirm; sqlite does not enforce
     * lengths, so this asserts what is written.
     */
    public function test_a_created_guest_is_clamped_to_the_guest_column_lengths(): void
    {
        $name = str_repeat('Ä', 150) . ' ' . str_repeat('Ö', 149); // 300 characters, multibyte
        $email = str_repeat('e', 150) . '@example.test';
        $this->member->user->forceFill(['name' => $name, 'email' => $email, 'phone' => str_repeat('7', 60)])->save();

        $guest = app(GuestMemberLinkService::class)->ensureGuestForMember($this->member->fresh());

        $this->assertSame(100, mb_strlen($guest->first_name));
        $this->assertSame(100, mb_strlen($guest->last_name));
        $this->assertSame(200, mb_strlen($guest->full_name));
        $this->assertSame(mb_substr($name, 0, 200), $guest->full_name);
        $this->assertSame(150, mb_strlen($guest->email));
        $this->assertSame(50, mb_strlen($guest->phone));
    }
}
