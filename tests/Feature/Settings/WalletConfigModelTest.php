<?php

namespace Tests\Feature\Settings;

use App\Models\WalletConfig;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the WalletConfig model contract — Apple + Google Wallet
 * credentials for member wallet passes (May 13 2026 ship).
 *
 * Why this matters:
 *
 *   Apple's pass-signing requires a .p12 cert + its password.
 *   Password lives in `apple_cert_password`. A regression that
 *   stored it as plaintext would leak the wallet-signing
 *   credentials via DB snapshots — every customer's wallet
 *   passes could be forged.
 *
 *   Sister to HotelSetting::ENCRYPTED_KEYS pattern (Tier M2 +
 *   V3): encrypt-on-write via setAttribute, decrypt-on-read
 *   via Attribute accessor. Legacy plaintext rows fall through
 *   the catch on read so admins can re-save to encrypt without
 *   500-ing the endpoint.
 *
 *   appleReady() + googleReady() predicates gate the "this org
 *   can issue passes" UX — admin sees green-checkmark vs amber-
 *   warning based on these.
 *
 * Contract:
 *
 *   - apple_cert_password encrypts on write (raw column =
 *     Crypt cipher payload)
 *   - apple_cert_password decrypts on read (accessor returns
 *     plaintext)
 *   - Legacy plaintext row reads via accessor's catch block
 *     (fail-open — admins re-save to encrypt)
 *   - Null password persists as null (defensive)
 *   - appleReady() returns true ONLY when all 4 required Apple
 *     fields set + is_active
 *   - googleReady() returns true ONLY when all 3 required Google
 *     fields set + is_active
 *   - is_active=false → both predicates false (defensive
 *     master kill switch)
 *   - BelongsToOrganization + TenantScope isolation
 */
class WalletConfigModelTest extends TestCase
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

        if (!Schema::hasTable('wallet_configs')) {
            Schema::create('wallet_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('apple_pass_type_id')->nullable();
                $t->string('apple_team_id')->nullable();
                $t->string('apple_organization_name')->nullable();
                $t->string('apple_cert_path')->nullable();
                $t->text('apple_cert_password')->nullable();
                $t->string('apple_wwdr_path')->nullable();
                $t->string('apple_pass_background_color', 16)->nullable();
                $t->string('apple_pass_foreground_color', 16)->nullable();
                $t->string('apple_pass_label_color', 16)->nullable();
                $t->string('google_issuer_id')->nullable();
                $t->string('google_class_suffix')->nullable();
                $t->string('google_service_account_path')->nullable();
                $t->boolean('is_active')->default(true);
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

    private function config(array $attrs = []): WalletConfig
    {
        return WalletConfig::create(array_merge([
            'organization_id' => $this->orgId,
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── apple_cert_password encryption ─── */

    public function test_apple_cert_password_stored_as_ciphertext_in_raw_column(): void
    {
        // CRITICAL: a DB snapshot MUST NOT leak the password.
        // Verify via direct query-builder bypass.
        $plaintext = 'my-secret-cert-password-12345';
        $this->config(['apple_cert_password' => $plaintext]);

        $raw = DB::table('wallet_configs')
            ->where('organization_id', $this->orgId)
            ->value('apple_cert_password');

        $this->assertNotSame($plaintext, $raw,
            'CRITICAL: raw column MUST NOT contain plaintext password.');
        $this->assertSame($plaintext, Crypt::decryptString($raw),
            'Crypt round-trip MUST recover plaintext.');
    }

    public function test_accessor_returns_plaintext_transparently(): void
    {
        $plaintext = 'test-password-AccessorTest';
        $this->config(['apple_cert_password' => $plaintext]);

        $row = WalletConfig::first();

        $this->assertSame($plaintext, $row->apple_cert_password,
            'Accessor MUST return plaintext (transparent decrypt).');
    }

    public function test_legacy_plaintext_row_reads_via_catch_path_fail_open(): void
    {
        // Direct INSERT bypasses the mutator → raw plaintext.
        // Accessor's catch block returns it unchanged (fail-open
        // per the docblock — admins re-save to encrypt).
        DB::table('wallet_configs')->insert([
            'organization_id'     => $this->orgId,
            'apple_cert_password' => 'LEGACY_PLAINTEXT',
            'is_active'           => true,
            'created_at'          => now(),
            'updated_at'          => now(),
        ]);

        $row = WalletConfig::first();
        $this->assertSame('LEGACY_PLAINTEXT', $row->apple_cert_password,
            'Legacy plaintext rows MUST surface via accessor catch path (fail-open).');
    }

    public function test_legacy_plaintext_row_re_encrypts_on_next_save(): void
    {
        // After save() the mutator re-encrypts. Admins can re-save
        // to migrate legacy rows to ciphertext.
        DB::table('wallet_configs')->insert([
            'organization_id'     => $this->orgId,
            'apple_cert_password' => 'BEFORE_SAVE',
            'is_active'           => true,
            'created_at'          => now(),
            'updated_at'          => now(),
        ]);

        $row = WalletConfig::first();
        // Touching the password attribute triggers the mutator
        // (set: Crypt::encryptString).
        $row->apple_cert_password = $row->apple_cert_password;
        $row->save();

        $raw = DB::table('wallet_configs')
            ->where('id', $row->id)
            ->value('apple_cert_password');
        $this->assertNotSame('BEFORE_SAVE', $raw,
            'After save, raw column MUST be ciphertext.');
        $this->assertSame('BEFORE_SAVE', Crypt::decryptString($raw),
            'Round-trip recovers legacy plaintext.');
    }

    public function test_null_password_persists_as_null(): void
    {
        // Defensive: a config row without password (apple not yet
        // set up) MUST persist null, not Crypt-encrypted empty
        // string.
        $config = $this->config(['apple_cert_password' => null]);

        $raw = DB::table('wallet_configs')
            ->where('id', $config->id)
            ->value('apple_cert_password');
        $this->assertNull($raw);

        $this->assertNull($config->fresh()->apple_cert_password);
    }

    /* ─── appleReady() predicate ─── */

    public function test_apple_ready_true_when_all_4_required_fields_set(): void
    {
        // The 4 required: apple_pass_type_id + apple_team_id +
        // apple_cert_path + apple_wwdr_path. PLUS is_active.
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert_path'    => '/private/storage/cert.p12',
            'apple_wwdr_path'    => '/private/storage/wwdr.pem',
        ]);

        $this->assertTrue($config->appleReady(),
            'All 4 Apple fields set + is_active → appleReady=true.');
    }

    public function test_apple_ready_false_when_pass_type_id_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => null, // missing
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert_path'    => '/private/storage/cert.p12',
            'apple_wwdr_path'    => '/private/storage/wwdr.pem',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_team_id_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => null,
            'apple_cert_path'    => '/private/storage/cert.p12',
            'apple_wwdr_path'    => '/private/storage/wwdr.pem',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_cert_path_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert_path'    => null,
            'apple_wwdr_path'    => '/private/storage/wwdr.pem',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_wwdr_path_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert_path'    => '/private/storage/cert.p12',
            'apple_wwdr_path'    => null,
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_is_active_false(): void
    {
        // CRITICAL: is_active is the master kill switch. All
        // fields set but is_active=false → still false. Used by
        // admin to temporarily disable wallet passes without
        // losing the config.
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert_path'    => '/private/storage/cert.p12',
            'apple_wwdr_path'    => '/private/storage/wwdr.pem',
            'is_active'          => false,
        ]);

        $this->assertFalse($config->appleReady(),
            'CRITICAL: is_active=false MUST disable wallet passes regardless of other fields.');
    }

    /* ─── googleReady() predicate ─── */

    public function test_google_ready_true_when_all_3_required_fields_set(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account_path'  => '/private/storage/sa.json',
        ]);

        $this->assertTrue($config->googleReady());
    }

    public function test_google_ready_false_when_issuer_id_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => null,
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account_path'  => '/private/storage/sa.json',
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_class_suffix_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => null,
            'google_service_account_path'  => '/private/storage/sa.json',
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_service_account_path_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account_path'  => null,
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_is_active_false(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account_path'  => '/private/storage/sa.json',
            'is_active'                    => false,
        ]);

        $this->assertFalse($config->googleReady());
    }

    /* ─── is_active boolean cast ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $on = $this->config(['is_active' => true]);
        $off = $this->config(['is_active' => false]);

        $this->assertTrue($on->is_active);
        $this->assertFalse($off->is_active);
        $this->assertIsBool($on->is_active);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_tenant_scope_isolates_wallet_configs_cross_org(): void
    {
        // CRITICAL: wallet credentials are tenant-private. Cross-
        // leak would surface another tenant's Apple team ID +
        // pass type — wallet pass spoofing risk.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('wallet_configs')->insert([
            'organization_id'      => $orgA,
            'apple_team_id'        => 'TEAMA1234',
            'is_active'            => true,
            'created_at'           => now(),
            'updated_at'           => now(),
        ]);
        \DB::table('wallet_configs')->insert([
            'organization_id'      => $orgB,
            'apple_team_id'        => 'TEAMB5678',
            'is_active'            => true,
            'created_at'           => now(),
            'updated_at'           => now(),
        ]);

        $aRows = WalletConfig::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('TEAMA1234', $aRows->first()->apple_team_id);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = WalletConfig::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('TEAMB5678', $bRows->first()->apple_team_id);
    }
}
