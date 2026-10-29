<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\ComparesJsonColumns;
use Tests\TestCase;

/**
 * The member app's look (release 2 §7): read by every staff member, changed by a manager, written as the full admin's
 * Settings page writes it so the apps' `GET /v1/theme` answers the same whichever side saved; colours `#rrggbb` and
 * the styles from the server's lists, refused per field; the logo as the full admin's logo upload.
 */
class AppLookTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, ComparesJsonColumns;

    private const SAPPHIRE = [
        'primary' => '#3b82f6', 'background' => '#0a0f1e', 'surface' => '#111827', 'secondary' => '#1f2937', 'text' => '#f8fafc',
        'text_secondary' => '#94a3b8', 'border' => '#1f2a3a', 'success' => '#22c55e', 'error' => '#ef4444', 'warning' => '#eab308', 'info' => '#06b6d4',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Storage::fake('public');
    }

    /** @return array<string, mixed> */
    private function look(array $overrides = []): array
    {
        return $overrides + ['colors' => self::SAPPHIRE, 'card_style' => 'glass', 'radius' => 20, 'button_style' => 'soft', 'accent_intensity' => 'bold'];
    }

    private function theme(): array
    {
        return $this->getJson(rtrim((string) config('app.url'), '/') . '/api/v1/theme')->assertOk()->json();
    }

    /** @return array<string, array<string, mixed>> this organisation's mobile rows, as the theme reader sees them */
    private function rows(): array
    {
        return HotelSetting::query()->where('group', 'mobile_app')->orderBy('key')->get()
            ->mapWithKeys(fn ($r) => [$r->key => ['value' => $r->value, 'type' => $r->type, 'group' => $r->group, 'label' => $r->label, 'scope' => $r->scope]])->all();
    }

    public function test_anyone_reads_the_look_with_the_full_admins_fallbacks_and_the_servers_lists(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        HotelSetting::create(['key' => 'mobile_primary_color', 'value' => '#123456', 'type' => 'string', 'group' => 'mobile_app']);
        app()->instance('current_organization_id', $prior);

        $response = $this->asStaffMember()->getJson($this->api('app-look?brand_id=all'))->assertOk()
            ->assertJsonPath('look', [
                'colors' => [
                    'primary' => '#c9a84c', 'background' => '#0d0d0d', 'surface' => '#161616', 'secondary' => '#1e1e1e', 'text' => '#ffffff',
                    'text_secondary' => '#8e8e93', 'border' => '#2c2c2c', 'success' => '#32d74b', 'error' => '#ff375f', 'warning' => '#ffd60a', 'info' => '#0a84ff',
                ],
                'card_style' => 'gradient', 'radius' => 16, 'button_style' => 'filled', 'accent_intensity' => 'vibrant', 'preset' => null, 'logo_url' => null,
            ])
            ->assertJsonPath('options.card_styles', ['gradient', 'solid', 'glass'])
            ->assertJsonPath('options.button_styles', ['filled', 'outline', 'soft'])
            ->assertJsonPath('options.accent_intensities', ['subtle', 'vibrant', 'bold'])
            ->assertJsonPath('options.radius', ['min' => 0, 'max' => 32])
            ->assertJsonPath('options.colors', array_keys(self::SAPPHIRE))
            ->assertJsonPath('options.presets.1', ['key' => 'royal_sapphire', 'name' => 'Royal Sapphire', 'colors' => self::SAPPHIRE])
            ->assertJsonPath('options.logo', ['max_kb' => 4096, 'max_edge' => 4096, 'types' => ['image/jpeg', 'image/png', 'image/webp']]);
        $this->assertCount(12, $response->json('options.presets'));

        // What the full admin stored is answered as stored, the preset by its key.
        HotelSetting::create(['key' => 'mobile_text_color', 'value' => '#FFF', 'type' => 'string', 'group' => 'mobile_app']);
        HotelSetting::create(['key' => 'mobile_radius', 'value' => '24', 'type' => 'integer', 'group' => 'mobile_app']);
        HotelSetting::create(['key' => 'mobile_preset_name', 'value' => 'Nordic Ice', 'type' => 'string', 'group' => 'mobile_app']);
        $this->asStaffMember()->getJson($this->api('app-look'))->assertOk()
            ->assertJsonPath('look.colors.text', '#FFF')->assertJsonPath('look.radius', 24)->assertJsonPath('look.preset', 'nordic_ice');
    }

    public function test_neutral_palettes_save_through_existing_app_colours_without_changing_accent_or_other_tenants(): void
    {
        $other = $this->otherOrganization();
        HotelSetting::withoutGlobalScopes()->insert([
            'organization_id' => $other['org']->id, 'key' => 'mobile_background_color', 'value' => '#123456',
            'type' => 'string', 'group' => 'mobile_app', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $options = $this->asManager()->getJson($this->api('app-look'))->assertOk()->json('options');
        $this->assertArrayNotHasKey('auto', $options['color_modes']);
        $this->assertArrayNotHasKey('primary', $options['color_modes']['light']);
        $this->assertSame('#242c3b', $options['color_modes']['dark']['background']);
        $colors = array_replace(self::SAPPHIRE, $options['color_modes']['light']);
        $this->putJson($this->api('app-look'), $this->look(['colors' => $colors]))->assertOk()
            ->assertJsonPath('look.colors.primary', '#3b82f6')
            ->assertJsonPath('look.colors.background', '#f5f7fb')
            ->assertJsonPath('look.colors.text', '#242c3b')
            ->assertJsonPath('look.colors.success', '#22c55e');
        $theme = $this->theme()['mobile_theme'];
        $this->assertSame('#f5f7fb', $theme['mobile_background_color']);
        $this->assertSame('#3b82f6', $theme['mobile_primary_color']);
        $this->assertSame('#123456', HotelSetting::withoutGlobalScopes()->where('organization_id', $other['org']->id)
            ->where('key', 'mobile_background_color')->value('value'));
    }

    public function test_a_manager_saves_it_lowercase_with_the_preset_and_one_audit_row_for_what_changed(): void
    {
        $this->asStaffMember()->putJson($this->api('app-look'), $this->look())->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $colors = self::SAPPHIRE;
        $colors['primary'] = '#3B82F6';
        $this->asManager()->putJson($this->api('app-look'), $this->look(['colors' => $colors, 'preset' => 'royal_sapphire']))->assertOk()
            ->assertJsonPath('look.colors', self::SAPPHIRE)
            ->assertJsonPath('look.card_style', 'glass')->assertJsonPath('look.radius', 20)->assertJsonPath('look.preset', 'royal_sapphire');

        $rows = $this->rows();
        $this->assertSame('#3b82f6', $rows['mobile_primary_color']['value']);
        $this->assertSame('20', $rows['mobile_radius']['value']);
        $this->assertSame('Royal Sapphire', $rows['mobile_preset_name']['value']);
        $this->assertCount(16, $rows);

        $audit = AuditLog::query()->where('action', 'mobile_app_look_updated')->sole();
        $this->assertSame('#3b82f6', $audit->new_values['mobile_primary_color']);
        $this->assertNull($audit->old_values['mobile_primary_color']);

        // The same look again writes nothing; one change is one key; no preset sent keeps the stored one.
        $this->asManager()->putJson($this->api('app-look'), $this->look(['preset' => 'royal_sapphire']))->assertOk();
        $this->asManager()->putJson($this->api('app-look'), $this->look(['radius' => 8]))->assertOk()->assertJsonPath('look.preset', 'royal_sapphire');
        $audit = AuditLog::query()->where('action', 'mobile_app_look_updated')->orderBy('id')->get();
        $this->assertCount(2, $audit);
        $this->assertSame(['mobile_radius' => '8'], $audit[1]->new_values);
        $this->assertSame(['mobile_radius' => '20'], $audit[1]->old_values);
    }

    public function test_a_colour_that_is_not_rrggbb_or_a_style_not_in_the_list_is_refused_per_field(): void
    {
        $colors = self::SAPPHIRE;
        $colors['primary'] = 'red';
        $colors['text'] = '#fff';
        unset($colors['info']);

        $this->asManager()->putJson($this->api('app-look'), $this->look(['colors' => $colors, 'card_style' => 'neon', 'radius' => 33, 'button_style' => null, 'preset' => 'disco']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['colors.primary', 'colors.text', 'colors.info', 'card_style', 'radius', 'button_style', 'preset'])
            ->assertJsonMissingValidationErrors(['colors.background', 'accent_intensity']);
        $this->assertSame([], $this->rows());
    }

    public function test_the_apps_theme_answers_the_same_whichever_side_saved(): void
    {
        // The full admin's Member App tab: a preset is saved as its colours and its name, the styles one by one.
        $settings = [];
        foreach (self::SAPPHIRE as $name => $hex) {
            $settings[] = ['key' => "mobile_{$name}_color", 'value' => $hex];
        }
        $settings[] = ['key' => 'mobile_preset_name', 'value' => 'Royal Sapphire'];
        foreach (['mobile_card_style' => 'glass', 'mobile_radius' => '20', 'mobile_button_style' => 'soft', 'mobile_accent_intensity' => 'bold'] as $key => $value) {
            $settings[] = ['key' => $key, 'value' => $value];
        }
        $this->asManager()->putJson(rtrim((string) config('app.url'), '/') . '/api/v1/admin/settings', ['settings' => $settings])->assertOk()->assertJsonPath('written', 16);
        $fullAdmin = ['theme' => $this->theme(), 'rows' => $this->rows()];
        $this->asManager()->getJson($this->api('app-look'))->assertJsonPath('look.colors', self::SAPPHIRE)->assertJsonPath('look.preset', 'royal_sapphire')
            ->assertJsonPath('look.radius', 20)->assertJsonPath('look.card_style', 'glass');

        HotelSetting::query()->where('group', 'mobile_app')->delete();
        $this->asManager()->putJson($this->api('app-look'), $this->look(['preset' => 'royal_sapphire']))->assertOk();

        // The same settings, whichever side wrote them; an object's key order is the rows' and means nothing.
        $this->assertSameJson($fullAdmin['theme'], $this->theme());
        $this->assertSame($fullAdmin['rows'], $this->rows());
        $this->assertSame('#3b82f6', $this->theme()['mobile_theme']['mobile_primary_color']);
    }

    public function test_the_logo_is_the_full_admins_company_logo_and_a_replacement_deletes_our_old_file(): void
    {
        $this->asStaffMember()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->image('logo.png', 400, 400)], ['Accept' => 'application/json'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asManager()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->create('logo.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['logo']);
        $this->asManager()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->image('logo.png', 400, 400)->size(4097)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['logo']);
        $this->assertSame([], Storage::disk('public')->allFiles());

        $first = (string) $this->asManager()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->image('logo.png', 400, 400)], ['Accept' => 'application/json'])
            ->assertOk()->json('logo_url');
        $this->assertStringStartsWith("/storage/org-{$this->org->id}/logos/", $first);
        $row = HotelSetting::query()->where('key', 'company_logo')->sole();
        $this->assertSame(['value' => $first, 'type' => 'string', 'group' => 'appearance', 'label' => 'Company Logo'], $row->only('value', 'type', 'group', 'label'));
        $this->assertSame($first, $this->theme()['theme']['company_logo']);

        $second = (string) $this->asManager()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->image('logo.webp', 300, 300)], ['Accept' => 'application/json'])
            ->assertOk()->json('logo_url');
        $this->assertFalse(Storage::disk('public')->exists(substr($first, strlen('/storage/'))));
        $this->assertTrue(Storage::disk('public')->exists(substr($second, strlen('/storage/'))));
        $this->asStaffMember()->getJson($this->api('app-look'))->assertJsonPath('look.logo_url', $second);

        // A logo that is not this organisation's own file is replaced but never deleted.
        Storage::disk('public')->put('shared/logo.png', 'x');
        $row->refresh()->update(['value' => '/storage/shared/logo.png']);
        $this->asManager()->post($this->api('app-look/logo'), ['logo' => UploadedFile::fake()->image('logo.png', 300, 300)], ['Accept' => 'application/json'])->assertOk();
        $this->assertTrue(Storage::disk('public')->exists('shared/logo.png'));
        $this->assertSame(3, AuditLog::query()->where('action', 'logo_uploaded')->count());
    }
}
