<?php

namespace Tests\Feature\Wallet;

use App\Models\{WalletConfig, WalletPass, WalletRegistration};
use App\Services\{AppleWalletService, OperationsStatus};
use App\Services\Wallet\{ApplePush, Artwork, Credentials, GoogleClient, Passes, SyncPass};
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\{DB, Http, Schema, Storage};
use Tests\Concerns\LoyaltyWorkspace\{AppSchema, MembershipSchema};
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;
use ZipArchive;

class WalletUpdatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AppSchema, MembershipSchema;

    private WalletConfig $wallet;
    private const DEVICE = 'device-library-test-12345678';
    private static ?array $certificates = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpAppSchema();
        $this->buildMembershipSchema();
        if (!Schema::hasColumn('loyalty_members', 'membership_valid_until')) Schema::table('loyalty_members', fn ($t) => $t->date('membership_valid_until')->nullable());
        if (!Schema::hasTable('wallet_passes')) (require database_path('migrations/2026_10_30_110000_create_wallet_pass_updates.php'))->up();
        Http::preventStrayRequests();
        Storage::fake('public');
        config(['app.url' => 'https://wallet.example.test', 'cache.shared' => 'array']);
        $this->wallet = WalletConfig::create(['organization_id' => $this->org->id, 'is_active' => true,
            'apple_pass_type_id' => 'pass.test.wallet', 'apple_team_id' => 'TESTTEAM01',
            'apple_cert_path' => 'stored.p12', 'apple_wwdr_path' => 'stored.pem', 'apple_cert_password' => 'test-password',
            'google_issuer_id' => '123456', 'google_class_suffix' => 'loyalty', 'google_service_account_path' => 'stored.json']);
        if (self::$certificates === null) {
            $key = openssl_pkey_new(['private_key_bits' => 2048]);
            $csr = openssl_csr_new(['commonName' => 'Pass Type ID: pass.test.wallet', 'organizationalUnitName' => 'TESTTEAM01', 'UID' => 'pass.test.wallet'], $key);
            $cert = openssl_csr_sign($csr, null, $key, 1);
            openssl_pkcs12_export($cert, $p12, $key, 'test-password');
            openssl_x509_export($cert, $pem); openssl_pkey_export($key, $private);
            self::$certificates = ['apple_cert' => $p12, 'apple_wwdr' => $pem,
                'google_service_account' => json_encode(['client_email' => 'wallet@example.test', 'private_key' => $private, 'token_uri' => 'https://attacker.invalid/steal'])];
        }
        foreach (self::$certificates as $file => $bytes) $this->wallet->putFile($file, $bytes);
        $this->wallet->save();
    }

    private function pass(string $provider = 'apple'): WalletPass { return app(Passes::class)->issue($this->ada, $this->wallet, $provider); }
    private function base(): string { return config('app.url').'/api/wallet/apple/v1'; }
    private function registration(WalletPass $pass): string { return $this->base().'/devices/'.self::DEVICE.'/registrations/'.$pass->type_id.'/'.$pass->serial; }
    private function headers(WalletPass $pass): array { return ['Authorization' => 'ApplePass '.$pass->authentication_token]; }
    private function unpack(string $binary): array
    {
        $path = tempnam(sys_get_temp_dir(), 'wallet_test_');
        try {
            file_put_contents($path, $binary); $zip = new ZipArchive();
            $this->assertTrue($zip->open($path));
            $payload = json_decode($zip->getFromName('pass.json'), true);
            $this->assertSame([29, 29], array_slice(getimagesizefromstring($zip->getFromName('icon.png')), 0, 2));
            $this->assertSame([320, 100], array_slice(getimagesizefromstring($zip->getFromName('logo@2x.png')), 0, 2));
            $zip->close(); return $payload;
        } finally { @unlink($path); }
    }

    public function test_registration_authentication_encryption_idempotence_and_removal(): void
    {
        $pass = $this->pass(); $url = $this->registration($pass); $push = str_repeat('ab', 32);
        $this->postJson($url, ['pushToken' => $push])->assertUnauthorized();
        $this->postJson($url, ['pushToken' => $push], $this->headers($pass))->assertCreated();
        $this->postJson($url, ['pushToken' => $push], $this->headers($pass))->assertOk();
        $row = WalletRegistration::sole();
        $this->assertSame($push, $row->push_token);
        $this->assertStringNotContainsString($push, $row->getRawOriginal('push_token'));
        $this->assertStringNotContainsString($pass->authentication_token, $pass->getRawOriginal('authentication_token'));
        $this->assertArrayNotHasKey('authentication_token', $pass->toArray());
        $this->assertArrayNotHasKey('push_token', $row->toArray());
        $this->deleteJson($url, [], ['Authorization' => 'ApplePass wrong'])->assertUnauthorized();
        $this->deleteJson($url, [], $this->headers($pass))->assertOk();
        $this->deleteJson($url, [], $this->headers($pass))->assertOk();
        $this->assertSame(0, WalletRegistration::count());
    }

    public function test_poll_tags_detect_same_second_updates_and_do_not_list_unregistered_passes(): void
    {
        $pass = $this->pass();
        $this->postJson($this->registration($pass), ['pushToken' => str_repeat('ab', 32)], $this->headers($pass))->assertCreated();
        app(Passes::class)->issue($this->grace, $this->wallet, 'apple');
        $url = $this->base().'/devices/'.self::DEVICE.'/registrations/'.$pass->type_id;
        $first = $this->getJson($url)->assertOk()->assertJsonPath('serialNumbers', [$pass->serial]);
        $tag = $first->json('lastUpdated');
        $this->getJson($url.'?passesUpdatedSince='.$tag)->assertNoContent();
        $this->ada->update(['current_points' => 1600, 'tier_id' => $this->tiers['platinum']->id]);
        $next = $this->getJson($url.'?passesUpdatedSince='.$tag)->assertOk();
        $this->assertNotSame($tag, $next->json('lastUpdated'));
        $payload = app(Passes::class)->payload($pass->fresh(), $this->wallet);
        $this->assertSame(1600, $payload['storeCard']['primaryFields'][0]['value']);
        $this->assertSame('Platinum', $payload['storeCard']['headerFields'][0]['value']);
        $this->getJson(str_replace(self::DEVICE, 'unknown-library-12345678', $url))->assertNoContent();
    }

    public function test_authenticated_download_is_signed_and_voids_off_expired_and_removed_members(): void
    {
        $pass = $this->pass(); $url = $this->base().'/passes/'.$pass->type_id.'/'.$pass->serial;
        $this->get($url)->assertUnauthorized();
        $active = $this->get($url, $this->headers($pass))->assertOk()->assertHeader('Content-Type', 'application/vnd.apple.pkpass');
        $payload = $this->unpack($active->getContent());
        $this->assertSame($pass->authentication_token, $payload['authenticationToken']);
        $this->assertSame('https://wallet.example.test/api/wallet/apple', $payload['webServiceURL']);
        $this->assertFalse($payload['voided']);
        $this->ada->update(['is_active' => false]);
        $void = $this->unpack($this->get($url, $this->headers($pass))->assertOk()->getContent());
        $this->assertTrue($void['voided']); $this->assertArrayNotHasKey('barcode', $void);
        $this->assertStringNotContainsString('Ada', json_encode($void));
        $this->ada->forceFill(['is_active' => true, 'membership_valid_until' => '2026-10-04'])->save();
        $this->assertTrue(app(Passes::class)->payload($pass, $this->wallet)['voided']);
        // Foreign-key behaviour used by a merge: credentials stay on the void pass, never transfer to a survivor.
        DB::table('loyalty_members')->where('id', $this->ada->id)->delete();
        $this->assertNull($pass->fresh()->member_id);
        $removed = $this->unpack($this->get($url, $this->headers($pass))->assertOk()->getContent());
        $this->assertTrue($removed['voided']);
    }

    public function test_identity_is_stable_and_cross_tenant_configs_are_refused(): void
    {
        $pass = $this->pass(); $other = $this->otherOrganization();
        $this->assertSame($pass->id, $this->pass()->id);
        $this->assertSame($pass->authentication_token, $this->pass()->authentication_token);
        $this->wallet->organization_id = $other['org']->id;
        $this->expectExceptionMessage('wallet_identity_changed');
        app(Passes::class)->payload($pass, $this->wallet);
    }

    public function test_google_updates_use_fixed_origins_and_current_balance_without_creating_objects(): void
    {
        $pass = $this->pass('google');
        Http::fake(['https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token', 'expires_in' => 3600]),
            'https://walletobjects.googleapis.com/*' => Http::response(['id' => $pass->serial])]);
        app(SyncPass::class)->run($pass);
        $this->assertNotNull($pass->fresh()->last_success_at);
        $this->ada->update(['current_points' => 1900]);
        app(SyncPass::class)->run($pass->fresh());
        Http::assertSent(fn ($r) => $r->method() === 'PATCH' && $r['loyaltyPoints']['balance']['int'] === 1900 && $r['id'] === $pass->serial);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'attacker.invalid'));
        $this->ada->update(['is_active' => false]);
        app(SyncPass::class)->run($pass->fresh());
        Http::assertSent(fn ($r) => $r->method() === 'PATCH' && $r['state'] === 'INACTIVE' && $r['accountName'] === 'Inactive membership' && $r['barcode']['value'] === 'inactive:'.$pass->id);
    }

    public function test_provider_failures_retry_without_leaking_secrets_and_unsaved_google_cards_are_not_failures(): void
    {
        $pass = $this->pass('google');
        $this->mock(GoogleClient::class)->shouldReceive('update')->once()->andThrow(new \RuntimeException('SECRET-TOKEN provider body'));
        app(SyncPass::class)->run($pass);
        $this->assertSame('google_update_failed', $pass->fresh()->failure_code);
        $this->assertTrue($pass->fresh()->next_attempt_at->isFuture());
        $this->assertStringNotContainsString('SECRET-TOKEN', json_encode($pass->fresh()));
        $this->mock(GoogleClient::class)->shouldReceive('update')->once()->andReturn(false);
        app(SyncPass::class)->run($pass->fresh());
        $this->assertNull($pass->fresh()->failure_code);
        $this->assertNull($pass->fresh()->last_success_at);
        $this->mock(GoogleClient::class)->shouldReceive('update')->once()->andReturn(true);
        app(SyncPass::class)->run($pass->fresh());
        $this->assertSame($pass->fresh()->content_hash, $pass->fresh()->synced_hash);
    }

    public function test_apns_prunes_only_confirmed_invalid_tokens_and_cleans_temporary_keys(): void
    {
        $pass = $this->pass();
        $row = WalletRegistration::create(['wallet_pass_id' => $pass->id, 'device_hash' => hash('sha256', self::DEVICE), 'push_token' => str_repeat('ab', 32)]);
        $before = glob(sys_get_temp_dir().'/wallet_apns_*');
        Http::fake(['https://api.push.apple.com/*' => Http::sequence()->push(['reason' => 'Unregistered'], 410)->push(['reason' => 'BadCertificate'], 403)]);
        app(SyncPass::class)->run($pass);
        $this->assertFalse(WalletRegistration::whereKey($row->id)->exists());
        $this->assertSame($before, glob(sys_get_temp_dir().'/wallet_apns_*'));
        Http::assertSent(fn ($r) => $r->body() === '{}' && $r->hasHeader('apns-topic', 'pass.test.wallet'));
        $row = WalletRegistration::create(['wallet_pass_id' => $pass->id, 'device_hash' => hash('sha256', self::DEVICE), 'push_token' => str_repeat('ab', 32)]);
        $pass->refresh()->forceFill(['synced_hash' => null])->save();
        app(SyncPass::class)->run($pass);
        $this->assertTrue(WalletRegistration::whereKey($row->id)->exists());
        $this->assertSame('apple_update_failed', $pass->fresh()->failure_code);
        $this->assertSame($before, glob(sys_get_temp_dir().'/wallet_apns_*'));
    }

    public function test_certificates_must_match_pass_type_and_team_and_google_requires_approved_class(): void
    {
        $this->assertNull(app(Credentials::class)->appleProblem($this->wallet));
        $this->wallet->apple_team_id = 'WRONGTEAM1';
        $this->assertSame('apple_certificate_identity', app(Credentials::class)->appleProblem($this->wallet));
        Http::fake(['https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-token']),
            'https://walletobjects.googleapis.com/*' => Http::response(['reviewStatus' => 'DRAFT'])]);
        $this->assertFalse(app(GoogleClient::class)->approved($this->wallet));
    }

    public function test_artwork_reads_only_own_logo_and_renders_real_dimensions(): void
    {
        $img = imagecreatetruecolor(64, 32); imagefill($img, 0, 0, imagecolorallocate($img, 255, 0, 0));
        ob_start(); imagepng($img); $bytes = ob_get_clean(); imagedestroy($img);
        $key = 'org-'.$this->org->id.'/logos/red.png'; Storage::disk('public')->put($key, $bytes);
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'company_logo', 'value' => '/storage/'.$key, 'type' => 'string', 'group' => 'appearance']);
        $binary = app(AppleWalletService::class)->generate($this->ada, $this->wallet, $this->pass());
        $this->unpack($binary);
        Http::assertNothingSent();
        DB::table('hotel_settings')->where('organization_id', $this->org->id)->where('key', 'company_logo')->update(['value' => 'http://169.254.169.254/private']);
        $this->unpack(app(AppleWalletService::class)->generate($this->ada, $this->wallet));
        Http::assertNothingSent();
    }

    public function test_replacing_a_protected_certificate_with_an_unprotected_one_clears_the_old_password(): void
    {
        openssl_pkcs12_read(self::$certificates['apple_cert'], $parts, 'test-password');
        openssl_pkcs12_export($parts['cert'], $unprotected, $parts['pkey'], '');
        $saved = \App\Services\Loyalty\WalletSettings::storeAppleCert($this->wallet, $unprotected, null, $this->manager, []);
        $this->assertSame('', (string) $saved->apple_cert_password);
        $this->assertNull(app(Credentials::class)->appleProblem($saved));
        $this->assertFalse(\App\Services\Loyalty\WalletSettings::shape($saved)['apple_cert_password_set']);
    }

    public function test_registration_limit_preserves_existing_devices_and_rejects_another_pass_token(): void
    {
        $pass = $this->pass(); $another = app(Passes::class)->issue($this->grace, $this->wallet, 'apple');
        $this->postJson($this->registration($pass), ['pushToken' => str_repeat('ab', 32)], $this->headers($another))->assertUnauthorized();
        for ($i = 0; $i < 30; $i++) {
            WalletRegistration::create(['wallet_pass_id' => $pass->id, 'device_hash' => hash('sha256', 'device-'.$i), 'push_token' => str_repeat('ab', 32)]);
        }
        $this->postJson($this->registration($pass), ['pushToken' => str_repeat('ab', 32)], $this->headers($pass))->assertStatus(429);
        $existing = str_replace(self::DEVICE, 'device-0', $this->registration($pass));
        $this->postJson($existing, ['pushToken' => str_repeat('cd', 32)], $this->headers($pass))->assertOk();
        $this->assertSame(30, WalletRegistration::where('wallet_pass_id', $pass->id)->count());
        $this->assertSame(str_repeat('cd', 32), WalletRegistration::where('device_hash', hash('sha256', 'device-0'))->sole()->push_token);
    }

    public function test_google_refreshes_a_rejected_token_once_and_accepts_legacy_approved_status(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::sequence()->push(['access_token' => 'old-token'])->push(['access_token' => 'new-token']),
            'https://walletobjects.googleapis.com/*' => Http::sequence()->push([], 401)->push(['reviewStatus' => 'approved']),
        ]);
        $this->assertTrue(app(GoogleClient::class)->approved($this->wallet));
        Http::assertSentCount(4);
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer new-token'));
    }
}
