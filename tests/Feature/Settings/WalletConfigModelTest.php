<?php

namespace Tests\Feature\Settings;

use App\Models\WalletConfig;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
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
 *     fields set + is_active (the two files: held in the row)
 *   - googleReady() returns true ONLY when all 3 required Google
 *     fields set + is_active (the key: held in the row)
 *   - The files (HexaTech Loyalty release 3 §2) are ciphertext in
 *     the raw columns, never in an array or JSON form; a file named
 *     by a pre-release-3 path and still on the local disk is taken
 *     into the row on read, a path whose file is gone is not ready
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
                $t->longText('apple_cert_content')->nullable();
                $t->longText('apple_wwdr_content')->nullable();
                $t->longText('google_service_account_content')->nullable();
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

    /** A row; `apple_cert`, `apple_wwdr` and `google_service_account` name a file's bytes (null: none). */
    private function config(array $attrs = []): WalletConfig
    {
        $files = array_intersect_key($attrs, WalletConfig::FILES);
        $config = WalletConfig::create(array_merge([
            'organization_id' => $this->orgId,
            'is_active'       => true,
        ], array_diff_key($attrs, WalletConfig::FILES)));
        foreach (array_filter($files, fn ($bytes) => $bytes !== null) as $file => $bytes) {
            $config->putFile($file, $bytes);
        }
        $config->save();

        return $config;
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
        // the certificate + the WWDR certificate. PLUS is_active.
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert'         => 'p12 bytes',
            'apple_wwdr'         => 'wwdr bytes',
        ]);

        $this->assertTrue($config->appleReady(),
            'All 4 Apple fields set + is_active → appleReady=true.');
    }

    public function test_apple_ready_false_when_pass_type_id_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => null, // missing
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert'         => 'p12 bytes',
            'apple_wwdr'         => 'wwdr bytes',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_team_id_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => null,
            'apple_cert'         => 'p12 bytes',
            'apple_wwdr'         => 'wwdr bytes',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_cert_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert'         => null,
            'apple_wwdr'         => 'wwdr bytes',
        ]);

        $this->assertFalse($config->appleReady());
    }

    public function test_apple_ready_false_when_wwdr_missing(): void
    {
        $config = $this->config([
            'apple_pass_type_id' => 'pass.com.example',
            'apple_team_id'      => 'ABCDEF1234',
            'apple_cert'         => 'p12 bytes',
            'apple_wwdr'         => null,
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
            'apple_cert'         => 'p12 bytes',
            'apple_wwdr'         => 'wwdr bytes',
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
            'google_service_account'       => '{"client_email":"a@b"}',
        ]);

        $this->assertTrue($config->googleReady());
    }

    public function test_google_ready_false_when_issuer_id_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => null,
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account'       => '{"client_email":"a@b"}',
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_class_suffix_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => null,
            'google_service_account'       => '{"client_email":"a@b"}',
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_service_account_missing(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account'       => null,
        ]);

        $this->assertFalse($config->googleReady());
    }

    public function test_google_ready_false_when_is_active_false(): void
    {
        $config = $this->config([
            'google_issuer_id'             => '3388000000001234567',
            'google_class_suffix'          => 'loyalty_card',
            'google_service_account'       => '{"client_email":"a@b"}',
            'is_active'                    => false,
        ]);

        $this->assertFalse($config->googleReady());
    }

    /* ─── The files, in the row (release 3 §2) ─── */

    public function test_a_file_is_ciphertext_in_its_raw_column_and_comes_back_byte_for_byte(): void
    {
        // A .p12 is binary: every byte value must survive.
        $p12 = random_bytes(64) . "\x00\xff\x30\x82" . implode('', array_map('chr', range(0, 255)));
        $config = $this->config(['apple_cert' => $p12, 'google_service_account' => '{"private_key":"KEY-MATERIAL"}']);

        $raw = (string) DB::table('wallet_configs')->where('id', $config->id)->value('apple_cert_content');
        $this->assertNotSame('', $raw);
        $this->assertStringNotContainsString(base64_encode($p12), $raw, 'CRITICAL: the raw column MUST be ciphertext.');
        $this->assertSame(base64_encode($p12), Crypt::decryptString($raw), 'The cast encrypts the base64 of the bytes.');
        $this->assertStringNotContainsString('KEY-MATERIAL', (string) DB::table('wallet_configs')->where('id', $config->id)->value('google_service_account_content'));

        $row = WalletConfig::first();
        $this->assertSame($p12, $row->fileBytes('apple_cert'));
        $this->assertTrue($row->hasFile('apple_cert'));
        $this->assertFalse($row->hasFile('apple_wwdr'));
        $this->assertNull($row->fileBytes('apple_wwdr'));
    }

    public function test_the_files_and_the_password_never_appear_in_an_array_or_json_form(): void
    {
        $this->config(['apple_cert_password' => 'PASSWORD-1', 'apple_cert' => 'CERT-BYTES', 'apple_wwdr' => 'WWDR-BYTES', 'google_service_account' => 'SA-BYTES']);
        $row = WalletConfig::first();

        $json = $row->toJson();
        foreach (['PASSWORD-1', 'CERT-BYTES', 'WWDR-BYTES', 'SA-BYTES', 'apple_cert_content', 'apple_cert_password'] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
        $this->assertArrayNotHasKey('google_service_account_content', $row->toArray());
    }

    public function test_content_that_no_longer_decrypts_reads_as_no_file_without_throwing(): void
    {
        $config = $this->config();
        DB::table('wallet_configs')->where('id', $config->id)->update(['apple_cert_content' => 'not-a-crypt-payload']);

        $row = WalletConfig::first();
        $this->assertTrue($row->hasFile('apple_cert'), 'The row names a file …');
        $this->assertNull($row->fileBytes('apple_cert'), '… that cannot be had.');
    }

    public function test_a_file_uploaded_before_release_3_is_taken_into_the_row_when_read_and_the_disk_is_left_alone(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put("wallet/{$this->orgId}/apple-cert.p12", "\x30\x82legacy-p12");
        DB::table('wallet_configs')->insert([
            'organization_id'             => $this->orgId,
            'apple_pass_type_id'          => 'pass.com.example',
            'apple_team_id'               => 'ABCDEF1234',
            'apple_cert_path'             => "wallet/{$this->orgId}/apple-cert.p12",
            'apple_wwdr_path'             => "wallet/{$this->orgId}/apple-wwdr.pem",
            'is_active'                   => true,
            'created_at'                  => now(),
            'updated_at'                  => now(),
        ]);

        $row = WalletConfig::first();

        // The certificate is in the row, encrypted; the WWDR file was not on the disk, so it stays named but absent.
        $this->assertSame("\x30\x82legacy-p12", $row->fileBytes('apple_cert'));
        $raw = DB::table('wallet_configs')->where('organization_id', $this->orgId)->first();
        $this->assertSame(base64_encode("\x30\x82legacy-p12"), Crypt::decryptString($raw->apple_cert_content));
        $this->assertNull($raw->apple_wwdr_content);
        $this->assertSame("wallet/{$this->orgId}/apple-cert.p12", $raw->apple_cert_path);
        $this->assertSame("wallet/{$this->orgId}/apple-wwdr.pem", $raw->apple_wwdr_path);
        Storage::disk('local')->assertExists("wallet/{$this->orgId}/apple-cert.p12");
        $this->assertFalse($row->appleReady(), 'A path whose file is gone is not a file.');

        // From then on the row is the source: the disk can be empty (a deploy, another replica).
        Storage::fake('local');
        $this->assertSame("\x30\x82legacy-p12", WalletConfig::first()->fileBytes('apple_cert'));
    }

    /* ─── is_active boolean cast ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $on = $this->config(['is_active' => true]);
        // One configuration per organisation (wallet_configs_organization_id_unique),
        // so the switched-off one belongs to another organisation.
        app()->instance('current_organization_id', OrganizationFactory::new()->create()->id);
        $off = $this->config(['is_active' => false]);
        app()->instance('current_organization_id', $this->orgId);

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
