<?php

namespace Tests\Feature\Mail;

use App\Models\EmailSuppression;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * POST /v1/webhooks/ses — who may write to the suppression list.
 *
 * A forged "complaint" here silences an address platform-wide and for good,
 * so the endpoint must act only on messages AWS actually signed for OUR topic.
 * These tests sign envelopes with a throwaway key whose self-signed
 * certificate is served from a faked sns.<region>.amazonaws.com URL — the
 * same shape SNS delivers — and prove that a valid signature is honoured, and
 * that a tampered body, a foreign topic, a certificate from anywhere else and
 * a SubscribeURL pointing anywhere else are all refused without side effects.
 */
class SesWebhookSignatureTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const ENDPOINT = '/api/v1/webhooks/ses';
    private const TOPIC    = 'arn:aws:sns:eu-west-2:000000000000:hexatech-ses-feedback';
    private const CERT_URL = 'https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-test.pem';

    /** @var \OpenSSLAsymmetricKey */
    private $privateKey;

    private string $certificatePem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpMinimalSchema();

        if (!Schema::hasTable('email_suppressions')) {
            (require database_path('migrations/2026_08_14_090000_create_email_suppressions_table.php'))->up();
        }

        EmailSuppression::query()->delete();
        Cache::flush();

        config(['services.ses.topic_arn' => self::TOPIC]);

        // A throwaway signing identity (tests/fixtures/sns, self-signed, no
        // trust anywhere): SNS's real one is an RSA key whose certificate is
        // served from its own domain; ours is served from a faked copy of that
        // domain. Committed rather than generated here because PHP's CSR
        // functions need an OpenSSL config file the workstation may not have.
        $this->privateKey     = openssl_pkey_get_private(file_get_contents(base_path('tests/fixtures/sns/test-signing-key.pem')));
        $this->certificatePem = file_get_contents(base_path('tests/fixtures/sns/test-signing-cert.pem'));

        $this->assertNotFalse($this->privateKey, 'The fixture key did not load.');
        $this->assertNotFalse(openssl_x509_read($this->certificatePem), 'The fixture certificate did not load.');

        Http::fake([
            'https://sns.eu-west-2.amazonaws.com/*' => Http::response($this->certificatePem, 200),
            '*'                                     => Http::response('not here', 404),
        ]);
    }

    protected function tearDown(): void
    {
        $this->app['env'] = 'testing';
        parent::tearDown();
    }

    // ─── Fixtures ─────────────────────────────────────────────────────────

    /** The string SNS signs, per its documentation: named fields in order, each "Name\nvalue\n". */
    private function canonical(array $envelope): string
    {
        $fields = $envelope['Type'] === 'Notification'
            ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
            : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

        $out = '';
        foreach ($fields as $field) {
            if (array_key_exists($field, $envelope)) {
                $out .= $field . "\n" . $envelope[$field] . "\n";
            }
        }

        return $out;
    }

    private function signed(array $envelope): array
    {
        openssl_sign($this->canonical($envelope), $signature, $this->privateKey, OPENSSL_ALGO_SHA256);

        return $envelope + [
            'SignatureVersion' => '2',
            'Signature'        => base64_encode($signature),
            'SigningCertURL'   => self::CERT_URL,
        ];
    }

    private function notification(array $sesMessage, array $overrides = []): array
    {
        return $this->signed(array_merge([
            'Type'      => 'Notification',
            'MessageId' => (string) Str::uuid(),
            'TopicArn'  => self::TOPIC,
            'Subject'   => 'Amazon SES Email Event Notification',
            'Message'   => json_encode($sesMessage),
            'Timestamp' => now()->toIso8601ZuluString('millisecond'),
        ], $overrides));
    }

    private function complaint(string $email): array
    {
        return [
            'notificationType' => 'Complaint',
            'complaint'        => [
                'complainedRecipients'  => [['emailAddress' => $email]],
                'complaintFeedbackType' => 'abuse',
            ],
        ];
    }

    private function bounce(string $email, string $type): array
    {
        return [
            'notificationType' => 'Bounce',
            'bounce'           => [
                'bounceType'        => $type,
                'bounceSubType'     => $type === 'Permanent' ? 'General' : 'MailboxFull',
                'bouncedRecipients' => [['emailAddress' => $email, 'diagnosticCode' => 'smtp; 550 5.1.1 user unknown']],
            ],
        ];
    }

    private function postEnvelope(array $envelope)
    {
        return $this->call('POST', self::ENDPOINT, [], [], [], ['CONTENT_TYPE' => 'text/plain', 'HTTP_ACCEPT' => 'application/json'], json_encode($envelope));
    }

    // ─── A signed message from our topic is acted on ──────────────────────

    public function test_a_signed_complaint_from_our_topic_suppresses_the_address_platform_wide(): void
    {
        $this->postEnvelope($this->notification($this->complaint('Angry.Person@example.test')))->assertStatus(200);

        $row = EmailSuppression::query()->where('email', 'angry.person@example.test')->first();

        $this->assertNotNull($row, 'The complaint was not recorded.');
        $this->assertSame(EmailSuppression::COMPLAINT, $row->reason);
        $this->assertNull($row->organization_id, 'A complaint is platform-wide.');
        $this->assertTrue(EmailSuppression::isSuppressed('angry.person@example.test', 42));
    }

    public function test_a_permanent_bounce_suppresses_and_a_transient_one_only_counts(): void
    {
        $this->postEnvelope($this->notification($this->bounce('gone@example.test', 'Permanent')))->assertStatus(200);
        $this->postEnvelope($this->notification($this->bounce('full@example.test', 'Transient')))->assertStatus(200);

        $this->assertTrue(EmailSuppression::isSuppressed('gone@example.test', null));
        $this->assertFalse(EmailSuppression::isSuppressed('full@example.test', null),
            'One soft bounce must not silence an address.');
        $this->assertSame(1, (int) EmailSuppression::query()->where('email', 'full@example.test')->value('failure_count'));
    }

    public function test_the_signing_certificate_is_fetched_once_and_cached(): void
    {
        $this->postEnvelope($this->notification($this->complaint('one@example.test')))->assertStatus(200);
        $this->postEnvelope($this->notification($this->complaint('two@example.test')))->assertStatus(200);

        Http::assertSentCount(1);
    }

    // ─── Everything else is refused, with no side effect ──────────────────

    public function test_a_tampered_message_is_refused(): void
    {
        $envelope = $this->notification($this->complaint('victim@example.test'));
        $envelope['Message'] = json_encode($this->complaint('someone.else@example.test'));

        $this->postEnvelope($envelope)->assertStatus(403);

        $this->assertSame(0, EmailSuppression::query()->count());
    }

    public function test_a_message_for_another_topic_is_refused_even_when_validly_signed(): void
    {
        $envelope = $this->notification($this->complaint('victim@example.test'), [
            'TopicArn' => 'arn:aws:sns:eu-west-2:000000000000:someone-elses-topic',
        ]);

        $this->postEnvelope($envelope)->assertStatus(403);

        $this->assertSame(0, EmailSuppression::query()->count());
    }

    public function test_a_certificate_from_anywhere_but_sns_is_never_fetched(): void
    {
        $envelope = $this->notification($this->complaint('victim@example.test'));
        $envelope['SigningCertURL'] = 'https://sns.attacker.example/SimpleNotificationService-test.pem';

        $this->postEnvelope($envelope)->assertStatus(403);

        Http::assertNothingSent();
        $this->assertSame(0, EmailSuppression::query()->count());

        // Nor an SNS host smuggled into the userinfo, nor plain http.
        foreach ([
            'https://sns.eu-west-2.amazonaws.com@attacker.example/cert.pem',
            'http://sns.eu-west-2.amazonaws.com/SimpleNotificationService-test.pem',
        ] as $url) {
            $envelope['SigningCertURL'] = $url;
            $this->postEnvelope($envelope)->assertStatus(403);
        }

        Http::assertNothingSent();
    }

    public function test_an_unsigned_or_unknown_signature_version_is_refused(): void
    {
        $envelope = $this->notification($this->complaint('victim@example.test'));

        unset($envelope['Signature']);
        $this->postEnvelope($envelope)->assertStatus(403);

        $envelope = $this->notification($this->complaint('victim@example.test'));
        $envelope['SignatureVersion'] = '9';
        $this->postEnvelope($envelope)->assertStatus(403);

        $this->assertSame(0, EmailSuppression::query()->count());
    }

    public function test_without_a_configured_topic_production_refuses_everything(): void
    {
        config(['services.ses.topic_arn' => null]);
        $this->app['env'] = 'production';

        $this->postEnvelope($this->notification($this->complaint('victim@example.test')))->assertStatus(403);

        $this->assertSame(0, EmailSuppression::query()->count());
    }

    // ─── The subscription handshake ───────────────────────────────────────

    public function test_a_signed_subscription_confirmation_is_confirmed_at_its_sns_url_only(): void
    {
        $confirm = 'https://sns.eu-west-2.amazonaws.com/?Action=ConfirmSubscription&TopicArn=' . self::TOPIC . '&Token=abc';

        $envelope = $this->signed([
            'Type'         => 'SubscriptionConfirmation',
            'MessageId'    => (string) Str::uuid(),
            'Token'        => 'abc',
            'TopicArn'     => self::TOPIC,
            'Message'      => 'You have chosen to subscribe to the topic.',
            'SubscribeURL' => $confirm,
            'Timestamp'    => now()->toIso8601ZuluString('millisecond'),
        ]);

        $this->postEnvelope($envelope)->assertStatus(200);

        Http::assertSent(fn ($request) => $request->url() === $confirm);
    }

    public function test_a_subscribe_url_off_sns_is_acknowledged_but_never_fetched(): void
    {
        $envelope = $this->signed([
            'Type'         => 'SubscriptionConfirmation',
            'MessageId'    => (string) Str::uuid(),
            'Token'        => 'abc',
            'TopicArn'     => self::TOPIC,
            'Message'      => 'You have chosen to subscribe to the topic.',
            'SubscribeURL' => 'https://sns.attacker.example/?Action=ConfirmSubscription',
            'Timestamp'    => now()->toIso8601ZuluString('millisecond'),
        ]);

        $this->postEnvelope($envelope)->assertStatus(200);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'attacker'));
    }
}
