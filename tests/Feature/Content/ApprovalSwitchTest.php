<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The approval switch (spec 2026-10-16 §6.1): per brand, default off, managers only, changing no post. */
class ApprovalSwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_switches_approvals_on_and_everyone_reads_it_in_the_brand_and_the_bootstrap(): void
    {
        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()->assertJsonPath('profile.requires_approval', false);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('profile.requires_approval', false);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => true])->assertOk()
            ->assertJsonPath('profile.requires_approval', true);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('profile.requires_approval', true);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => 'often'])->assertStatus(422)->assertJsonValidationErrors('requires_approval');
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['requires_approval' => false])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertTrue($this->profile->fresh()->requires_approval);
    }

    public function test_switching_changes_no_posts_status(): void
    {
        $approved = $this->makePost(['status' => 'approved']);
        $ready = $this->makePost(['status' => 'ready_to_publish']);

        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => true])->assertOk();
        $this->asManager()->putJson($this->api('brand/profile'), ['requires_approval' => false])->assertOk();

        $this->assertSame('approved', $approved->fresh()->status);
        $this->assertSame('ready_to_publish', $ready->fresh()->status);
    }
}
