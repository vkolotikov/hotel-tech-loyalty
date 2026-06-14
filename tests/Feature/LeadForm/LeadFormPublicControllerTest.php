<?php

namespace Tests\Feature\LeadForm;

use App\Http\Controllers\Api\V1\Public\LeadFormPublicController;
use App\Models\LeadForm;
use App\Services\CustomFieldService;
use App\Services\RealtimeEventService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the public-facing contract of LeadFormPublicController
 * (CRM v2 Phase 10 — public lead-capture forms).
 *
 * Coverage focused on the LOW-RISK / HIGH-VALUE surface:
 *
 *   show(embedKey)
 *     - 404 on unknown embed_key (no org enumeration via timing)
 *     - 410 on inactive form (deliberate-archive semantic, not 404)
 *     - 200 + config payload (name + embed_key + fields + design)
 *
 *   resolveForm(embedKey) — the cross-tenant lookup that binds the
 *     org + brand into the container so subsequent writes scope
 *     correctly without a JWT
 *     - Binds current_organization_id from the form's org
 *     - Binds current_brand_id when the form has one (brand-scoped
 *       widget URLs)
 *     - Does NOT bind when form is missing (no scope leak)
 *
 *   buildValidationRules(form) — generates per-field-type rules
 *     from the form's `fields` config. Each of the 10 types maps
 *     to a canonical Laravel rule. The submit() path uses these
 *     to validate before reaching createGuestAndInquiry.
 *
 *   The full submit() happy-path (Guest + Inquiry + hot_lead event
 *   + submission_count increment) is covered by integration tests
 *   downstream — this file locks the public API contract pieces.
 *
 * Public form URLs are throttled to 5/min in routes/api.php. The
 * throttle itself is config not logic; covered by the routes file's
 * declaration not this test.
 */
class LeadFormPublicControllerTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LeadFormPublicController $controller;
    private ReflectionMethod $resolveForm;
    private ReflectionMethod $buildRules;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // Lead-form schema — created only here since no shared
        // helper for it yet.
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
                $t->text('fields')->nullable(); // jsonb in prod
                $t->text('design')->nullable();
                $t->boolean('is_active')->default(true);
                $t->integer('submission_count')->default(0);
                $t->timestamp('last_submitted_at')->nullable();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        // Organization::booted's created hook needs brands.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('logo_url')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->controller = new LeadFormPublicController(
            $this->createMock(RealtimeEventService::class),
            new CustomFieldService(),
        );

        $this->resolveForm = new ReflectionMethod($this->controller, 'resolveForm');
        $this->buildRules  = new ReflectionMethod($this->controller, 'buildValidationRules');
        $this->resolveForm->setAccessible(true);
        $this->buildRules->setAccessible(true);
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

    private function form(array $attrs = []): LeadForm
    {
        return LeadForm::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test Form',
            'embed_key'       => 'embed_' . substr(md5(uniqid()), 0, 16),
            'is_active'       => true,
            'fields'          => LeadForm::defaultFields(),
            'design'          => LeadForm::defaultDesign(),
        ], $attrs));
    }

    private function decode(JsonResponse $resp): array
    {
        return json_decode($resp->getContent(), true);
    }

    /* ─── show() — 404 + 410 + 200 ─── */

    public function test_show_returns_404_for_unknown_embed_key(): void
    {
        // No enumeration via timing: unknown keys behave identically
        // to never-existed keys.
        $resp = $this->controller->show('unknown_embed_key_xyz');

        $this->assertSame(404, $resp->getStatusCode());
        $body = $this->decode($resp);
        $this->assertSame('Form not found.', $body['message']);
    }

    public function test_show_returns_410_for_inactive_form(): void
    {
        // 410 Gone — distinct from 404 to signal "deliberate
        // archive" so the SPA's diagnostic can show a different
        // UI ("This form is no longer accepting submissions.").
        $form = $this->form(['is_active' => false]);

        $resp = $this->controller->show($form->embed_key);

        $this->assertSame(410, $resp->getStatusCode());
        $body = $this->decode($resp);
        $this->assertStringContainsString('no longer accepting', $body['message']);
    }

    public function test_show_returns_form_config_on_valid_embed_key(): void
    {
        // Happy path — payload shape the JS widget reads.
        $form = $this->form([
            'name'   => 'Get a Quote',
            'fields' => [['key' => 'name', 'label' => 'Your name', 'enabled' => true, 'required' => true]],
            'design' => ['primary_color' => '#FF6600'],
        ]);

        $resp = $this->controller->show($form->embed_key);

        $this->assertSame(200, $resp->getStatusCode());
        $body = $this->decode($resp);
        $this->assertSame('Get a Quote',    $body['name']);
        $this->assertSame($form->embed_key, $body['embed_key']);
        $this->assertSame([['key' => 'name', 'label' => 'Your name', 'enabled' => true, 'required' => true]],
            $body['fields']);
        $this->assertSame(['primary_color' => '#FF6600'], $body['design']);
    }

    public function test_show_returns_default_fields_when_form_has_none(): void
    {
        // Form with `fields = null` falls back to the documented
        // defaultFields() set so the widget still renders something.
        $form = $this->form(['fields' => null]);

        $resp = $this->controller->show($form->embed_key);
        $body = $this->decode($resp);

        $this->assertNotEmpty($body['fields'],
            'Null fields MUST fall back to defaultFields().');
    }

    /* ─── resolveForm() — context binding side-effect ─── */

    public function test_resolveForm_binds_organization_id_from_form_org(): void
    {
        // CRITICAL: the public endpoint runs without auth (no JWT,
        // no tenant context). resolveForm MUST bind the org from
        // the form so subsequent writes scope correctly. Without
        // this, Guest::create would land with org_id=null and the
        // lead would silently disappear under TenantScope.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }

        $form = $this->form();
        $this->resolveForm->invoke($this->controller, $form->embed_key);

        $this->assertTrue(app()->bound('current_organization_id'));
        $this->assertSame($this->orgId, (int) app('current_organization_id'),
            'CRITICAL: resolveForm MUST bind current_organization_id from the form.');
    }

    public function test_resolveForm_binds_brand_id_when_form_has_one(): void
    {
        // Brand-scoped form URLs (per-brand widget). resolveForm
        // MUST bind current_brand_id too so BrandScope filters
        // downstream queries to that brand's content.
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        $form = $this->form(['brand_id' => 42]);
        $this->resolveForm->invoke($this->controller, $form->embed_key);

        $this->assertTrue(app()->bound('current_brand_id'));
        $this->assertSame(42, (int) app('current_brand_id'));
    }

    public function test_resolveForm_does_NOT_bind_brand_when_form_lacks_one(): void
    {
        // Default brand-less form. resolveForm MUST NOT bind a
        // bogus brand id — the legacy org-level scope kicks in.
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        $form = $this->form(['brand_id' => null]);
        $this->resolveForm->invoke($this->controller, $form->embed_key);

        $this->assertFalse(app()->bound('current_brand_id'),
            'Brand-less form MUST NOT bind current_brand_id.');
    }

    public function test_resolveForm_returns_null_for_unknown_key_and_does_not_leak_context(): void
    {
        // Defense in depth: unknown keys MUST NOT leak context.
        // A chained query downstream of a failed resolve would
        // silently scope to the wrong tenant.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        $result = $this->resolveForm->invoke($this->controller, 'nonexistent_embed');

        $this->assertNull($result);
        $this->assertFalse(app()->bound('current_organization_id'),
            'Failed resolve MUST NOT bind tenant context.');
        $this->assertFalse(app()->bound('current_brand_id'));
    }

    /* ─── buildValidationRules() — per-type rule generation ─── */

    public function test_build_rules_returns_correct_rule_per_field_type(): void
    {
        // The 9 supported types + their canonical Laravel rules.
        // Lock the rule strings so a typo in production (e.g.
        // 'emial' instead of 'email') would surface here.
        $form = $this->form([
            'fields' => [
                ['key' => 'email', 'type' => 'email',    'enabled' => true],
                ['key' => 'phone', 'type' => 'phone',    'enabled' => true],
                ['key' => 'when',  'type' => 'date',     'enabled' => true],
                ['key' => 'pax',   'type' => 'number',   'enabled' => true],
                ['key' => 'notes', 'type' => 'textarea', 'enabled' => true],
                ['key' => 'pick',  'type' => 'select',   'enabled' => true],
                ['key' => 'agree', 'type' => 'checkbox', 'enabled' => true],
                ['key' => 'site',  'type' => 'url',      'enabled' => true],
                ['key' => 'name',  'type' => 'text',     'enabled' => true],
            ],
        ]);

        $rules = $this->buildRules->invoke($this->controller, $form);

        // Each rule string MUST carry the right validator token.
        $this->assertStringContainsString('email',    $rules['email']);
        $this->assertStringContainsString('string',   $rules['phone']);
        $this->assertStringContainsString('date',     $rules['when']);
        $this->assertStringContainsString('numeric',  $rules['pax']);
        $this->assertStringContainsString('string',   $rules['notes']);
        $this->assertStringContainsString('max:4000', $rules['notes']);
        $this->assertStringContainsString('boolean',  $rules['agree']);
        $this->assertStringContainsString('url',      $rules['site']);
        $this->assertStringContainsString('string',   $rules['name']);
    }

    public function test_build_rules_emits_required_prefix_for_required_fields(): void
    {
        // The `required` flag flips the rule from 'nullable|…' to
        // 'required|…'. A regression that always emits 'nullable'
        // would silently accept empty submissions on required
        // fields.
        $form = $this->form([
            'fields' => [
                ['key' => 'must_have',  'type' => 'text', 'enabled' => true, 'required' => true],
                ['key' => 'can_be_blank','type' => 'text','enabled' => true, 'required' => false],
            ],
        ]);

        $rules = $this->buildRules->invoke($this->controller, $form);

        $this->assertStringStartsWith('required|',  $rules['must_have'],
            'Required field MUST start with "required|".');
        $this->assertStringStartsWith('nullable|',  $rules['can_be_blank'],
            'Optional field MUST start with "nullable|".');
    }

    public function test_build_rules_skips_disabled_fields(): void
    {
        // Fields with enabled=false are turned off in the admin
        // editor. They MUST NOT appear in the validation rules
        // (otherwise a stale rule could reject a payload that's
        // missing a deliberately-hidden field).
        $form = $this->form([
            'fields' => [
                ['key' => 'enabled_field',  'type' => 'text', 'enabled' => true],
                ['key' => 'disabled_field', 'type' => 'text', 'enabled' => false],
            ],
        ]);

        $rules = $this->buildRules->invoke($this->controller, $form);

        $this->assertArrayHasKey('enabled_field',    $rules);
        $this->assertArrayNotHasKey('disabled_field', $rules);
    }

    public function test_build_rules_emits_multiselect_array_plus_dotstar_rules(): void
    {
        // multiselect needs TWO rules: the top-level array check +
        // a `key.*` rule for each item (Laravel pattern). The
        // wildcard MUST cap the per-item value length to prevent
        // payload-bombing.
        $form = $this->form([
            'fields' => [
                ['key' => 'tags', 'type' => 'multiselect', 'enabled' => true],
            ],
        ]);

        $rules = $this->buildRules->invoke($this->controller, $form);

        $this->assertStringContainsString('array', $rules['tags']);
        $this->assertArrayHasKey('tags.*', $rules,
            'multiselect MUST emit a per-item wildcard rule.');
        $this->assertStringContainsString('string', $rules['tags.*']);
        $this->assertStringContainsString('max:120', $rules['tags.*']);
    }

    public function test_build_rules_returns_empty_for_form_with_no_enabled_fields(): void
    {
        $form = $this->form(['fields' => []]);

        $rules = $this->buildRules->invoke($this->controller, $form);

        $this->assertSame([], $rules);
    }
}
