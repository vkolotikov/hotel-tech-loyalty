<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** What HexaTech CRM reads before it draws anything (2026-11-07). */
class BootstrapTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    public function test_the_organisation_the_person_their_rights_and_what_waits(): void
    {
        DB::table('chat_widget_configs')->insert(['organization_id' => $this->org->id, 'widget_key' => 'wk-123', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->chat(['status' => 'waiting']);
        $this->chat(['status' => 'active']);
        $this->lead(['created_at' => now()->subHours(2)]);
        DB::table('tasks')->insert(['organization_id' => $this->org->id, 'title' => 'Call back', 'assigned_to' => $this->manager->id, 'due_at' => now()->subDay(), 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('bootstrap'))->assertOk()
            ->assertJsonPath('name', 'HexaTech CRM')
            ->assertJsonPath('organization.name', 'Harbour Clinic')
            ->assertJsonPath('venue.timezone', 'Europe/Riga')
            ->assertJsonPath('venue.today', '2026-11-04')
            ->assertJsonPath('features.chatbot', true)
            ->assertJsonPath('ai.status', 'unlimited')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('staff.can.manage_bot', true)
            ->assertJsonPath('staff.can.manage_pipelines', true)
            ->assertJsonPath('widget.key', 'wk-123')
            ->assertJsonPath('counts.chats_waiting', 1)
            ->assertJsonPath('counts.leads_new', 1)
            ->assertJsonPath('counts.tasks_due', 1)
            ->assertJsonPath('setup.total', 6);
    }

    public function test_staff_see_the_managers_changes_as_not_theirs(): void
    {
        $this->asStaffMember()->getJson($this->crmApi('bootstrap'))->assertOk()
            ->assertJsonPath('staff.role', 'staff')
            ->assertJsonPath('staff.can.manage_bot', false)
            ->assertJsonPath('staff.can.manage_widget', false)
            ->assertJsonPath('staff.can.manage_canned', false)
            ->assertJsonPath('staff.can.delete_records', true)
            ->assertJsonPath('widget', null)
            ->assertJsonPath('counts.tasks_due', 0);
    }

    public function test_a_plan_without_the_chatbot_says_so(): void
    {
        $this->org->forceFill(['plan_features' => ['engagement' => 'true']])->save();

        $this->asManager()->getJson($this->crmApi('bootstrap'))->assertOk()
            ->assertJsonPath('features.chatbot', false)
            ->assertJsonPath('features.engagement', true);
    }

    public function test_the_ai_allowance_is_the_organisations(): void
    {
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'ai_monthly_cost_cents' => '1000']])->save();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'gpt-4o-mini', 'feature' => 'website_chatbot', 'cost_cents' => 900, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('bootstrap'))->assertOk()
            ->assertJsonPath('ai.status', 'warn')
            ->assertJsonPath('ai.percent', 90);
    }
}
