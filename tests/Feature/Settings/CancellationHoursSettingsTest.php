<?php

namespace Tests\Feature\Settings;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The member portal enforces two cancellation windows
 * (`CancellationPolicy::forStay()` / `forService()`, defaulting to 48h /
 * 24h — see app/Services/Booking/CancellationPolicy.php); Settings →
 * Booking (BookingTab.tsx) exposes both as editable fields, so the admin
 * `PUT /v1/admin/settings` endpoint must actually accept and persist the
 * two keys it sends: `booking_cancel_hours` and `services_cancel_hours`.
 *
 * Both keys are already seeded by
 * SettingsController::ensureTenantHasDefaultSettings() at group 'booking'
 * (see Phase2MigrationTest) — not 'system' or 'integrations' — so
 * update() needs no scope/group block or server-side whitelist for them.
 * This test proves that end-to-end through the real HTTP endpoint rather
 * than by reading the source: a fresh org sees the 48h/24h defaults, and a
 * save round-trips through GET, for an ordinary (non-super_admin) staff
 * member — the same role BookingTab.tsx's admin screen is typically
 * driven by.
 */
class CancellationHoursSettingsTest extends TestCase
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

    /** An ordinary (non-super_admin) staff member — the role that normally lives in Settings → Booking. */
    private function staffUser(): User
    {
        $org = Organization::create([
            'name'                => 'Riverside Clinic',
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        $user = User::create([
            'organization_id' => $org->id,
            'name'            => 'Front Desk',
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

    /** Find one setting item anywhere in the grouped response. */
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

    public function test_a_fresh_org_sees_the_cancellation_policy_defaults_of_48_and_24_hours(): void
    {
        Sanctum::actingAs($this->staffUser());

        $response = $this->getJson('/api/v1/admin/settings');
        $this->assertSame(200, $response->getStatusCode(), $response->getContent());

        $stays = $this->item($response->json(), 'booking_cancel_hours');
        $services = $this->item($response->json(), 'services_cancel_hours');

        $this->assertNotNull($stays, 'booking_cancel_hours is missing from a fresh org\'s settings.');
        $this->assertNotNull($services, 'services_cancel_hours is missing from a fresh org\'s settings.');
        // `type => 'integer'` on the settings row means index() returns the
        // *typed* value (int), not the raw stored string — unlike the
        // update() round-trip below, which echoes back what was sent.
        $this->assertSame(48, $stays['value']);
        $this->assertSame(24, $services['value']);
    }

    public function test_saving_both_cancellation_windows_persists_and_round_trips_through_get(): void
    {
        Sanctum::actingAs($this->staffUser());

        // BookingTab.tsx always loads GET /v1/admin/settings first (the
        // `admin-settings` query `getVal` reads from) — this is what seeds
        // the two rows as `type => 'integer'` before any save happens.
        $this->getJson('/api/v1/admin/settings');

        $save = $this->putJson('/api/v1/admin/settings', [
            'settings' => [
                ['key' => 'booking_cancel_hours', 'value' => '72'],
                ['key' => 'services_cancel_hours', 'value' => '6'],
            ],
        ]);
        $this->assertSame(200, $save->getStatusCode(), $save->getContent());

        $persisted = $save->json('persisted') ?? [];
        $this->assertSame('72', (string) ($persisted['booking_cancel_hours'] ?? null),
            'PUT /v1/admin/settings did not echo back the saved stay cancellation hours.');
        $this->assertSame('6', (string) ($persisted['services_cancel_hours'] ?? null),
            'PUT /v1/admin/settings did not echo back the saved service cancellation hours.');

        $get = $this->getJson('/api/v1/admin/settings');
        $stays = $this->item($get->json(), 'booking_cancel_hours');
        $services = $this->item($get->json(), 'services_cancel_hours');

        $this->assertSame(72, $stays['value']);
        $this->assertSame(6, $services['value']);
    }

    public function test_zero_hours_saves_as_zero_not_as_the_default(): void
    {
        // 0 means "free cancellation until the stay/appointment starts" — it must
        // not be coerced back to the 48/24 default the way an empty string would
        // by the frontend's `getVal(key) || '48'` fallback.
        Sanctum::actingAs($this->staffUser());
        $this->getJson('/api/v1/admin/settings');

        $save = $this->putJson('/api/v1/admin/settings', [
            'settings' => [
                ['key' => 'booking_cancel_hours', 'value' => '0'],
                ['key' => 'services_cancel_hours', 'value' => '0'],
            ],
        ]);
        $this->assertSame(200, $save->getStatusCode(), $save->getContent());

        $get = $this->getJson('/api/v1/admin/settings');
        $stays = $this->item($get->json(), 'booking_cancel_hours');
        $services = $this->item($get->json(), 'services_cancel_hours');

        $this->assertSame(0, $stays['value']);
        $this->assertSame(0, $services['value']);
    }
}
