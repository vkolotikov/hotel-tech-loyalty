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
 * GET /v1/settings must never hand a tenant the PLATFORM's own secrets.
 *
 * The leak this pins: an org that had never set a credential had an empty
 * settings row; index() "helpfully" substituted the platform's env value for
 * any key in ENV_FALLBACKS; and if the key was also a SECRET_KEY, that
 * platform value went back to the client masked — with the first and last
 * four characters visible. Eight of a ten-character password, to every
 * tenant super_admin who opened Settings.
 *
 * SecretMaskingTest locks the mask and the list; this file drives the real
 * endpoint and asserts the guard in index() itself: a secret the tenant has
 * not set reads as "not set", while a non-secret setting still shows the
 * platform default it always did.
 */
class SettingsSecretFallbackTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const PLATFORM_SECRET = 'PLATFORM-expo-0123456789ABCDEF';

    protected function setUp(): void
    {
        parent::setUp();

        // organizations, users, brands … (the brand middleware resolves the
        // org's default brand, which Organization::created provisions only
        // when the table exists), then hotel_settings.
        $this->setUpLoyaltySchema();
        $this->setUpBookingRefundSchema();

        if (!Schema::hasColumn('brands', 'logo_url')) {
            Schema::table('brands', fn ($table) => $table->string('logo_url')->nullable());
        }
        if (!Schema::hasColumn('brands', 'sort_order')) {
            Schema::table('brands', fn ($table) => $table->integer('sort_order')->default(0));
        }

        // The brand middleware narrows a staff user to their assigned brands
        // through this pivot before falling back to the org's default.
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }

        // index() decides what a caller may see from their staff role.
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
        foreach (['EXPO_ACCESS_TOKEN', 'MAIL_FROM_NAME'] as $key) {
            unset($_SERVER[$key], $_ENV[$key]);
            putenv($key);
        }
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    private function platformEnv(string $key, string $value): void
    {
        $_SERVER[$key] = $value;
        $_ENV[$key]    = $value;
        putenv($key . '=' . $value);
    }

    /** A tenant super_admin, signed in, whose org has an EMPTY row for the two settings under test. */
    private function superAdminWithEmptyRows(): User
    {
        $org = Organization::create([
            'name'                => 'Tenant Hotel',
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        $user = User::create([
            'organization_id' => $org->id,
            'name'            => 'Owner',
            'email'           => 'owner_' . uniqid('', true) . '@example.test',
            'password'        => 'irrelevant-Password-1',
            'user_type'       => 'staff',
        ]);

        DB::table('staff')->insert([
            'organization_id' => $org->id,
            'user_id'         => $user->id,
            'role'            => 'super_admin',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        foreach ([
            ['expo_access_token', 'Expo Access Token'],
            ['mail_from_name',    'From Name'],
        ] as [$key, $label]) {
            DB::table('hotel_settings')->insert([
                'organization_id' => $org->id,
                'key'             => $key,
                'value'           => '',
                'type'            => 'string',
                'group'           => 'integrations',
                'label'           => $label,
                'scope'           => 'company',
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);
        }

        return $user;
    }

    /** Find one setting item anywhere in the grouped response. */
    private function item(array $json, string $key): ?array
    {
        $found = null;
        array_walk_recursive($json, function () {});

        $walk = function ($node) use (&$walk, &$found, $key) {
            if ($found !== null || !is_array($node)) {
                return;
            }
            if (($node['key'] ?? null) === $key && array_key_exists('masked', $node)) {
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

    public function test_an_unset_tenant_secret_is_reported_as_not_set_never_as_the_platforms_value(): void
    {
        $this->platformEnv('EXPO_ACCESS_TOKEN', self::PLATFORM_SECRET);
        $this->platformEnv('MAIL_FROM_NAME', 'Platform Sender');

        Sanctum::actingAs($this->superAdminWithEmptyRows());

        $response = $this->getJson('/api/v1/admin/settings');
        $this->assertSame(200, $response->getStatusCode(), 'GET /api/v1/admin/settings: ' . substr($response->getContent(), 0, 300));

        $body = $response->getContent();
        $this->assertStringNotContainsString(self::PLATFORM_SECRET, $body,
            'The platform credential reached a tenant response verbatim.');
        $this->assertStringNotContainsString(substr(self::PLATFORM_SECRET, -4), $body,
            'The tail of the platform credential reached a tenant response (masked leak).');

        $secret = $this->item($response->json(), 'expo_access_token');
        $this->assertNotNull($secret, 'The expo_access_token row is missing from the super_admin view.');
        $this->assertNull($secret['masked'], 'An unset tenant secret must not be masked from the platform value.');
        $this->assertFalse($secret['has_value'], 'An unset tenant secret must read as "not set".');

        // The guard is narrow: a NON-secret setting still falls back to the
        // platform value, exactly as before, so the screen keeps telling the
        // truth about what is in effect.
        $plain = $this->item($response->json(), 'mail_from_name');
        $this->assertNotNull($plain);
        $this->assertSame('Platform Sender', $plain['value']);
        $this->assertTrue($plain['has_value']);
    }
}
