<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * HexaTech CRM's AI usage (round 5, 2026-11-12): CRM packages are sold by their AI allowance, so a manager of an
 * organisation on CRM alone sees this month's spend against it (`admin/crm/ai-usage`, AccessMap manager / crm), by
 * feature and by the venue's day — the organisation's own ledger only.
 */
class AiUsageTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['admin_access.mode' => 'enforce']);
        $this->org->forceFill([
            'entitled_products' => ['crm_chat'],
            'plan_features'     => ['chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '2500'],
        ])->save();
    }

    private function spend(int $orgId, string $at, string $feature, int $cents): void
    {
        DB::table('ai_usage_logs')->insert(['organization_id' => $orgId, 'model' => 'claude-haiku-4-5', 'kind' => 'chat', 'feature' => $feature,
            'input_tokens' => 100, 'output_tokens' => 50, 'cost_cents' => $cents, 'created_at' => $at]);
    }

    public function test_a_crm_only_manager_sees_the_months_spend_by_feature_and_by_the_venues_day_against_the_allowance(): void
    {
        $this->spend($this->org->id, '2026-11-02 10:00:00', 'website_chatbot', 300);
        $this->spend($this->org->id, '2026-11-03 23:30:00', 'crm_draft', 200);   // 01:30 on the 4th in Riga
        $this->spend($this->org->id, '2026-11-04 09:00:00', 'website_chatbot', 500);
        $this->spend($this->org->id, '2026-10-31 23:00:00', 'website_chatbot', 9000); // last month's allowance

        $usage = $this->asManager()->getJson($this->crmApi('ai-usage'))->assertOk();

        $this->assertSame(['status' => 'under', 'used_cents' => 1000, 'cap_cents' => 2500, 'percent' => 40], $usage->json('budget'));
        $this->assertSame(['modules' => ['crm'], 'tiers' => ['crm' => 'standard']], $usage->json('plan'));
        $this->assertSame([['website_chatbot', 800, 2], ['crm_draft', 200, 1]],
            array_map(fn ($r) => [$r['feature'], $r['cost_cents'], $r['calls']], $usage->json('by_feature')));
        $this->assertSame([['2026-11-01', 0, 0], ['2026-11-02', 300, 1], ['2026-11-03', 0, 0], ['2026-11-04', 700, 2]],
            array_map(fn ($r) => [$r['day'], $r['cost_cents'], $r['calls']], $usage->json('by_day')));
        $this->assertSame(['2026-11', '2026-11-04', 3], [$usage->json('month'), $usage->json('today'), $usage->json('calls')]);
    }

    public function test_another_organisations_spend_never_shows(): void
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        $this->spend($other->id, '2026-11-03 12:00:00', 'website_chatbot', 4000);

        $usage = $this->asManager()->getJson($this->crmApi('ai-usage'))->assertOk();
        $this->assertSame([0, [], 0], [$usage->json('budget.used_cents'), $usage->json('by_feature'), array_sum(array_column($usage->json('by_day'), 'cost_cents'))]);
    }

    public function test_a_staff_member_and_another_module_are_refused(): void
    {
        $this->asStaffMember()->getJson($this->crmApi('ai-usage'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();
        $this->asManager()->getJson($this->crmApi('ai-usage'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }
}
