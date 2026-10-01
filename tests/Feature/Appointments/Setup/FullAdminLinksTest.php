<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The full admin may link only its own organisation's rows (before: any organisation's id passed `exists`). */
class FullAdminLinksTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_team_member_cannot_be_given_another_organisations_service(): void
    {
        $other = $this->otherOrganization();
        $foreign = $this->inOrganization($other->id, fn () => Service::create(['name' => 'Foreign', 'duration_minutes' => 30, 'price' => 10, 'is_active' => true]));

        $this->asStaff()->postJson('/api/v1/admin/service-masters', ['name' => 'Ilze', 'service_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors('service_ids.0');
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", ['service_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors('service_ids.0');

        $this->asStaff()->postJson('/api/v1/admin/service-masters', ['name' => 'Ilze', 'service_ids' => [$this->service->id]])
            ->assertCreated();
    }

    public function test_a_service_cannot_be_given_another_organisations_team_member_or_category(): void
    {
        $other = $this->otherOrganization();
        $foreignMaster = $this->inOrganization($other->id, fn () => ServiceMaster::create(['name' => 'Foreign', 'is_active' => true]));
        $foreignCategory = $this->inOrganization($other->id, fn () => ServiceCategory::create(['name' => 'Foreign']));

        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['master_ids' => [$foreignMaster->id]])
            ->assertStatus(422)->assertJsonValidationErrors('master_ids.0');
        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['category_id' => $foreignCategory->id])
            ->assertStatus(422)->assertJsonValidationErrors('category_id');
        $this->asStaff()->postJson('/api/v1/admin/services', ['name' => 'X', 'duration_minutes' => 30, 'price' => 10, 'master_ids' => [$foreignMaster->id]])
            ->assertStatus(422)->assertJsonValidationErrors('master_ids.0');

        $this->asStaff()->putJson("/api/v1/admin/services/{$this->service->id}", ['master_ids' => [$this->master->id]])
            ->assertOk();
    }
}
