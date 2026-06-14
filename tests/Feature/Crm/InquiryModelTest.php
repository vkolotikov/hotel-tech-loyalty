<?php

namespace Tests\Feature\Crm;

use App\Models\Inquiry;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Task;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Inquiry model contract — the central CRM v2 entity.
 *
 * Surfaces locked:
 *
 *   resolveRouteBinding override — bypasses BrandScope for admin
 *   route resolution. Without this, /v1/admin/inquiries/{id}
 *   silently 404s for any inquiry whose brand_id differs from
 *   the SPA's current brand selector. CLAUDE.md flags this as a
 *   confusing failure mode for cancel/convert/edit flows.
 *
 *   Pipeline/stage/lost_reason linkage (CRM v2 Phase 1) —
 *   foundational relationships.
 *
 *   AI Smart Panel cache columns (CRM v2 Phase 2):
 *     - ai_brief_at datetime cast (drives the 15-min TTL check)
 *     - ai_win_probability integer (0-100 clamp covered in
 *       InquiryAiServiceTest)
 *
 *   custom_data array cast (CRM Phase 7 admin-defined fields).
 *
 *   Deals & Fulfillment (2026-05-15):
 *     - paid_amount decimal:2
 *     - fulfillment_started_at + _completed_at datetime
 *
 *   External attribution (2026-05-17):
 *     - external_submitted_at datetime
 *
 *   openTasks relationship — open tasks only (the lead-detail
 *   Tasks panel).
 *
 *   BelongsToOrganization + TenantScope isolation.
 */
class InquiryModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpCrmPresetSchema includes inquiries, pipelines,
        // pipeline_stages, inquiry_lost_reasons, brands.
        $this->setUpCrmPresetSchema();

        // Add the Phase 2 AI cache columns + Phase 7 custom_data
        // + Phase 10 lead_form_id + Deals fulfillment + External
        // attribution.
        foreach ([
            'guest_id'                  => 'unsignedBigInteger',
            'inquiry_type'              => 'string',
            'source'                    => 'string',
            'check_in'                  => 'date',
            'check_out'                 => 'date',
            'num_rooms'                 => 'integer',
            'num_adults'                => 'integer',
            'rate_offered'              => 'decimal',
            'total_value'               => 'decimal',
            'priority'                  => 'string',
            'next_task_completed'       => 'boolean',
            'catering_required'         => 'boolean',
            'av_required'               => 'boolean',
            'last_contacted_at'         => 'date',
            'ai_brief'                  => 'text',
            'ai_brief_at'               => 'timestamp',
            'ai_intent'                 => 'string',
            'ai_win_probability'        => 'integer',
            'ai_going_cold_risk'        => 'string',
            'ai_suggested_action'       => 'text',
            'custom_data'               => 'text',
            'lead_form_id'              => 'unsignedBigInteger',
            'fulfillment_stage'         => 'string',
            'paid_amount'               => 'decimal',
            'fulfillment_started_at'    => 'timestamp',
            'fulfillment_completed_at'  => 'timestamp',
            'external_source'           => 'string',
            'external_id'               => 'string',
            'external_url'              => 'string',
            'external_submitted_at'     => 'timestamp',
            'currency'                  => 'string',
        ] as $col => $type) {
            if (!Schema::hasColumn('inquiries', $col)) {
                Schema::table('inquiries', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'string'             => $t->string($col),
                        'text'               => $t->text($col),
                        'integer'            => $t->integer($col),
                        'decimal'            => $t->decimal($col, 12, 2),
                        'boolean'            => $t->boolean($col)->default(false),
                        'date'               => $t->date($col),
                        'timestamp'          => $t->timestamp($col),
                        'unsignedBigInteger' => $t->unsignedBigInteger($col),
                    };
                    if ($type !== 'boolean') $colDef->nullable();
                });
            }
        }

        // tasks table (for openTasks relationship).
        if (!Schema::hasTable('tasks')) {
            Schema::create('tasks', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->string('title');
                $t->timestamp('due_at')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'inquiry_id']);
            });
        }

        // activities table (for activities relationship).
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->string('type', 32);
                $t->timestamp('occurred_at')->nullable();
                $t->timestamps();
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    private function inquiry(array $attrs = []): Inquiry
    {
        return Inquiry::create(array_merge([
            'organization_id' => $this->orgId,
            'inquiry_type'    => 'individual',
            'status'          => 'New',
        ], $attrs));
    }

    /* ─── resolveRouteBinding: bypasses BrandScope ─── */

    public function test_resolveRouteBinding_finds_inquiry_across_brands(): void
    {
        // CRITICAL: /v1/admin/inquiries/{id} MUST resolve
        // regardless of the bound brand. Pre-fix, switching brand
        // in the SPA silently 404'd the lead detail page.
        $inquiry = $this->inquiry(['brand_id' => 100]);

        // Bind a DIFFERENT brand context.
        app()->instance('current_brand_id', 999);

        $model = new Inquiry();
        $resolved = $model->resolveRouteBinding($inquiry->id);

        $this->assertNotNull($resolved);
        $this->assertSame((int) $inquiry->id, (int) $resolved->id,
            'resolveRouteBinding MUST find inquiry across brand contexts.');
    }

    public function test_resolveRouteBinding_aborts_404_when_inquiry_not_found(): void
    {
        // Defensive: unknown id → 404 (Laravel's abort).
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        $model = new Inquiry();
        $model->resolveRouteBinding(999_999_999);
    }

    /* ─── Pipeline / stage / lost_reason relationships ─── */

    public function test_pipeline_relationship_is_belongs_to(): void
    {
        $inquiry = $this->inquiry();
        $rel = $inquiry->pipeline();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_pipeline_stage_relationship_is_belongs_to(): void
    {
        $inquiry = $this->inquiry();
        $rel = $inquiry->pipelineStage();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_lost_reason_relationship_uses_lost_reason_id_foreign_key(): void
    {
        // FK is explicitly 'lost_reason_id', NOT the conventional
        // 'inquiry_lost_reason_id'. Lock the name so a future
        // refactor doesn't silently break the funnel report.
        $inquiry = $this->inquiry();
        $rel = $inquiry->lostReason();

        $this->assertSame('lost_reason_id', $rel->getForeignKeyName(),
            'lostReason FK MUST be lost_reason_id (NOT inquiry_lost_reason_id).');
    }

    /* ─── AI Smart Panel cache columns (Phase 2) ─── */

    public function test_ai_brief_at_casts_to_carbon(): void
    {
        // The freshness check in InquiryAiService::briefForInquiry
        // calls ->gt() — needs Carbon, not raw string.
        $inquiry = $this->inquiry([
            'ai_brief'    => 'Test brief',
            'ai_brief_at' => now()->subMinutes(5),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->ai_brief_at);
    }

    public function test_ai_win_probability_casts_to_integer(): void
    {
        $inquiry = $this->inquiry(['ai_win_probability' => '75']);

        $this->assertSame(75, $inquiry->ai_win_probability);
        $this->assertIsInt($inquiry->ai_win_probability);
    }

    public function test_ai_smart_panel_fields_persist_intact(): void
    {
        // Lock the documented Phase 2 AI cache columns.
        $inquiry = $this->inquiry([
            'ai_brief'            => 'Honeymoon couple, 4-night stay.',
            'ai_intent'           => 'booking_inquiry',
            'ai_win_probability'  => 75,
            'ai_going_cold_risk'  => 'low',
            'ai_suggested_action' => 'Send a sea-view package quote.',
        ]);

        $fresh = $inquiry->fresh();
        $this->assertSame('Honeymoon couple, 4-night stay.', $fresh->ai_brief);
        $this->assertSame('booking_inquiry', $fresh->ai_intent);
        $this->assertSame(75, $fresh->ai_win_probability);
        $this->assertSame('low', $fresh->ai_going_cold_risk);
        $this->assertSame('Send a sea-view package quote.', $fresh->ai_suggested_action);
    }

    /* ─── custom_data array cast (Phase 7) ─── */

    public function test_custom_data_round_trips_through_array_cast(): void
    {
        // Use non-zero decimal so JSON encode/decode doesn't strip
        // it to int (.00 collapses to int).
        $custom = [
            'event_type'      => 'corporate_retreat',
            'special_needs'   => ['vegan', 'gluten-free'],
            'expected_value'  => 12000.50,
        ];

        $inquiry = $this->inquiry(['custom_data' => $custom]);

        $this->assertSame($custom, $inquiry->fresh()->custom_data);
    }

    /* ─── Date casts (CRM v2 Phase 1 stay-detail fields) ─── */

    public function test_check_in_and_check_out_cast_to_carbon(): void
    {
        $inquiry = $this->inquiry([
            'check_in'  => '2026-07-15',
            'check_out' => '2026-07-20',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->check_in);
        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->check_out);
        $this->assertSame('2026-07-15', $inquiry->check_in->toDateString());
    }

    /* ─── Decimal casts (money fields) ─── */

    public function test_rate_offered_and_total_value_cast_to_decimal_2_string(): void
    {
        // Money-safe. Float cast would surface 1500.50 as
        // 1500.499999... silently.
        $inquiry = $this->inquiry([
            'rate_offered' => 250.75,
            'total_value'  => 1500.50,
        ]);

        $this->assertSame('250.75',  $inquiry->fresh()->rate_offered);
        $this->assertSame('1500.50', $inquiry->fresh()->total_value);
    }

    /* ─── Boolean casts ─── */

    public function test_event_required_flags_cast_to_boolean(): void
    {
        // catering_required + av_required drive the function-space
        // form's conditional sections.
        $inquiry = $this->inquiry([
            'catering_required' => true,
            'av_required'       => false,
        ]);

        $this->assertTrue($inquiry->catering_required);
        $this->assertFalse($inquiry->av_required);
    }

    public function test_next_task_completed_casts_to_boolean(): void
    {
        // Lock the legacy CRM Phase 0 column (kept for back-compat
        // with old code paths that haven't migrated to the new
        // tasks table).
        $inquiry = $this->inquiry(['next_task_completed' => true]);

        $this->assertTrue($inquiry->next_task_completed);
    }

    /* ─── Deals & Fulfillment fields (2026-05-15) ─── */

    public function test_paid_amount_casts_to_decimal_2_string(): void
    {
        $inquiry = $this->inquiry(['paid_amount' => 750.25]);

        $this->assertSame('750.25', $inquiry->fresh()->paid_amount);
    }

    public function test_fulfillment_timestamps_cast_to_carbon(): void
    {
        $inquiry = $this->inquiry([
            'fulfillment_started_at'   => now()->subDays(2),
            'fulfillment_completed_at' => now()->subDay(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->fulfillment_started_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->fulfillment_completed_at);
    }

    /* ─── External attribution (2026-05-17) ─── */

    public function test_external_submitted_at_casts_to_carbon(): void
    {
        // The lead-intake API stamps this. Drives the funnel
        // attribution report.
        $inquiry = $this->inquiry([
            'external_source'       => 'zapier',
            'external_id'           => 'zap_12345',
            'external_submitted_at' => now()->subHour(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $inquiry->external_submitted_at);
        $this->assertSame('zapier', $inquiry->external_source);
    }

    /* ─── openTasks relationship ─── */

    public function test_open_tasks_excludes_completed(): void
    {
        // The lead-detail Tasks panel shows ONLY open tasks. A
        // regression that surfaced completed work would clutter
        // the panel.
        $inquiry = $this->inquiry();

        // 2 open + 1 completed.
        Task::create([
            'organization_id' => $this->orgId,
            'inquiry_id'      => $inquiry->id,
            'title'           => 'Open A',
            'due_at'          => now()->addDay(),
        ]);
        Task::create([
            'organization_id' => $this->orgId,
            'inquiry_id'      => $inquiry->id,
            'title'           => 'Open B',
            'due_at'          => now()->addDays(2),
        ]);
        Task::create([
            'organization_id' => $this->orgId,
            'inquiry_id'      => $inquiry->id,
            'title'           => 'Done',
            'due_at'          => now()->subDay(),
            'completed_at'    => now(),
        ]);

        $open = $inquiry->openTasks()->get();

        $this->assertCount(2, $open,
            'openTasks MUST exclude completed tasks.');
        $titles = $open->pluck('title')->sort()->values()->toArray();
        $this->assertSame(['Open A', 'Open B'], $titles);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $inquiry = $this->inquiry();

        $this->assertSame($this->orgId, (int) $inquiry->organization_id);
    }

    public function test_tenant_scope_isolates_inquiries_cross_org(): void
    {
        // CRITICAL: pipeline kanban + lead detail MUST scope to
        // tenant. Cross-leak exposes pricing, special_requests,
        // guest names.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('inquiries')->insert([
            'organization_id' => $orgA,
            'status'          => 'New',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('inquiries')->insert([
            'organization_id' => $orgB,
            'status'          => 'New',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, Inquiry::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, Inquiry::all());
    }
}
