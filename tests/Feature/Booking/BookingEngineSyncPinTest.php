<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/** What the five-minute Smoobu sync may and may not overwrite on a mirror we wrote ourselves. */
class BookingEngineSyncPinTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private BookingEngineService $engine;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([])->byDefault();
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

    private function mirror(array $attrs = []): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => '777001', 'booking_reference' => 'BK-SYNC0001',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'guest_email' => 'ada@example.test', 'guest_name' => 'Ada Lovelace',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 180, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue', 'member_id' => 41,
        ], $attrs));
    }

    /** What Smoobu sends back for the same reservation. */
    private function smoobu(array $over = []): array
    {
        return array_merge([
            'id' => 777001, 'reference-id' => 'BK-SYNC0001', 'type' => 'reservation',
            'arrival' => now()->addDays(10)->toDateString(), 'departure' => now()->addDays(12)->toDateString(),
            'apartment' => ['id' => 101, 'name' => 'Sea view'], 'channel' => ['id' => 7, 'name' => 'Direct booking'],
            'guest-name' => 'Ada Lovelace', 'email' => 'ada@example.test', 'adults' => 2, 'children' => 0,
            'price' => 180, 'price-paid' => 'No',
        ], $over);
    }

    /** A member of the venue: guests.member_id is a foreign key in production, so the member's guest names a real one. */
    private function member(): LoyaltyMember
    {
        $this->setUpLoyaltySchema();
        $tier = LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 0, 'is_active' => true]);
        $user = User::create(['name' => 'Ada L', 'email' => 'member-' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->org->id]);

        return LoyaltyMember::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-' . uniqid(),
            'qr_code_token' => bin2hex(random_bytes(16)), 'referral_code' => strtoupper(bin2hex(random_bytes(4)))]);
    }

    public function test_the_sync_keeps_the_portal_fields(): void
    {
        $member = $this->member();
        $guest = Guest::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'first_name' => 'Ada', 'last_name' => 'L', 'full_name' => 'Ada L', 'email' => 'members-own@example.test', 'member_id' => $member->id]);
        $mirror = $this->mirror(['guest_id' => $guest->id, 'discount_amount' => 20, 'list_total' => 200, 'discount_label' => 'Gold', 'member_id' => $member->id]);

        $this->engine->upsertBookingFromData($this->smoobu());

        $fresh = $mirror->fresh();
        $this->assertSame('Member portal', $fresh->channel_name);
        $this->assertSame($guest->id, (int) $fresh->guest_id, 'the email lookup found no guest; the member\'s link must survive');
        $this->assertSame($member->id, (int) $fresh->member_id);
        $this->assertEquals(20.0, (float) $fresh->discount_amount);
        $this->assertSame('open', $fresh->payment_status);
    }

    public function test_the_sync_still_keeps_website_for_a_widget_booking(): void
    {
        $mirror = $this->mirror(['channel_name' => 'Website', 'member_id' => null]);
        $this->engine->upsertBookingFromData($this->smoobu());
        $this->assertSame('Website', $mirror->fresh()->channel_name);
    }

    public function test_the_sync_relabels_a_booking_it_did_not_write(): void
    {
        $mirror = $this->mirror(['channel_name' => 'Airbnb', 'member_id' => null, 'payment_status' => 'channel_managed']);
        $this->engine->upsertBookingFromData($this->smoobu(['channel' => ['id' => 3, 'name' => 'Booking.com']]));
        $this->assertSame('Booking.com', $mirror->fresh()->channel_name);
    }

    /** capture_expired and the legacy US spelling ('canceled') are both on the pin list. */
    public function test_a_refund_and_an_authorisation_are_never_overwritten(): void
    {
        foreach (['refunded', 'partially_refunded', 'disputed', 'cancelled', 'canceled', 'authorized', 'capture_expired'] as $i => $status) {
            $mirror = $this->mirror(['reservation_id' => (string) (777100 + $i), 'payment_status' => $status, 'price_paid' => 45, 'stripe_payment_intent_id' => 'pi_' . $status]);
            $this->engine->upsertBookingFromData($this->smoobu(['id' => 777100 + $i, 'price-paid' => 'Yes']));
            $fresh = $mirror->fresh();
            $this->assertSame($status, $fresh->payment_status, $status);
            $this->assertEquals(45.0, (float) $fresh->price_paid, $status . ' price_paid');
        }
    }

    /** A widget stay's failed first capture is pinned too, not just a member's. */
    public function test_a_widgets_failed_capture_stays_authorized_through_a_sync(): void
    {
        $mirror = $this->mirror(['channel_name' => 'Website', 'member_id' => null, 'payment_status' => 'authorized', 'price_paid' => 0, 'stripe_payment_intent_id' => 'pi_widget_auth']);
        $this->engine->upsertBookingFromData($this->smoobu(['price-paid' => 'Yes']));
        $this->assertSame('authorized', $mirror->fresh()->payment_status);
    }

    public function test_a_member_stay_paid_at_the_venue_becomes_paid_when_smoobu_says_so(): void
    {
        $mirror = $this->mirror();
        $this->engine->upsertBookingFromData($this->smoobu(['price-paid' => 'Yes']));
        $this->assertSame('paid', $mirror->fresh()->payment_status);
    }

    /** price_paid is pinned alongside payment_status. */
    public function test_a_member_stay_paid_online_is_not_reopened_by_smoobu(): void
    {
        $mirror = $this->mirror(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_paid', 'price_paid' => 180]);
        $this->engine->upsertBookingFromData($this->smoobu(['price-paid' => 'No']));
        $fresh = $mirror->fresh();
        $this->assertSame('paid', $fresh->payment_status);
        $this->assertEquals(180.0, (float) $fresh->price_paid);
    }

    public function test_a_member_cancellation_is_not_resurrected(): void
    {
        $mirror = $this->mirror(['internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => 'member_portal']);
        $this->engine->upsertBookingFromData($this->smoobu()); // Smoobu still says "reservation": its own cancel failed
        $fresh = $mirror->fresh();
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('cancelled', $fresh->booking_state);
    }

    /** A member's own notice survives an empty Smoobu notice. */
    public function test_the_sync_keeps_a_members_notice_when_smoobu_sends_none(): void
    {
        $mirror = $this->mirror(['notice' => 'Quiet room please']);
        $this->engine->upsertBookingFromData($this->smoobu());
        $this->assertSame('Quiet room please', $mirror->fresh()->notice);
    }

    /** A real Smoobu notice still wins over a member's own. */
    public function test_the_sync_still_lets_a_real_smoobu_notice_win(): void
    {
        $mirror = $this->mirror(['notice' => 'Quiet room please']);
        $this->engine->upsertBookingFromData($this->smoobu(['notice' => 'Extra towels']));
        $this->assertSame('Extra towels', $mirror->fresh()->notice);
    }

    public function test_the_sync_keeps_a_members_own_price_elements_even_when_the_price_changed(): void
    {
        $this->smoobu->shouldReceive('getPriceElements')->never();
        $mirror = $this->mirror(['price_total' => 180]);
        BookingPriceElement::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'booking_mirror_id' => $mirror->id, 'reservation_id' => '777001',
            'element_type' => 'accommodation', 'name' => 'Sea view', 'amount' => 200, 'quantity' => 2, 'currency_code' => 'EUR', 'sort_order' => 0,
        ]);
        BookingPriceElement::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'booking_mirror_id' => $mirror->id, 'reservation_id' => '777001',
            'element_type' => 'discount', 'name' => 'Gold', 'amount' => -20, 'quantity' => 1, 'currency_code' => 'EUR', 'sort_order' => 1,
        ]);

        $this->engine->upsertBookingFromData($this->smoobu(['price' => 190]));

        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation', 'discount'], $rows->pluck('element_type')->all());
        $this->assertEquals(-20.0, (float) $rows[1]->amount);
    }
}
