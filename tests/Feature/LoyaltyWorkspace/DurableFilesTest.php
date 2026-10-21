<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberImportBatch;
use App\Models\WalletConfig;
use App\Services\AppleWalletService;
use App\Services\GoogleWalletService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Concerns\LoyaltyWorkspace\AppSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;
use ZipArchive;

/**
 * Durable files (spec 2026-10-22 release 3 §2, R3-1). Laravel Cloud keeps no local disk between deployments and shares
 * none between replicas, so the wallet pass files and a member import's CSV live in the database: a "restart" here is
 * a fresh, empty fake disk between the upload and the use, and everything still works.
 *
 * - The wallet files are encrypted in `wallet_configs`; both passes are made from there (the Apple signature is
 *   verified, the Google JWT too) and the signing leaves no key behind in the temp dir. A file on the disk from before
 *   is taken into the row when the row is first read and the disk is then left alone; one named but already gone asks
 *   for a new upload (`*_gone`). The answers are flags only.
 * - An import's file is in `member_import_batches.file_content` from the preview to the last chunk, byte for byte (BOM,
 *   delimiter, encoding), and cleared when the batch ends; a batch previewed before release 3 still runs from its path
 *   while the file is there. Lists never read the file.
 */
class DurableFilesTest extends TestCase
{
    use AppSchema, DatabaseTransactions, MembershipSchema, SetsUpLoyaltyWorkspace;

    /** @var array{p12: string, pem: string, key: string, public: string, google: string}|null one certificate for the class */
    private static ?array $made = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpAppSchema();
        $this->buildMembershipSchema();
        $this->withWalletFeature();
        Storage::fake('local');
        Storage::fake();
    }

    /** A self-signed certificate as .p12 (password `p12-secret`) and PEM, its key, and a Google key file using it. */
    private static function made(): array
    {
        if (self::$made === null) {
            $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            $cert = openssl_csr_sign(openssl_csr_new(['commonName' => 'Pass Type ID: pass.com.lumiere.members'], $key), null, $key, 1);
            openssl_pkcs12_export($cert, $p12, $key, 'p12-secret');
            openssl_x509_export($cert, $pem);
            openssl_pkey_export($key, $private);
            self::$made = [
                'p12' => $p12, 'pem' => $pem, 'key' => $private, 'public' => openssl_pkey_get_details($key)['key'],
                'google' => json_encode(['type' => 'service_account', 'client_email' => 'wallet@venue.iam.gserviceaccount.com', 'private_key' => $private]),
            ];
        }

        return self::$made;
    }

    private function admin(string $path = ''): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/wallet-config' . ($path !== '' ? '/' . $path : '');
    }

    private function adminImports(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/members/imports' . ($path === '' ? '' : '/' . $path);
    }

    private function adminUpload(string $path, string $name, string $content, array $more = []): void
    {
        $this->asManager()->post($this->admin($path), ['file' => UploadedFile::fake()->createWithContent($name, $content)] + $more, ['Accept' => 'application/json'])->assertOk();
    }

    /** The full admin's answer with every piece in place. */
    private static function readyShape(): array
    {
        return [
            'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => 'ABCDE12345', 'apple_organization_name' => null,
            'apple_pass_background_color' => 'rgb(13,13,13)', 'apple_pass_foreground_color' => 'rgb(255,255,255)', 'apple_pass_label_color' => 'rgb(201,168,76)',
            'apple_cert_uploaded' => true, 'apple_cert_password_set' => true, 'apple_wwdr_uploaded' => true, 'apple_ready' => true,
            'google_issuer_id' => '3388000000012345678', 'google_class_suffix' => 'members', 'google_service_account_uploaded' => true, 'google_ready' => true,
            'is_active' => true,
        ];
    }

    /** The files in the temp dir the pass builder names its own (the staging dir, the cert, the key, the WWDR copy). */
    private static function passTempFiles(): array
    {
        return glob(sys_get_temp_dir() . '/pkpass_*') ?: [];
    }

    /** Make Ada's Apple pass from the stored row and check it is signed with the stored certificate. */
    private function assertApplePassSigns(): void
    {
        $made = self::made();
        $before = self::passTempFiles();
        $pkpass = app(AppleWalletService::class)->generate($this->ada, WalletConfig::query()->firstOrFail());
        $this->assertSame([], array_values(array_diff(self::passTempFiles(), $before)), 'No certificate, key or staging file is left in the temp dir.');

        $dir = sys_get_temp_dir() . '/durable-files-' . Str::random(12);
        mkdir($dir, 0700);
        try {
            file_put_contents("{$dir}/pass.pkpass", $pkpass);
            $zip = new ZipArchive();
            $this->assertTrue($zip->open("{$dir}/pass.pkpass") === true);
            $names = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $names[] = $zip->getNameIndex($i);
            }
            sort($names);
            $this->assertSame(['icon.png', 'icon@2x.png', 'logo.png', 'logo@2x.png', 'manifest.json', 'pass.json', 'signature'], $names, 'Nothing secret is bundled.');
            $manifest = (string) $zip->getFromName('manifest.json');
            $pass = (string) $zip->getFromName('pass.json');
            file_put_contents("{$dir}/manifest.json", $manifest);
            file_put_contents("{$dir}/signature", (string) $zip->getFromName('signature'));
            $zip->close();

            $this->assertSame(sha1($pass), json_decode($manifest, true)['pass.json']);
            $this->assertSame('pass.com.lumiere.members', json_decode($pass, true)['passTypeIdentifier']);

            // A detached DER signature of the manifest, by the stored certificate.
            $ok = openssl_cms_verify("{$dir}/manifest.json", OPENSSL_CMS_NOVERIFY | OPENSSL_CMS_BINARY | OPENSSL_CMS_DETACHED, "{$dir}/signer.pem", [], null, null, null, "{$dir}/signature", OPENSSL_ENCODING_DER);
            $this->assertTrue($ok, 'The pass signature verifies.');
            $this->assertSame(openssl_x509_fingerprint($made['pem']), openssl_x509_fingerprint((string) file_get_contents("{$dir}/signer.pem")));
        } finally {
            array_map('unlink', glob("{$dir}/*") ?: []);
            @rmdir($dir);
        }
    }

    /** Make Ada's Google Wallet link from the stored row and check its JWT is signed with the stored key. */
    private function assertGoogleLinkSigns(): void
    {
        $made = self::made();
        $url = app(GoogleWalletService::class)->buildSaveUrl($this->ada, WalletConfig::query()->firstOrFail());
        $this->assertStringStartsWith('https://pay.google.com/gp/v/save/', $url);
        [$header, $payload, $signature] = explode('.', substr($url, strlen('https://pay.google.com/gp/v/save/')));
        $decode = fn (string $part) => base64_decode(strtr($part, '-_', '+/') . str_repeat('=', (4 - strlen($part) % 4) % 4));

        $this->assertSame(1, openssl_verify("{$header}.{$payload}", $decode($signature), $made['public'], OPENSSL_ALGO_SHA256));
        $this->assertSame('wallet@venue.iam.gserviceaccount.com', json_decode($decode($payload), true)['iss']);
    }

    public function test_certificates_uploaded_before_a_restart_still_make_both_passes_with_the_local_disk_empty(): void
    {
        $made = self::made();
        $this->asManager()->putJson($this->admin(), [
            'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => 'ABCDE12345', 'google_issuer_id' => '3388000000012345678', 'google_class_suffix' => 'members',
        ])->assertOk();
        $this->adminUpload('apple-cert', 'Certificates.p12', $made['p12'], ['password' => 'p12-secret']);
        $this->adminUpload('apple-wwdr', 'AppleWWDRCAG4.pem', $made['pem']);
        $this->adminUpload('google-service-account', 'sa.json', $made['google']);
        $this->assertSame([], Storage::disk('local')->allFiles(), 'Nothing is written to the local disk.');

        // The deploy (or another replica): a new, empty local disk.
        Storage::fake('local');

        $full = $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => self::readyShape()]);
        $workspace = $this->asManager()->getJson($this->api('wallet?brand_id=all'))->assertOk()
            ->assertJsonPath('wallet.apple_missing', [])->assertJsonPath('wallet.google_missing', []);

        $this->assertApplePassSigns();
        $this->assertGoogleLinkSigns();

        // Never a secret out: not in an answer, not in an audit row, not in the clear in the database.
        $raw = DB::table('wallet_configs')->where('organization_id', $this->org->id)->first();
        $audit = json_encode(AuditLog::query()->get()->toArray());
        foreach ([$full->getContent(), $workspace->getContent(), $audit, $raw->apple_cert_content, $raw->apple_wwdr_content, $raw->google_service_account_content] as $text) {
            foreach (['PRIVATE KEY', 'BEGIN CERTIFICATE', base64_encode(substr($made['p12'], 0, 48)), 'p12-secret', 'wallet/'] as $secret) {
                $this->assertStringNotContainsString($secret, (string) $text);
            }
        }
    }

    public function test_a_file_on_the_disk_from_before_release_3_is_taken_into_the_database_on_first_read_then_used_from_there(): void
    {
        $made = self::made();
        $dir = "wallet/{$this->org->id}";
        Storage::disk('local')->put("{$dir}/apple-cert.p12", $made['p12']);
        Storage::disk('local')->put("{$dir}/apple-wwdr.pem", $made['pem']);
        Storage::disk('local')->put("{$dir}/google-service-account.json", $made['google']);
        DB::table('wallet_configs')->insert([
            'organization_id' => $this->org->id, 'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => 'ABCDE12345',
            'apple_cert_path' => "{$dir}/apple-cert.p12", 'apple_cert_password' => Crypt::encryptString('p12-secret'), 'apple_wwdr_path' => "{$dir}/apple-wwdr.pem",
            'google_issuer_id' => '3388000000012345678', 'google_class_suffix' => 'members', 'google_service_account_path' => "{$dir}/google-service-account.json",
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // The first read takes the three files in; the full admin's answer is what it was.
        $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => self::readyShape()]);

        $raw = DB::table('wallet_configs')->where('organization_id', $this->org->id)->first();
        $this->assertSame(base64_encode($made['p12']), Crypt::decryptString($raw->apple_cert_content));
        $this->assertSame(base64_encode($made['pem']), Crypt::decryptString($raw->apple_wwdr_content));
        $this->assertSame(base64_encode($made['google']), Crypt::decryptString($raw->google_service_account_content));
        // Left alone: the paths as they were, the files where they were.
        $this->assertSame("{$dir}/apple-cert.p12", $raw->apple_cert_path);
        $this->assertSame("{$dir}/google-service-account.json", $raw->google_service_account_path);
        Storage::disk('local')->assertExists(["{$dir}/apple-cert.p12", "{$dir}/apple-wwdr.pem", "{$dir}/google-service-account.json"]);

        // Then the deploy empties the disk: the database is the source.
        Storage::fake('local');
        $this->asManager()->getJson($this->api('wallet'))->assertOk()
            ->assertJsonPath('wallet.apple_ready', true)->assertJsonPath('wallet.apple_missing', [])
            ->assertJsonPath('wallet.google_ready', true)->assertJsonPath('wallet.google_missing', []);
        $this->assertApplePassSigns();
        $this->assertGoogleLinkSigns();
    }

    public function test_a_file_named_before_release_3_but_already_gone_from_the_disk_asks_for_a_new_upload(): void
    {
        $made = self::made();
        $dir = "wallet/{$this->org->id}";
        DB::table('wallet_configs')->insert([
            'organization_id' => $this->org->id, 'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => 'ABCDE12345',
            'apple_cert_path' => "{$dir}/apple-cert.p12", 'apple_cert_password' => Crypt::encryptString('p12-secret'), 'apple_wwdr_path' => "{$dir}/apple-wwdr.pem",
            'google_issuer_id' => '3388000000012345678', 'google_class_suffix' => 'members', 'google_service_account_path' => "{$dir}/google-service-account.json",
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => [
            'apple_cert_uploaded' => false, 'apple_wwdr_uploaded' => false, 'apple_ready' => false,
            'google_service_account_uploaded' => false, 'google_ready' => false,
        ] + self::readyShape()]);
        $this->asManager()->getJson($this->api('wallet'))->assertOk()
            ->assertJsonPath('wallet.apple_missing', ['certificate_gone', 'wwdr_gone'])
            ->assertJsonPath('wallet.google_missing', ['service_account_gone']);
        $this->assertFalse(WalletConfig::query()->firstOrFail()->appleReady(), 'The member\'s pass answers "not enabled", not a failed signing.');

        // Uploaded again (the owner's step after the deploy), it is ready.
        $this->adminUpload('apple-cert', 'Certificates.p12', $made['p12']);
        $this->adminUpload('apple-wwdr', 'AppleWWDRCAG4.pem', $made['pem']);
        $this->adminUpload('google-service-account', 'sa.json', $made['google']);
        $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => self::readyShape()]);
        $this->asManager()->getJson($this->api('wallet'))->assertOk()->assertJsonPath('wallet.apple_missing', [])->assertJsonPath('wallet.google_missing', []);
    }

    public function test_an_import_reads_its_file_from_the_database_for_every_chunk_whatever_became_of_the_disk(): void
    {
        // Excel's "CSV UTF-8" BOM, semicolons, CRLF, and a Windows-1252 byte in a column the import ignores.
        $lines = ["\xEF\xBB\xBFName;E-mail;Points;Notes"];
        for ($i = 1; $i <= 130; $i++) {
            $lines[] = "Guest {$i};guest{$i}@example.test;10;caf\xE9";
        }
        $csv = implode("\r\n", $lines) . "\r\n";

        $id = $this->asManager()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent('guests.csv', $csv)], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('preview.rows', 130)->assertJsonPath('preview.new', 130)
            ->assertJsonPath('preview.columns_used', ['name', 'email', 'points'])->assertJsonPath('preview.columns_ignored', ['Notes'])
            ->json('batch.id');

        $batch = MemberImportBatch::query()->findOrFail($id);
        $this->assertSame($csv, $batch->fileBytes(), 'Byte for byte, as uploaded.');
        $this->assertNull($batch->stored_path);
        $this->assertMatchesRegularExpression('#^[A-Za-z0-9+/]+=*$#', (string) DB::table('member_import_batches')->where('id', $id)->value('file_content'), 'ASCII only, whatever the file\'s encoding.');
        $this->assertSame([], Storage::allFiles());

        // Each chunk on a "new server": an empty disk.
        Storage::fake();
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 0])->assertOk()->assertJsonPath('batch.processed', 100);
        Storage::fake();
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 100])->assertOk()
            ->assertJsonPath('batch.state', 'completed')->assertJsonPath('batch.created', 130)->assertJsonPath('batch.points', 1300);

        $this->assertSame(10, (int) LoyaltyMember::query()->whereHas('user', fn ($q) => $q->where('email', 'guest1@example.test'))->value('current_points'));
        $this->assertSame('Guest 130', LoyaltyMember::query()->whereHas('user', fn ($q) => $q->where('email', 'guest130@example.test'))->firstOrFail()->user->name);
        $this->assertNull(DB::table('member_import_batches')->where('id', $id)->value('file_content'), 'Cleared once the batch ends.');
    }

    public function test_the_full_admins_import_runs_across_a_restart_too_and_clears_the_file(): void
    {
        $lines = ['name,email'];
        for ($i = 1; $i <= 130; $i++) {
            $lines[] = "Guest {$i},guest{$i}@example.test";
        }
        $uuid = $this->asManager()->post($this->adminImports('preview'), ['file' => UploadedFile::fake()->createWithContent('guests.csv', implode("\n", $lines) . "\n")], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('preview.will_create', 130)->json('batch.uuid');

        Storage::fake();
        $this->asManager()->postJson($this->adminImports("{$uuid}/process"))->assertOk()->assertJsonPath('batch.processed', 100)->assertJsonPath('batch.status', 'running');
        Storage::fake();
        $this->asManager()->postJson($this->adminImports("{$uuid}/process"))->assertOk()
            ->assertJsonPath('batch.status', 'completed')->assertJsonPath('batch.ok', 130)->assertJsonPath('batch.is_finished', true);
        $this->assertNull(DB::table('member_import_batches')->where('uuid', $uuid)->value('file_content'));
    }

    public function test_a_batch_previewed_before_release_3_still_runs_from_its_file_while_it_is_there(): void
    {
        Storage::put('member-imports/legacy.csv', "name,email\nAlan Turing,alan@example.test\nKurt Gödel,kurt@example.test\n");
        $legacy = $this->legacyBatch(Storage::path('member-imports/legacy.csv'), 2);
        $gone = $this->legacyBatch(Storage::path('member-imports/gone.csv'), 3);

        $this->asManager()->postJson($this->api("members/imports/{$legacy->id}/run"))->assertOk()
            ->assertJsonPath('batch.state', 'completed')->assertJsonPath('batch.created', 2);
        Storage::assertMissing('member-imports/legacy.csv');

        // Its file went with the disk: the batch fails as it always did, and the operator uploads it again.
        $this->asManager()->postJson($this->api("members/imports/{$gone->id}/run"))->assertOk()
            ->assertJsonPath('batch.state', 'failed')->assertJsonPath('batch.failure', 'file_unreadable');
    }

    public function test_a_stored_file_that_no_longer_reads_fails_the_batch_and_is_cleared(): void
    {
        $id = $this->asManager()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent('g.csv', "name,email\nAlan Turing,alan@example.test\n")], ['Accept' => 'application/json'])
            ->assertOk()->json('batch.id');
        DB::table('member_import_batches')->where('id', $id)->update(['file_content' => 'not base64 at all!']);

        $this->asManager()->postJson($this->api("members/imports/{$id}/run"))->assertOk()
            ->assertJsonPath('batch.state', 'failed')->assertJsonPath('batch.failure', 'file_unreadable')->assertJsonPath('batch.created', 0);
        $this->assertNull(DB::table('member_import_batches')->where('id', $id)->value('file_content'));
    }

    public function test_the_lists_of_imports_never_read_a_stored_file(): void
    {
        $this->asManager()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent('g.csv', "name,email\nAlan Turing,alan@example.test\n")], ['Accept' => 'application/json'])->assertOk();

        DB::enableQueryLog();
        $workspace = $this->asManager()->getJson($this->api('members/imports'))->assertOk();
        $full = $this->asManager()->getJson($this->adminImports(''))->assertOk();
        $reads = array_values(array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => str_contains($sql, 'from "member_import_batches"')));
        DB::disableQueryLog();

        $this->assertCount(2, $reads);
        foreach ($reads as $sql) {
            $this->assertStringNotContainsString('file_content', $sql);
            $this->assertStringNotContainsString('*', $sql);
        }
        $this->assertCount(1, $workspace->json('imports'));
        $this->assertCount(1, $full->json('data'));
        $this->assertStringNotContainsString('file_content', $workspace->getContent() . $full->getContent());
    }

    /** A batch as release 2 left it: the file named by its path on this server's disk, nothing in the row. */
    private function legacyBatch(string $path, int $rows): MemberImportBatch
    {
        return MemberImportBatch::create([
            'uuid' => (string) Str::uuid(), 'organization_id' => $this->org->id, 'created_by_user_id' => $this->manager->id,
            'original_filename' => basename($path), 'stored_path' => $path, 'file_rows' => $rows, 'total_rows' => $rows,
            'status' => 'pending', 'columns_used' => ['name', 'email'], 'columns_ignored' => [],
        ]);
    }
}
