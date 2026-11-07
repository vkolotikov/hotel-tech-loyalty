<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The full admin's lead endpoints the CRM works on (2026-11-08): the list sorts only by real columns; bulk status
 * changes move the stage too; a new lead lands in the default pipeline; follow-up days are the venue's; the deals'
 * `total` counts deals only. The clock: Wednesday 4 November 2026, 12:00 in Riga (10:00 UTC).
 */
class LeadsAndDealsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private int $pipeline;

    /** @var array<string, int> */
    private array $stages = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCustomFieldsSchema();
        $this->setUpRealtimeEventsSchema();
        $this->widenTables();

        $this->pipeline = DB::table('pipelines')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Sales', 'slug' => 'sales', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        foreach ([['New', 'open', 1], ['Contacted', 'open', 2], ['Booked', 'won', 3], ['Gone', 'lost', 4]] as [$name, $kind, $order]) {
            $this->stages[$name] = DB::table('pipeline_stages')->insertGetId(['organization_id' => $this->org->id, 'pipeline_id' => $this->pipeline, 'name' => $name, 'slug' => strtolower($name), 'kind' => $kind, 'sort_order' => $order, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function widenTables(): void
    {
        foreach ([
            'mobile' => fn ($t) => $t->string('mobile')->nullable(),
            'vip_level' => fn ($t) => $t->string('vip_level')->nullable(),
            'nationality' => fn ($t) => $t->string('nationality')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('guests', $column)) {
                Schema::table('guests', $add);
            }
        }
        foreach ([
            'priority' => fn ($t) => $t->string('priority', 20)->nullable(),
            'inquiry_type' => fn ($t) => $t->string('inquiry_type', 50)->nullable(),
            'property_id' => fn ($t) => $t->unsignedBigInteger('property_id')->nullable(),
            'corporate_account_id' => fn ($t) => $t->unsignedBigInteger('corporate_account_id')->nullable(),
            'event_name' => fn ($t) => $t->string('event_name')->nullable(),
            'room_type_requested' => fn ($t) => $t->string('room_type_requested')->nullable(),
            'check_in' => fn ($t) => $t->date('check_in')->nullable(),
            'check_out' => fn ($t) => $t->date('check_out')->nullable(),
            'lost_reason_id' => fn ($t) => $t->unsignedBigInteger('lost_reason_id')->nullable(),
            'ai_win_probability' => fn ($t) => $t->integer('ai_win_probability')->nullable(),
            'last_contacted_at' => fn ($t) => $t->date('last_contacted_at')->nullable(),
            'custom_data' => fn ($t) => $t->text('custom_data')->nullable(),
            'fulfillment_stage' => fn ($t) => $t->string('fulfillment_stage', 32)->nullable(),
            'fulfillment_completed_at' => fn ($t) => $t->timestamp('fulfillment_completed_at')->nullable(),
            'payment_status' => fn ($t) => $t->string('payment_status', 32)->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('inquiries', $column)) {
                Schema::table('inquiries', $add);
            }
        }
        if (!Schema::hasTable('properties')) {
            Schema::create('properties', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->string('name'), $t->string('code')->nullable(), $t->timestamps()]);
        }
        if (!Schema::hasTable('corporate_accounts')) {
            Schema::create('corporate_accounts', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->string('company_name'), $t->timestamps()]);
        }
    }

    private function row(int $lead): object
    {
        return DB::table('inquiries')->where('id', $lead)->first();
    }

    public function test_the_list_sorts_by_real_columns_only(): void
    {
        $small = $this->lead(['total_value' => 100, 'pipeline_id' => $this->pipeline], 'Small');
        $large = $this->lead(['total_value' => 900, 'pipeline_id' => $this->pipeline], 'Large');

        $ids = fn (string $query) => collect($this->asStaffMember()->getJson($this->adminApi("inquiries?{$query}"))->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$large, $small], $ids('sort=total_value&dir=desc'));
        $this->assertSame([$small, $large], $ids('sort=total_value&dir=asc'));
        // Names the table lacks fall back to the newest first instead of a database error.
        foreach (['value_estimated', 'guest_name', 'win_probability'] as $missing) {
            $this->asStaffMember()->getJson($this->adminApi("inquiries?sort={$missing}"))->assertOk();
        }
    }

    public function test_bulk_status_changes_move_the_stage_of_the_leads_pipeline(): void
    {
        $a = $this->lead(['pipeline_id' => $this->pipeline, 'pipeline_stage_id' => $this->stages['New']]);
        $b = $this->lead(['pipeline_id' => $this->pipeline, 'pipeline_stage_id' => $this->stages['New']], 'Grace Hopper');
        $loose = $this->lead([], 'No Pipeline');
        $bulk = fn (string $action, ?string $value = null) => $this->asStaffMember()
            ->postJson($this->adminApi('inquiries/bulk'), ['ids' => [$a, $b, $loose], 'action' => $action, 'value' => $value])->assertOk();

        $bulk('set_status', 'Contacted');
        $this->assertSame(['Contacted', $this->stages['Contacted']], [$this->row($a)->status, (int) $this->row($a)->pipeline_stage_id]);

        $bulk('mark_won');
        $this->assertSame(['Confirmed', $this->stages['Booked']], [$this->row($b)->status, (int) $this->row($b)->pipeline_stage_id]);

        $bulk('mark_lost');
        $this->assertSame(['Lost', $this->stages['Gone']], [$this->row($a)->status, (int) $this->row($a)->pipeline_stage_id]);
        $this->assertSame(['Lost', null], [$this->row($loose)->status, $this->row($loose)->pipeline_stage_id], 'a lead without a pipeline keeps none');
    }

    public function test_a_new_lead_goes_into_the_default_pipeline(): void
    {
        $guest = DB::table('guests')->insertGetId(['organization_id' => $this->org->id, 'full_name' => 'Ada', 'created_at' => now(), 'updated_at' => now()]);

        $matching = $this->asStaffMember()->postJson($this->adminApi('inquiries'), ['guest_id' => $guest, 'status' => 'Contacted'])->assertCreated()->json('id');
        $this->assertSame([$this->pipeline, $this->stages['Contacted'], 'Contacted'], [(int) $this->row($matching)->pipeline_id, (int) $this->row($matching)->pipeline_stage_id, $this->row($matching)->status]);

        $unknown = $this->asStaffMember()->postJson($this->adminApi('inquiries'), ['guest_id' => $guest, 'status' => 'Waiting for the board'])->assertCreated()->json('id');
        $this->assertSame([$this->stages['New'], 'Waiting for the board'], [(int) $this->row($unknown)->pipeline_stage_id, $this->row($unknown)->status]);

        $none = $this->asStaffMember()->postJson($this->adminApi('inquiries'), ['guest_id' => $guest])->assertCreated()->json('id');
        $this->assertSame([$this->stages['New'], 'New'], [(int) $this->row($none)->pipeline_stage_id, $this->row($none)->status]);
    }

    public function test_follow_up_days_are_the_venues(): void
    {
        // 00:30 on Thursday in Riga is 22:30 on Wednesday in UTC: the venue's day is already Thursday.
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-11-04 22:30:00'));
        $thursday = $this->lead(['next_task_due' => '2026-11-05'], 'Due Thursday');
        $wednesday = $this->lead(['next_task_due' => '2026-11-04'], 'Due Wednesday');

        $ids = fn (string $filter) => collect($this->asStaffMember()->getJson($this->adminApi("inquiries?task_due={$filter}"))->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$thursday], $ids('today'));
        $this->assertSame([$wednesday], $ids('overdue'));

        $kpis = $this->asStaffMember()->getJson($this->adminApi('inquiries/kpis'))->assertOk()->json();
        $this->assertSame([1, 1], [$kpis['due_today'], $kpis['overdue']]);
        $today = $this->asStaffMember()->getJson($this->adminApi('inquiries/today'))->assertOk()->json();
        $this->assertSame(['2026-11-05', 1, 1], [$today['date'], $today['today']['count'], $today['overdue']['count']]);
    }

    public function test_the_deals_total_counts_deals_only(): void
    {
        $this->lead(['status' => 'Confirmed', 'fulfillment_stage' => 'in_production']);
        $this->lead(['status' => 'Confirmed']);
        $this->lead(['status' => 'Confirmed', 'fulfillment_stage' => 'completed', 'fulfillment_completed_at' => now()]);
        $this->lead(['status' => 'New']);
        $this->lead(['status' => 'Contacted']);

        $this->asStaffMember()->getJson($this->adminApi('deals/kpis'))->assertOk()->assertJsonPath('total', 2);
    }
}
