<?php

namespace Tests\Unit\Chatbot;

use App\Models\ChatWidgetConfig;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Normalising the "Talk to a person" WhatsApp number.
 *
 * The dangerous case is not a rejected number — that is visible and the admin
 * fixes it. It is a number that is silently changed into a DIFFERENT valid
 * number, because the venue's own customers then reach a stranger and nothing
 * about the widget looks broken.
 *
 * That is what a naive `ltrim($digits, '0')` does to national formats: UK
 * "020 7123 4567" becomes "2071234567". So leading-zero handling is restricted
 * to the "00" international dialling prefix, and the tests below pin both
 * halves of that distinction.
 */
class WhatsappHandoffNumberTest extends TestCase
{
    public static function numbers(): array
    {
        return [
            'plain international'      => ['+44 20 7123 4567', '442071234567'],
            'no plus'                  => ['442071234567',     '442071234567'],
            'brackets and dashes'      => ['+1 (555) 010-9999', '15550109999'],
            'double-zero prefix'       => ['0044 20 7123 4567', '442071234567'],
            'double-zero, no spaces'   => ['00442071234567',    '442071234567'],
            'latvian mobile'           => ['+371 20 123 456',   '37120123456'],
        ];
    }

    #[DataProvider('numbers')]
    public function test_admin_typed_numbers_reduce_to_wa_me_digits(string $input, string $expected): void
    {
        $this->assertSame($expected, ChatWidgetConfig::normaliseWhatsapp($input));
    }

    public function test_a_national_number_keeps_its_leading_zero(): void
    {
        // The whole point. Stripping this zero yields 2071234567 — a real
        // number belonging to someone else. Left intact, wa.me simply fails to
        // resolve and the venue notices.
        $this->assertSame('02071234567', ChatWidgetConfig::normaliseWhatsapp('020 7123 4567'));
    }

    public static function rejected(): array
    {
        return [
            'null'          => [null],
            'empty'         => [''],
            'whitespace'    => ['   '],
            'too short'     => ['1234567'],
            'no digits'     => ['call us!'],
            'only prefix'   => ['00'],
        ];
    }

    #[DataProvider('rejected')]
    public function test_unusable_input_yields_no_button(?string $input): void
    {
        // The widget hides the button on null. A button that opens a broken
        // wa.me link is worse than no button at all.
        $this->assertNull(ChatWidgetConfig::normaliseWhatsapp($input));
    }
}
