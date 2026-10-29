<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\WalletConfig;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\LoyaltyWorkspace\AppSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The wallet pass in HexaTech Loyalty (release 2 §7): a manager's, behind the plan's `wallet` feature; the full
 * admin's writer (WalletSettings) with the workspace's own checks first — Apple's colour form, the identifiers'
 * shapes, each file by its content — and readiness that says exactly what is missing. Never a secret or a path out.
 * Since release 3 (§2) the files are kept in the row, encrypted, and nothing is written to the local disk.
 */
class WalletTest extends TestCase
{
    use AppSchema, DatabaseTransactions, SetsUpLoyaltyWorkspace;

    /** @var array{p12: string, pem: string, der: string, key: string}|null one certificate for the whole class */
    private static ?array $made = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpAppSchema();
        $this->withWalletFeature();
        Storage::fake('local');
    }

    /** A self-signed certificate as .p12 (password `p12-secret`), PEM and DER, and its private key as PEM. */
    private static function made(): array
    {
        if (self::$made === null) {
            $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
            $cert = openssl_csr_sign(openssl_csr_new(['commonName' => 'Pass Type ID: pass.test.loyalty'], $key), null, $key, 1);
            openssl_pkcs12_export($cert, $p12, $key, 'p12-secret');
            openssl_x509_export($cert, $pem);
            openssl_pkey_export($key, $private);
            $der = base64_decode(preg_replace('/-----[A-Z ]+-----|\s+/', '', $pem));
            self::$made = ['p12' => $p12, 'pem' => $pem, 'der' => $der, 'key' => $private];
        }

        return self::$made;
    }

    private function upload(string $path, string $name, string $content, array $more = [])
    {
        return $this->asManager()->post($this->api($path), ['file' => UploadedFile::fake()->createWithContent($name, $content)] + $more, ['Accept' => 'application/json']);
    }

    /** A file's bytes as the row holds them (`apple_cert`, `apple_wwdr`, `google_service_account`). */
    private function stored(string $file): ?string
    {
        return WalletConfig::query()->first()?->fileBytes($file);
    }

    public function test_a_manager_reads_it_with_the_defaults_and_what_each_pass_lacks(): void
    {
        $other = $this->otherOrganization();
        DB::table('wallet_configs')->insert(['organization_id' => $other['org']->id, 'apple_team_id' => 'THEIRS1234', 'is_active' => true]);

        $response = $this->asManager()->getJson($this->api('wallet?brand_id=all'))->assertOk()->assertExactJson(['wallet' => [
            'apple_pass_type_id' => null, 'apple_team_id' => null, 'apple_organization_name' => null,
            'apple_pass_background_color' => 'rgb(13,13,13)', 'apple_pass_foreground_color' => 'rgb(255,255,255)', 'apple_pass_label_color' => 'rgb(201,168,76)',
            'apple_cert_uploaded' => false, 'apple_cert_password_set' => false, 'apple_wwdr_uploaded' => false, 'apple_ready' => false,
            'google_issuer_id' => null, 'google_class_suffix' => null, 'google_service_account_uploaded' => false, 'google_ready' => false,
            'is_active' => true,
            'apple_missing' => ['pass_type_id', 'team_id', 'certificate', 'wwdr'],
            'google_missing' => ['issuer_id', 'class_suffix', 'service_account'],
        ]]);
        $this->assertStringNotContainsString('THEIRS', $response->getContent());
        $this->assertSame(1, WalletConfig::query()->count());
    }

    public function test_it_is_a_managers_and_the_plans(): void
    {
        foreach (['get' => 'wallet', 'put' => 'wallet', 'post' => 'wallet/apple-cert'] as $method => $path) {
            $this->asStaffMember()->json($method, $this->api($path), [])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        }
        foreach (['wallet/apple-wwdr', 'wallet/google-service-account'] as $path) {
            $this->asStaffMember()->postJson($this->api($path))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        }

        $this->withWalletFeature(false);
        $this->asManager()->getJson($this->api('wallet'))->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        $this->assertSame(0, WalletConfig::query()->count());
    }

    public function test_a_save_takes_apples_colour_form_and_the_identifiers_shapes_and_never_the_password(): void
    {
        $this->asManager()->putJson($this->api('wallet'), ['apple_cert_password' => 'stays-out'])->assertOk();
        $this->assertNull(WalletConfig::query()->first()->apple_cert_password);

        $this->asManager()->putJson($this->api('wallet'), [
            'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => ' abcde12345 ', 'apple_organization_name' => 'Lumière',
            'apple_pass_background_color' => 'rgb( 20 , 30,40 )', 'apple_pass_foreground_color' => 'rgb(255, 255, 255)', 'apple_pass_label_color' => 'rgb(0,0,0)',
            'google_issuer_id' => '3388000000012345678', 'google_class_suffix' => 'lumiere_members-1.0', 'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('wallet.apple_team_id', 'ABCDE12345')
            ->assertJsonPath('wallet.apple_pass_background_color', 'rgb(20,30,40)')
            ->assertJsonPath('wallet.apple_pass_foreground_color', 'rgb(255,255,255)')
            ->assertJsonPath('wallet.is_active', false)
            ->assertJsonPath('wallet.apple_missing', ['switched_off', 'certificate', 'wwdr'])
            ->assertJsonPath('wallet.google_missing', ['switched_off', 'service_account']);

        $this->asManager()->putJson($this->api('wallet'), [
            'apple_pass_type_id' => 'com.lumiere', 'apple_team_id' => 'SHORT', 'apple_pass_background_color' => '#0d0d0d',
            'apple_pass_foreground_color' => 'rgb(256,0,0)', 'apple_pass_label_color' => 'red', 'google_issuer_id' => '33-88', 'google_class_suffix' => 'a b',
        ])->assertStatus(422)->assertJsonValidationErrors([
            'apple_pass_type_id', 'apple_team_id', 'apple_pass_background_color', 'apple_pass_foreground_color', 'apple_pass_label_color',
            'google_issuer_id', 'google_class_suffix',
        ]);
        $this->asManager()->putJson($this->api('wallet'), ['apple_pass_label_color' => ['rgb(0,0,0)']])
            ->assertStatus(422)->assertJsonValidationErrors(['apple_pass_label_color']);
        $this->assertSame('pass.com.lumiere.members', WalletConfig::query()->first()->apple_pass_type_id);

        $audit = AuditLog::query()->where('action', 'wallet_config_updated')->orderBy('id')->get();
        $this->assertCount(2, $audit);
        $this->assertSame(['fields' => []], $audit[0]->new_values);
        $this->assertNotContains('apple_cert_password', $audit[1]->new_values['fields']);
    }

    public function test_the_certificate_must_be_pkcs12_that_opens_with_its_password(): void
    {
        $made = self::made();

        $this->upload('wallet/apple-cert', 'Certificates.p12', 'not a certificate', ['password' => 'p12-secret'])
            ->assertStatus(422)->assertJsonPath('error', 'not_pkcs12');
        $this->upload('wallet/apple-cert', 'Certificates.p12', $made['p12'], ['password' => 'wrong'])
            ->assertStatus(422)->assertJsonPath('error', 'cert_unreadable');
        $this->upload('wallet/apple-cert', 'Certificates.p12', $made['p12'])
            ->assertStatus(422)->assertJsonPath('error', 'cert_unreadable');
        $this->assertNull($this->stored('apple_cert'));

        $response = $this->upload('wallet/apple-cert', 'Certificates.p12', $made['p12'], ['password' => 'p12-secret'])->assertOk()
            ->assertJsonPath('wallet.apple_cert_uploaded', true)
            ->assertJsonPath('wallet.apple_cert_password_set', true)
            ->assertJsonPath('wallet.apple_missing', ['pass_type_id', 'team_id', 'wwdr']);
        $this->assertSame($made['p12'], $this->stored('apple_cert'));
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertStringNotContainsString('p12-secret', $response->getContent());
        $this->assertStringNotContainsString('wallet/', $response->getContent());

        // A new copy without the password opens with the stored one.
        $this->upload('wallet/apple-cert', 'again.p12', $made['p12'])->assertOk();

        $audit = AuditLog::query()->where('action', 'wallet_apple_cert_uploaded')->get();
        $this->assertCount(2, $audit);
        $this->assertSame(['source' => 'loyalty_workspace'], $audit[0]->new_values);
    }

    public function test_the_wwdr_certificate_is_stored_as_pem_whether_it_came_as_pem_or_as_apples_der(): void
    {
        $made = self::made();

        $this->upload('wallet/apple-wwdr', 'AppleWWDRCAG4.cer', 'hello')->assertStatus(422)->assertJsonPath('error', 'not_certificate');
        $this->upload('wallet/apple-wwdr', 'AppleWWDRCAG4.cer', "\x30\x82\x01\x00broken")->assertStatus(422)->assertJsonPath('error', 'not_certificate');

        $this->upload('wallet/apple-wwdr', 'AppleWWDRCAG4.cer', $made['der'])->assertOk()->assertJsonPath('wallet.apple_wwdr_uploaded', true);
        $stored = (string) $this->stored('apple_wwdr');
        $this->assertStringStartsWith("-----BEGIN CERTIFICATE-----\n", $stored);
        $this->assertNotFalse(openssl_x509_read($stored));
        $this->assertSame(openssl_x509_fingerprint($made['pem']), openssl_x509_fingerprint($stored));

        $this->upload('wallet/apple-wwdr', 'wwdr.pem', $made['pem'])->assertOk();
        $this->assertSame($made['pem'], $this->stored('apple_wwdr'));
    }

    public function test_the_google_key_must_be_json_with_an_email_and_a_key_that_signs(): void
    {
        $made = self::made();

        $this->upload('wallet/google-service-account', 'sa.json', 'not json')->assertStatus(422)->assertJsonPath('error', 'not_json');
        $this->upload('wallet/google-service-account', 'sa.json', '{"client_email":"a@b.iam.gserviceaccount.com"}')
            ->assertStatus(422)->assertJsonPath('error', 'not_service_account');
        $this->upload('wallet/google-service-account', 'sa.json', json_encode(['client_email' => 'a@b', 'private_key' => "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"]))
            ->assertStatus(422)->assertJsonPath('error', 'not_service_account');
        $this->assertNull($this->stored('google_service_account'));

        $json = json_encode(['type' => 'service_account', 'client_email' => 'wallet@venue.iam.gserviceaccount.com', 'private_key' => $made['key']]);
        $response = $this->upload('wallet/google-service-account', 'sa.json', $json)->assertOk()->assertJsonPath('wallet.google_service_account_uploaded', true);
        $this->assertSame($json, $this->stored('google_service_account'));
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertStringNotContainsString('wallet@venue', $response->getContent());
        $this->assertSame(['source' => 'loyalty_workspace'], AuditLog::query()->where('action', 'wallet_google_sa_uploaded')->sole()->new_values);
    }

    public function test_ready_until_a_file_named_before_release_3_is_gone_or_the_password_no_longer_opens_the_certificate(): void
    {
        $made = self::made();
        $this->asManager()->putJson($this->api('wallet'), [
            'apple_pass_type_id' => 'pass.com.lumiere.members', 'apple_team_id' => 'ABCDE12345', 'google_issuer_id' => '3388', 'google_class_suffix' => 'members',
        ])->assertOk();
        $this->upload('wallet/apple-cert', 'c.p12', $made['p12'], ['password' => 'p12-secret'])->assertOk();
        $this->upload('wallet/apple-wwdr', 'w.pem', $made['pem'])->assertOk();
        $this->upload('wallet/google-service-account', 'g.json', json_encode(['client_email' => 'a@b', 'private_key' => $made['key']]))->assertOk();

        $this->asManager()->getJson($this->api('wallet'))->assertOk()
            ->assertJsonPath('wallet.apple_ready', true)->assertJsonPath('wallet.apple_missing', [])
            ->assertJsonPath('wallet.google_ready', true)->assertJsonPath('wallet.google_missing', []);

        // The full admin's form sends the password blank on every save: it no longer clears it (R2-6).
        $this->asManager()->putJson(rtrim((string) config('app.url'), '/') . '/api/v1/admin/wallet-config', ['apple_cert_password' => ''])->assertOk();
        $this->asManager()->getJson($this->api('wallet'))->assertOk()->assertJsonPath('wallet.apple_ready', true);

        // A password cleared before that fix is named; so is a key uploaded before release 3 (§2) whose path is named
        // but whose file the deploy took from the disk before it could be read into the row: upload it again.
        DB::table('wallet_configs')->where('organization_id', $this->org->id)->update([
            'apple_cert_password' => null,
            'google_service_account_content' => null, 'google_service_account_path' => "wallet/{$this->org->id}/google-service-account.json",
        ]);

        $this->asManager()->getJson($this->api('wallet'))->assertOk()
            ->assertJsonPath('wallet.apple_missing', ['certificate_password'])
            ->assertJsonPath('wallet.google_missing', ['service_account_gone'])
            ->assertJsonPath('wallet.google_service_account_uploaded', false)
            ->assertJsonPath('wallet.google_ready', false);
    }
}
