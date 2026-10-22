<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Services\Loyalty\Sms\SmsMessage;
use App\Services\Sms\PhoneNumber;
use App\Services\Sms\SmsText;
use App\Services\Sms\TwilioSms;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * How an SMS is measured, how a member's number is read, and who the venue sends as (release 4 §5). The length cases
 * are one file, frontend/src/loyalty/sms/smsLength.cases.json, which the workspace's own count is held to as well
 * (sms/smsMath.test.ts): the page says before sending exactly what the server counts.
 */
class SmsTextTest extends TestCase
{
    /** @return array<string, array{0: array<string, mixed>}> */
    public static function lengthCases(): array
    {
        $cases = json_decode((string) file_get_contents(dirname(__DIR__, 3) . '/frontend/src/loyalty/sms/smsLength.cases.json'), true);
        $out = [];
        foreach ($cases as $case) {
            $out[$case['name']] = [$case];
        }

        return $out;
    }

    #[DataProvider('lengthCases')]
    public function test_an_sms_is_measured_as_the_networks_count_it(array $case): void
    {
        $this->assertSame([
            'encoding'    => $case['encoding'],
            'units'       => $case['units'],
            'segments'    => $case['segments'],
            'per_segment' => $case['per_segment'],
            'unicode'     => $case['unicode'],
        ], SmsText::measure($case['text']));
    }

    public function test_the_cases_cover_both_alphabets_and_every_boundary(): void
    {
        $cases = array_column(array_map(fn ($c) => $c[0], self::lengthCases()), 'segments', 'name');
        $this->assertGreaterThanOrEqual(15, count($cases));
        $this->assertContains(0, $cases);
        $this->assertContains(3, $cases);
    }

    public function test_line_breaks_are_one_character(): void
    {
        $this->assertSame("a\nb\nc", SmsText::normalise("a\r\nb\rc"));
    }

    public function test_a_members_number_is_read_in_international_form_only(): void
    {
        $this->assertSame('+442079460958', PhoneNumber::e164('+44 20 7946 0958'));
        $this->assertSame('+442079460958', PhoneNumber::e164('0044 (20) 7946-0958'));
        $this->assertSame('+37126123456', PhoneNumber::e164(' +371 2612.3456 '));
        $this->assertSame('+15005550006', PhoneNumber::e164('+1 (500) 555-0006'));
        foreach (['020 7946 0958', '7946 0958', '+0 123 4567', '+44 20 7946 0958 ext 2', '+1234', '+1234567890123456', 'call me'] as $not) {
            $this->assertNull(PhoneNumber::e164($not), $not);
            $this->assertSame(PhoneNumber::NOT_INTERNATIONAL, PhoneNumber::problem($not), $not);
        }
        $this->assertSame(PhoneNumber::NONE, PhoneNumber::problem(null));
        $this->assertSame(PhoneNumber::NONE, PhoneNumber::problem('  '));
        $this->assertNull(PhoneNumber::problem('+44 20 7946 0958'));
    }

    public function test_the_venue_sends_as_a_number_a_messaging_service_or_a_sender_name(): void
    {
        $this->assertSame(['From', '+15005550006'], TwilioSms::sender('+1 500 555 0006'));
        $this->assertSame(['MessagingServiceSid', 'MGtestservicexxxxxxxxxxxxxxxxxxxxx'], TwilioSms::sender('MGtestservicexxxxxxxxxxxxxxxxxxxxx'));
        $this->assertSame(['From', 'MGM Hotel'], TwilioSms::sender('MGM Hotel'), 'a short sender name is not a service SID');
        $this->assertSame(['From', 'Lumiere'], TwilioSms::sender('Lumiere'));
        $this->assertNull(TwilioSms::sender(''));
        $this->assertNull(TwilioSms::sender('555 0006'));
        $this->assertNull(TwilioSms::sender('A name far too long'));
        $this->assertNull(TwilioSms::sender('12345'));
    }

    public function test_tags_are_filled_as_plain_text_and_the_lines_are_kept(): void
    {
        $values = ['{{first_name}}' => "Ada\nEvil", '{{hotel_name}}' => 'Lumière', '{{member_name}}' => 'Ada Lovelace'];

        $this->assertSame("Hi Ada Evil,\ndouble points at Lumière. {{unknown}}", SmsMessage::fill("Hi {{first_name}},\r\ndouble points at {{hotel_name}}. {{unknown}}", $values));
    }
}
