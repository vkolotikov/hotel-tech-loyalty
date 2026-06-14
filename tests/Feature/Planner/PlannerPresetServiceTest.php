<?php

namespace Tests\Feature\Planner;

use App\Models\CrmSetting;
use App\Models\PlannerTemplate;
use App\Services\PlannerPresetService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks PlannerPresetService::apply() — the planner-side mirror
 * of IndustryPresetService. Reshapes two pieces atomically when
 * an admin clicks an industry preset in Settings → Planner:
 *
 *   1. planner_groups (the icon-tab row in Day / Schedule / Month
 *      views) — single CrmSetting JSON value, OVERWRITTEN on
 *      apply.
 *   2. PlannerTemplate rows (the org-wide template library) —
 *      seeded IDEMPOTENTLY by name. Existing templates with the
 *      same name are skipped so admin's manual templates survive
 *      every preset switch.
 *
 * Coverage:
 *   - PRESETS const completeness (all 8 industries)
 *   - listPresets metadata shape + is_current flag
 *   - apply('unknown') → InvalidArgumentException
 *   - apply writes planner_groups JSON to crm_settings
 *   - apply seeds template library
 *   - Idempotency: re-applying skips existing-name rows
 *   - Custom admin-added templates survive a preset apply
 *   - apply stamps planner_preset crm_setting
 *   - apply returns summary struct with expected keys
 */
class PlannerPresetServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private PlannerPresetService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpPlannerPresetSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new PlannerPresetService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_PRESETS_const_covers_all_8_industries(): void
    {
        // Mirror of the IndustryPresetService completeness invariant.
        // Picker auto-discovers presets via self::PRESETS — a missing
        // entry here means an industry that has CRM but no planner.
        $expected = ['hotel', 'beauty', 'medical', 'legal',
                     'real_estate', 'education', 'fitness', 'restaurant'];
        $actual = array_keys(PlannerPresetService::PRESETS);

        foreach ($expected as $key) {
            $this->assertContains($key, $actual,
                "PlannerPresetService::PRESETS must include '{$key}'.");
        }
    }

    public function test_listPresets_returns_metadata_for_every_preset(): void
    {
        $out = $this->service->listPresets();

        $this->assertArrayHasKey('presets', $out);
        $this->assertArrayHasKey('current', $out);
        $this->assertCount(8, $out['presets']);

        foreach ($out['presets'] as $p) {
            $this->assertArrayHasKey('key', $p);
            $this->assertArrayHasKey('label', $p);
            $this->assertArrayHasKey('description', $p);
            $this->assertArrayHasKey('icon', $p);
            $this->assertArrayHasKey('group_count', $p);
            $this->assertArrayHasKey('template_count', $p);
            $this->assertArrayHasKey('groups', $p);
            $this->assertArrayHasKey('is_current', $p);
            $this->assertIsArray($p['groups']);
            $this->assertGreaterThan(0, $p['group_count']);
            $this->assertSame(count($p['groups']), $p['group_count']);
        }
    }

    public function test_listPresets_flags_current_via_planner_preset_setting(): void
    {
        CrmSetting::create(['key' => 'planner_preset', 'value' => 'beauty']);

        $out = $this->service->listPresets();

        $current = array_filter($out['presets'], fn ($p) => $p['is_current'] === true);
        $this->assertCount(1, $current);
        $this->assertSame('beauty', array_values($current)[0]['key']);
        $this->assertSame('beauty', $out['current']);
    }

    public function test_apply_unknown_key_throws_invalid_argument(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches("/Unknown planner preset 'wombat'/");

        $this->service->apply('wombat');
    }

    public function test_apply_writes_planner_groups_json_to_crm_settings(): void
    {
        $summary = $this->service->apply('hotel');

        $row = CrmSetting::where('key', 'planner_groups')->first();
        $this->assertNotNull($row,
            'apply() must write the planner_groups CrmSetting.');

        $decoded = json_decode($row->value, true);
        $this->assertIsArray($decoded);
        $this->assertGreaterThan(0, count($decoded));
        $this->assertSame(count($decoded), $summary['groups_set']);
    }

    public function test_apply_seeds_template_library(): void
    {
        $summary = $this->service->apply('hotel');

        $count = PlannerTemplate::count();
        $this->assertGreaterThan(0, $count);
        $this->assertSame($count, $summary['templates_added']);
        $this->assertSame(0, $summary['templates_skipped']);
    }

    public function test_apply_stamps_planner_preset_crm_setting(): void
    {
        $this->service->apply('restaurant');

        $stamp = CrmSetting::where('key', 'planner_preset')->first();
        $this->assertNotNull($stamp);
        $this->assertSame('restaurant', $stamp->value);
    }

    public function test_re_applying_same_preset_skips_existing_templates(): void
    {
        // Idempotency: a re-apply must not duplicate template rows.
        $this->service->apply('hotel');
        $countAfterFirst = PlannerTemplate::count();

        $summary = $this->service->apply('hotel');
        $countAfterSecond = PlannerTemplate::count();

        $this->assertSame($countAfterFirst, $countAfterSecond,
            'Re-applying preset must not duplicate templates.');
        $this->assertSame(0, $summary['templates_added'],
            'Re-apply must add 0 new templates.');
        $this->assertSame($countAfterFirst, $summary['templates_skipped'],
            'Re-apply must skip every existing template.');
    }

    public function test_admin_added_template_survives_a_preset_apply(): void
    {
        // The contract: a template the admin manually created (with a
        // name not in any preset) MUST NOT be deleted or modified by
        // a preset apply. The seed-by-name dedup protects only
        // matching names — admin's unique templates survive.
        $manual = PlannerTemplate::create([
            'name'        => 'My very unique custom template name 2026',
            'title'       => 'Custom workflow',
            'category'    => 'Custom',
            'task_group'  => 'Operations',
        ]);

        $this->service->apply('hotel');

        $reloaded = PlannerTemplate::find($manual->id);
        $this->assertNotNull($reloaded);
        $this->assertSame('My very unique custom template name 2026', $reloaded->name);
        $this->assertSame('Custom workflow', $reloaded->title);
    }

    public function test_admin_template_with_matching_preset_name_is_skipped_not_clobbered(): void
    {
        // If admin happened to author a template whose `name` matches
        // one in the preset (e.g. they renamed something to match
        // "Morning briefing"), the preset apply must SKIP it rather
        // than clobber the admin's edits to other fields. This is
        // the documented "don't stomp admin edits" contract.
        $presets = PlannerPresetService::PRESETS['hotel']['templates'];
        $firstTemplateName = $presets[0]['name'];

        // Admin had this name with custom title.
        $admin = PlannerTemplate::create([
            'name'  => $firstTemplateName,
            'title' => 'Custom title from admin',
        ]);

        $summary = $this->service->apply('hotel');

        $reloaded = PlannerTemplate::find($admin->id);
        $this->assertNotNull($reloaded);
        $this->assertSame('Custom title from admin', $reloaded->title,
            "Apply must NOT clobber admin's title on a same-name row.");
        $this->assertGreaterThanOrEqual(1, $summary['templates_skipped'],
            'The admin-owned row must show up in templates_skipped count.');
    }

    public function test_name_match_is_case_insensitive(): void
    {
        // The idempotency dedup uses mb_strtolower. Admin's "Morning
        // Briefing" must collide with preset's "morning briefing".
        $presets = PlannerPresetService::PRESETS['hotel']['templates'];
        $firstName = $presets[0]['name'];

        PlannerTemplate::create([
            'name' => mb_strtoupper($firstName), // CAPITAL VERSION
        ]);

        $summary = $this->service->apply('hotel');

        $this->assertGreaterThanOrEqual(1, $summary['templates_skipped'],
            'Case-shifted name must be detected as duplicate.');
    }

    public function test_switching_presets_seeds_new_templates_without_dropping_old(): void
    {
        // Switching preset is ADDITIVE on templates (no
        // deactivation, unlike custom_fields in CRM). Admin who
        // tries hotel, switches to beauty, ends up with hotel
        // templates PLUS beauty templates. This is by design —
        // template names are the dedup key.
        $this->service->apply('hotel');
        $hotelOnlyCount = PlannerTemplate::count();

        $this->service->apply('beauty');
        $afterBoth = PlannerTemplate::count();

        $this->assertGreaterThanOrEqual($hotelOnlyCount, $afterBoth,
            'Switching presets keeps the hotel templates around (additive).');
    }

    public function test_apply_returns_summary_struct_with_expected_keys(): void
    {
        $summary = $this->service->apply('hotel');

        $this->assertArrayHasKey('groups_set', $summary);
        $this->assertArrayHasKey('templates_added', $summary);
        $this->assertArrayHasKey('templates_skipped', $summary);
        $this->assertIsInt($summary['groups_set']);
        $this->assertIsInt($summary['templates_added']);
        $this->assertIsInt($summary['templates_skipped']);
    }
}
