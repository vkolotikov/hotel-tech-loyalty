<?php

namespace Tests\Feature\Settings;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Settings → Branding → Style saves `theme_style` per organisation: 'glass'
 * (also what no saved value means) or 'classic'. The admin SPA reads it with
 * the colours from the appearance group through both theme endpoints, so the
 * key must land in `appearance`, and a value the SPA can't render must be
 * refused before anything in the same save is written.
 */
class ThemeStyleSettingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpLoyaltySchema();
        $this->setUpBookingRefundSchema();

        if (!Schema::hasColumn('brands', 'logo_url')) {
            Schema::table('brands', fn ($table) => $table->string('logo_url')->nullable());
        }
        if (!Schema::hasColumn('brands', 'sort_order')) {
            Schema::table('brands', fn ($table) => $table->integer('sort_order')->default(0));
        }
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('staff');
                $table->string('hotel_name')->nullable();
                $table->string('department')->nullable();
                $table->text('allowed_nav_groups')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /** An ordinary (non-super_admin) manager, the role that changes branding. */
    private function staffUser(): User
    {
        $org = Organization::create([
            'name'                => 'Riverside Studio',
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        $user = User::create([
            'organization_id' => $org->id,
            'name'            => 'Studio Manager',
            'email'           => 'staff_' . uniqid('', true) . '@example.test',
            'password'        => 'irrelevant-Password-1',
            'user_type'       => 'staff',
        ]);

        DB::table('staff')->insert([
            'organization_id' => $org->id,
            'user_id'         => $user->id,
            'role'            => 'manager',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        return $user;
    }

    /** Find one setting item anywhere in the grouped settings response. */
    private function item(array $json, string $key): ?array
    {
        $found = null;
        $walk = function ($node) use (&$walk, &$found, $key) {
            if ($found !== null || !is_array($node)) {
                return;
            }
            if (($node['key'] ?? null) === $key && array_key_exists('has_value', $node)) {
                $found = $node;
                return;
            }
            foreach ($node as $child) {
                $walk($child);
            }
        };
        $walk($json);

        return $found;
    }

    private function stored(int $orgId, string $key): ?HotelSetting
    {
        return HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->first();
    }

    private function saveStyle(mixed $value)
    {
        return $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'theme_style', 'value' => $value]]]);
    }

    public function test_glass_and_classic_are_saved_under_appearance_and_served_by_both_theme_endpoints(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');

        $save = $this->saveStyle('classic');
        $this->assertSame(200, $save->getStatusCode(), $save->getContent());
        $this->assertSame('classic', (string) $save->json('persisted.theme_style'));

        $row = $this->stored($user->organization_id, 'theme_style');
        $this->assertNotNull($row, 'theme_style was not stored for the organisation.');
        $this->assertSame('appearance', $row->group);

        $this->assertSame('classic', $this->getJson('/api/v1/admin/branding/theme')->json('theme.theme_style'));
        $this->assertSame('classic', $this->getJson('/api/v1/theme')->json('theme.theme_style'));

        $this->assertSame(200, $this->saveStyle('glass')->getStatusCode());
        $this->assertSame('glass', $this->getJson('/api/v1/admin/branding/theme')->json('theme.theme_style'));
    }

    public function test_an_unknown_style_is_refused_and_nothing_is_saved(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');

        // 'light' is Part 2's style; until it ships it is as unknown as 'neon'.
        foreach (['neon', 'GLASS', 'light', ''] as $bad) {
            $res = $this->saveStyle($bad);
            $this->assertSame(422, $res->getStatusCode(), "'{$bad}' was accepted: " . $res->getContent());
            $this->assertSame('theme_style must be glass or classic.', $res->json('errors.theme_style.0'));
        }

        $this->assertNull($this->stored($user->organization_id, 'theme_style'));
    }

    public function test_a_save_mixing_a_colour_with_a_bad_style_writes_neither(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');
        $before = $this->stored($user->organization_id, 'primary_color')?->value;

        $res = $this->putJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'primary_color', 'value' => '#10b981'],
            ['key' => 'theme_style', 'value' => 'neon'],
        ]]);

        $this->assertSame(422, $res->getStatusCode(), $res->getContent());
        $this->assertSame($before, $this->stored($user->organization_id, 'primary_color')?->value);
        $this->assertNull($this->stored($user->organization_id, 'theme_style'));
    }

    public function test_a_fresh_organisation_is_seeded_with_the_royal_blue_palette(): void
    {
        Sanctum::actingAs($this->staffUser());

        $res = $this->getJson('/api/v1/admin/settings');
        $this->assertSame(200, $res->getStatusCode(), $res->getContent());
        $this->assertSame('#3b82f6', $this->item($res->json(), 'primary_color')['value'] ?? null);
    }
}
