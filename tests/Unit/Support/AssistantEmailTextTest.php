<?php

namespace Tests\Unit\Support;

use App\Services\Crm\AssistantEmailText;
use PHPUnit\Framework\TestCase;

final class AssistantEmailTextTest extends TestCase
{
    public function test_copies_and_quoted_originals_do_not_become_new_requests_or_style_samples(): void
    {
        $received = ['subject' => 'Proof', 'direction' => 'from_customer', 'sent_at' => '2026-01-12',
            'body' => "Keep the blue.\n\n---\nUse the two supplied names.\n\nKind regards,\nSam\n\nLe\u{00a0}mar. 3 nov. à 10:47, Sales a écrit\u{00a0}:\n\nWe approved two proofs."];
        $sent = ['subject' => 'Proof', 'direction' => 'other', 'sent_at' => '2026-01-11',
            'body' => "We approved two proofs.\n\nSent from my iPhone"];
        $rows = AssistantEmailText::messages([$received, $received, $sent]);
        self::assertCount(2, $rows);
        self::assertSame("Keep the blue.\n\n---\nUse the two supplied names.", $rows[0]['body']);
        self::assertSame('We approved two proofs.', $rows[1]['body']);
        self::assertArrayNotHasKey('quoted_context', $rows[0]);
    }

    public function test_inline_answers_postscript_and_a_missing_original_remain_available(): void
    {
        $row = ['subject' => 'Estimate', 'direction' => 'from_customer', 'sent_at' => null,
            'body' => "Please see below.\n> When?\nFriday.\nThanks,\nAli\nP.S. Please keep the original dimensions.\n\nFrom: Sales\n\nTo: Customer\nSubject: Estimate\n\nFreight was included for the pilot."];
        $clean = AssistantEmailText::messages([$row])[0];
        self::assertStringContainsString('Friday.', $clean['body']);
        self::assertStringContainsString('original dimensions', $clean['body']);
        self::assertStringNotContainsString('Freight', $clean['body']);
        self::assertStringContainsString('Freight was included', $clean['quoted_context']);
        self::assertStringNotContainsString('Subject: Estimate', $clean['quoted_context']);
    }

    public function test_assigned_credentials_are_scrubbed_and_the_public_destination_is_preserved(): void
    {
        $clean = AssistantEmailText::redact("Use https://example.test/card/123. Reset: https://example.test/reset?token=sample-test-value\nPassword:\n\nsample-test-pass\nPassword\n  \n  sample-test-other\nAuthorization: Bearer sample-test-bearer\nPlease keep the QR code unchanged.");
        self::assertStringNotContainsString('sample-test-', $clean);
        self::assertStringContainsString('https://example.test/card/123', $clean);
        self::assertStringContainsString('Please keep the QR code unchanged.', $clean);
    }
}
