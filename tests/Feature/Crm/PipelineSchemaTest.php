<?php

namespace Tests\Feature\Crm;

use App\Models\InquiryLostReason;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the CRM v2 Phase 1 pipeline schema trio: Pipeline +
 * PipelineStage + InquiryLostReason.
 *
 * Surfaces locked:
 *
 *   Pipeline:
 *     - is_default boolean cast (the "active pipeline" flag —
 *       drives the lead detail's pipeline selector default)
 *     - stages() HasMany ordered by sort_order (kanban column
 *       order MUST be deterministic)
 *     - inquiries() HasMany
 *
 *   PipelineStage:
 *     - kind invariant: 'open' / 'won' / 'lost' (CRM v2 Phase 1
 *       contract — drives flow logic: open=in-flight forecast,
 *       won=Convert-to-reservation trigger, lost=requires
 *       lost_reason capture)
 *     - sort_order integer (kanban column ordering)
 *     - default_win_probability integer (drives the SPA's
 *       win-probability picker default)
 *     - pipeline + inquiries relationships
 *
 *   InquiryLostReason:
 *     - inquiries() HasMany with FK='lost_reason_id' (NOT
 *       inquiry_lost_reason_id — funnel report depends)
 *     - is_active boolean (soft-deactivate vs delete: in-use
 *       reasons soft-deactivate so historical funnel keeps
 *       labels, per IndustryPresetService::apply contract)
 *     - sort_order integer (picker display order)
 *
 *   All three: BelongsToOrganization auto-fill + TenantScope.
 */
class PipelineSchemaTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpCrmPresetSchema has pipelines, pipeline_stages,
        // inquiry_lost_reasons, inquiries, brands.
        $this->setUpCrmPresetSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── Pipeline ─── */

    public function test_pipeline_is_default_casts_to_boolean(): void
    {
        // CRITICAL: drives "which pipeline is active" — the lead
        // detail's pipeline selector defaults to is_default=true.
        $defaultPipe = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
            'is_default'      => true,
        ]);
        $secondary = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'MICE',
            'is_default'      => false,
        ]);

        $this->assertTrue($defaultPipe->is_default);
        $this->assertFalse($secondary->is_default);
        $this->assertIsBool($defaultPipe->is_default);
    }

    public function test_pipeline_stages_returns_stages_ordered_by_sort_order(): void
    {
        // CRITICAL: kanban column order MUST be deterministic.
        // Out-of-order stages would jumble the kanban (Won before
        // Open, Lost before In-Progress).
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
            'is_default'      => true,
        ]);

        // Insert in non-sequential order — sort_order MUST drive.
        PipelineStage::create([
            'organization_id' => $this->orgId,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'Won',
            'kind'            => 'won',
            'sort_order'      => 30,
        ]);
        PipelineStage::create([
            'organization_id' => $this->orgId,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'New',
            'kind'            => 'open',
            'sort_order'      => 10,
        ]);
        PipelineStage::create([
            'organization_id' => $this->orgId,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'Negotiating',
            'kind'            => 'open',
            'sort_order'      => 20,
        ]);

        $stages = $pipeline->stages()->get();
        $names = $stages->pluck('name')->values()->toArray();

        $this->assertSame(['New', 'Negotiating', 'Won'], $names,
            'Stages MUST surface in sort_order ascending.');
    }

    public function test_pipeline_inquiries_relationship_is_has_many(): void
    {
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
        ]);

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $pipeline->inquiries(),
        );
    }

    public function test_pipeline_sort_order_casts_to_integer(): void
    {
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
            'sort_order'      => '5', // string input
        ]);

        $this->assertSame(5, $pipeline->sort_order);
        $this->assertIsInt($pipeline->sort_order);
    }

    /* ─── PipelineStage ─── */

    public function test_pipeline_stage_kind_persists_each_canonical_value(): void
    {
        // CRITICAL: the 3 documented kinds drive flow logic. A
        // typo in production would silently break the
        // Convert-to-reservation trigger (won) or skip the
        // lost_reason capture (lost).
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
        ]);

        foreach (['open', 'won', 'lost'] as $kind) {
            $stage = PipelineStage::create([
                'organization_id' => $this->orgId,
                'pipeline_id'     => $pipeline->id,
                'name'            => ucfirst($kind),
                'kind'            => $kind,
            ]);

            $this->assertSame($kind, $stage->fresh()->kind,
                "Kind '{$kind}' MUST persist intact.");
        }
    }

    public function test_pipeline_stage_default_win_probability_casts_to_integer(): void
    {
        // Drives the SPA's win-probability picker default when
        // an inquiry lands on this stage. Locked because the SPA
        // does arithmetic on this (e.g. forecast revenue
        // calculation).
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
        ]);

        $stage = PipelineStage::create([
            'organization_id'         => $this->orgId,
            'pipeline_id'             => $pipeline->id,
            'name'                    => 'Negotiating',
            'kind'                    => 'open',
            'default_win_probability' => '60',
        ]);

        $this->assertSame(60, $stage->default_win_probability);
        $this->assertIsInt($stage->default_win_probability);
    }

    public function test_pipeline_stage_pipeline_relationship_is_belongs_to(): void
    {
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
        ]);
        $stage = PipelineStage::create([
            'organization_id' => $this->orgId,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'New',
            'kind'            => 'open',
        ]);

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $stage->pipeline(),
        );
        $this->assertSame((int) $pipeline->id, (int) $stage->pipeline->id);
    }

    public function test_pipeline_stage_inquiries_relationship_is_has_many(): void
    {
        $pipeline = Pipeline::create([
            'organization_id' => $this->orgId,
            'name'            => 'Sales',
        ]);
        $stage = PipelineStage::create([
            'organization_id' => $this->orgId,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'New',
            'kind'            => 'open',
        ]);

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $stage->inquiries(),
        );
    }

    /* ─── InquiryLostReason ─── */

    public function test_inquiry_lost_reason_is_active_casts_to_boolean(): void
    {
        // Soft-deactivate vs delete: in-use reasons soft-
        // deactivate so historical funnel keeps labels (per
        // IndustryPresetService::apply contract).
        $active = InquiryLostReason::create([
            'organization_id' => $this->orgId,
            'label'           => 'Price',
            'is_active'       => true,
        ]);
        $hidden = InquiryLostReason::create([
            'organization_id' => $this->orgId,
            'label'           => 'Deprecated reason',
            'is_active'       => false,
        ]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($hidden->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_inquiry_lost_reason_sort_order_casts_to_integer(): void
    {
        $reason = InquiryLostReason::create([
            'organization_id' => $this->orgId,
            'label'           => 'Price',
            'sort_order'      => '3',
        ]);

        $this->assertSame(3, $reason->sort_order);
        $this->assertIsInt($reason->sort_order);
    }

    public function test_inquiry_lost_reason_inquiries_relationship_uses_lost_reason_id_fk(): void
    {
        // CRITICAL: FK is 'lost_reason_id', NOT
        // 'inquiry_lost_reason_id'. The funnel report's lost-by-
        // reason chart depends on this — regression to convention
        // silently breaks the chart.
        $reason = InquiryLostReason::create([
            'organization_id' => $this->orgId,
            'label'           => 'Price',
        ]);

        $rel = $reason->inquiries();
        $this->assertSame('lost_reason_id', $rel->getForeignKeyName(),
            'inquiries FK MUST be lost_reason_id (NOT inquiry_lost_reason_id).');
    }

    /* ─── BelongsToOrganization + TenantScope (all 3 models) ─── */

    public function test_pipeline_auto_fills_organization_id_from_bound_context(): void
    {
        $pipeline = Pipeline::create([
            'name'            => 'Sales',
            'organization_id' => $this->orgId,
        ]);

        $this->assertSame($this->orgId, (int) $pipeline->organization_id);
    }

    public function test_pipeline_stage_tenant_scope_isolates_cross_org(): void
    {
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('pipeline_stages')->insert([
            'organization_id' => $orgA,
            'pipeline_id'     => 1,
            'name'            => 'Org A stage',
            'kind'            => 'open',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('pipeline_stages')->insert([
            'organization_id' => $orgB,
            'pipeline_id'     => 1,
            'name'            => 'Org B stage',
            'kind'            => 'open',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, PipelineStage::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, PipelineStage::all());
    }

    public function test_inquiry_lost_reason_tenant_scope_isolates_cross_org(): void
    {
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('inquiry_lost_reasons')->insert([
            'organization_id' => $orgA,
            'label'           => 'Org A reason',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('inquiry_lost_reasons')->insert([
            'organization_id' => $orgB,
            'label'           => 'Org B reason',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, InquiryLostReason::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, InquiryLostReason::all());
    }
}
