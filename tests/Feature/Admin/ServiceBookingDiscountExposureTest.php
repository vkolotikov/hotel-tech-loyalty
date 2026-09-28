<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\MakesAdminCaller;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Task 12: the admin service-bookings list/detail payload gains `member`
 * ({id, name, member_number} | null), `discount` ({amount, label} | null),
 * `list_amount` and `source` without renaming any existing key — the admin
 * SPA still reads booking_reference/status/total_amount/etc as before.
 * A portal booking (member_id set, discount_amount > 0) carries both; a
 * widget booking (no member, no discount) carries both as null.
 */
class ServiceBookingDiscountExposureTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture, MakesAdminCaller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
    }

    public function test_a_portal_booking_carries_member_and_discount_and_a_widget_booking_carries_neither(): void
    {
        $fixture = $this->seedPointsFixture();
        $org = Organization::withoutGlobalScopes()->find($fixture['orgId']);
        $member = $fixture['member'];
        $staff = $this->staffUser($org);

        $portalBooking = $this->pointsBooking($org->id, $member, [
            'source'          => 'member_portal',
            'discount_amount' => 6,
            'discount_label'  => 'Gold tier discount',
            'list_amount'     => 60,
        ]);
        $widgetBooking = $this->pointsBooking($org->id, $member, [
            'member_id'       => null,
            'source'          => 'widget',
            'discount_amount' => 0,
            'discount_label'  => null,
        ]);

        $rows = collect(
            $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/service-bookings')->assertOk()->json('data')
        )->keyBy('id');

        $this->assertSame('member_portal', $rows[$portalBooking->id]['source']);
        $this->assertSame(60.0, (float) $rows[$portalBooking->id]['list_amount']);
        $this->assertSame($member->id, $rows[$portalBooking->id]['member']['id']);
        $this->assertSame('Ada', $rows[$portalBooking->id]['member']['name']);
        $this->assertSame($member->member_number, $rows[$portalBooking->id]['member']['member_number']);
        $this->assertSame(6.0, (float) $rows[$portalBooking->id]['discount']['amount']);
        $this->assertSame('Gold tier discount', $rows[$portalBooking->id]['discount']['label']);

        $this->assertSame('widget', $rows[$widgetBooking->id]['source']);
        $this->assertNull($rows[$widgetBooking->id]['member']);
        $this->assertNull($rows[$widgetBooking->id]['discount']);

        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/service-bookings/{$portalBooking->id}")
            ->assertOk()
            ->assertJsonPath('member.id', $member->id)
            ->assertJsonPath('member.member_number', $member->member_number)
            ->assertJsonPath('discount.amount', 6)
            ->assertJsonPath('discount.label', 'Gold tier discount');

        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/service-bookings/{$widgetBooking->id}")
            ->assertOk()
            ->assertJsonPath('member', null)
            ->assertJsonPath('discount', null);
    }
}
