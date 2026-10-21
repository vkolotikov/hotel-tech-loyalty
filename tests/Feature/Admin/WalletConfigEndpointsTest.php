<?php

namespace Tests\Feature\Admin;

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
 * The full admin's wallet-config endpoints, pinned before their writes moved into App\Services\Loyalty\WalletSettings
 * (HexaTech Loyalty release 2 §7) and kept passing after: the answers, what is stored where, what is audited, and that
 * the full admin checks no colour format and no file type (only the Google file's two keys).
 */
class WalletConfigEndpointsTest extends TestCase
{
    use AppSchema, DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpAppSchema();
        $this->withWalletFeature();
        Storage::fake('local');
    }

    private function admin(string $path = ''): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/wallet-config' . ($path !== '' ? '/' . $path : '');
    }

    /** @return array<string, mixed> */
    private static function shape(array $overrides = []): array
    {
        return $overrides + [
            'apple_pass_type_id'              => null,
            'apple_team_id'                   => null,
            'apple_organization_name'         => null,
            'apple_pass_background_color'     => 'rgb(13,13,13)',
            'apple_pass_foreground_color'     => 'rgb(255,255,255)',
            'apple_pass_label_color'          => 'rgb(201,168,76)',
            'apple_cert_uploaded'             => false,
            'apple_cert_password_set'         => false,
            'apple_wwdr_uploaded'             => false,
            'apple_ready'                     => false,
            'google_issuer_id'                => null,
            'google_class_suffix'             => null,
            'google_service_account_uploaded' => false,
            'google_ready'                    => false,
            'is_active'                       => true,
        ];
    }

    public function test_the_first_read_makes_the_row_and_answers_it_as_made_then_with_the_columns_defaults(): void
    {
        // firstOrCreate hands back the model it made, which carries no column default: the first answer reads them
        // as empty, the next one as stored.
        $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => self::shape([
            'apple_pass_background_color' => null, 'apple_pass_foreground_color' => null, 'apple_pass_label_color' => null, 'is_active' => false,
        ])]);
        $this->assertSame(1, WalletConfig::query()->count());

        $this->asManager()->getJson($this->admin())->assertOk()->assertExactJson(['config' => self::shape()]);
        $this->assertSame(1, WalletConfig::query()->count());
    }

    public function test_an_update_takes_any_colour_text_stores_the_password_encrypted_and_never_answers_it(): void
    {
        $this->asManager()->putJson($this->admin(), [
            'apple_pass_type_id' => 'pass.com.example.loyalty', 'apple_team_id' => 'ABCDE12345', 'apple_organization_name' => 'Lumière',
            'apple_cert_password' => 'p12-secret', 'apple_pass_background_color' => 'red', 'apple_pass_foreground_color' => '#fff',
            'apple_pass_label_color' => 'rgb(1, 2, 3)', 'google_issuer_id' => '3388000000012345', 'google_class_suffix' => 'members',
        ])->assertOk()->assertExactJson(['config' => self::shape([
            'apple_pass_type_id' => 'pass.com.example.loyalty', 'apple_team_id' => 'ABCDE12345', 'apple_organization_name' => 'Lumière',
            'apple_pass_background_color' => 'red', 'apple_pass_foreground_color' => '#fff', 'apple_pass_label_color' => 'rgb(1, 2, 3)',
            'apple_cert_password_set' => true, 'google_issuer_id' => '3388000000012345', 'google_class_suffix' => 'members',
        ])]);

        $raw = (string) DB::table('wallet_configs')->where('organization_id', $this->org->id)->value('apple_cert_password');
        $this->assertNotSame('p12-secret', $raw);
        $this->assertSame('p12-secret', WalletConfig::query()->first()->apple_cert_password);

        // Not sent, sent empty, sent null: kept. The full admin's form sends '' on every save ("Leave blank to keep
        // current"); Laravel turns it into null, which used to clear the password and stop the passes (fixed on the
        // owner's word, 2026-10-22). A new value replaces it.
        $this->asManager()->putJson($this->admin(), ['apple_team_id' => 'ABCDE12345'])->assertOk()->assertJsonPath('config.apple_cert_password_set', true);
        $this->asManager()->putJson($this->admin(), ['apple_cert_password' => ''])->assertOk()->assertJsonPath('config.apple_cert_password_set', true);
        $this->asManager()->putJson($this->admin(), ['apple_cert_password' => null])->assertOk()->assertJsonPath('config.apple_cert_password_set', true);
        $this->assertSame('p12-secret', WalletConfig::query()->first()->apple_cert_password);
        $this->asManager()->putJson($this->admin(), ['apple_cert_password' => 'again', 'is_active' => false])
            ->assertOk()->assertJsonPath('config.apple_cert_password_set', true)->assertJsonPath('config.is_active', false);
        $this->assertSame('again', WalletConfig::query()->first()->apple_cert_password);

        $audit = AuditLog::query()->where('action', 'wallet_config_updated')->orderBy('id')->get();
        $this->assertCount(5, $audit);
        $this->assertSame(['fields' => [
            'apple_pass_type_id', 'apple_team_id', 'apple_organization_name', 'apple_cert_password', 'apple_pass_background_color',
            'apple_pass_foreground_color', 'apple_pass_label_color', 'google_issuer_id', 'google_class_suffix',
        ]], $audit[0]->new_values);
        $this->assertSame(['fields' => ['apple_team_id']], $audit[1]->new_values);
        $this->assertSame(['fields' => []], $audit[2]->new_values);
        $this->assertSame(['fields' => []], $audit[3]->new_values);
        $this->assertSame(['fields' => ['apple_cert_password', 'is_active']], $audit[4]->new_values);
        $this->assertStringNotContainsString('p12-secret', json_encode($audit->toArray()));
    }

    public function test_an_update_keeps_its_length_rules(): void
    {
        $this->asManager()->putJson($this->admin(), [
            'apple_team_id' => str_repeat('A', 33), 'apple_pass_background_color' => str_repeat('r', 33), 'google_issuer_id' => str_repeat('1', 65),
            'apple_pass_label_color' => null, 'is_active' => 'often',
        ])->assertStatus(422)->assertJsonValidationErrors(['apple_team_id', 'apple_pass_background_color', 'google_issuer_id', 'apple_pass_label_color', 'is_active']);
        $this->assertSame(0, AuditLog::query()->where('action', 'wallet_config_updated')->count());
    }

    public function test_the_apple_certificate_is_stored_whatever_it_holds_with_its_password(): void
    {
        $file = UploadedFile::fake()->createWithContent('Certificates.p12', 'not really pkcs12');

        $this->asManager()->post($this->admin('apple-cert'), ['file' => $file, 'password' => 'p12-secret'], ['Accept' => 'application/json'])
            ->assertOk()->assertExactJson(['config' => self::shape(['apple_cert_uploaded' => true, 'apple_cert_password_set' => true])]);

        Storage::disk('local')->assertExists("wallet/{$this->org->id}/apple-cert.p12");
        $this->assertSame('not really pkcs12', Storage::disk('local')->get("wallet/{$this->org->id}/apple-cert.p12"));
        $config = WalletConfig::query()->first();
        $this->assertSame("wallet/{$this->org->id}/apple-cert.p12", $config->apple_cert_path);
        $this->assertSame('p12-secret', $config->apple_cert_password);
        $audit = AuditLog::query()->where('action', 'wallet_apple_cert_uploaded')->sole();
        $this->assertSame(['filename' => 'Certificates.p12'], $audit->new_values);

        // Without a password the stored one stays; a new file takes the same name.
        $this->asManager()->post($this->admin('apple-cert'), ['file' => UploadedFile::fake()->createWithContent('again.p12', 'second')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('config.apple_cert_password_set', true);
        $this->assertSame('second', Storage::disk('local')->get("wallet/{$this->org->id}/apple-cert.p12"));
        $this->assertSame('p12-secret', WalletConfig::query()->first()->apple_cert_password);
    }

    public function test_the_wwdr_certificate_is_stored_and_a_file_over_200_kb_or_none_is_refused(): void
    {
        $this->asManager()->post($this->admin('apple-wwdr'), ['file' => UploadedFile::fake()->createWithContent('AppleWWDRCAG4.cer', "\x30\x82binary")], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('config.apple_wwdr_uploaded', true);
        Storage::disk('local')->assertExists("wallet/{$this->org->id}/apple-wwdr.pem");
        $this->assertSame(['filename' => 'AppleWWDRCAG4.cer'], AuditLog::query()->where('action', 'wallet_apple_wwdr_uploaded')->sole()->new_values);

        $this->asManager()->post($this->admin('apple-wwdr'), ['file' => UploadedFile::fake()->create('big.pem', 201)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['file']);
        $this->asManager()->post($this->admin('apple-cert'), [], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['file']);
        $this->asManager()->post($this->admin('google-service-account'), [], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_the_google_file_needs_its_two_keys_and_audits_the_account_email(): void
    {
        $this->asManager()->post($this->admin('google-service-account'), ['file' => UploadedFile::fake()->createWithContent('sa.json', '{"client_email":"x@y.iam.gserviceaccount.com"}')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertExactJson(['message' => 'Uploaded file is not a valid Google service account JSON (missing private_key or client_email).']);
        Storage::disk('local')->assertMissing("wallet/{$this->org->id}/google-service-account.json");

        $json = '{"type":"service_account","client_email":"wallet@venue.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"}';
        $this->asManager()->post($this->admin('google-service-account'), ['file' => UploadedFile::fake()->createWithContent('sa.json', $json)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('config.google_service_account_uploaded', true)->assertJsonPath('config.google_ready', false);
        $this->assertSame($json, Storage::disk('local')->get("wallet/{$this->org->id}/google-service-account.json"));
        $this->assertSame(['client_email' => 'wallet@venue.iam.gserviceaccount.com'], AuditLog::query()->where('action', 'wallet_google_sa_uploaded')->sole()->new_values);
    }

    public function test_ready_when_every_piece_is_there_and_it_is_on(): void
    {
        $this->asManager()->putJson($this->admin(), ['apple_pass_type_id' => 'pass.x', 'apple_team_id' => 'T', 'google_issuer_id' => '1', 'google_class_suffix' => 'c'])->assertOk();
        $this->asManager()->post($this->admin('apple-cert'), ['file' => UploadedFile::fake()->createWithContent('c.p12', 'x')], ['Accept' => 'application/json'])->assertOk();
        $this->asManager()->post($this->admin('apple-wwdr'), ['file' => UploadedFile::fake()->createWithContent('w.pem', 'x')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('config.apple_ready', true)->assertJsonPath('config.google_ready', false);
        $this->asManager()->post($this->admin('google-service-account'), ['file' => UploadedFile::fake()->createWithContent('g.json', '{"client_email":"a@b","private_key":"k"}')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('config.google_ready', true);

        $this->asManager()->putJson($this->admin(), ['is_active' => false])->assertOk()
            ->assertJsonPath('config.apple_ready', false)->assertJsonPath('config.google_ready', false);
    }

    public function test_without_the_plans_wallet_feature_the_routes_answer_402(): void
    {
        $this->withWalletFeature(false);

        $this->asManager()->getJson($this->admin())->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        $this->assertSame(0, WalletConfig::query()->count());
    }
}
