<?php

namespace Tests\Feature\Settings;

use App\Models\HotelSetting;
use App\Services\SmoobuClient;
use App\Support\SmoobuEndpoint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class IntegrationBoundaryTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpBookingRefundSchema();
        config(['admin_access.mode' => 'enforce']);
        Http::preventStrayRequests();
        $this->actingAs($this->staff, 'sanctum');
        app()->instance('current_organization_id', $this->org->id);
    }

    private function owner(): void
    {
        DB::table('staff')->where('user_id', $this->staff->id)->update(['role' => 'super_admin']);
        $this->staff->unsetRelation('staff');
    }

    private function save(array $settings)
    {
        return $this->putJson('/api/v1/admin/settings', ['settings' => $settings]);
    }

    public function test_manager_cannot_create_or_update_integration_key_even_with_false_row_metadata(): void
    {
        HotelSetting::where('key', 'twilio_auth_token')->delete();
        $this->save([['key' => 'twilio_auth_token', 'value' => 'dummy-secret-value']])->assertForbidden();
        $setting = HotelSetting::create(['key' => 'twilio_auth_token', 'value' => 'existing-dummy-secret', 'group' => 'general', 'type' => 'string', 'scope' => 'company']);
        $this->save([['key' => 'twilio_auth_token', 'value' => 'replacement-secret']])->assertForbidden();
        $this->assertSame('existing-dummy-secret', $setting->fresh()->value);
        $this->getJson('/api/v1/admin/settings')->assertOk()->assertDontSee('twilio_auth_token');
    }

    public function test_unknown_key_refuses_the_entire_batch_and_other_tenant_cannot_define_its_authority(): void
    {
        $this->owner();
        $other = $this->otherOrganization();
        DB::table('hotel_settings')->insert(['organization_id' => $other->id, 'key' => 'new_arbitrary_secret', 'value' => 'other-tenant', 'group' => 'general', 'type' => 'string', 'scope' => 'company']);
        $this->save([['key' => 'hotel_name', 'value' => 'Must not persist'], ['key' => 'new_arbitrary_secret', 'value' => 'unexpected']])->assertUnprocessable();
        $this->assertDatabaseMissing('hotel_settings', ['organization_id' => $this->org->id, 'key' => 'hotel_name', 'value' => 'Must not persist']);
        $this->assertDatabaseMissing('hotel_settings', ['organization_id' => $this->org->id, 'key' => 'new_arbitrary_secret']);
    }

    public function test_owner_writes_canonical_metadata_and_twilio_never_leaves_plaintext_in_database_cache_or_response(): void
    {
        $this->owner();
        $secret = 'twilio-test-placeholder-sensitive-tail';
        $this->save([['key' => 'twilio_auth_token', 'value' => $secret]])->assertOk()->assertDontSee($secret)->assertDontSee('sensitive-tail');
        $row = HotelSetting::where('key', 'twilio_auth_token')->firstOrFail();
        $this->assertSame($secret, $row->value);
        $this->assertSame($secret, Crypt::decryptString($row->getRawOriginal('value')));
        $this->assertSame('integrations', $row->group);
        $this->assertSame('company', $row->scope);
        $this->assertNull(HotelSetting::getValue('twilio_auth_token'));
        $this->getJson('/api/v1/admin/settings')->assertOk()->assertDontSee($secret)->assertDontSee('tail');
    }

    public function test_twilio_backfill_is_idempotent_and_discards_old_plaintext_cache(): void
    {
        $row = HotelSetting::create(['key' => 'twilio_auth_token', 'value' => '', 'group' => 'integrations', 'type' => 'string']);
        DB::table('hotel_settings')->where('id', $row->id)->update(['value' => 'legacy-test-placeholder']);
        Cache::put('org:'.$this->org->id.':hotel_settings', ['twilio_auth_token' => 'legacy-test-placeholder']);
        $migration = require database_path('migrations/2026_10_29_160100_encrypt_twilio_tokens.php');
        $migration->up();
        $encrypted = $row->fresh()->getRawOriginal('value');
        $this->assertSame('legacy-test-placeholder', Crypt::decryptString($encrypted));
        $this->assertNull(Cache::get('org:'.$this->org->id.':hotel_settings'));
        $migration->up();
        $this->assertSame($encrypted, $row->fresh()->getRawOriginal('value'));
    }

    public function test_smoobu_destination_is_fixed_even_for_legacy_url_and_probe_does_not_follow_redirects(): void
    {
        $this->owner();
        $this->save([['key' => 'booking_smoobu_base_url', 'value' => 'https://untrusted.example.test/api']])->assertUnprocessable();
        HotelSetting::create(['key' => 'booking_smoobu_api_key', 'value' => 'tenant-key-placeholder', 'group' => 'integrations', 'type' => 'string']);
        HotelSetting::create(['key' => 'booking_smoobu_base_url', 'value' => 'https://untrusted.example.test/api', 'group' => 'integrations', 'type' => 'string']);
        Http::fake([SmoobuEndpoint::BASE.'/*' => Http::sequence()
            ->push(['apartments' => [['id' => 1]], 'total_items' => 1])
            ->push('', 302, ['Location' => 'https://untrusted.example.test'])]);
        $this->postJson('/api/v1/admin/settings/test-integration', ['type' => 'smoobu'])->assertOk()->assertJsonPath('success', true);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), SmoobuEndpoint::BASE.'/apartments') && $request->hasHeader('Api-Key', 'tenant-key-placeholder'));
        Http::assertSentCount(1);
        $this->postJson('/api/v1/admin/settings/test-integration', ['type' => 'smoobu'])->assertOk()->assertJsonPath('success', false)->assertJsonPath('message', 'HTTP 302');
    }

    public function test_unconfigured_tenant_cannot_probe_with_platform_credentials(): void
    {
        $_ENV['SMOOBU_API_KEY'] = $_SERVER['SMOOBU_API_KEY'] = 'platform-test-placeholder';
        try {
            HotelSetting::where('key', 'booking_smoobu_api_key')->delete();
            Http::fake();
            $this->postJson('/api/v1/admin/settings/test-integration', ['type' => 'smoobu'])->assertOk()->assertJsonPath('success', false)->assertJsonPath('message', 'No API key configured');
            Http::assertNothingSent();
        } finally {
            unset($_ENV['SMOOBU_API_KEY'], $_SERVER['SMOOBU_API_KEY']);
        }
    }

    public function test_smoobu_client_uses_fixed_origin_and_tenant_key_and_rejects_foreign_brand_credentials(): void
    {
        $this->addColumnsIfMissing('brands', [
            'pms_smoobu_api_key' => fn ($t) => $t->text('pms_smoobu_api_key')->nullable(),
            'pms_smoobu_channel_id' => fn ($t) => $t->string('pms_smoobu_channel_id')->nullable(),
        ]);
        $other = $this->otherOrganization();
        $brand = \App\Models\Brand::withoutGlobalScopes()->where('organization_id', $other->id)->first();
        if (!$brand) {
            $id = DB::table('brands')->insertGetId(['organization_id' => $other->id, 'name' => 'Foreign brand', 'slug' => 'foreign-brand', 'created_at' => now(), 'updated_at' => now()]);
            $brand = \App\Models\Brand::withoutGlobalScopes()->findOrFail($id);
        }
        $brand->forceFill(['pms_smoobu_api_key' => 'foreign-brand-placeholder'])->save();
        app()->instance('current_brand_id', $brand->id);
        HotelSetting::create(['key' => 'booking_smoobu_api_key', 'value' => 'tenant-client-placeholder', 'group' => 'integrations', 'type' => 'string']);
        HotelSetting::create(['key' => 'booking_smoobu_base_url', 'value' => 'https://untrusted.example.test', 'group' => 'integrations', 'type' => 'string']);
        Http::fake([SmoobuEndpoint::BASE.'/*' => Http::response(['apartments' => [['id' => 1]], 'page_count' => 1])]);
        $this->assertSame([['id' => 1]], (new SmoobuClient())->getApartments()['apartments']);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), SmoobuEndpoint::BASE.'/apartments') && $request->hasHeader('Api-Key', 'tenant-client-placeholder'));
        Http::assertSentCount(1);
    }

    public function test_generic_settings_preserve_programme_validation_and_switch_dates(): void
    {
        $this->save([['key' => 'hotel_name', 'value' => 'Must roll back'], ['key' => 'cashback_percent', 'value' => '1000']])
            ->assertUnprocessable()->assertJsonValidationErrors('cashback_percent');
        $this->assertDatabaseMissing('hotel_settings', ['organization_id' => $this->org->id, 'key' => 'hotel_name', 'value' => 'Must roll back']);
        $this->save([['key' => 'tier_progress_by', 'value' => 'unknown']])->assertUnprocessable();
        $this->save([['key' => 'stamps_enabled_since', 'value' => '2000-01-01']])->assertUnprocessable();
        $this->save([['key' => 'stamps_enabled', 'value' => 'true'], ['key' => 'stamps_per_card', 'value' => '5']])
            ->assertOk()->assertJsonPath('written', 2);
        $this->assertTrue(\App\Services\Loyalty\Programme\ProgrammeOptions::get($this->org->id, 'stamps_enabled'));
        $this->assertSame(5, \App\Services\Loyalty\Programme\ProgrammeOptions::get($this->org->id, 'stamps_per_card'));
        $this->assertSame('2026-10-05', \App\Services\Loyalty\Programme\ProgrammeOptions::onSince($this->org->id, 'stamps_enabled'));
    }

    public function test_manager_can_save_and_read_existing_booking_and_widget_controls(): void
    {
        $values = ['booking_payment_enabled' => 'true', 'services_slot_step' => '30', 'services_lead_minutes' => '120',
            'services_max_advance_days' => '90', 'services_allow_master_choice' => 'true', 'services_require_deposit' => 'true',
            'services_deposit_percent' => '50', 'services_cancellation_policy' => 'Cancel before the free cancellation window.'];
        foreach (['booking_widget', 'services_widget'] as $prefix) {
            foreach (['theme' => 'dark', 'color' => '#334455', 'radius' => '12', 'font' => 'Georgia, serif',
                'button_style' => 'filled', 'bg_color' => '#112233', 'text_color' => '#ffffff', 'custom_css' => '.widget { gap: 12px; }',
                'show_logo' => 'false', 'show_name' => 'true', 'property_name' => 'Fixture venue', 'logo_url' => '/fixture-logo.png'] as $suffix => $value) {
                $values[$prefix . '_' . $suffix] = $value;
            }
        }
        $rows = array_map(fn ($key, $value) => compact('key', 'value'), array_keys($values), $values);
        $this->save($rows)->assertOk()->assertJsonPath('written', count($values));
        $response = $this->getJson('/api/v1/admin/settings')->assertOk();
        foreach ($values as $key => $value) {
            $this->assertDatabaseHas('hotel_settings', ['organization_id' => $this->org->id, 'key' => $key, 'value' => $value, 'group' => 'booking']);
            $response->assertSee($key);
        }
        $this->save([['key' => 'services_widget_unknown_secret', 'value' => 'refuse']])->assertUnprocessable();
    }

    /** Literal controls plus the three finite generated key families in the active generic-settings writer. */
    public function test_every_active_frontend_generic_settings_control_is_registered(): void
    {
        $settings = file_get_contents(base_path('frontend/src/pages/Settings.tsx'));
        $booking = file_get_contents(base_path('frontend/src/components/settings/BookingTab.tsx'));
        $theme = file_get_contents(base_path('frontend/src/theme/themeSettings.ts'));
        $source = $settings . $booking . $theme;
        preg_match_all("/(?:handleChange|toggle|isOn|getVal)\\('([a-z0-9_]+)'|\\bkey: '([a-z0-9_]+)'/", $source, $matches);
        $keys = array_filter(array_merge($matches[1], $matches[2]));
        preg_match_all('/(?:keys:|const COLOR_KEYS =)\\s*\\[([^\\]]+)\\]/s', $settings, $lists);
        foreach ($lists[1] as $list) {
            preg_match_all("/'([a-z0-9_]+)'/", $list, $items);
            $keys = array_merge($keys, $items[1]);
        }
        preg_match_all("/\\bm\\('([a-z0-9_]+)'/", $settings, $mobile);
        foreach ($mobile[1] as $suffix) $keys[] = 'mobile_' . $suffix;
        preg_match_all("/\\bsk\\('([a-z0-9_]+)'/", $booking, $widgets);
        foreach (array_unique($widgets[1]) as $suffix) {
            $keys[] = 'booking_widget_' . $suffix;
            $keys[] = 'services_widget_' . $suffix;
        }
        preg_match_all('/const (?:pmsSections|channelSections|serviceSections): Section\\[\\] = \\[([\\s\\S]*?)\\n    \\]/', $settings, $sections);
        foreach ($sections[1] as $section) {
            preg_match_all("/id: '([a-z0-9_]+)'/", $section, $ids);
            foreach ($ids[1] as $id) $keys[] = $id . '_enabled';
        }
        $keys = array_unique($keys);
        $this->assertGreaterThan(100, count($keys), 'Inventory includes integration, branding, mobile and booking controls.');
        foreach ($keys as $key) {
            $this->assertNotNull(\App\Support\SettingRegistry::get($key), "Active settings control is not registered: {$key}");
        }
    }
}
