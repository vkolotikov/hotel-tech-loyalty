<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * `POST widget-config/rotate-widget-key` (2026-11-08): a manager gives the website widget a new public key; the old
 * snippet stops working at once (its cached config is forgotten too), and the answer is the config as `GET
 * widget-config` answers it. The private `api_key` and `regenerate-key` are untouched.
 */
class WidgetKeyRotationTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private string $oldKey;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();

        $this->oldKey = (string) Str::uuid();
        DB::table('chat_widget_configs')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'widget_key' => $this->oldKey, 'api_key' => 'private-key-of-the-test', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_manager_rotates_the_public_key_and_the_old_one_stops_at_once(): void
    {
        Cache::put('widget:config:' . $this->oldKey, ['cached' => true], 60);
        $shown = $this->asManager()->getJson($this->adminApi('widget-config'))->assertOk()->json();

        $rotated = $this->asManager()->postJson($this->adminApi('widget-config/rotate-widget-key'))->assertOk()->json();

        $this->assertTrue(Str::isUuid($rotated['widget_key']));
        $this->assertNotSame($this->oldKey, $rotated['widget_key']);
        $this->assertSame(array_keys($shown), array_keys($rotated), 'the same shape as GET widget-config');
        $this->assertSame('private-key-of-the-test', DB::table('chat_widget_configs')->value('api_key'), 'the private key is not touched');
        $this->assertSame($rotated['widget_key'], DB::table('chat_widget_configs')->value('widget_key'));
        $this->assertFalse(Cache::has('widget:config:' . $this->oldKey), 'the old key answers no cached config');
        $this->assertSame($rotated['widget_key'], $this->asManager()->getJson($this->adminApi('widget-config'))->json('widget_key'));
    }

    public function test_the_widgets_config_is_cached_where_every_container_sees_it_forgotten(): void
    {
        // Production's default cache is each container's own files; the shared one is the database (2026-11-08).
        config(['cache.stores.shared_for_test' => ['driver' => 'array'], 'cache.shared' => 'shared_for_test']);
        $shared = Cache::store('shared_for_test');
        $shared->put('widget:config:' . $this->oldKey, ['from' => 'the shared cache'], 60);

        // The widget reads its config there…
        $this->getJson(rtrim((string) config('app.url'), '/') . '/api/v1/widget/' . $this->oldKey . '/config')
            ->assertOk()->assertExactJson(['from' => 'the shared cache']);

        // …and a rotation forgets it there, for every container.
        $this->asManager()->postJson($this->adminApi('widget-config/rotate-widget-key'))->assertOk();
        $this->assertFalse($shared->has('widget:config:' . $this->oldKey), 'the old key answers no cached config anywhere');

        // A save forgets the new key's entry there too (ChatWidgetConfig::saved).
        $newKey = (string) DB::table('chat_widget_configs')->value('widget_key');
        $shared->put('widget:config:' . $newKey, ['stale' => true], 60);
        \App\Models\ChatWidgetConfig::withoutGlobalScopes()->where('widget_key', $newKey)->firstOrFail()->forceFill(['is_active' => true, 'updated_at' => now()->addMinute()])->save();
        $this->assertFalse($shared->has('widget:config:' . $newKey));
    }

    public function test_a_staff_member_may_not_rotate_it(): void
    {
        $this->asStaffMember()->postJson($this->adminApi('widget-config/rotate-widget-key'))->assertForbidden();
        $this->assertSame($this->oldKey, DB::table('chat_widget_configs')->value('widget_key'));
    }

    public function test_nothing_to_rotate_before_a_config_is_saved(): void
    {
        DB::table('chat_widget_configs')->delete();
        $this->asManager()->postJson($this->adminApi('widget-config/rotate-widget-key'))->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->assertSame(0, DB::table('chat_widget_configs')->count());
    }
}
