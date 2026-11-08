<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * Another organisation's ids are refused where the workspace links records (round 2): a bare `exists:<table>,id`
 * accepted any organisation's row, so a lead, a task or a merge could point across tenants. OwnRows limits each to the
 * bound organisation.
 */
class ForeignIdsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private int $theirGuest;
    private int $theirLead;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();

        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        $this->theirGuest = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Someone Else', 'created_at' => now(), 'updated_at' => now()]);
        $this->theirLead = DB::table('inquiries')->insertGetId(['organization_id' => $other->id, 'guest_id' => $this->theirGuest, 'status' => 'New', 'next_task_completed' => false, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_task_cannot_point_at_another_organisations_lead_or_contact(): void
    {
        $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Call', 'type' => 'call', 'inquiry_id' => $this->theirLead, 'guest_id' => $this->theirGuest])
            ->assertStatus(422)->assertJsonValidationErrors(['inquiry_id', 'guest_id']);
        $this->assertSame(0, DB::table('tasks')->count());
    }

    public function test_a_lead_cannot_be_made_for_another_organisations_contact(): void
    {
        $this->asStaffMember()->postJson($this->adminApi('inquiries'), ['guest_id' => $this->theirGuest, 'status' => 'New'])
            ->assertStatus(422)->assertJsonValidationErrors(['guest_id']);
    }

    public function test_a_merge_names_only_this_organisations_contacts(): void
    {
        $ours = DB::table('guests')->insertGetId(['organization_id' => $this->org->id, 'full_name' => 'Ours', 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->postJson($this->adminApi('guests/merge'), ['winner_id' => $ours, 'loser_id' => $this->theirGuest])
            ->assertStatus(422)->assertJsonValidationErrors(['loser_id']);
    }
}
