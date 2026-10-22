<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Cards\CodeReader;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** How Scan reads a code, by string (release 5, spec 2026-10-23 §2, §3): every form it reads, and what it refuses. */
class CodeReaderTest extends TestCase
{
    public function test_the_spaces_invisible_marks_and_the_wallet_pass_hash_are_dropped(): void
    {
        $this->assertSame('LS-001001', CodeReader::clean('  #LS-001001 '));
        $this->assertSame('LS-001001', CodeReader::clean('# LS-001001'));
        $this->assertSame('LS-001001', CodeReader::clean("\u{FEFF}LS-001001\n"));
        $this->assertSame('', CodeReader::clean('  # '));
    }

    /** @return array<string, array{0: string, 1: ?array}> */
    public static function appCodes(): array
    {
        $token = str_repeat('Ab3', 21) . 'z';

        return [
            'the v2 JSON'                      => ['{"type":"hotel_loyalty","member_number":"LS-001001","version":2}', ['number', 'LS-001001']],
            'the v1 JSON'                      => ['{"type":"hotel_loyalty","token":"' . $token . '","version":1}', ['token', $token]],
            'caps lock on'                     => ['{"TYPE":"HOTEL_LOYALTY","MEMBER_NUMBER":"ls-001001","VERSION":2}', ['number', 'ls-001001']],
            'a German layout'                  => ['ÜÄtzpeÄÖÄhotel?lozaltzÄ,Ämember?numberÄÖÄLSß001001Ä,ÄversionÄÖ2*', ['number', 'LS-001001']],
            'a German layout, y and z swapped' => ['ÜÄmember?numberÄÖÄHLßYZ12Ä*', ['number', 'HL-ZY12']],
            'a Russian layout'                 => ['ХЭензуЭЖЭрщеуд_дщнфденЭбЭьуьиук_тгьиукЭЖЭДЫ-001001ЭбЭмукышщтЭЖ2Ъ', ['number', 'LS-001001']],
            'a UK layout'                      => ['{@type@:@hotel_loyalty@,@member_number@:@LS-001001@,@version@:2}', ['number', 'LS-001001']],
            // Release 6: the strings FRENCH_KEYS and SPANISH_KEYS give for a US-layout scanner's keys.
            'a French AZERTY layout'           => ['¨%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%LS)àà&àà&%;%version%Mé£', ['number', 'LS-001001']],
            'AZERTY, the dead ¨ dropped'       => ['%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%LS)àà&àà&%;%version%Mé£', ['number', 'LS-001001']],
            'AZERTY, a, q, z, w and m moved'   => ['¨%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%Q?W)àé"ç%;%version%Mé£', ['number', 'AMZ-0239']],
            'a Spanish layout'                 => ["^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'001001¨,¨version¨Ñ2*", ['number', 'LS-001001']],
            'Spanish, a quote before a vowel'  => ["^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨ÑËL'000123¨,¨version¨Ñ2*", ['number', 'EL-000123']],
            'a v1 code on a Spanish layout'    => ["^¨type¨Ñ¨hotel?loyalty¨,¨token¨Ñ" . 'ä' . substr($token, 1) . "¨,¨version¨Ñ1*", ['token', 'a' . substr($token, 1)]],
            'quotes and colons bent'           => ['Ä"type"Ö"hotel_loyalty"Ümember_number"Ö"LS-001001"Ü', ['number', 'LS-001001']],
            'a v1 code on a UK layout'         => ['{@type@:@hotel_loyalty@,@token@:@' . $token . '@,@version@:1}', ['token', $token]],
            'a link with the number'           => ['https://venue.example/card?member_number=LS-001001', ['number', 'LS-001001']],
            'a member number alone'            => ['LS-001001', null],
            'a token alone'                    => [$token, null],
            'JSON without either'              => ['{"type":"hotel_loyalty","version":2}', null],
            'an empty number'                  => ['{"member_number":"  "}', null],
        ];
    }

    #[DataProvider('appCodes')]
    public function test_the_member_apps_code_however_a_keyboard_layout_bent_it(string $code, ?array $expected): void
    {
        $this->assertSame($expected, CodeReader::appCode($code));
    }

    public function test_the_french_and_spanish_key_maps_type_the_apps_code_back_key_for_key(): void
    {
        $code = '{"type":"hotel_loyalty","member_number":"LS-001001","version":2}';
        $this->assertContains($code, CodeReader::layouts('¨%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%LS)àà&àà&%;%version%Mé£'));
        $this->assertContains($code, CodeReader::layouts("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'001001¨,¨version¨Ñ2*"));
        // Every shifted key of the number row, typed back (and the key after it: é is 2, ñ is ;).
        $this->assertContains('!@#$%^&*()_+2', CodeReader::layouts('1234567890°+é'));
        $this->assertContains('!@#$%^&*()_+;', CodeReader::layouts('!"·$%&/()=?¿ñ'));
        $this->assertSame(['plain'], CodeReader::layouts('plain'), 'a code without a layout\'s marks is read as it is');
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function bentNumbers(): array
    {
        return [
            'French AZERTY'               => ['LS)àà&àà&', ['LS-001001']],
            'AZERTY, letters that move'   => ['Q?W)àé"ç', ['AMZ-0239']],
            'Spanish'                     => ["LS'001001", ['LS-001001']],
            'German'                      => ['LSß001001', ['LS-001001']],
            'Russian'                     => ['ДЫ-001001', ['LS-001001']],
            'the wallet pass hash'        => ['#LS)àà&àà&', ['LS-001001']],
            'a number nothing bent'       => ['LS-001001', []],
            'a lower-case number'         => ['ls 001001', []],
            'no number in any layout'     => ['%%%', []],
            'empty'                       => ['', []],
        ];
    }

    #[DataProvider('bentNumbers')]
    public function test_a_member_number_a_layout_bent_is_typed_back_and_one_nothing_bent_is_left_alone(string $code, array $expected): void
    {
        $this->assertSame($expected, CodeReader::numberForms($code));
    }

    public function test_a_link_gives_its_query_values_then_the_path_segments_that_hold_a_digit(): void
    {
        $this->assertSame(['LS-001001'], CodeReader::urlValues('https://venue.example/card/LS-001001'));
        $this->assertSame(['LS-001001', '2026'], CodeReader::urlValues('https://venue.example/2026/members/?member=LS-001001'));
        $this->assertSame(['abc123', 'LS-1'], CodeReader::urlValues('www.venue.example/m/LS-1#token=abc123'));
        $this->assertSame([], CodeReader::urlValues('https://venue.example/'));
        $this->assertNull(CodeReader::urlValues('LS-001001'));
    }

    public function test_a_member_number_compares_in_upper_case_without_separators(): void
    {
        $this->assertSame('LS001001', CodeReader::number('ls 001-001'));
        $this->assertSame('LS001001', CodeReader::number('#LS-001001'));
        $this->assertSame('HL2026000001', CodeReader::number('HL-2026-000001'));
        $this->assertSame('A123', CodeReader::number('a/1.2_3'));
    }

    public function test_digits_alone_need_four_or_more(): void
    {
        $this->assertSame('001001', CodeReader::digits('001001'));
        $this->assertSame('1001', CodeReader::digits('1001'));
        $this->assertNull(CodeReader::digits('001'));
        $this->assertNull(CodeReader::digits('LS1001'));
        $this->assertNull(CodeReader::digits('1001 '));
    }

    public function test_a_hex_card_id_however_the_reader_spaced_it(): void
    {
        $this->assertSame('04a2b3c4', CodeReader::hexUid('04:A2:B3:C4'));
        $this->assertSame('04a2b3c4', CodeReader::hexUid('04-a2 b3.c4'));
        $this->assertSame('04a2b3c4d5e6f7', CodeReader::hexUid('04_A2_B3_C4_D5_E6_F7'));
        $this->assertNull(CodeReader::hexUid('LS-001001'));
        $this->assertNull(CodeReader::hexUid(':-'));
    }

    public function test_a_decimal_card_id_as_hex_in_both_byte_orders(): void
    {
        $this->assertSame(['04a2b3c4', 'c4b3a204'], CodeReader::decimalUids('77771716'));
        $this->assertSame(['04a2b3c4', 'c4b3a204'], CodeReader::decimalUids('0077771716'));
        $this->assertSame(['c4b3a204', '04a2b3c4'], CodeReader::decimalUids('3300106756'));
        $this->assertSame(['04a2b3c4d5e6f7', 'f7e6d5c4b3a204'], CodeReader::decimalUids('1304792892040951'));
        $this->assertSame(['f7e6d5c4b3a204', '04a2b3c4d5e6f7'], CodeReader::decimalUids('69778125050061316'));
        $this->assertSame([], CodeReader::decimalUids('1001'));
        $this->assertSame([], CodeReader::decimalUids('99999999999999999'), 'more than seven bytes');
        $this->assertSame([], CodeReader::decimalUids('04a2'));
    }

    public function test_a_card_id_is_stored_as_lower_case_hex_with_the_forms_it_may_already_be_stored_under(): void
    {
        $this->assertSame(['uid' => '04a2b3c4', 'also' => ['c4b3a204']], CodeReader::cardUid('04:A2:B3:C4'));
        $this->assertSame(['uid' => '04a2b3c4d5e6f7', 'also' => ['f7e6d5c4b3a204']], CodeReader::cardUid(' 04 A2 B3 C4 D5 E6 F7 '));
        // Ten digits are the decimal a keyboard-style reader types; converted.
        $this->assertSame(['uid' => '04a2b3c4', 'also' => ['c4b3a204']], CodeReader::cardUid('0077771716'));
        $this->assertSame(['uid' => '04a2b3c4d5e6f7', 'also' => ['f7e6d5c4b3a204']], CodeReader::cardUid('1304792892040951'));
        // Eight digits read as the hex printed on a card, and also as the decimal they could be.
        $this->assertSame(['uid' => '12345678', 'also' => ['78563412', '00bc614e', '4e61bc00']], CodeReader::cardUid('12345678'));

        foreach (['LS-001001', '04a2b', '04a2b3', '1234', '', '0000000000000000000000'] as $refused) {
            $this->assertNull(CodeReader::cardUid($refused), $refused);
        }
    }
}
