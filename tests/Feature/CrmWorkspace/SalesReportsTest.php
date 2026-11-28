<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpCrmReports;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The full admin's sales reports in HexaTech CRM (round 5, owner 2026-11-12): `crm/reports/*` answer from the same code
 * as the full admin's `reporting/*` and `analytics/inquiry-funnel` (SalesReports), under the Reports page's rule
 * (`can_view_analytics`), for an organisation on the CRM module too — this organisation's leads only, in the chosen
 * brand, and a company's reservations only where bookings are the organisation's.
 */
class SalesReportsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace, SetsUpCrmReports;

    private int $open;
    private int $won;
    private int $lost;
    private int $price;
    /** @var array<string, int> */
    private array $leads = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCrmReports();
        $this->staffMember->forceFill(['name' => 'Anna Berzina'])->save();

        $pipeline = DB::table('pipelines')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Sales', 'slug' => 'sales-' . uniqid(), 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        $stage = fn (string $name, string $kind, int $order, ?int $chance) => DB::table('pipeline_stages')->insertGetId(['organization_id' => $this->org->id, 'pipeline_id' => $pipeline, 'name' => $name, 'slug' => strtolower($name), 'kind' => $kind, 'sort_order' => $order, 'default_win_probability' => $chance, 'created_at' => now(), 'updated_at' => now()]);
        $this->open = $stage('New', 'open', 1, 50);
        $this->won = $stage('Booked', 'won', 2, null);
        $this->lost = $stage('Gone', 'lost', 3, null);
        $this->price = DB::table('inquiry_lost_reasons')->insertGetId(['organization_id' => $this->org->id, 'label' => 'Price', 'slug' => 'price', 'created_at' => now(), 'updated_at' => now()]);

        $acme = $this->company('Acme');
        $beta = $this->company('Beta');
        // Created 3 days ago (the helper), so all in every window. 4 November 2026 is the fixed day.
        $this->leads['a'] = $this->lead(['status' => 'New', 'source' => 'website', 'total_value' => 1000, 'pipeline_stage_id' => $this->open, 'assigned_to' => 'Anna Berzina', 'corporate_account_id' => $acme]);
        $this->leads['b'] = $this->lead(['status' => 'Confirmed', 'source' => 'chat', 'total_value' => 500, 'pipeline_stage_id' => $this->won, 'corporate_account_id' => $acme]);
        $this->leads['c'] = $this->lead(['status' => 'Lost', 'source' => 'website', 'total_value' => 200, 'pipeline_stage_id' => $this->lost, 'lost_reason_id' => $this->price, 'corporate_account_id' => $beta]);
        $this->leads['d'] = $this->lead(['status' => 'Lost', 'source' => 'website', 'pipeline_stage_id' => $this->lost]);
        $this->leads['e'] = $this->lead(['status' => 'Proposal Sent', 'source' => 'referral', 'total_value' => 400, 'pipeline_stage_id' => $this->open, 'ai_win_probability' => 80, 'check_in' => '2026-12-10', 'assigned_to' => 'Anna Berzina']);

        $this->activity(['inquiry_id' => $this->leads['a'], 'type' => 'call', 'created_by' => $this->staffMember->id, 'occurred_at' => now()->subDay()]);
        $this->activity(['inquiry_id' => $this->leads['a'], 'type' => 'task_completed', 'created_by' => $this->staffMember->id, 'occurred_at' => now()->subDays(2)]);
        $this->activity(['inquiry_id' => $this->leads['b'], 'type' => 'note', 'created_by' => $this->manager->id, 'occurred_at' => now()->subDays(40)]);
    }

    private function report(string $name, string $query = ''): array
    {
        return $this->asManager()->getJson($this->crmApi("reports/{$name}{$query}"))->assertOk()->json();
    }

    public function test_a_crm_only_organisation_reads_every_report_from_its_leads(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();

        $funnel = $this->report('funnel', '?months=6');
        $this->assertSame([3, 2, 2, 2, 1, 1, 1], array_column($funnel['stages'], 'count'), 'everyone who reached a stage or a later one');
        $this->assertSame([1, 2, 33.3], [$funnel['won'], $funnel['lost'], $funnel['win_rate_pct']]);

        $forecast = $this->report('forecast', '?months=3');
        $this->assertEquals(1400, $forecast['total_gross']);
        $this->assertEquals(820, $forecast['total_expected'], '1000 at the stage\'s 50 %, 400 at the AI\'s 80 %');
        $this->assertSame(['2026-11', '2026-12', '2027-01', 'beyond'], array_column($forecast['buckets'], 'key'));
        $this->assertSame(2, $forecast['buckets'][1]['deal_count']);

        $lost = $this->report('lost-reasons');
        $this->assertSame([['Price', 1, 200.0], ['Unspecified', 1, 0.0]], array_map(fn ($r) => [$r['label'], $r['count'], (float) $r['lost_value']], $lost['reasons']));
        $this->assertSame(2, $lost['total_count']);

        $sources = collect($this->report('sources')['sources'])->keyBy('source');
        $this->assertSame([3, 0, 2, 0.0], [$sources['website']['count'], $sources['website']['won'], $sources['website']['lost'], (float) $sources['website']['win_rate_pct']]);
        $this->assertSame([1, 1, 100.0, 500.0], [$sources['chat']['count'], $sources['chat']['won'], (float) $sources['chat']['win_rate_pct'], (float) $sources['chat']['won_value']]);
        $this->assertNull($sources['referral']['win_rate_pct'], 'nothing closed, no rate');

        $owners = collect($this->report('owners', '?days=30')['owners'])->keyBy('name');
        $this->assertSame(['activities' => 2, 'tasks_done' => 1, 'inquiries' => 2, 'open' => 2, 'won' => 0, 'lost' => 0], collect($owners['Anna Berzina'])->except('name')->all());
        $this->assertArrayNotHasKey($this->manager->name, $owners->all(), 'the manager\'s line is older than 30 days');
    }

    public function test_companies_carry_no_booking_revenue_for_an_organisation_without_bookings(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();
        $gamma = $this->company('Gamma');
        $this->reservation($gamma, 900);

        $body = $this->report('companies');

        $this->assertFalse($body['with_bookings']);
        $this->assertSame(['Acme'], array_column($body['companies'], 'company_name'), 'only companies with a won or an open lead; no reservation read');
        $this->assertEquals(500, $body['companies'][0]['won_value']);
        $this->assertEquals(1000, $body['companies'][0]['open_pipeline_value']);
        $this->assertSame(2, $body['companies'][0]['inquiries_count']);
        $this->assertArrayNotHasKey('confirmed_revenue', $body['companies'][0]);
        $this->assertArrayNotHasKey('reservations_count', $body['companies'][0]);
    }

    public function test_a_full_customer_sees_reservation_revenue_as_the_full_admin_does(): void
    {
        $gamma = $this->company('Gamma');
        $this->reservation($gamma, 900);

        $body = $this->report('companies');

        $this->assertTrue($body['with_bookings']);
        $this->assertSame('Gamma', $body['companies'][0]['company_name'], 'by confirmed reservation revenue, those with none after');
        $this->assertEquals(900, $body['companies'][0]['confirmed_revenue']);
        $this->assertSame(1, $body['companies'][0]['reservations_count']);
        $this->assertEquals(0, $body['companies'][1]['confirmed_revenue']);
    }

    public function test_the_full_admins_reports_answer_the_same(): void
    {
        // The full admin's analytics routes ask the flag itself (staff.can), managers included.
        DB::table('staff')->where('user_id', $this->manager->id)->update(['can_view_analytics' => true]);
        $pairs = [
            ['analytics/inquiry-funnel?months=6', 'funnel?months=6'],
            ['reporting/forecast?months=6', 'forecast?months=6'],
            ['reporting/lost-reasons?months=6', 'lost-reasons?months=6'],
            ['reporting/source-attribution?months=6', 'sources?months=6'],
            ['reporting/owner-activity?days=30', 'owners?days=30'],
        ];
        foreach ($pairs as [$admin, $crm]) {
            $this->assertSame(
                $this->asManager()->getJson($this->adminApi($admin))->assertOk()->json(),
                $this->asManager()->getJson($this->crmApi("reports/{$crm}"))->assertOk()->json(),
                $admin,
            );
        }
        $this->assertSame(
            $this->asManager()->getJson($this->adminApi('reporting/company-ltv?limit=10'))->assertOk()->json('companies'),
            $this->asManager()->getJson($this->crmApi('reports/companies?limit=10'))->assertOk()->json('companies'),
        );
    }

    public function test_the_reports_rule_is_the_reports_pages(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();

        $this->asStaffMember()->getJson($this->crmApi('reports/funnel'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_view_analytics' => true]);
        $this->asStaffMember()->getJson($this->crmApi('reports/funnel'))->assertOk();
        $this->asStaffMember()->getJson($this->crmApi('reports/companies'))->assertOk();
    }

    public function test_an_organisation_on_another_module_is_refused(): void
    {
        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();

        foreach (['funnel', 'forecast', 'lost-reasons', 'sources', 'owners', 'companies'] as $name) {
            $this->asManager()->getJson($this->crmApi("reports/{$name}"))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
        }
    }

    public function test_another_organisations_leads_never_count_and_a_chosen_brand_counts_its_own(): void
    {
        $other = $this->otherOrganisation();
        $theirGuest = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Someone Else', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('inquiries')->insert(['organization_id' => $other->id, 'guest_id' => $theirGuest, 'status' => 'Lost', 'source' => 'website', 'total_value' => 9999, 'next_task_completed' => false, 'created_at' => now(), 'updated_at' => now()]);
        $second = DB::table('brands')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Old Town Studio', 'slug' => 'old-town', 'widget_token' => Str::random(40), 'is_default' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->lead(['status' => 'Confirmed', 'source' => 'event', 'total_value' => 300, 'brand_id' => $second]);

        $all = collect($this->report('sources', '?brand_id=all')['sources'])->keyBy('source');
        $this->assertSame(3, $all['website']['count'], 'not the other organisation\'s');
        $this->assertSame(2, $this->report('lost-reasons')['total_count']);
        $this->assertSame(1, $all['event']['count']);

        $brand = $this->report('sources', "?brand_id={$second}")['sources'];
        $this->assertSame([['event', 1]], array_map(fn ($s) => [$s['source'], $s['count']], $brand));
        $this->assertSame(1, $this->report('funnel', "?brand_id={$second}")['won']);
    }

    public function test_bad_windows_are_refused(): void
    {
        $this->asManager()->getJson($this->crmApi('reports/funnel?months=0'))->assertStatus(422);
        $this->asManager()->getJson($this->crmApi('reports/forecast?months=13'))->assertStatus(422);
        $this->asManager()->getJson($this->crmApi('reports/owners?days=999'))->assertStatus(422);
        $this->asManager()->getJson($this->crmApi('reports/companies?limit=1'))->assertStatus(422);
    }
}
