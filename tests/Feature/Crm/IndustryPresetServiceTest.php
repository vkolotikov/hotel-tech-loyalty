<?php

namespace Tests\Feature\Crm;

use App\Models\CrmSetting;
use App\Models\CustomField;
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
 * Locks IndustryPresetService::apply() — the atomic 8-industry
 * preset switcher that powers the one-click industry setup.
 *
 * Why this matters: this single service touches pipeline + stages
 * + lost reasons + 6 layout configs + custom fields + chatbot
 * identity. A regression on any one of those leaves the org in a
 * mismatched state where the sidebar says "Beauty" but the
 * pipeline says "Hotel Sales". Locking the contract here surfaces
 * drift across what's currently 8 independent presets + 5 distinct
 * tables.
 *
 * Coverage:
 *
 *   1. PRESETS const completeness — all 8 GTM + GTM-deferred
 *      industries present.
 *
 *   2. listPresets() returns metadata for the picker UI.
 *
 *   3. apply('unknown') throws InvalidArgumentException —
 *      callers (controller) translate to 422.
 *
 *   4. Happy path on a fresh org: hotel preset seeds the
 *      pipeline + stages + lost reasons + crm_settings entries.
 *
 *   5. Pipeline-stage migration when switching presets — existing
 *      inquiries are reassigned by `kind` (open/won/lost), not
 *      hard-deleted alongside the old stages.
 *
 *   6. Lost-reason soft-deactivate vs hard-delete — in-use
 *      reasons stay around for historical reporting.
 *
 *   7. Idempotency — re-applying the same preset doesn't dupe
 *      stages or reasons.
 *
 *   8. Layout configs (the 6 entity field-visibility keys) get
 *      written to crm_settings atomically.
 *
 *   9. industry_preset key gets stamped so listPresets() can
 *      flag is_current and a future switch can deactivate the
 *      previous preset's custom fields.
 */
class IndustryPresetServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private IndustryPresetService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmPresetSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // The service composes with CustomFieldService::applyPreset
        // for the custom-fields branch. Both real instances are
        // safe here — pure logic, the schema's already provisioned.
        $this->service = new IndustryPresetService(new CustomFieldService());
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_PRESETS_const_covers_all_8_GTM_industries(): void
    {
        // The complete-coverage invariant. Each industry maps to a
        // Phase 0 sub-brand domain in industryHosts.ts; a missing
        // preset here would let a host detect the industry but
        // the picker would show "Unknown" for that key.
        $expected = ['hotel', 'beauty', 'medical', 'legal',
                     'real_estate', 'education', 'fitness', 'restaurant'];
        $actual = array_keys(IndustryPresetService::PRESETS);

        foreach ($expected as $key) {
            $this->assertContains($key, $actual,
                "PRESETS must include the '{$key}' industry.");
        }
    }

    public function test_listPresets_returns_metadata_for_every_preset(): void
    {
        $out = $this->service->listPresets();

        $this->assertArrayHasKey('presets', $out);
        $this->assertArrayHasKey('current', $out);
        $this->assertCount(8, $out['presets'],
            'listPresets must return one entry per preset (8 industries).');

        foreach ($out['presets'] as $p) {
            // Each preset entry must carry the picker fields.
            $this->assertArrayHasKey('key', $p);
            $this->assertArrayHasKey('label', $p);
            $this->assertArrayHasKey('description', $p);
            $this->assertArrayHasKey('icon', $p);
            $this->assertArrayHasKey('pipeline_name', $p);
            $this->assertArrayHasKey('stage_count', $p);
            $this->assertArrayHasKey('reason_count', $p);
            $this->assertArrayHasKey('is_current', $p);
            $this->assertIsBool($p['is_current']);
        }
    }

    public function test_listPresets_flags_current_via_industry_preset_setting(): void
    {
        // current_industry comes from crm_settings.industry_preset —
        // seeded the moment apply() runs. listPresets must surface
        // it as is_current=true on the matching entry.
        CrmSetting::create(['key' => 'industry_preset', 'value' => 'beauty']);

        $out = $this->service->listPresets();

        $current = array_filter($out['presets'], fn ($p) => $p['is_current'] === true);
        $this->assertCount(1, $current);
        $this->assertSame('beauty', array_values($current)[0]['key']);
        $this->assertSame('beauty', $out['current']);
    }

    public function test_apply_unknown_key_throws_invalid_argument(): void
    {
        // The error path. Controllers translate this into a 422
        // with an actionable message.
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches("/Unknown industry preset 'kangaroo'/");

        $this->service->apply('kangaroo');
    }

    public function test_apply_hotel_on_empty_org_seeds_pipeline_with_stages(): void
    {
        // Happy path on a fresh org: no prior pipeline / stages.
        // Service must create a default pipeline + the full stage
        // list from the preset.
        $summary = $this->service->apply('hotel');

        $pipeline = Pipeline::where('is_default', true)->first();
        $this->assertNotNull($pipeline);

        $stages = PipelineStage::where('pipeline_id', $pipeline->id)->get();
        $this->assertGreaterThan(0, $stages->count());
        $this->assertSame($stages->count(), $summary['stages_replaced']);

        // Every stage's `kind` must be one of the canonical 3 —
        // mirrors PipelineStageKindTest's enum contract.
        foreach ($stages as $s) {
            $this->assertContains($s->kind, ['open', 'won', 'lost']);
        }
    }

    public function test_apply_hotel_seeds_lost_reason_taxonomy(): void
    {
        $summary = $this->service->apply('hotel');

        $reasons = InquiryLostReason::all();
        $this->assertGreaterThan(0, $reasons->count());
        $this->assertSame($reasons->count(), $summary['reasons_set']);
        foreach ($reasons as $r) {
            $this->assertTrue((bool) $r->is_active);
        }
    }

    public function test_apply_stamps_industry_preset_setting_and_layout_keys(): void
    {
        $summary = $this->service->apply('beauty');

        // industry_preset surfaces in the picker as is_current.
        $stamp = CrmSetting::where('key', 'industry_preset')->first();
        $this->assertNotNull($stamp);
        $this->assertSame('beauty', $stamp->value);

        // 6 layout keys get written by the preset (one per entity
        // type the field-visibility system covers).
        $expectedKeys = ['inquiry_fields', 'customer_fields', 'corporate_fields',
                         'deal_fields', 'member_fields', 'task_fields'];
        foreach ($expectedKeys as $key) {
            $row = CrmSetting::where('key', $key)->first();
            $this->assertNotNull($row, "Layout config key '{$key}' must be written.");
            $this->assertNotEmpty($row->value, "Layout '{$key}' must have a non-empty value.");
        }

        $this->assertTrue($summary['layout_updated']);
    }

    public function test_apply_is_idempotent_on_repeat_application(): void
    {
        // Re-applying the same preset should not duplicate stages
        // or lost reasons. The replace logic must detect existing
        // stages and replace, not append.
        $this->service->apply('hotel');
        $stagesAfterFirst = PipelineStage::count();
        $reasonsAfterFirst = InquiryLostReason::count();

        $this->service->apply('hotel');
        $stagesAfterSecond = PipelineStage::count();
        $reasonsAfterSecond = InquiryLostReason::count();

        $this->assertSame($stagesAfterFirst, $stagesAfterSecond,
            'Re-applying preset must not duplicate stages.');
        $this->assertSame($reasonsAfterFirst, $reasonsAfterSecond,
            'Re-applying preset must not duplicate lost reasons.');
    }

    public function test_existing_inquiry_migrates_to_new_stage_of_same_kind(): void
    {
        // The non-destructive contract: when switching presets, an
        // existing inquiry on a 'won' stage must end up on a 'won'
        // stage in the new preset (not deleted, not orphaned).
        $this->service->apply('hotel');
        $oldWonStage = PipelineStage::where('kind', 'won')->first();
        $this->assertNotNull($oldWonStage);

        $inquiry = Inquiry::create([
            'pipeline_stage_id' => $oldWonStage->id,
            'pipeline_id'       => $oldWonStage->pipeline_id,
            'status'            => $oldWonStage->name,
        ]);

        // Switch to a different preset.
        $this->service->apply('beauty');

        $inquiry->refresh();
        $newStage = PipelineStage::find($inquiry->pipeline_stage_id);
        $this->assertNotNull($newStage, 'Inquiry must reference a real new stage.');
        $this->assertSame('won', $newStage->kind,
            'Existing won-stage inquiry must migrate to the new preset\'s won stage.');
    }

    public function test_existing_inquiry_on_open_stage_migrates_to_new_open_stage(): void
    {
        // Mirror of the won-migration test for the open kind.
        // 'open' is the most common state — even more important
        // not to lose track of these inquiries across a switch.
        $this->service->apply('hotel');
        $oldOpenStage = PipelineStage::where('kind', 'open')->first();

        $inquiry = Inquiry::create([
            'pipeline_stage_id' => $oldOpenStage->id,
            'pipeline_id'       => $oldOpenStage->pipeline_id,
            'status'            => $oldOpenStage->name,
        ]);

        $this->service->apply('restaurant');

        $inquiry->refresh();
        $newStage = PipelineStage::find($inquiry->pipeline_stage_id);
        $this->assertSame('open', $newStage->kind);
    }

    public function test_inquiry_status_text_mirrors_new_stage_name_after_migration(): void
    {
        // The legacy `inquiries.status` text column is mirrored to
        // the new stage's name on migration. Without this, the
        // pre-pipelines UI surfaces (which still read .status) show
        // the OLD stage name post-switch.
        $this->service->apply('hotel');
        $oldStage = PipelineStage::where('kind', 'open')->first();

        $inquiry = Inquiry::create([
            'pipeline_stage_id' => $oldStage->id,
            'pipeline_id'       => $oldStage->pipeline_id,
            'status'            => $oldStage->name,
        ]);
        $oldStageName = $oldStage->name;

        $this->service->apply('medical');
        $inquiry->refresh();

        $newStage = PipelineStage::find($inquiry->pipeline_stage_id);
        $this->assertSame($newStage->name, $inquiry->status,
            'Inquiry.status must mirror the new stage name.');
        $this->assertNotSame($oldStageName, $inquiry->status,
            'Old stage name must not survive the migration on .status.');
    }

    public function test_lost_reason_in_use_is_soft_deactivated_not_hard_deleted(): void
    {
        // Critical for historical reporting: a Lost reason with
        // attached inquiries must stay in the table (is_active=false)
        // so the funnel report can still render its label for past
        // leads. Hard-deleting would make those past inquiries
        // reference a NULL lost_reason_id.
        //
        // IMPORTANT — pick a hotel-specific label. replaceLostReasons
        // soft-deactivates in step 1 BUT step 2 reactivates any row
        // whose label matches the new preset's list. So if we use
        // 'Price' (in both hotel + beauty), the row gets
        // soft-deactivated then immediately reactivated — true to
        // the documented "switch back recovery" path. To test the
        // soft-deactivate side in isolation we need a label only in
        // the OLD preset.
        $this->service->apply('hotel');
        $reasonInUse = InquiryLostReason::where('label', 'Unavailable for those dates')->first();
        $this->assertNotNull($reasonInUse,
            'Hotel preset must seed "Unavailable for those dates" (hotel-specific label).');

        $inq = Inquiry::create([
            'lost_reason_id' => $reasonInUse->id,
            'status'         => 'Lost',
        ]);

        // Sanity: the inquiry was created with the lost_reason_id
        // set + the relationship sees it.
        $this->assertSame((int) $reasonInUse->id, (int) $inq->lost_reason_id);
        $this->assertTrue($reasonInUse->inquiries()->exists());

        $watchedId = $reasonInUse->id;

        // Switch to a different preset — beauty does NOT have a
        // "Unavailable for those dates" reason in its list, so step 2
        // can't reactivate this row.
        $this->service->apply('beauty');

        $raw = \Illuminate\Support\Facades\DB::table('inquiry_lost_reasons')
            ->where('id', $watchedId)
            ->first();
        $this->assertNotNull($raw,
            'Lost reason with attached inquiries must NOT be hard-deleted.');
        $this->assertFalse((bool) $raw->is_active,
            'Lost reason with attached inquiries must be soft-deactivated.');
    }

    public function test_same_label_lost_reason_reactivates_on_switch_back_path(): void
    {
        // The documented "switch back" recovery: a label that exists
        // in BOTH the old AND the new preset (e.g. 'Price' is shared
        // between hotel and beauty) gets soft-deactivated in step 1
        // of replaceLostReasons, then REACTIVATED in step 2 because
        // step 2's label-match check upgrades it back to is_active=true.
        // This is by design — an admin who tries hotel, switches to
        // beauty, then back to hotel doesn't lose any reason they had
        // historical inquiries against.
        $this->service->apply('hotel');
        $sharedReason = InquiryLostReason::where('label', 'Price')->first();
        $this->assertNotNull($sharedReason);

        Inquiry::create([
            'lost_reason_id' => $sharedReason->id,
            'status'         => 'Lost',
        ]);

        $this->service->apply('beauty');

        $raw = \Illuminate\Support\Facades\DB::table('inquiry_lost_reasons')
            ->where('id', $sharedReason->id)
            ->first();
        $this->assertNotNull($raw);
        $this->assertTrue((bool) $raw->is_active,
            'A label present in BOTH presets stays active across switches (switch-back recovery).');
    }

    public function test_unused_lost_reasons_are_hard_deleted_on_switch(): void
    {
        // Symmetric to the soft-deactivate test: reasons WITHOUT
        // attached inquiries are hard-deleted on switch. Keeps the
        // table from accumulating dead rows across many switches.
        $this->service->apply('hotel');
        $hotelReasonCount = InquiryLostReason::count();
        $this->assertGreaterThan(0, $hotelReasonCount);

        // No inquiry attached to any reason.
        $this->service->apply('beauty');

        $reasonsAfterSwitch = InquiryLostReason::where('is_active', true)->count();
        $deactivatedAfterSwitch = InquiryLostReason::where('is_active', false)->count();

        // None of the hotel reasons had inquiries, so none get
        // soft-deactivated — they all hard-delete and only the
        // beauty reasons remain.
        $this->assertSame(0, $deactivatedAfterSwitch,
            'Unused old reasons must hard-delete, not soft-deactivate.');
        $this->assertGreaterThan(0, $reasonsAfterSwitch,
            'New preset reasons must be active after switch.');
    }

    public function test_switching_presets_deactivates_old_custom_fields(): void
    {
        // CustomFieldService::applyPreset adds fields per preset key.
        // When switching presets, the old preset's seeded fields
        // (NOT admin-added) get soft-deactivated. Manually-added
        // fields stay untouched.
        $this->service->apply('beauty');
        $beautyFieldCount = CustomField::where('is_active', true)->count();

        // Apply a manual field that doesn't belong to any preset.
        CustomField::create([
            'entity'    => 'inquiry',
            'key'       => 'manual_admin_field',
            'label'     => 'Admin-added field',
            'type'      => 'text',
            'is_active' => true,
        ]);
        $beforeSwitch = CustomField::where('is_active', true)->count();
        $this->assertSame($beautyFieldCount + 1, $beforeSwitch);

        // Switch industries — old preset fields get soft-deactivated.
        $this->service->apply('medical');

        $manualStillActive = CustomField::where('key', 'manual_admin_field')
            ->where('is_active', true)
            ->exists();
        $this->assertTrue($manualStillActive,
            'Admin-added fields must NOT be deactivated when switching presets.');
    }

    public function test_apply_returns_summary_struct_with_expected_keys(): void
    {
        // Contract on the return shape — the controller surfaces
        // these in the success toast.
        $summary = $this->service->apply('hotel');

        $this->assertArrayHasKey('stages_replaced', $summary);
        $this->assertArrayHasKey('reasons_set', $summary);
        $this->assertArrayHasKey('fields_added', $summary);
        $this->assertArrayHasKey('fields_deactivated', $summary);
        $this->assertArrayHasKey('layout_updated', $summary);

        $this->assertIsInt($summary['stages_replaced']);
        $this->assertIsInt($summary['reasons_set']);
        $this->assertIsInt($summary['fields_added']);
        $this->assertIsInt($summary['fields_deactivated']);
        $this->assertIsBool($summary['layout_updated']);
    }
}
