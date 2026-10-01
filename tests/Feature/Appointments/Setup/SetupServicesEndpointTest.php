<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupServicesEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_a_manager_creates_or_changes_a_service(): void
    {
        $staff = $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum');
        $staff->postJson($this->api('setup/services'), ['name' => 'X', 'duration_minutes' => 30, 'price' => 10])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $staff->patchJson($this->api("setup/services/{$this->service->id}"), ['price' => 1])->assertStatus(403);
        $staff->postJson($this->api('setup/categories'), ['name' => 'Hair'])->assertStatus(403);
    }

    public function test_a_manager_creates_a_service_with_who_performs_it(): void
    {
        $this->asStaff()->postJson($this->api('setup/services'), [
            'name' => 'Scalp Ritual', 'duration_minutes' => 30, 'price' => 40,
            'performers' => [['id' => $this->master->id, 'price' => 45]],
        ])->assertCreated()
            ->assertJsonPath('service.name', 'Scalp Ritual')
            ->assertJsonPath('service.performers.0.id', $this->master->id)
            ->assertJsonPath('service.performers.0.price', 45);
    }

    public function test_deactivating_previews_the_appointments_then_saves_and_says_them_again(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['is_active' => false])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('total', 1)->assertJsonPath('affected.0.id', $booking->id);
        $this->assertTrue((bool) Service::find($this->service->id)->is_active);

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}"), ['is_active' => false])
            ->assertOk()->assertJsonPath('service.is_active', false)->assertJsonPath('total', 1);
    }

    public function test_taking_a_person_off_a_service_previews_their_appointments_of_it(): void
    {
        $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['performers' => []])
            ->assertOk()->assertJsonPath('total', 1);
        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['performers' => [['id' => $this->master->id]]])
            ->assertOk()->assertJsonPath('total', 0);
    }

    public function test_a_dry_run_with_bad_input_is_a_422_not_an_empty_preview(): void
    {
        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}") . '?dry_run=1', ['duration_minutes' => 2, 'is_active' => false])
            ->assertStatus(422)->assertJsonValidationErrors('duration_minutes');
    }

    public function test_links_and_ids_must_be_this_organisations(): void
    {
        $foreign = $this->inOrganization($this->otherOrganization()->id, fn () => ServiceMaster::create(['name' => 'Foreign', 'is_active' => true]));

        $this->asStaff()->patchJson($this->api("setup/services/{$this->service->id}"), ['performers' => [['id' => $foreign->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('performers.0.id');
        $this->asStaff()->patchJson($this->api('setup/services/999999'), ['price' => 1])
            ->assertStatus(404)->assertJsonPath('error', 'service_not_found');
    }

    public function test_a_manager_adds_a_category(): void
    {
        $this->asStaff()->postJson($this->api('setup/categories'), ['name' => 'Hair'])
            ->assertCreated()->assertJsonPath('category.name', 'Hair');
    }
}
