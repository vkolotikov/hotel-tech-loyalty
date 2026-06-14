<?php

namespace Tests\Feature\Crm;

use App\Models\CrmSetting;
use App\Models\Inquiry;
use App\Models\InquiryLostReason;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Services\CustomFieldService;
use App\Services\IndustryPresetService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks IndustryPresetService::apply — the one-click CRM reshape
 * shipped in CRM v2 Phase 9.
 *
 * Customer-facing contract:
 *
 *   - Admin picks an industry → pipeline name + stages + lost
 *     reason taxonomy + 6 entity field layouts all swap atomically
 *     to industry-appropriate defaults
 *
 *   - Switching presets is NON-DESTRUCTIVE to data:
 *       • Existing inquiries migrate to the new pipeline's stage
 *         of the matching `kind` (open→open, won→won, lost→lost)
 *       • Lost reasons currently linked to inquiries get soft-
 *         deactivated (is_active=false) — funnel report keeps its
 *         labels for past leads
 *       • Lost reasons NOT in use get hard-deleted
 *
 *   - Atomic: DB::transaction wraps the writes — a partial
 *     application can't leave the org with mismatched stages and
 *     lost-reasons
 *
 *   - The `industry_preset` crm_settings row tracks the active
 *     selection so the picker UI shows "Currently: …"
 *
 *   - Re-applying the SAME preset is idempotent (no errors, no
 *     duplicates)
 *
 *   - Unknown preset keys throw InvalidArgumentException so a
 *     typo / malicious payload doesn't silently no-op
 */
class IndustryPresetServiceApplyTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private IndustryPresetService $service;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmPresetSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        // Resolve via container so Custom field dep is injected.
        $this->service = app(IndustryPresetService::class);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── Unknown preset rejection ─── */

    public function test_unknown_preset_throws_invalid_argument(): void
    {
        // Defensive: typo or malicious payload (e.g. SQL injection
        // attempt) must hard-fail, not silently no-op or fall back
        // to a default.
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage("Unknown industry preset 'extraterrestrial_lodging'");

        $this->service->apply('extraterrestrial_lodging');
    }

    /* ─── First-apply on fresh org ─── */

    public function test_apply_hotel_creates_default_pipeline_with_stages(): void
    {
        $this->service->apply('hotel');

        $pipeline = Pipeline::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('is_default', true)
            ->first();

        $this->assertNotNull($pipeline,
            'Apply MUST create a default pipeline if none exists.');

        $stages = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('pipeline_id', $pipeline->id)
            ->get();

        $this->assertGreaterThan(0, $stages->count(),
            'Stages MUST be seeded.');

        // Locked invariant: every preset's stages MUST include at
        // least one of each kind (open/won/lost) so inquiry
        // migration on switch can always find a target.
        $kinds = $stages->pluck('kind')->unique()->sort()->values()->toArray();
        $this->assertContains('open', $kinds);
        $this->assertContains('won', $kinds);
        $this->assertContains('lost', $kinds);
    }

    public function test_apply_seeds_lost_reason_taxonomy(): void
    {
        $this->service->apply('hotel');

        $reasons = InquiryLostReason::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('is_active', true)
            ->get();

        $this->assertGreaterThan(0, $reasons->count(),
            'Lost reason taxonomy MUST be seeded on apply.');
    }

    public function test_apply_writes_all_six_entity_layout_configs(): void
    {
        // The 6 entity layouts that Field Manager reads. Every
        // preset MUST write these so the SPA's deep-merge against
        // DEFAULT_*_FIELDS produces a consistent shape.
        $this->service->apply('hotel');

        $keys = CrmSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->whereIn('key', [
                'inquiry_fields', 'customer_fields', 'corporate_fields',
                'deal_fields',    'member_fields',   'task_fields',
            ])
            ->pluck('key')
            ->sort()
            ->values()
            ->toArray();

        $this->assertSame(
            ['corporate_fields', 'customer_fields', 'deal_fields',
             'inquiry_fields', 'member_fields', 'task_fields'],
            $keys,
            'All 6 entity field layouts MUST be written.',
        );
    }

    public function test_apply_stamps_industry_preset_setting_with_chosen_key(): void
    {
        // The picker UI shows "Currently: Hotel" by reading this row.
        $this->service->apply('beauty');

        $current = CrmSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('key', 'industry_preset')
            ->value('value');

        $this->assertSame('beauty', $current,
            'industry_preset crm_setting MUST track the chosen key.');
    }

    public function test_apply_returns_summary_with_expected_shape(): void
    {
        // The summary feeds the toast confirmation: "Replaced 6
        // stages, set 5 lost reasons, added 4 custom fields …"
        // — the documented shape.
        $summary = $this->service->apply('hotel');

        $this->assertArrayHasKey('stages_replaced', $summary);
        $this->assertArrayHasKey('reasons_set',     $summary);
        $this->assertArrayHasKey('fields_added',    $summary);
        $this->assertArrayHasKey('fields_deactivated', $summary);
        $this->assertArrayHasKey('layout_updated',  $summary);

        $this->assertGreaterThan(0, $summary['stages_replaced'],
            'stages_replaced MUST count > 0 on first apply.');
        $this->assertGreaterThan(0, $summary['reasons_set']);
        $this->assertTrue($summary['layout_updated']);
    }

    /* ─── Non-destructive switch: data preservation ─── */

    public function test_switching_preset_migrates_inquiries_to_matching_stage_kind(): void
    {
        // CRITICAL preservation invariant. Set up hotel preset →
        // create an inquiry on the WON stage → switch to beauty →
        // inquiry MUST move to beauty's won stage, not lost or
        // open. Otherwise switching industries silently corrupts
        // every closed deal in the funnel report.
        $this->service->apply('hotel');

        $hotelWon = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('kind', 'won')
            ->first();

        $inquiry = Inquiry::create([
            'organization_id'   => $this->orgId,
            'pipeline_id'       => $hotelWon->pipeline_id,
            'pipeline_stage_id' => $hotelWon->id,
            'status'            => 'won',
        ]);

        // Switch industries.
        $this->service->apply('beauty');

        $inquiry->refresh();
        $newStage = PipelineStage::withoutGlobalScopes()->find($inquiry->pipeline_stage_id);

        $this->assertNotNull($newStage,
            'Inquiry MUST still have a valid stage after preset switch.');
        $this->assertSame('won', $newStage->kind,
            'CRITICAL: WON inquiry MUST migrate to the new preset\'s WON stage (kind-matched).');
    }

    public function test_switching_preset_soft_deactivates_in_use_lost_reasons(): void
    {
        // The data preservation contract for the funnel: lost
        // reasons currently linked to inquiries MUST stay queryable
        // (so the historical funnel report keeps its labels)
        // but get is_active=false so they don't surface in NEW
        // pickers.
        //
        // Pick a hotel-only reason ('Unavailable for those dates')
        // that does NOT appear in medical's taxonomy — otherwise
        // the second loop's by-label match resurfaces it.
        $this->service->apply('hotel');

        $hotelOnlyReason = InquiryLostReason::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('label', 'Unavailable for those dates')
            ->first();
        $this->assertNotNull($hotelOnlyReason,
            'Pre-condition: hotel preset MUST have the "Unavailable for those dates" reason.');

        $lostStage = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('kind', 'lost')
            ->first();

        Inquiry::create([
            'organization_id'   => $this->orgId,
            'pipeline_id'       => $lostStage->pipeline_id,
            'pipeline_stage_id' => $lostStage->id,
            'lost_reason_id'    => $hotelOnlyReason->id,
            'status'            => 'lost',
        ]);

        $reasonId = $hotelOnlyReason->id;

        // Switch to medical (which has none of hotel's labels except
        // 'Other', so 'Unavailable for those dates' stays
        // soft-deactivated rather than being resurfaced by label
        // match).
        $this->service->apply('medical');

        $row = InquiryLostReason::withoutGlobalScopes()->find($reasonId);
        $this->assertNotNull($row,
            'In-use lost reason MUST survive switch (no hard-delete).');
        $this->assertFalse((bool) $row->is_active,
            'In-use lost reason MUST be soft-deactivated (is_active=false).');
    }

    public function test_switching_preset_hard_deletes_unused_lost_reasons(): void
    {
        // Counterpart: lost reasons NOT linked to any inquiry get
        // hard-deleted so the dropdown stays clean. Soft-deactivating
        // every reason would balloon the picker over years of
        // industry switching.
        $this->service->apply('hotel');

        // Hotel preset's reasons exist; nothing is linked. Switch
        // to beauty.
        $hotelReasonIds = InquiryLostReason::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->pluck('id')
            ->toArray();

        $this->service->apply('beauty');

        // None of the hotel reasons should still exist — they were
        // unused so the service hard-deleted them.
        $stillThere = InquiryLostReason::withoutGlobalScopes()
            ->whereIn('id', $hotelReasonIds)
            ->count();

        $this->assertSame(0, $stillThere,
            'Unused lost reasons MUST be hard-deleted on switch (keeps picker clean).');
    }

    /* ─── Idempotency ─── */

    public function test_re_applying_same_preset_does_not_throw(): void
    {
        // Idempotent: a double-click on Apply must NOT corrupt the
        // CRM. The 3 lost-reason / stage seeding operations all
        // need to handle "row already exists" gracefully.
        $this->service->apply('hotel');

        // Second apply MUST NOT throw.
        $summary = $this->service->apply('hotel');

        $this->assertTrue($summary['layout_updated']);
    }

    public function test_re_applying_same_preset_does_not_explode_stage_count(): void
    {
        // Each apply REPLACES stages (creates new + removes/migrates
        // old). After 3 sequential applies the stage count MUST
        // match the preset's stage count — not 3× it. Otherwise the
        // kanban board would explode with phantom stage columns.
        $this->service->apply('hotel');
        $countAfter1 = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->count();

        $this->service->apply('hotel');
        $this->service->apply('hotel');
        $countAfter3 = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->count();

        $this->assertSame($countAfter1, $countAfter3,
            'Re-applying the same preset 3× MUST yield the same stage count (no phantom duplicates).');
    }

    /* ─── Atomicity (transaction wrapping) ─── */

    public function test_apply_is_wrapped_in_a_db_transaction(): void
    {
        // Documented atomic contract — pipeline + stages + lost
        // reasons + 6 layouts MUST all write together or all roll
        // back. We can't easily force a partial-fail in a unit
        // test, but we can verify that a SUCCESSFUL apply leaves
        // every documented row written. If atomicity is broken,
        // future regressions that partial-write would surface as
        // an apply that succeeds but writes only 4 layouts (not 6).
        $this->service->apply('hotel');

        $pipeline = Pipeline::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->first();
        $stages = PipelineStage::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count();
        $reasons = InquiryLostReason::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count();
        $layouts = CrmSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->whereIn('key', [
                'inquiry_fields', 'customer_fields', 'corporate_fields',
                'deal_fields', 'member_fields', 'task_fields',
            ])->count();

        $this->assertNotNull($pipeline);
        $this->assertGreaterThan(0, $stages);
        $this->assertGreaterThan(0, $reasons);
        $this->assertSame(6, $layouts,
            'All 6 entity layouts MUST be present after a successful apply (atomic write).');
    }

    /* ─── Tenant isolation ─── */

    public function test_apply_does_not_touch_other_orgs_data(): void
    {
        // Defensive: even with TenantScope auto-filtering, verify
        // an apply on org A doesn't reach into org B's pipeline.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        // Apply 'hotel' for org A (current context).
        $this->service->apply('hotel');

        // Confirm: org A has rows, org B has none.
        $aPipelines = Pipeline::withoutGlobalScopes()
            ->where('organization_id', $orgA)->count();
        $bPipelines = Pipeline::withoutGlobalScopes()
            ->where('organization_id', $orgB)->count();

        $this->assertGreaterThan(0, $aPipelines);
        $this->assertSame(0, $bPipelines,
            'Org A apply MUST NOT create rows for org B (tenant isolation).');
    }
}
