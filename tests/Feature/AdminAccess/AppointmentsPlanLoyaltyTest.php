<?php

namespace Tests\Feature\AdminAccess;

use App\Models\Guest;
use App\Models\User;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanLoyaltyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function onTheAppointmentsPlan(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
    }

    public function test_the_programme_is_off_whatever_tiers_exist(): void
    {
        $this->assertTrue(PortalBootstrap::loyaltyOn($this->org->id)); // the fixture's active Gold tier

        $this->onTheAppointmentsPlan();

        $this->assertFalse(PortalBootstrap::loyaltyOn($this->org->id));
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('loyalty.programme_on', false);
    }

    public function test_a_visit_earns_no_points(): void
    {
        $booking = $this->seedBooking(['member_id' => $this->member->id]);
        $this->assertNotSame('programme_off', app(BookingPointsService::class)->previewForServiceBooking($booking)['reason']);

        $this->onTheAppointmentsPlan();

        $this->assertSame(['points' => 0, 'reason' => 'programme_off'], app(BookingPointsService::class)->previewForServiceBooking($booking->fresh()));
    }

    public function test_a_new_client_with_an_email_stays_a_client(): void
    {
        // On a full plan Guest::created starts a membership, the member's sign-in first.
        Guest::create(['organization_id' => $this->org->id, 'full_name' => 'Full Plan', 'first_name' => 'Full', 'email' => 'full-plan@example.test']);
        $this->assertTrue(User::withoutGlobalScopes()->where('email', 'full-plan@example.test')->exists());

        $this->onTheAppointmentsPlan();

        // The widgets and the workspace both create guests; neither makes a member now.
        $guest = Guest::create(['organization_id' => $this->org->id, 'full_name' => 'Plan Only', 'first_name' => 'Plan', 'email' => 'plan-only@example.test']);
        $this->assertNull($guest->fresh()->member_id);
        $this->assertFalse(User::withoutGlobalScopes()->where('email', 'plan-only@example.test')->exists());

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Desk Client', 'email' => 'desk-client@example.test'])->assertSuccessful();
        $this->assertFalse(User::withoutGlobalScopes()->where('email', 'desk-client@example.test')->exists());
    }
}
