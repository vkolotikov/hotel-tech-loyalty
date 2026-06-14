<?php

namespace Tests\Feature\Settings;

use App\Models\CrmSetting;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the CrmSetting model contract — JSON key/value config
 * backing every preset application (CRM, Planner, Loyalty,
 * Field Manager v3).
 *
 * Why this matters:
 *
 *   CrmSetting is the value store for every per-org config key
 *   that doesn't deserve its own table — planner_groups,
 *   planner_channels, planner_templates, employees, the 5+ Field
 *   Manager entity layouts, industry_preset, planner_preset,
 *   members_preset, lost_reason_layout, custom_field_layouts, …
 *
 *   The 2026-05-11 migration `2026_05_11_120000_crm_settings_per_org_unique`
 *   replaced a single-tenant `UNIQUE(key)` with composite
 *   `UNIQUE(organization_id, key)`. Without it, any fresh org's
 *   first write of a seeded key (planner_groups, employees) hits
 *   23505 unique violation. That migration is the load-bearing
 *   schema invariant; the model-side contract here ensures every
 *   write goes through the JSON cast cleanly.
 *
 *   `value` is jsonb in prod, cast 'json' (NOT 'array') so it
 *   accepts BOTH array-shaped + object-shaped + primitive-shaped
 *   payloads. Planner stores arrays (group lists); Field Manager
 *   stores objects (per-entity layout configs); active_preset
 *   stores plain strings. The cast must round-trip all shapes.
 *
 * Contract:
 *
 *   - value json cast — round-trips arrays, objects/assoc arrays,
 *     strings, ints, bools, nulls.
 *   - key uniqueness is composite (org × key) — same key can
 *     coexist across orgs.
 *   - updateOrCreate by (org × key) is the canonical write
 *     pattern (used by CrmController, IndustryPresetService,
 *     PlannerPresetService, LoyaltyPresetService).
 *   - BelongsToOrganization + TenantScope cross-org isolation.
 */
class CrmSettingModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key');
                $t->text('value')->nullable();
                $t->timestamps();
                // Composite unique — the 2026-05-11 invariant.
                $t->unique(['organization_id', 'key']);
            });
        }

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

    /* ─── value json cast — array shape ─── */

    public function test_value_round_trips_indexed_array(): void
    {
        // Planner's planner_groups + planner_channels are
        // indexed arrays. Lock so the cast preserves order.
        $groups = ['Housekeeping', 'Front Desk', 'Maintenance', 'F&B'];

        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'planner_groups',
            'value'           => $groups,
        ]);

        $this->assertSame($groups, $row->fresh()->value);
    }

    public function test_value_round_trips_associative_array(): void
    {
        // Field Manager v3 stores per-entity layout configs as
        // assoc arrays (Inquiry.list.* / Customer.detail.* etc).
        $layout = [
            'form' => ['name' => true, 'phone' => true, 'budget' => false],
            'list' => ['priority_pill' => true, 'owner' => false],
        ];

        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'inquiry_fields',
            'value'           => $layout,
        ]);

        $this->assertSame($layout, $row->fresh()->value);
    }

    public function test_value_round_trips_deeply_nested_structure(): void
    {
        // Stress test: planner_templates carries the deepest
        // structure — array of objects, each with metadata,
        // subtask arrays, custom_data jsonb.
        $templates = [
            [
                'name'             => 'Morning rounds',
                'task_group'       => 'Housekeeping',
                'duration_minutes' => 60,
                'priority'         => 'normal',
                'subtasks'         => [
                    ['title' => 'Check rooms 100-110'],
                    ['title' => 'Restock minibar'],
                ],
                'meta'             => ['shift' => 'morning', 'team_size' => 3],
            ],
            [
                'name'        => 'Evening close',
                'task_group'  => 'Front Desk',
                'duration_minutes' => 30,
                'priority'    => 'high',
                'subtasks'    => [],
            ],
        ];

        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'planner_templates',
            'value'           => $templates,
        ]);

        $this->assertSame($templates, $row->fresh()->value);
    }

    /* ─── value json cast — primitive shapes ─── */

    public function test_value_round_trips_string_primitive(): void
    {
        // active_preset stores a plain string ('hotel' /
        // 'beauty' / 'medical' / …). The 'json' cast MUST
        // accept primitives (NOT 'array' — which would force
        // wrapping).
        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'industry_preset',
            'value'           => 'hotel',
        ]);

        $this->assertSame('hotel', $row->fresh()->value);
    }

    public function test_value_round_trips_integer_primitive(): void
    {
        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'team_capacity',
            'value'           => 42,
        ]);

        $this->assertSame(42, $row->fresh()->value);
    }

    public function test_value_round_trips_boolean_primitive(): void
    {
        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'auto_assign_inquiries',
            'value'           => true,
        ]);

        $this->assertTrue($row->fresh()->value);
    }

    public function test_value_round_trips_null(): void
    {
        // Field Manager v3 stores null when a layout is unset
        // — the deep-merge in useSettings() handles null →
        // defaults.
        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'task_fields',
            'value'           => null,
        ]);

        $this->assertNull($row->fresh()->value);
    }

    public function test_value_round_trips_empty_array(): void
    {
        // Lock: empty array [] round-trips as [] not null. The
        // distinction matters: a present-but-empty
        // planner_groups (admin cleared the list) is meaningfully
        // different from a never-set planner_groups (use
        // defaults).
        $row = CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'employees',
            'value'           => [],
        ]);

        $this->assertSame([], $row->fresh()->value);
    }

    /* ─── Composite unique (org × key) invariant ─── */

    public function test_same_key_can_coexist_across_orgs(): void
    {
        // CRITICAL: the 2026-05-11 invariant. Org A's
        // planner_groups MUST NOT collide with Org B's. Pre-fix
        // (single-tenant UNIQUE(key)), this would 23505.
        CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'planner_groups',
            'value'           => ['A1', 'A2'],
        ]);

        $orgB = OrganizationFactory::new()->create()->id;
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);

        $bRow = CrmSetting::create([
            'organization_id' => $orgB,
            'key'             => 'planner_groups',
            'value'           => ['B1', 'B2'],
        ]);

        $this->assertNotNull($bRow->id,
            'Same key MUST coexist across orgs — 2026-05-11 composite-unique invariant.');
    }

    public function test_same_key_in_same_org_violates_uniqueness(): void
    {
        // Defensive: lock that uniqueness IS enforced within an
        // org (so updateOrCreate is the safe write pattern, NOT
        // create-then-create).
        CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'planner_groups',
            'value'           => ['first'],
        ]);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);

        CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'planner_groups',
            'value'           => ['duplicate'],
        ]);
    }

    /* ─── updateOrCreate canonical write pattern ─── */

    public function test_update_or_create_by_org_and_key_creates_when_missing(): void
    {
        // The canonical write pattern from
        // IndustryPresetService::apply() +
        // PlannerPresetService::apply() +
        // LoyaltyPresetService::apply() +
        // CrmController::updateSettings.
        CrmSetting::updateOrCreate(
            ['organization_id' => $this->orgId, 'key' => 'planner_groups'],
            ['value' => ['Housekeeping', 'F&B']]
        );

        $row = CrmSetting::where('key', 'planner_groups')->first();
        $this->assertNotNull($row);
        $this->assertSame(['Housekeeping', 'F&B'], $row->value);
    }

    public function test_update_or_create_by_org_and_key_updates_when_present(): void
    {
        // Re-apply a preset → existing row updates in place,
        // no 23505.
        CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'industry_preset',
            'value'           => 'hotel',
        ]);

        CrmSetting::updateOrCreate(
            ['organization_id' => $this->orgId, 'key' => 'industry_preset'],
            ['value' => 'beauty']
        );

        $rows = CrmSetting::where('key', 'industry_preset')->get();
        $this->assertCount(1, $rows,
            'updateOrCreate MUST update in place, not insert duplicate.');
        $this->assertSame('beauty', $rows->first()->value);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $row = CrmSetting::create([
            'key'   => 'auto-filled-key',
            'value' => 'test',
        ]);

        $this->assertSame($this->orgId, (int) $row->organization_id);
    }

    public function test_tenant_scope_isolates_crm_settings_cross_org(): void
    {
        // CRITICAL: industry_preset + planner_preset settings
        // reveal a tenant's industry. Cross-leak would expose
        // competitor's vertical positioning + preset taxonomy.
        $orgB = OrganizationFactory::new()->create()->id;

        CrmSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'industry_preset',
            'value'           => 'hotel',
        ]);
        \DB::table('crm_settings')->insert([
            'organization_id' => $orgB,
            'key'             => 'industry_preset',
            'value'           => json_encode('medical'),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = CrmSetting::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('hotel', $aRows->first()->value);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = CrmSetting::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('medical', $bRows->first()->value);
    }
}
