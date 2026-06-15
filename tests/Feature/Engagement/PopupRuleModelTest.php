<?php

namespace Tests\Feature\Engagement;

use App\Models\PopupRule;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the PopupRule model contract — the chat widget's
 * proactive-engagement trigger configuration.
 *
 * Why this matters:
 *
 *   PopupRules are evaluated client-side by the embedded chat
 *   widget (`hotel-chat.js`) to fire the popup at the right
 *   moment — time_on_page / scroll / exit_intent / url_match.
 *   Server returns the rule list inside the cached widget config
 *   payload (the cache-bust hooks are locked separately in
 *   tests/Feature/Widget/WidgetConfigCacheBustTest.php). This
 *   test locks the MODEL surface: casts, scopes, FK locks,
 *   tenant isolation.
 *
 *   quick_replies array carries the buttons shown when the popup
 *   opens — drives instant-engagement options. A regression in
 *   the array cast surfaces it as a JSON string and the widget
 *   renders no buttons.
 *
 *   language_targets array gates the rule by visitor locale
 *   (an EN-only popup MUST NOT fire for FR visitors). Same array
 *   cast load-bearing point.
 *
 * Contract:
 *
 *   - is_active boolean cast + scopeActive filter
 *   - language_targets + quick_replies array casts
 *   - priority + impressions_count + clicks_count int casts
 *   - widgetConfig BelongsTo ChatWidgetConfig FK='widget_config_id'
 *     (NOT the conventional 'chat_widget_config_id')
 *   - BelongsToOrganization + BelongsToBrand traits
 *   - TenantScope cross-org isolation
 */
class PopupRuleModelTest extends TestCase
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

        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64)->nullable();
                $t->string('name')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('popup_rules')) {
            Schema::create('popup_rules', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('widget_config_id')->nullable();
                $t->string('name');
                $t->boolean('is_active')->default(true);
                $t->string('trigger_type', 32);
                $t->string('trigger_value')->nullable();
                $t->string('url_match_type', 32)->nullable();
                $t->text('url_match_value')->nullable();
                $t->string('visitor_type', 32)->nullable();
                $t->text('language_targets')->nullable();
                $t->text('message')->nullable();
                $t->text('quick_replies')->nullable();
                $t->integer('priority')->default(0);
                $t->integer('impressions_count')->default(0);
                $t->integer('clicks_count')->default(0);
                $t->timestamps();
                $t->index(['organization_id', 'is_active']);
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

    private function rule(array $attrs = []): PopupRule
    {
        return PopupRule::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test popup rule',
            'is_active'       => true,
            'trigger_type'    => 'time_on_page',
            'trigger_value'   => '30',
            'priority'        => 0,
        ], $attrs));
    }

    /* ─── is_active boolean + scopeActive ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $active   = $this->rule(['is_active' => true,  'name' => 'Active rule']);
        $disabled = $this->rule(['is_active' => false, 'name' => 'Disabled rule']);

        $this->assertTrue($active->is_active);
        $this->assertFalse($disabled->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_scope_active_filters_only_active_rules(): void
    {
        // CRITICAL: widget config payload filters via this
        // scope. Inactive rules MUST be excluded — admin's
        // "pause this campaign" workflow depends on it.
        $this->rule(['is_active' => true,  'name' => 'A1']);
        $this->rule(['is_active' => false, 'name' => 'D1']);
        $this->rule(['is_active' => true,  'name' => 'A2']);

        $active = PopupRule::active()->get();
        $names = $active->pluck('name')->sort()->values()->toArray();

        $this->assertSame(['A1', 'A2'], $names,
            'scopeActive MUST exclude is_active=false rules.');
    }

    /* ─── Canonical trigger_type values ─── */

    public function test_canonical_trigger_type_values_persist_intact(): void
    {
        // Lock the 4 documented client-side triggers. The
        // widget's event listeners branch on these exact
        // strings; a typo silently breaks the trigger.
        $types = ['time_on_page', 'scroll', 'exit_intent', 'url_match'];

        foreach ($types as $type) {
            $rule = $this->rule(['name' => "T-{$type}", 'trigger_type' => $type]);
            $this->assertSame($type, $rule->fresh()->trigger_type);
        }
    }

    public function test_canonical_url_match_type_values_persist_intact(): void
    {
        // Lock the 3 url_match_type variants used by both
        // url_match trigger AND the per-rule URL filter.
        $types = ['exact', 'contains', 'regex'];

        foreach ($types as $type) {
            $rule = $this->rule([
                'name'           => "U-{$type}",
                'url_match_type' => $type,
            ]);
            $this->assertSame($type, $rule->fresh()->url_match_type);
        }
    }

    /* ─── language_targets array cast ─── */

    public function test_language_targets_round_trips_through_array_cast(): void
    {
        // CRITICAL: locale gate. An EN-only popup MUST NOT
        // fire for FR visitors. A regression in the array
        // cast surfaces it as a JSON string and the widget's
        // includes() check silently fails open (fires for
        // everyone).
        $targets = ['en', 'de', 'fr'];

        $rule = $this->rule(['language_targets' => $targets]);

        $this->assertSame($targets, $rule->fresh()->language_targets);
    }

    public function test_null_language_targets_persists_as_null(): void
    {
        // Semantic: null = "no language filter" (fires for
        // all locales). A regression that coerces null → []
        // would break the all-locales-fallback.
        $rule = $this->rule(['language_targets' => null]);

        $this->assertNull($rule->fresh()->language_targets);
    }

    /* ─── quick_replies array cast ─── */

    public function test_quick_replies_round_trips_through_array_cast(): void
    {
        // quick_replies = the buttons shown when the popup
        // opens (instant-engagement options).
        $replies = [
            ['label' => 'Book a room',  'action' => 'navigate', 'url' => '/book'],
            ['label' => 'Talk to us',   'action' => 'open_chat'],
            ['label' => 'Special offers', 'action' => 'navigate', 'url' => '/offers'],
        ];

        $rule = $this->rule(['quick_replies' => $replies]);

        $this->assertSame($replies, $rule->fresh()->quick_replies);
    }

    public function test_empty_quick_replies_array_round_trips(): void
    {
        // Empty array [] MUST round-trip as [] (NOT null) —
        // admin's "cleared the buttons" state is distinct
        // from "never configured".
        $rule = $this->rule(['quick_replies' => []]);

        $this->assertSame([], $rule->fresh()->quick_replies);
    }

    /* ─── Counter int casts ─── */

    public function test_priority_casts_to_integer(): void
    {
        // priority is the rule-ordering sort key — higher
        // priorities try-match first. Lock so a refactor that
        // mis-casts breaks the deterministic match order.
        $rule = $this->rule(['priority' => '5']);

        $this->assertSame(5, $rule->priority);
        $this->assertIsInt($rule->priority);
    }

    public function test_impressions_count_casts_to_integer(): void
    {
        // impressions_count = how many times the popup
        // appeared. Drives the admin's "this rule has fired
        // X times" stat + the engagement rate calculation.
        $rule = $this->rule(['impressions_count' => '1500']);

        $this->assertSame(1500, $rule->impressions_count);
        $this->assertIsInt($rule->impressions_count);
    }

    public function test_clicks_count_casts_to_integer(): void
    {
        // clicks_count / impressions_count = conversion rate
        // shown on the admin Popup Rules page.
        $rule = $this->rule(['clicks_count' => '120']);

        $this->assertSame(120, $rule->clicks_count);
        $this->assertIsInt($rule->clicks_count);
    }

    /* ─── Default counter values ─── */

    public function test_counter_defaults_are_zero(): void
    {
        // New rules MUST default to 0/0 — the engagement
        // rate calculation divides by impressions_count; a
        // null would crash.
        $rule = PopupRule::create([
            'organization_id' => $this->orgId,
            'name'            => 'Brand new rule',
            'trigger_type'    => 'scroll',
            'is_active'       => true,
        ]);

        $fresh = $rule->fresh();
        $this->assertSame(0, $fresh->impressions_count);
        $this->assertSame(0, $fresh->clicks_count);
    }

    /* ─── widgetConfig FK lock ─── */

    public function test_widget_config_relationship_uses_widget_config_id_fk(): void
    {
        // CRITICAL: FK is 'widget_config_id' (NOT
        // 'chat_widget_config_id'). Lock the explicit name.
        $rule = $this->rule(['widget_config_id' => 100]);
        $rel = $rule->widgetConfig();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('widget_config_id', $rel->getForeignKeyName(),
            'widgetConfig FK MUST be widget_config_id (NOT chat_widget_config_id).');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $rule = $this->rule();

        $this->assertSame($this->orgId, (int) $rule->organization_id);
    }

    public function test_tenant_scope_isolates_popup_rules_cross_org(): void
    {
        // CRITICAL: popup rules carry marketing copy + URLs +
        // language targeting. Cross-leak would expose
        // competitor's targeting strategy.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->rule(['name' => 'Org A rule']);
        \DB::table('popup_rules')->insert([
            'organization_id'   => $orgB,
            'name'              => 'Org B rule',
            'trigger_type'      => 'scroll',
            'is_active'         => true,
            'priority'          => 0,
            'impressions_count' => 0,
            'clicks_count'      => 0,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        $aRows = PopupRule::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A rule', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = PopupRule::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B rule', $bRows->first()->name);
    }
}
