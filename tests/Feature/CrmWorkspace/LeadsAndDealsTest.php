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
        foreach ([
            'num_nights' => fn ($t) => $t->integer('num_nights')->nullable(),
            'num_rooms' => fn ($t) => $t->integer('num_rooms')->default(1),
            'num_adults' => fn ($t) => $t->integer('num_adults')->default(1),
            'num_children' => fn ($t) => $t->integer('num_children')->default(0),
            'rate_offered' => fn ($t) => $t->decimal('rate_offered', 10, 2)->nullable(),
            'special_requests' => fn ($t) => $t->text('special_requests')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('inquiries', $column)) {
                Schema::table('inquiries', $add);
            }
        }
        // The timeline and the draft reservation a lead closed as won gets (production's columns and nullability).
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id'), $t->unsignedBigInteger('brand_id')->nullable(),
                $t->unsignedBigInteger('inquiry_id')->nullable(), $t->unsignedBigInteger('guest_id')->nullable(), $t->unsignedBigInteger('corporate_account_id')->nullable(),
                $t->string('type', 32), $t->string('direction', 16)->nullable(), $t->string('subject')->nullable(), $t->text('body')->nullable(),
                $t->integer('duration_minutes')->nullable(), $t->text('metadata')->nullable(), $t->unsignedBigInteger('created_by')->nullable(),
                $t->timestamp('occurred_at')->nullable(), $t->timestamps()]);
        }
        if (!Schema::hasTable('reservations')) {
            Schema::create('reservations', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id')->nullable(), $t->unsignedBigInteger('brand_id')->nullable(),
                $t->unsignedBigInteger('guest_id'), $t->unsignedBigInteger('inquiry_id')->nullable(), $t->unsignedBigInteger('corporate_account_id')->nullable(),
                $t->unsignedBigInteger('property_id'), $t->string('confirmation_no', 50)->nullable(), $t->date('check_in'), $t->date('check_out'),
                $t->integer('num_nights')->nullable(), $t->integer('num_rooms')->default(1), $t->integer('num_adults')->default(1), $t->integer('num_children')->default(0),
                $t->string('room_type', 100)->nullable(), $t->decimal('rate_per_night', 10, 2)->nullable(), $t->decimal('total_amount', 12, 2)->nullable(),
                $t->string('payment_status', 30)->default('Pending'), $t->string('status', 30)->default('Confirmed'), $t->string('source', 100)->nullable(),
                $t->text('special_requests')->nullable(), $t->timestamps()]);
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

    public function test_leads_without_a_value_come_last_in_either_direction(): void
    {
        $none = $this->lead(['total_value' => null], 'No value');
        $small = $this->lead(['total_value' => 100], 'Small');
        $large = $this->lead(['total_value' => 900], 'Large');

        $ids = fn (string $dir) => collect($this->asStaffMember()->getJson($this->adminApi("inquiries?sort=total_value&dir={$dir}"))->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$large, $small, $none], $ids('desc'));
        $this->assertSame([$small, $large, $none], $ids('asc'));
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

    public function test_bulk_won_closes_each_lead_as_marking_one_won_does(): void
    {
        $property = DB::table('properties')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Harbour House', 'code' => 'HBR', 'created_at' => now(), 'updated_at' => now()]);
        $stay = $this->lead(['pipeline_id' => $this->pipeline, 'pipeline_stage_id' => $this->stages['New'], 'property_id' => $property,
            'check_in' => '2026-12-01', 'check_out' => '2026-12-04', 'num_nights' => 3, 'total_value' => 600], 'Stay Guest');
        $plain = $this->lead(['pipeline_id' => $this->pipeline, 'pipeline_stage_id' => $this->stages['Contacted']], 'Plain Lead');

        $this->asStaffMember()->postJson($this->adminApi('inquiries/bulk'), ['ids' => [$stay, $plain], 'action' => 'mark_won'])
            ->assertOk()->assertJsonPath('updated', 2);

        foreach ([$stay, $plain] as $lead) {
            $this->assertSame(['Confirmed', $this->stages['Booked']], [$this->row($lead)->status, (int) $this->row($lead)->pipeline_stage_id]);
            $this->assertSame(1, DB::table('activities')->where('inquiry_id', $lead)->where('subject', 'Marked Won')->count(), 'the timeline says it was won');
        }
        // The lead with a property and dates has its draft reservation, as `/won` makes one; the other has none.
        $this->assertSame(['HBR-' . str_pad((string) $stay, 5, '0', STR_PAD_LEFT), '2026-12-01'],
            [DB::table('reservations')->where('inquiry_id', $stay)->value('confirmation_no'), substr((string) DB::table('reservations')->where('inquiry_id', $stay)->value('check_in'), 0, 10)]);
        $this->assertSame(0, DB::table('reservations')->where('inquiry_id', $plain)->count());

        // Won again: no second reservation.
        $this->asStaffMember()->postJson($this->adminApi('inquiries/bulk'), ['ids' => [$stay], 'action' => 'mark_won'])->assertOk();
        $this->assertSame(1, DB::table('reservations')->where('inquiry_id', $stay)->count());
    }

    public function test_the_list_shows_the_leads_nobody_owns(): void
    {
        $nobody = $this->lead(['assigned_to' => null], 'Nobody');
        $empty = $this->lead(['assigned_to' => ''], 'Empty');
        $this->lead(['assigned_to' => 'Anna'], 'Annas');

        $ids = fn (string $query) => collect($this->asStaffMember()->getJson($this->adminApi("inquiries?{$query}"))->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$nobody, $empty], $ids('unassigned=1'));
        $this->assertCount(3, $ids('unassigned=0'));
    }

    public function test_the_deals_figures_count_the_awaiting_payment_step_itself(): void
    {
        $this->lead(['status' => 'Confirmed', 'fulfillment_stage' => 'payment_pending', 'total_value' => 200, 'payment_status' => 'pending']);
        $this->lead(['status' => 'Confirmed', 'fulfillment_stage' => 'in_production', 'total_value' => 300, 'payment_status' => 'partial']);

        $kpis = $this->asStaffMember()->getJson($this->adminApi('deals/kpis'))->assertOk()->json();
        // Not paid in full: both; the step "Awaiting payment", what `?stage=payment_pending` lists: one.
        $this->assertSame(2, $kpis['awaiting_payment']['count']);
        $this->assertSame([1, 200], [$kpis['payment_pending']['count'], (int) $kpis['payment_pending']['value']]);
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

    public function test_the_created_date_filters_are_the_venues_days(): void
    {
        // 00:30 on 5 November in Riga is 22:30 on the 4th in UTC; 23:30 on the 5th in Riga is 21:30 UTC.
        $early = $this->lead(['created_at' => '2026-11-04 22:30:00'], 'Early on the fifth');
        $late = $this->lead(['created_at' => '2026-11-05 21:30:00'], 'Late on the fifth');
        $sixth = $this->lead(['created_at' => '2026-11-05 22:30:00'], 'Early on the sixth');

        $ids = fn (string $query) => collect($this->asStaffMember()->getJson($this->adminApi("inquiries?{$query}"))->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$early, $late], $ids('date_from=2026-11-05&date_to=2026-11-05'));
        $this->assertSame([$sixth], $ids('date_from=2026-11-06'));
        $this->assertSame([$early, $late], $ids('date_to=2026-11-05'));
        $this->assertSame([$early, $late, $sixth], $ids('date_from=not-a-day'), 'a value that is not a day is ignored');
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

    public function test_an_overdue_deal_is_overdue_by_the_venues_day(): void
    {
        // 23:30 UTC on Wednesday is 01:30 on Thursday in Riga: Wednesday's follow-up is overdue there already.
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-11-04 23:30:00'));
        app()->forgetScopedInstances();
        $late = $this->lead(['status' => 'Confirmed', 'next_task_due' => '2026-11-04']);
        $this->lead(['status' => 'Confirmed', 'next_task_due' => '2026-11-05']);

        $ids = collect($this->asStaffMember()->getJson($this->adminApi('deals?focus=overdue'))->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$late], $ids);
    }
}
