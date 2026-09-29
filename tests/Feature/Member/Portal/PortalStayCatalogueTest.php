<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BookingRoom;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalStayCatalogueTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const ROOMS = '/api/v1/member/portal/stays';
    private const FREE = '/api/v1/member/portal/stays/availability';

    protected function setUp(): void
    {
        parent::setUp();
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone')->nullable());
        }
        $this->setUpStayPortal();
    }

    private function free(array $query = [])
    {
        return $this->withToken($this->token)->getJson(self::FREE . '?' . http_build_query(array_merge(['check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0], $query)));
    }

    public function test_the_catalogue_lists_rooms_extras_policies_and_limits(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Closed wing', 'slug' => 'closed', 'is_active' => false]);
        app()->forgetInstance('current_organization_id');
        $this->setting('booking_policies', json_encode(['check_in_time' => '16:00', 'check_out_time' => '10:00', 'cancellation_policy' => 'Free until two days before.']));
        $this->setting('booking_min_nights', '2');
        $this->setting('booking_max_nights', '14');
        $this->setting('booking_cancel_hours', '48');
        $this->tenPercentOnStays();

        $json = $this->withToken($this->token)->getJson(self::ROOMS)->assertOk()->json();

        $this->assertSame(['101'], array_column($json['rooms'], 'id'), 'inactive rooms are not offered');
        $this->assertSame('Sea view', $json['rooms'][0]['name']);
        $this->assertSame(2, $json['rooms'][0]['max_guests']);
        $this->assertEquals(100.0, $json['rooms'][0]['base_price']);
        $this->assertSame((string) $extra->id, $json['extras'][0]['id']);
        $this->assertEquals(15.0, $json['extras'][0]['price']);
        $this->assertSame('16:00', $json['policies']['check_in_time']);
        $this->assertSame('Free until two days before.', $json['policies']['cancellation_policy']);
        $this->assertSame(48, $json['policies']['cancel_hours']);
        $this->assertSame(['currency' => 'EUR', 'min_nights' => 2, 'max_nights' => 14], $json['rules']);
        $this->assertSame('10% off stays', $json['pricing']['automatic']['label']);
        $this->assertSame('at_venue', $json['payment']['mode']);
        $this->assertArrayNotHasKey('style', $json, 'the widget\'s styling is not the portal\'s');
    }

    public function test_a_venue_without_rooms_or_with_smoobu_off_answers_not_bookable(): void
    {
        $this->setting('smoobu_enabled', 'false');
        $this->withToken($this->token)->getJson(self::ROOMS)->assertStatus(404)->assertJsonPath('error', 'not_bookable');

        $this->setting('smoobu_enabled', 'true');
        $this->flushHeaders();
        BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);
        $this->withToken($this->token)->getJson(self::ROOMS)->assertStatus(404)->assertJsonPath('error', 'not_bookable');
    }

    public function test_availability_lists_free_rooms_with_the_member_total(): void
    {
        $this->smoobuRates(200.0);
        $this->tenPercentOnStays();

        $json = $this->free()->assertOk()->json();

        $this->assertSame(2, $json['nights']);
        $this->assertFalse($json['party_too_large']);
        $this->assertCount(1, $json['rooms']);
        $this->assertSame('101', $json['rooms'][0]['id']);
        $this->assertEquals(200.0, $json['rooms'][0]['total_price']);
        $this->assertEquals(180.0, $json['rooms'][0]['member_total']);
        $this->assertEquals(100.0, $json['rooms'][0]['price_per_night']);
        $this->assertSame('EUR', $json['rooms'][0]['currency']);
        $this->assertArrayNotHasKey('combinations', $json, 'combination stays are not sold in the portal (plan3-1)');
    }

    public function test_a_party_too_large_for_any_room_is_told_so(): void
    {
        $this->smoobuRates(200.0);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden']);
        app()->forgetInstance('current_organization_id');
        $this->smoobu->shouldReceive('getRates')->andReturn(['data' => [
            '101' => ['available' => true, 'price' => 200.0, 'min_stay' => 1],
            '102' => ['available' => true, 'price' => 180.0, 'min_stay' => 1],
        ]]);

        $json = $this->free(['adults' => 4])->assertOk()->json();

        $this->assertSame([], $json['rooms']);
        $this->assertTrue($json['party_too_large']);
    }

    public function test_a_stay_outside_the_venues_limits_is_refused(): void
    {
        $this->setting('booking_min_nights', '3');
        $this->free()->assertStatus(422)->assertJsonPath('error', 'invalid_stay');

        $this->setting('booking_min_nights', '1');
        $this->setting('booking_max_nights', '5');
        $this->flushHeaders();
        $this->free(['check_out' => now()->addDays(20)->toDateString()])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
    }

    public function test_a_check_in_in_the_past_is_refused(): void
    {
        $this->free(['check_in' => now()->subDay()->toDateString()])->assertStatus(422);
    }

    public function test_a_venue_with_a_broken_timezone_still_answers(): void
    {
        \Illuminate\Support\Facades\DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Mars/Olympus']);
        $this->smoobuRates(200.0);
        $this->free()->assertOk();
    }
}
