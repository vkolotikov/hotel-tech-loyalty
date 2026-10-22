<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingRoom;
use App\Services\BookingEngineService;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

/**
 * R4-3 (owner, 2026-10-22, "charge correctly"): a stay's extra is charged as
 * the full admin sets it (Bookings → Extras, `price_type`), in the engine's
 * extrasLines() that the public widget's quote and the member portal's quote
 * both price with:
 *
 *   per_stay          price × quantity
 *   per_night         price × nights × quantity
 *   per_person        price × guests × quantity   (guests = adults + children)
 *   per_person_night  price × guests × nights × quantity
 *
 * `per_guest` (a legacy type, never offered by the admin screen) is priced as
 * `per_person`. The fixture's stay is two nights in room 101 at 200.00;
 * Smoobu is a Mockery mock (StayPortalFixture).
 */
class StayExtrasPricingTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates(200.0);
        BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['max_guests' => 4]);
    }

    private function extra(string $type, float $price, string $name = 'Extra'): string
    {
        app()->instance('current_organization_id', $this->org->id);
        $id = (string) $this->seedStayExtra($this->org->id, ['name' => $name, 'price' => $price, 'price_type' => $type])->id;
        app()->forgetInstance('current_organization_id');

        return $id;
    }

    /** The public widget's own quote (POST /api/v1/booking/quote with the venue's widget token). */
    private function widgetQuote(array $body)
    {
        $res = $this->postJson('/api/v1/booking/quote?org=' . $this->org->fresh()->widget_token, array_merge([
            'unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 1,
        ], $body));
        app()->forgetInstance('current_organization_id');

        return $res;
    }

    private function portalQuote(array $body)
    {
        $res = $this->withToken($this->token)->postJson('/api/v1/member/portal/stays/quote', array_merge([
            'unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 1,
        ], $body));
        app()->forgetInstance('current_organization_id');

        return $res;
    }

    /** [type, price, quantity, adults, children, what the extra costs for the two nights] */
    public static function charged(): array
    {
        return [
            'per stay'                         => ['per_stay', 15.0, 1, 2, 1, 15.0],
            'per stay, two of them'            => ['per_stay', 15.0, 2, 2, 1, 30.0],
            'per night'                        => ['per_night', 10.0, 1, 2, 1, 20.0],
            'per night, two of them'           => ['per_night', 10.0, 2, 2, 1, 40.0],
            'per person: adults and children'  => ['per_person', 5.0, 1, 2, 1, 15.0],
            'per person: one adult'            => ['per_person', 5.0, 1, 1, 0, 5.0],
            'per person per night'             => ['per_person_night', 5.0, 1, 2, 1, 30.0],
            'per person per night, two'        => ['per_person_night', 5.0, 2, 2, 2, 80.0],
            'legacy per guest, as per person'  => ['per_guest', 4.0, 1, 2, 1, 12.0],
            'cents: per person per night'      => ['per_person_night', 12.35, 1, 3, 0, 74.10],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('charged')]
    public function test_the_widget_charges_each_extra_as_it_is_set(string $type, float $price, int $quantity, int $adults, int $children, float $expected): void
    {
        $id = $this->extra($type, $price);

        $res = $this->widgetQuote(['adults' => $adults, 'children' => $children, 'extras' => [['id' => $id, 'quantity' => $quantity]]])->assertOk();

        $this->assertEqualsWithDelta($expected, $res->json('extras_total'), 0.001);
        $this->assertEqualsWithDelta(200.0 + $expected, $res->json('gross_total'), 0.001);
        $payload = BookingHold::withoutGlobalScopes()->where('hold_token', $res->json('hold_token'))->sole()->payload_json;
        $this->assertEqualsWithDelta($expected, $payload['extras_total'], 0.001, 'the hold keeps what the payment charges');
        $this->assertEqualsWithDelta(200.0 + $expected, $payload['gross_total'], 0.001);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('charged')]
    public function test_the_portal_charges_each_extra_as_the_widget_does(string $type, float $price, int $quantity, int $adults, int $children, float $expected): void
    {
        $id = $this->extra($type, $price);

        $json = $this->portalQuote(['adults' => $adults, 'children' => $children, 'extras' => [['id' => $id, 'quantity' => $quantity]]])->assertOk()->json();

        $this->assertEqualsWithDelta($expected, $json['lines']['extras_total'], 0.001);
        $this->assertEqualsWithDelta($expected, $json['lines']['extras'][0]['line_total'], 0.001);
        $this->assertSame($quantity, $json['lines']['extras'][0]['quantity']);
        $this->assertEqualsWithDelta($expected / $quantity, $json['lines']['extras'][0]['unit_price'], 0.001, 'one of the extra, for this stay');
        $this->assertEqualsWithDelta(200.0 + $expected, $json['list_amount'], 0.001);
    }

    /** Several extras of every type in one stay: the lines add up to the engine's own total, in both. */
    public function test_a_stay_with_every_type_adds_up_the_same_in_the_widget_and_the_portal(): void
    {
        $extras = [
            ['id' => $this->extra('per_stay', 15.0, 'Late check-out'), 'quantity' => 1],
            ['id' => $this->extra('per_night', 7.10, 'Parking'), 'quantity' => 1],
            ['id' => $this->extra('per_person', 12.35, 'Welcome drink'), 'quantity' => 1],
            ['id' => $this->extra('per_person_night', 9.0, 'Breakfast'), 'quantity' => 2],
        ];
        // 15 + 7.10×2 + 12.35×3 + 9×3×2×2 = 15 + 14.20 + 37.05 + 108 = 174.25
        $widget = $this->widgetQuote(['extras' => $extras])->assertOk();
        $portal = $this->portalQuote(['extras' => $extras])->assertOk()->json();

        $this->assertEqualsWithDelta(174.25, $widget->json('extras_total'), 0.001);
        $this->assertEqualsWithDelta(174.25, $portal['lines']['extras_total'], 0.001);
        $this->assertEqualsWithDelta(174.25, array_sum(array_column($portal['lines']['extras'], 'line_total')), 0.001);
        $this->assertSame([15.0, 14.2, 37.05, 108.0], array_map(fn ($l) => round((float) $l['line_total'], 2), $portal['lines']['extras']));
    }

    /** The engine's own lines, read directly: a type it does not know is charged once per stay, as before. */
    public function test_a_type_the_admin_cannot_save_is_charged_per_stay_and_the_spelled_out_alias_per_person_per_night(): void
    {
        $unknown = $this->extra('per_booking', 20.0);
        $alias = $this->extra('per_person_per_night', 5.0);
        $stay = $this->extra('per_stay', 3.0);
        app()->instance('current_organization_id', $this->org->id);

        // Two adults and a child, two nights.
        $lines = app(BookingEngineService::class)->extrasLines([
            ['id' => $unknown, 'quantity' => 1], ['id' => $alias, 'quantity' => 1], ['id' => $stay, 'quantity' => 2],
        ], 2, 1, 2);

        $this->assertSame([20.0, 30.0, 6.0], array_map(fn ($l) => round((float) $l['line_total'], 2), $lines));
        $this->assertSame([20.0, 30.0, 3.0], array_map(fn ($l) => round((float) $l['unit_price'], 2), $lines));
    }

    /** The legacy `booking_extras` setting (a venue with no extras table rows) is priced by the same rule, its `type` key read as before. */
    public function test_the_legacy_extras_setting_is_charged_by_the_same_rule(): void
    {
        $this->setting('booking_extras', json_encode([
            ['id' => 'legacy-night', 'name' => 'Parking', 'price' => 6, 'type' => 'per_night'],
            ['id' => 'legacy-guest', 'name' => 'Spa pass', 'price' => 10, 'type' => 'per_guest'],
            ['id' => 'legacy-plain', 'name' => 'Flowers', 'price' => 25],
        ]));

        $res = $this->widgetQuote(['extras' => [['id' => 'legacy-night', 'quantity' => 1], ['id' => 'legacy-guest', 'quantity' => 1], ['id' => 'legacy-plain', 'quantity' => 1]]])->assertOk();

        // 6×2 nights + 10×3 guests + 25 once
        $this->assertEqualsWithDelta(67.0, $res->json('extras_total'), 0.001);
    }
}
