<?php

namespace Tests\Feature\Crm;

use App\Models\CustomField;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the CustomField model contract — admin-defined custom
 * fields per entity (CRM v2 Phase 7).
 *
 * Sister to CustomFieldServiceValidateTest (the validate() type
 * coercion contract). THIS test locks the MODEL surface: the
 * ENTITIES + TYPES enum constants, the casts, and the per-org
 * uniqueness invariant.
 *
 * Why this matters:
 *
 *   ENTITIES + TYPES are the documented enum surfaces. The
 *   migration's CHECK constraint enforces them at the DB layer;
 *   the constants surface them to the SPA's field-type picker
 *   and the CustomFieldService::validate type coercion match
 *   expression. A regression in EITHER constant silently
 *   miscategorises new fields.
 *
 *   The unique constraint on (org × entity × key) prevents
 *   duplicate field definitions per entity — admin can't
 *   accidentally create two 'allergies' fields on guest, which
 *   would surface duplicate inputs in the SPA's Add Inquiry form.
 *
 * Contract:
 *
 *   - ENTITIES constant frozen at 4 documented values
 *   - TYPES constant frozen at 10 documented values
 *   - Casts: config array, required + is_active + show_in_list
 *     all bool, sort_order int
 *   - Duplicate (org, entity, key) throws UniqueConstraintViolationException
 *   - Same (entity, key) coexists ACROSS orgs
 *   - BelongsToOrganization auto-fill + TenantScope isolation
 */
class CustomFieldModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpCustomFieldsSchema includes the unique index
        // (organization_id, entity, key).
        $this->setUpCustomFieldsSchema();

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

    private function field(array $attrs = []): CustomField
    {
        return CustomField::create(array_merge([
            'organization_id' => $this->orgId,
            'entity'          => 'guest',
            'key'             => 'allergies_' . uniqid(),
            'label'           => 'Allergies',
            'type'            => 'text',
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── ENTITIES constant ─── */

    public function test_entities_constant_is_locked_at_4_documented_values(): void
    {
        // Lock the public surface. Adding a 5th entity requires
        // updating BOTH this constant AND
        // (1) the migration's CHECK constraint
        // (2) the SPA's entity-tab list in FieldManagerPanel
        // (3) the entity's model's $fillable for `custom_data`
        // This test catches the omission.
        $this->assertSame(
            ['inquiry', 'guest', 'corporate_account', 'task'],
            CustomField::ENTITIES,
            'CRITICAL: ENTITIES locked at 4 documented values. '
            . 'Adding a 5th requires migration + SPA + model updates.',
        );
    }

    public function test_each_entity_value_persists_intact(): void
    {
        foreach (CustomField::ENTITIES as $entity) {
            $row = $this->field([
                'entity' => $entity,
                'key'    => 'test_for_' . $entity,
            ]);

            $this->assertSame($entity, $row->fresh()->entity,
                "Entity '{$entity}' MUST persist intact.");
        }
    }

    /* ─── TYPES constant ─── */

    public function test_types_constant_is_locked_at_10_documented_values(): void
    {
        // Lock the 10 documented field types. The SPA's field-type
        // picker shows these; CustomFieldService::validate has a
        // match expression on the same list. Drift between them
        // would silently break per-type coercion.
        $this->assertSame(
            ['text', 'textarea', 'number', 'date',
             'select', 'multiselect', 'checkbox',
             'url', 'email', 'phone'],
            CustomField::TYPES,
            'CRITICAL: TYPES locked at 10 documented values. '
            . 'Adding a type requires migration + validate() + SPA picker updates.',
        );
    }

    public function test_each_type_value_persists_intact(): void
    {
        foreach (CustomField::TYPES as $i => $type) {
            $row = $this->field([
                'type' => $type,
                'key'  => 'field_' . $i,
            ]);

            $this->assertSame($type, $row->fresh()->type,
                "Type '{$type}' MUST persist intact.");
        }
    }

    /* ─── Casts ─── */

    public function test_config_round_trips_through_array_cast(): void
    {
        // config stores per-type setup: select/multiselect store
        // their options[] here; number stores min/max; date stores
        // min/max date. A regression in the array cast silently
        // breaks every typed field's option list.
        $cfg = [
            'options' => ['vegan', 'vegetarian', 'gluten-free'],
            'help_url' => 'https://example.com/help',
        ];

        $row = $this->field(['type' => 'select', 'config' => $cfg]);

        $this->assertSame($cfg, $row->fresh()->config);
    }

    public function test_required_casts_to_boolean(): void
    {
        $req = $this->field(['required' => true]);
        $opt = $this->field(['required' => false]);

        $this->assertTrue($req->required);
        $this->assertFalse($opt->required);
        $this->assertIsBool($req->required);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        // Soft-deactivate keeps saved values on entity rows but
        // hides the field from new writes (per Phase 7 contract).
        $on = $this->field(['is_active' => true]);
        $off = $this->field(['is_active' => false]);

        $this->assertTrue($on->is_active);
        $this->assertFalse($off->is_active);
    }

    public function test_show_in_list_casts_to_boolean(): void
    {
        // Phase 8 — promotes a custom field to an extra column on
        // the leads/customers/etc list view. Lock the cast.
        $row = $this->field(['show_in_list' => true]);

        $this->assertTrue($row->show_in_list);
        $this->assertIsBool($row->show_in_list);
    }

    public function test_sort_order_casts_to_integer(): void
    {
        // Drives the SPA's drag-reorder. String '3' from form
        // input MUST coerce.
        $row = $this->field(['sort_order' => '3']);

        $this->assertSame(3, $row->sort_order);
        $this->assertIsInt($row->sort_order);
    }

    /* ─── Per-org per-entity per-key uniqueness ─── */

    public function test_duplicate_org_entity_key_throws_unique_violation(): void
    {
        // CRITICAL: prevents admin from accidentally creating two
        // 'allergies' fields on guest. The SPA's create flow would
        // silently surface duplicate inputs in Add Inquiry form
        // otherwise.
        $this->field([
            'entity' => 'guest',
            'key'    => 'allergies_fixed',
        ]);

        $this->expectException(UniqueConstraintViolationException::class);
        $this->field([
            'entity' => 'guest',
            'key'    => 'allergies_fixed', // duplicate
        ]);
    }

    public function test_same_key_in_different_entity_coexists(): void
    {
        // The unique key is (org, entity, key). Same key on
        // DIFFERENT entities is fine — a 'priority' field could
        // exist on BOTH inquiry AND task.
        $this->field(['entity' => 'inquiry', 'key' => 'priority']);
        $this->field(['entity' => 'task',    'key' => 'priority']);

        $count = CustomField::withoutGlobalScopes()
            ->where('key', 'priority')
            ->count();
        $this->assertSame(2, $count,
            'Same key on DIFFERENT entities MUST coexist (unique on org+entity+key).');
    }

    public function test_same_entity_key_in_different_orgs_coexists(): void
    {
        // Per-tenant unique — orgs MUST be able to define their
        // own 'allergies' fields independently.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('custom_fields')->insert([
            'organization_id' => $orgA,
            'entity'          => 'guest',
            'key'             => 'shared_key',
            'label'           => 'A',
            'type'            => 'text',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('custom_fields')->insert([
            'organization_id' => $orgB,
            'entity'          => 'guest',
            'key'             => 'shared_key',
            'label'           => 'B',
            'type'            => 'text',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $count = CustomField::withoutGlobalScopes()
            ->where('key', 'shared_key')->count();
        $this->assertSame(2, $count,
            'Same entity+key in DIFFERENT orgs MUST coexist (per-tenant unique).');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $row = $this->field();

        $this->assertSame($this->orgId, (int) $row->organization_id);
    }

    public function test_tenant_scope_isolates_custom_fields_cross_org(): void
    {
        // CRITICAL: an org's custom-field schema is tenant-private.
        // Cross-leak would expose their CRM customisation strategy
        // to competitors.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->field(['entity' => 'guest', 'key' => 'org_a_field']);
        \DB::table('custom_fields')->insert([
            'organization_id' => $orgB,
            'entity'          => 'guest',
            'key'             => 'org_b_field',
            'label'           => 'B',
            'type'            => 'text',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, CustomField::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, CustomField::all());
    }
}
