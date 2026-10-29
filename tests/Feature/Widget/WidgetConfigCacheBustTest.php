<?php

namespace Tests\Feature\Widget;

use App\Models\ChatWidgetConfig;
use App\Models\PopupRule;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the auto-cache-bust hooks on ChatWidgetConfig + PopupRule
 * (May 27 2026 widget perf overhaul).
 *
 * Why this matters:
 *
 *   WidgetChatController::getConfig caches the per-widget config
 *   payload for 60 seconds — the chat widget hammers /config on
 *   every page load across thousands of customer sites, so the
 *   cache shaves real load off the API.
 *
 *   But: when admin tweaks the widget (recolor, change welcome
 *   message, add a popup rule), they expect the change to appear
 *   on the customer's site within seconds — not after the 60-second
 *   TTL drains.
 *
 *   The fix: both ChatWidgetConfig AND PopupRule register Eloquent
 *   `saved`/`deleted` hooks that Cache::forget the per-widget
 *   key. Tweaks propagate within ~1s of save instead of up to 60s.
 *
 * Cache key format: `widget:config:{widget_key}` — keyed on the
 * widget's stable widget_key (NOT the org id), so the widget URL
 * on the customer's site keeps resolving even if widget_key
 * rotates.
 *
 * PopupRule busts by looking up the org's ChatWidgetConfig
 * widget_key — admin can't bust the right cache otherwise.
 */
class WidgetConfigCacheBustTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // Organization::booted's created hook needs brands.
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

        // ChatWidgetConfig has many columns but the test only touches
        // widget_key + a couple cosmetic strings. Minimal schema.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64)->nullable();
                $t->string('api_key', 100)->nullable();
                $t->string('company_name')->nullable();
                $t->string('header_title')->nullable();
                $t->string('welcome_message')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->index(['organization_id', 'widget_key']);
            });
        }

        if (!Schema::hasTable('popup_rules')) {
            Schema::create('popup_rules', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('widget_config_id')->nullable();
                $t->string('name');
                $t->string('trigger_type', 32);
                $t->integer('delay_seconds')->default(0);
                $t->text('message')->nullable();
                $t->boolean('is_active')->default(true);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        Cache::flush();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /**
     * Helper: create a widget config row + bind tenant context. A widget key is a
     * uuid (chat_widget_configs.widget_key is `uuid` in production; the model
     * makes one with Str::uuid()), so the keys here are fixed uuids.
     */
    private function widgetConfig(string $widgetKey = '00000000-0000-4000-8000-000000000000'): ChatWidgetConfig
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        return ChatWidgetConfig::create([
            'api_key' => \Illuminate\Support\Str::random(48),
            'widget_key'      => $widgetKey,
            'company_name'    => 'Test Hotel',
            'header_title'    => 'Chat with us',
        ]);
    }

    private function cacheKeyFor(string $widgetKey): string
    {
        return 'widget:config:' . $widgetKey;
    }

    /* ─── ChatWidgetConfig saved hook ─── */

    public function test_saving_chat_widget_config_busts_cache_for_widget_key(): void
    {
        // CRITICAL: the cache MUST drop on any save so admin tweaks
        // propagate within seconds, not up to 60s (the cache TTL).
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000001');

        // Pre-seed the cache as if a recent /config request set it.
        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000001'),
            ['stale_payload' => true], 60);
        $this->assertNotNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000001')),
            'Pre-condition: cache key seeded.',
        );

        // Save anything on the config (admin recolour).
        $config->update(['header_title' => 'New header']);

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000001')),
            'CRITICAL: ChatWidgetConfig saved MUST bust widget:config:{key}.',
        );
    }

    public function test_create_also_busts_cache(): void
    {
        // create() fires the saved event too. A fresh widget config
        // shouldn't read a stale cached payload from an earlier
        // probe.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Pre-seed a stale entry (e.g. a probe hit /config before
        // any row existed).
        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000002'),
            ['empty_probe' => true], 60);

        ChatWidgetConfig::create([
            'api_key' => \Illuminate\Support\Str::random(48),
            'widget_key'   => '00000000-0000-4000-8000-000000000002',
            'company_name' => 'New Hotel',
        ]);

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000002')),
            'create() MUST also bust the cache (saved event fires).',
        );
    }

    public function test_delete_busts_cache(): void
    {
        // When admin removes a widget config (rare but possible),
        // any cached payload MUST drop too — else the widget on
        // the customer site would keep serving the deleted config
        // for up to 60s.
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000003');

        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000003'),
            ['stale' => true], 60);

        $config->delete();

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000003')),
            'delete() MUST bust the cache.',
        );
    }

    public function test_cache_key_uses_widget_key_not_org_id(): void
    {
        // Widget URLs embedded on customer sites carry the
        // widget_key, not the org id. The cache key MUST match
        // that lookup format. Pre-fix testing: bust by org id
        // would miss the widget_key-keyed cache entirely.
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000004');

        // Seed the WRONG key format (org-id based) — bust MUST
        // ignore it because the implementation keys on widget_key.
        Cache::put('widget:config:1', ['org_keyed' => true], 60);
        // Seed the RIGHT format.
        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000004'),
            ['widget_keyed' => true], 60);

        $config->update(['header_title' => 'X']);

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000004')),
            'The widget_key-format MUST be busted.',
        );
        $this->assertNotNull(
            Cache::get('widget:config:1'),
            'Unrelated cache keys MUST stay intact.',
        );
    }

    public function test_null_widget_key_cache_hook_never_forgets_an_empty_key(): void
    {
        // Exercise the defensive hook without inserting a state PostgreSQL's
        // NOT NULL widget_key constraint correctly refuses.
        $config = new ChatWidgetConfig([
            'widget_key'   => null,
            'company_name' => 'Legacy config',
        ]);
        Cache::shouldReceive('forget')->never();
        ChatWidgetConfig::getEventDispatcher()->dispatch('eloquent.saved: ' . ChatWidgetConfig::class, [$config]);
        ChatWidgetConfig::getEventDispatcher()->dispatch('eloquent.deleted: ' . ChatWidgetConfig::class, [$config]);
        $this->assertFalse($config->exists);
    }

    /* ─── PopupRule saved hook ─── */

    public function test_saving_popup_rule_busts_widget_config_cache(): void
    {
        // CRITICAL: PopupRule's bust looks up the ORG's
        // ChatWidgetConfig widget_key. Admin adds a "show after 5s"
        // rule — the widget cache MUST drop so the new rule fires
        // on the next visitor.
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000005');

        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000005'),
            ['popup_rules' => []], 60);

        PopupRule::create([
            'organization_id'  => app('current_organization_id'),
            'widget_config_id' => $config->id,
            'name'             => 'Welcome popup',
            'trigger_type'     => 'time_on_page',
            'message'         => 'Can we help?', // NOT NULL in production
            'delay_seconds'    => 5,
            'is_active'        => true,
        ]);

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000005')),
            'CRITICAL: creating a PopupRule MUST bust the widget config cache.',
        );
    }

    public function test_updating_popup_rule_busts_cache(): void
    {
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000006');

        $rule = PopupRule::create([
            'organization_id'  => app('current_organization_id'),
            'widget_config_id' => $config->id,
            'name'             => 'Initial',
            'trigger_type'     => 'time_on_page',
            'message'         => 'Can we help?', // NOT NULL in production
            'delay_seconds'    => 5,
        ]);

        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000006'),
            ['old_rules' => true], 60);

        $rule->update(['delay_seconds' => 10]);

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000006')),
            'Updating a PopupRule MUST bust the cache.',
        );
    }

    public function test_deleting_popup_rule_busts_cache(): void
    {
        $config = $this->widgetConfig('00000000-0000-4000-8000-000000000007');

        $rule = PopupRule::create([
            'organization_id'  => app('current_organization_id'),
            'widget_config_id' => $config->id,
            'name'             => 'To delete',
            'trigger_type'     => 'exit_intent',
            'message'         => 'Can we help?', // NOT NULL in production
        ]);

        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000007'),
            ['rules' => 1], 60);

        $rule->delete();

        $this->assertNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000007')),
            'Deleting a PopupRule MUST bust the cache.',
        );
    }

    public function test_popup_rule_in_org_without_widget_config_does_not_crash(): void
    {
        // Defensive: an org with no ChatWidgetConfig row but a
        // PopupRule (shouldn't happen, but possible during
        // partial setup) MUST NOT crash on save. The bust callback
        // short-circuits when widget_key lookup returns null.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // No ChatWidgetConfig for this org.
        $rule = PopupRule::create([
            'organization_id' => $org->id,
            'name'            => 'Orphan rule',
            'trigger_type'    => 'time_on_page',
            'message'         => 'Can we help?', // NOT NULL in production
        ]);

        // The save (which fires the hook with no widget_key
        // resolvable) MUST NOT throw.
        $rule->name = 'Updated';
        $rule->save();

        $this->assertSame('Updated', $rule->fresh()->name);
    }

    /* ─── Cross-org isolation ─── */

    public function test_org_a_save_does_not_bust_org_b_cache(): void
    {
        // CRITICAL: an admin in org A saving their widget config
        // MUST NOT bust org B's cache. Defensive: ChatWidgetConfig
        // keys the cache by THIS row's widget_key, not by any
        // global pattern.
        $orgA = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $orgA->id);
        $configA = ChatWidgetConfig::create([
            'api_key' => \Illuminate\Support\Str::random(48),
            'widget_key'   => '00000000-0000-4000-8000-000000000008',
            'company_name' => 'Org A',
        ]);

        app()->forgetInstance('current_organization_id');
        $orgB = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $orgB->id);
        $configB = ChatWidgetConfig::create([
            'api_key' => \Illuminate\Support\Str::random(48),
            'widget_key'   => '00000000-0000-4000-8000-000000000009',
            'company_name' => 'Org B',
        ]);

        // Seed both caches.
        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000008'),
            ['payload' => 'A'], 60);
        Cache::put($this->cacheKeyFor('00000000-0000-4000-8000-000000000009'),
            ['payload' => 'B'], 60);

        // Save org A.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        $configA->update(['header_title' => 'New A header']);

        // Org A's cache MUST be busted.
        $this->assertNull(Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000008')));
        // Org B's cache MUST stay intact.
        $this->assertNotNull(
            Cache::get($this->cacheKeyFor('00000000-0000-4000-8000-000000000009')),
            'Org A save MUST NOT touch org B\'s cache.',
        );
    }
}
