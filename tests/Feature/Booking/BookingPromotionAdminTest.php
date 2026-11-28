<?php

namespace Tests\Feature\Booking;

use App\Models\BookingPromotion;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class BookingPromotionAdminTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpAvailabilitySchema();
        $this->org->update(['timezone' => 'Europe/Riga']);
        if (!Schema::hasTable('booking_promotions')) (require database_path('migrations/2026_11_13_120000_create_booking_promotions.php'))->up();
    }

    private function body(array $overrides = []): array
    {
        return $overrides + ['name' => 'Black Friday', 'code' => 'blackfor15', 'type' => 'percentage', 'value' => 15, 'status' => 'published',
            'booking_from' => '2026-11-27T00:00', 'booking_until' => '2026-11-28T00:00', 'stay_from' => null, 'stay_until' => null,
            'room_ids' => [], 'excluded_dates' => [['from' => '2026-12-31', 'until' => '2026-12-31']], 'min_nights' => 1];
    }

    public function test_manager_controls_dates_in_venue_time_and_edits_are_revision_checked(): void
    {
        $r = $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body())->assertCreated()->assertJsonPath('code', 'BLACKFOR15')->assertJsonPath('booking_from', '2026-11-27T00:00');
        $id = $r->json('id');
        $p = BookingPromotion::withoutGlobalScopes()->findOrFail($id);
        $this->assertSame('2026-11-26T22:00:00+00:00', $p->booking_from->toIso8601String());
        $this->asStaff()->putJson('/api/v1/admin/booking-promotions/' . $id, $this->body(['revision' => 1, 'status' => 'paused']))->assertOk()->assertJsonPath('revision', 2);
        $this->asStaff()->putJson('/api/v1/admin/booking-promotions/' . $id, $this->body(['revision' => 1]))->assertStatus(409)->assertJsonPath('code', 'stale');
        $this->asStaff()->getJson('/api/v1/admin/booking-promotions')->assertOk()->assertJsonPath('timezone', 'Europe/Riga')->assertJsonPath('promotions.0.state', 'paused');
    }

    public function test_receptionist_cannot_read_or_change_promotions(): void
    {
        $receptionist = $this->staffUser($this->org, ['role' => 'receptionist']);
        $this->actingAs($receptionist, 'sanctum')->postJson('/api/v1/admin/booking-promotions', $this->body())->assertForbidden();
        $this->actingAs($receptionist, 'sanctum')->getJson('/api/v1/admin/booking-promotions')->assertForbidden();
    }

    public function test_published_dates_and_excluded_range_are_validated(): void
    {
        $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body(['booking_from' => null]))->assertStatus(422);
        $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body(['excluded_dates' => [['from' => '2026-12-31', 'until' => '2026-12-30']]]))->assertStatus(422);
        $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body(['value' => 101]))->assertStatus(422);
    }

    public function test_promotion_updates_cannot_cross_organizations(): void
    {
        $r = $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body())->assertCreated();
        $other = Organization::create(['name' => 'Other venue', 'slug' => 'other-promo-venue']);
        $otherStaff = $this->staffUser($other);
        $this->actingAs($otherStaff, 'sanctum')->putJson('/api/v1/admin/booking-promotions/' . $r->json('id'), $this->body(['revision' => 1]))->assertNotFound();
    }

    public function test_a_campaign_can_be_paused_after_one_of_its_rooms_is_deactivated(): void
    {
        $room = \App\Models\BookingRoom::forceCreate(['organization_id' => $this->org->id, 'name' => 'Old lodge', 'slug' => 'old-lodge', 'is_active' => true, 'max_guests' => 2, 'currency' => 'EUR']);
        $r = $this->asStaff()->postJson('/api/v1/admin/booking-promotions', $this->body(['room_ids' => [$room->id]]))->assertCreated();
        $room->update(['is_active' => false]);
        $this->asStaff()->putJson('/api/v1/admin/booking-promotions/' . $r->json('id'), $this->body(['revision' => 1, 'status' => 'paused', 'room_ids' => [$room->id]]))->assertOk();
        $this->asStaff()->putJson('/api/v1/admin/booking-promotions/' . $r->json('id'), $this->body(['revision' => 2, 'status' => 'published', 'room_ids' => [$room->id]]))->assertStatus(422);
        $this->asStaff()->getJson('/api/v1/admin/booking-promotions')->assertOk()->assertJsonPath('rooms.0.is_active', false);
    }
}
