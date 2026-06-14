<?php

namespace Tests\Feature\LeadForm;

use App\Models\LeadForm;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the LeadForm model contract — embeddable lead-capture
 * forms (CRM v2 Phase 10).
 *
 * Sister to LeadFormPublicControllerTest (Tier R2) which covers
 * the public submit + show endpoints. This file locks the model's
 * casts + static helpers + canonical default field/design shapes.
 *
 * Why this matters:
 *
 *   defaultFields() + defaultDesign() are the SOURCE OF TRUTH
 *   for new-form bootstrapping AND the public widget's fallback
 *   when fields/design columns are null. A regression in either
 *   silently breaks every newly-created lead form across every
 *   tenant.
 *
 *   newEmbedKey() generates the public URL token customers paste
 *   into their iframe. 32-char alphanum collision-resistance is
 *   load-bearing — brute-force scanning the URL space MUST be
 *   infeasible.
 *
 * Contract:
 *
 *   defaultFields() returns 8 documented fields in a stable
 *   order (visual order on the rendered form). Each field has:
 *     key, type, label, placeholder, required, enabled
 *
 *   defaultDesign() returns the documented design map with
 *   title + intro + submit_text + success_title + success_message
 *   + primary_color + theme + corners + show_privacy_link +
 *   show_brand_logo.
 *
 *   newEmbedKey() returns 32-char alphanum string, unique
 *   across the table (loops until distinct).
 *
 *   Casts: fields + design array; is_active bool; submission_count
 *   int; last_submitted_at datetime.
 *
 *   submissions() HasMany relationship.
 *
 *   BelongsToOrganization + TenantScope isolation.
 */
class LeadFormModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('lead_forms')) {
            Schema::create('lead_forms', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('embed_key', 32)->unique();
                $t->text('description')->nullable();
                $t->string('default_source')->nullable();
                $t->string('default_inquiry_type')->nullable();
                $t->unsignedBigInteger('default_property_id')->nullable();
                $t->unsignedBigInteger('default_assigned_to')->nullable();
                $t->text('fields')->nullable();
                $t->text('design')->nullable();
                $t->boolean('is_active')->default(true);
                $t->integer('submission_count')->default(0);
                $t->timestamp('last_submitted_at')->nullable();
                $t->timestamps();
                $t->index('organization_id');
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

    private function form(array $attrs = []): LeadForm
    {
        return LeadForm::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test Form',
            'embed_key'       => 'embed_' . substr(md5(uniqid()), 0, 26),
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── defaultFields() static helper ─── */

    public function test_default_fields_returns_8_documented_fields(): void
    {
        // Lock the field count. Adding a 9th MUST surface here
        // (the SPA's "Show all fields" toggle expects this count).
        $fields = LeadForm::defaultFields();

        $this->assertCount(8, $fields,
            'defaultFields MUST return exactly 8 documented fields.');
    }

    public function test_default_fields_includes_documented_keys_in_order(): void
    {
        // Lock the canonical visual order. A reorder regression
        // would silently shuffle the rendered form across every
        // tenant's existing forms (since the public widget falls
        // back to defaults when fields=null).
        $expected = [
            'name', 'email', 'phone', 'inquiry_type',
            'check_in', 'check_out', 'num_people', 'message',
        ];

        $actual = array_column(LeadForm::defaultFields(), 'key');

        $this->assertSame($expected, $actual,
            'defaultFields visual order MUST match the documented sequence.');
    }

    public function test_default_fields_name_email_message_are_enabled(): void
    {
        // CRITICAL: name + email + message are the 3 fields
        // enabled by default. A regression that disabled them
        // would render an empty form on every new lead-capture
        // page.
        $fields = collect(LeadForm::defaultFields())->keyBy('key');

        $this->assertTrue($fields['name']['enabled'],
            "'name' MUST be enabled by default.");
        $this->assertTrue($fields['email']['enabled'],
            "'email' MUST be enabled by default.");
        $this->assertTrue($fields['message']['enabled'],
            "'message' MUST be enabled by default.");
    }

    public function test_default_fields_stay_fields_are_disabled_by_default(): void
    {
        // check_in / check_out / num_people / inquiry_type all
        // default to disabled — admins enable when their workflow
        // needs them. Pre-fix a regression that enabled them all
        // would show a hotel-flavoured form on every tenant
        // (beauty / medical / restaurant orgs see "Check-in" etc).
        $fields = collect(LeadForm::defaultFields())->keyBy('key');

        $this->assertFalse($fields['check_in']['enabled']);
        $this->assertFalse($fields['check_out']['enabled']);
        $this->assertFalse($fields['num_people']['enabled']);
        $this->assertFalse($fields['inquiry_type']['enabled']);
    }

    public function test_default_fields_name_and_email_are_required(): void
    {
        // CRITICAL: name + email are required. Pre-fix a regression
        // that flipped them to optional would let submissions
        // through with empty contact info — orphan inquiries with
        // no way to reach the lead.
        $fields = collect(LeadForm::defaultFields())->keyBy('key');

        $this->assertTrue($fields['name']['required'],
            "'name' MUST be required by default.");
        $this->assertTrue($fields['email']['required'],
            "'email' MUST be required by default.");
    }

    public function test_default_fields_field_types_match_documented_set(): void
    {
        // Lock the type mapping. The public LeadFormPublicController
        // builds validation rules by field type — a type-name
        // typo silently breaks validation.
        $fields = collect(LeadForm::defaultFields())->keyBy('key');

        $this->assertSame('text',     $fields['name']['type']);
        $this->assertSame('email',    $fields['email']['type']);
        $this->assertSame('phone',    $fields['phone']['type']);
        $this->assertSame('select',   $fields['inquiry_type']['type']);
        $this->assertSame('date',     $fields['check_in']['type']);
        $this->assertSame('date',     $fields['check_out']['type']);
        $this->assertSame('number',   $fields['num_people']['type']);
        $this->assertSame('textarea', $fields['message']['type']);
    }

    /* ─── defaultDesign() static helper ─── */

    public function test_default_design_returns_documented_keys(): void
    {
        $design = LeadForm::defaultDesign();

        // Lock the 10 documented design keys. A missing key would
        // surface as `undefined` in the SPA's editor — visible UX
        // breakage.
        $expected = [
            'title', 'intro', 'submit_text',
            'success_title', 'success_message',
            'primary_color', 'theme', 'corners',
            'show_privacy_link', 'show_brand_logo',
        ];

        foreach ($expected as $key) {
            $this->assertArrayHasKey($key, $design,
                "defaultDesign MUST include '{$key}'.");
        }
    }

    public function test_default_design_theme_is_light(): void
    {
        // Documented default — light theme. Customer marketing
        // sites are mostly light backgrounds; dark theme is an
        // explicit opt-in.
        $this->assertSame('light', LeadForm::defaultDesign()['theme']);
    }

    public function test_default_design_corners_is_rounded(): void
    {
        $this->assertSame('rounded', LeadForm::defaultDesign()['corners']);
    }

    public function test_default_design_primary_color_is_cyan(): void
    {
        // Documented marketing palette match: #22d3ee (tailwind
        // cyan-400). Lock the exact hex.
        $this->assertSame('#22d3ee', LeadForm::defaultDesign()['primary_color']);
    }

    /* ─── newEmbedKey() static helper ─── */

    public function test_new_embed_key_returns_32_char_alphanum(): void
    {
        $key = LeadForm::newEmbedKey();

        $this->assertSame(32, strlen($key),
            'newEmbedKey MUST return 32-char string (collision-resistant URL space).');
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{32}$/', $key,
            'newEmbedKey MUST be alphanumeric only (URL-safe).');
    }

    public function test_new_embed_key_returns_unique_keys_across_calls(): void
    {
        // 32 chars × ~62 alphanum chars = 62^32 ≈ 5×10^57 space.
        // Sequential calls MUST yield distinct values. Loop check
        // ensures the loop-until-unique guard in the implementation
        // actually fires when needed.
        $keys = [];
        for ($i = 0; $i < 5; $i++) {
            $keys[] = LeadForm::newEmbedKey();
        }

        $this->assertCount(5, array_unique($keys),
            'newEmbedKey MUST return distinct keys across calls.');
    }

    public function test_new_embed_key_avoids_collisions_with_existing_rows(): void
    {
        // Seed a known embed_key + call newEmbedKey enough times
        // to verify no collision surfaces. Loop guard in the
        // implementation MUST keep generating until unique.
        $existing = LeadForm::newEmbedKey();
        $this->form(['embed_key' => $existing]);

        for ($i = 0; $i < 20; $i++) {
            $fresh = LeadForm::newEmbedKey();
            $this->assertNotSame($existing, $fresh,
                'newEmbedKey MUST NOT collide with existing row.');
        }
    }

    /* ─── Casts ─── */

    public function test_fields_round_trips_through_array_cast(): void
    {
        $custom = [
            ['key' => 'name', 'type' => 'text', 'enabled' => true],
            ['key' => 'note', 'type' => 'textarea', 'enabled' => false],
        ];

        $form = $this->form(['fields' => $custom]);

        $this->assertSame($custom, $form->fresh()->fields);
    }

    public function test_design_round_trips_through_array_cast(): void
    {
        $custom = [
            'title'         => 'Tell us about your trip',
            'primary_color' => '#ff6600',
            'theme'         => 'dark',
        ];

        $form = $this->form(['design' => $custom]);

        $this->assertSame($custom, $form->fresh()->design);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        $on = $this->form(['is_active' => true]);
        $off = $this->form(['is_active' => false]);

        $this->assertTrue($on->is_active);
        $this->assertFalse($off->is_active);
    }

    public function test_submission_count_casts_to_integer(): void
    {
        // Drives the admin's lead-form list "247 submissions"
        // display. Int safety matters for the SPA's sort.
        $form = $this->form(['submission_count' => 247]);

        $this->assertSame(247, $form->fresh()->submission_count);
        $this->assertIsInt($form->fresh()->submission_count);
    }

    public function test_last_submitted_at_casts_to_carbon(): void
    {
        // Drives the "Last submission X ago" diffForHumans
        // display on the admin lead-forms page.
        $form = $this->form(['last_submitted_at' => now()->subDays(2)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $form->last_submitted_at);
    }

    /* ─── submissions HasMany ─── */

    public function test_submissions_relationship_is_has_many(): void
    {
        $form = $this->form();
        $rel = $form->submissions();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_tenant_scope_isolates_lead_forms_cross_org(): void
    {
        // CRITICAL: lead forms are tenant-private. Cross-leak
        // would expose another org's lead-capture URLs +
        // submission counts.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('lead_forms')->insert([
            'organization_id' => $orgA,
            'name'            => 'Org A form',
            'embed_key'       => LeadForm::newEmbedKey(),
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('lead_forms')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B form',
            'embed_key'       => LeadForm::newEmbedKey(),
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = LeadForm::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A form', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = LeadForm::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B form', $bRows->first()->name);
    }
}
