<?php

namespace Tests\Unit\Support;

use App\Support\SmoobuAuthentication;
use PHPUnit\Framework\TestCase;

class SmoobuAuthenticationTest extends TestCase
{
    public function test_signature_covers_exact_body_and_sorted_encoded_query(): void
    {
        $headers = SmoobuAuthentication::headers('POST', 'https://login.smoobu.com/api/reservations?z=last&a=two+words', '{"price":240}', 'fixture-key', 'fixture-signing-secret', '2026-11-27T10:00:00Z', 'fixture-nonce');
        $canonical = "POST\n/api/reservations\na=two%20words&z=last\n2026-11-27T10:00:00Z\nfixture-nonce\n" . hash('sha256', '{"price":240}') . "\nfixture-key";
        $this->assertSame(base64_encode(hash_hmac('sha256', $canonical, 'fixture-signing-secret', true)), $headers['X-Signature']);
        $this->assertSame('fixture-key', $headers['X-API-Key']);
        $changed = SmoobuAuthentication::headers('POST', 'https://login.smoobu.com/api/reservations?z=last&a=two+words', '{"price":241}', 'fixture-key', 'fixture-signing-secret', '2026-11-27T10:00:00Z', 'fixture-nonce');
        $this->assertNotSame($headers['X-Signature'], $changed['X-Signature']);
    }

    public function test_credentials_cannot_be_signed_for_another_host(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        SmoobuAuthentication::headers('GET', 'https://example.test/api', '', 'fixture-key', 'fixture-secret', '2026-11-27T10:00:00Z', 'nonce');
    }
}
