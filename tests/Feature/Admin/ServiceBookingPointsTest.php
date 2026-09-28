<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use App\Models\PointsTransaction;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\MakesAdminCaller;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Both admin paths that can complete a service booking must award points
 * exactly once — the bulk action (a query-builder update, no model events)
 * and the single-status PATCH (a model update, events do fire but nothing
 * subscribes to them for points). Both call BookingPointsService explicitly
 * rather than through an observer (plan ruling, task-11-brief.md).
 */
class ServiceBookingPointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture, MakesAdminCaller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
    }

    public function test_bulk_and_single_completion_award_once(): void
    {
        $fixture = $this->seedPointsFixture();
        $org = Organization::withoutGlobalScopes()->find($fixture['orgId']);
        $member = $fixture['member'];
        $staff = $this->staffUser($org);

        $bulkBooking = $this->pointsBooking($org->id, $member, ['status' => 'confirmed']);
        $singleBooking = $this->pointsBooking($org->id, $member, ['status' => 'confirmed']);

        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$bulkBooking->id], 'action' => 'mark_complete'])
            ->assertOk();

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/service-bookings/{$singleBooking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame(2, PointsTransaction::where('member_id', $member->id)->count());
        $this->assertNotNull($bulkBooking->fresh()->points_awarded_at);
        $this->assertNotNull($singleBooking->fresh()->points_awarded_at);

        // Re-running either path again (already completed) must not
        // double-award -- the guard is points_awarded_at, not the request kind.
        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$bulkBooking->id], 'action' => 'mark_complete'])
            ->assertOk();
        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/service-bookings/{$singleBooking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame(2, PointsTransaction::where('member_id', $member->id)->count());
    }

    public function test_the_widget_booking_without_a_member_earns_nothing(): void
    {
        $fixture = $this->seedPointsFixture();
        $org = Organization::withoutGlobalScopes()->find($fixture['orgId']);
        $staff = $this->staffUser($org);

        $booking = $this->pointsBooking($org->id, $fixture['member'], [
            'member_id' => null,
            'status'    => 'confirmed',
        ]);

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/service-bookings/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame(0, PointsTransaction::count());
    }
}
