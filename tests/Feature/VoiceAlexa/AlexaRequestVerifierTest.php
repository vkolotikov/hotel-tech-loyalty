<?php

namespace Tests\Feature\VoiceAlexa;

use App\Voice\Alexa\AlexaRequestVerifier;
use App\Voice\Alexa\AlexaVerificationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AlexaRequestVerifierTest extends TestCase
{
    private const SKILL = 'amzn1.ask.skill.hexatech-test';

    private string $caFile;

    /** Whatever the fake certificate host currently serves. */
    private string $servedPem;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $set = AlexaCertificates::set();

        $this->caFile = tempnam(sys_get_temp_dir(), 'alexa-ca');
        file_put_contents($this->caFile, $set['rootPem']);

        config(['voice.alexa' => [
            'enabled' => true,
            'skill_ids' => [self::SKILL],
            'ca_bundle' => $this->caFile,
            'timestamp_tolerance_seconds' => 150,
            'certificate_cache_seconds' => 3600,
            'pairing_ttl_seconds' => 600,
        ]]);

        // One closure stub reading a property. Http::fake gives earlier stubs
        // precedence, so re-faking per test would keep serving the first
        // certificate and make the SAN and chain tests fail on the signature
        // instead of the property they are meant to prove.
        $this->servedPem = $set['leafPem'];
        Http::preventStrayRequests();
        Http::fake([AlexaCertificates::CERT_URL => fn () => Http::response($this->servedPem, 200)]);
    }

    protected function tearDown(): void
    {
        @unlink($this->caFile);
        parent::tearDown();
    }

    private function body(array $overrides = []): string
    {
        return json_encode(array_replace_recursive([
            'version' => '1.0',
            'session' => ['new' => true, 'sessionId' => 'amzn1.echo-api.session.test',
                'application' => ['applicationId' => self::SKILL],
                'user' => ['userId' => 'amzn1.ask.account.test']],
            'context' => ['System' => ['application' => ['applicationId' => self::SKILL],
                'user' => ['userId' => 'amzn1.ask.account.test']]],
            'request' => ['type' => 'LaunchRequest', 'requestId' => 'amzn1.echo-api.request.test',
                'timestamp' => now()->utc()->format('Y-m-d\TH:i:s\Z'), 'locale' => 'en-GB'],
        ], $overrides));
    }

    private function verify(string $body, ?string $url = AlexaCertificates::CERT_URL, ?string $signature = null): array
    {
        $signature ??= AlexaCertificates::sign($body, AlexaCertificates::set()['leafKey']);

        return (new AlexaRequestVerifier)->verify($body, $url, $signature);
    }

    /** Asserts rejection and that the rejection is for the stated reason. */
    private function assertRejected(callable $call, string $expectedReason): void
    {
        try {
            $call();
            $this->fail('Expected rejection: '.$expectedReason);
        } catch (AlexaVerificationException $error) {
            $this->assertStringContainsString($expectedReason, $error->getMessage());
        }
    }

    public function test_a_correctly_signed_request_from_a_trusted_chain_is_accepted(): void
    {
        $this->assertSame('LaunchRequest', $this->verify($this->body())['request']['type']);
    }

    public function test_a_tampered_body_is_rejected(): void
    {
        $body = $this->body();
        $signature = AlexaCertificates::sign($body, AlexaCertificates::set()['leafKey']);
        $tampered = str_replace('LaunchRequest', 'IntentRequest', $body);

        $this->assertRejected(fn () => $this->verify($tampered, AlexaCertificates::CERT_URL, $signature),
            'signature does not match');
    }

    public function test_certificate_urls_outside_amazons_echo_api_path_are_rejected(): void
    {
        foreach ([
            'http://s3.amazonaws.com/echo.api/echo-api-cert-test.pem',
            'https://notamazon.com/echo.api/echo-api-cert-test.pem',
            'https://s3.amazonaws.com/EcHo.aPi/echo-api-cert-test.pem',
            'https://s3.amazonaws.com:563/echo.api/echo-api-cert-test.pem',
            'https://s3.amazonaws.com/invalid.path/echo-api-cert-test.pem',
            'https://s3.amazonaws.com@evil.example/echo.api/echo-api-cert-test.pem',
        ] as $url) {
            $this->assertRejected(fn () => $this->verify($this->body(), $url), 'not an Alexa URL');
        }

        $this->assertRejected(fn () => $this->verify($this->body(), null), 'not an Alexa URL');
    }

    public function test_a_dot_segment_url_that_normalizes_into_the_echo_api_path_is_accepted(): void
    {
        $url = 'https://s3.amazonaws.com/echo.api/../echo.api/echo-api-cert-test.pem';

        $this->assertSame('LaunchRequest', $this->verify($this->body(), $url)['request']['type']);
    }

    public function test_a_certificate_without_the_echo_api_name_is_rejected(): void
    {
        $set = AlexaCertificates::set();
        $this->servedPem = $set['noSanPem'];
        $body = $this->body();

        $this->assertRejected(fn () => $this->verify($body, AlexaCertificates::CERT_URL,
            AlexaCertificates::sign($body, $set['noSanKey'])), 'not issued to echo-api.amazon.com');
    }

    public function test_an_expired_certificate_is_rejected(): void
    {
        $short = AlexaCertificates::shortLived();
        file_put_contents($this->caFile, $short['rootPem']);
        $this->servedPem = $short['leafPem'];

        $this->travel(3)->days();
        $body = $this->body();

        $this->assertRejected(fn () => $this->verify($body, AlexaCertificates::CERT_URL,
            AlexaCertificates::sign($body, $short['leafKey'])), 'not currently valid');
    }

    public function test_a_certificate_from_an_untrusted_authority_is_rejected(): void
    {
        $set = AlexaCertificates::set();
        $this->servedPem = $set['untrustedLeafPem'];
        $body = $this->body();

        $this->assertRejected(fn () => $this->verify($body, AlexaCertificates::CERT_URL,
            AlexaCertificates::sign($body, $set['untrustedLeafKey'])), 'does not chain to a trusted root');
    }

    public function test_a_stale_timestamp_is_rejected(): void
    {
        $stale = $this->body(['request' => ['timestamp' => now()->subSeconds(151)->utc()->format('Y-m-d\TH:i:s\Z')]]);

        $this->assertRejected(fn () => $this->verify($stale), 'outside the allowed window');
    }

    public function test_requests_for_other_skills_are_rejected_and_an_empty_allowlist_rejects_all(): void
    {
        $other = $this->body(['context' => ['System' => ['application' => ['applicationId' => 'amzn1.ask.skill.someone-else']]]]);
        $this->assertRejected(fn () => $this->verify($other), 'does not serve');

        config(['voice.alexa.skill_ids' => []]);
        $this->assertRejected(fn () => $this->verify($this->body()), 'does not serve');
    }

    public function test_a_missing_ca_bundle_fails_closed(): void
    {
        config(['voice.alexa.ca_bundle' => sys_get_temp_dir().'/does-not-exist-'.uniqid().'.pem']);

        $this->assertRejected(fn () => $this->verify($this->body()), 'No trusted certificate authorities');
    }
}
