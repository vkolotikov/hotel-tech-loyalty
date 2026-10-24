<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Scan: what a code names, only ever in this organisation (spec 2026-10-21 §4.7). */
class ScanTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function scan(string $code)
    {
        return $this->asStaffMember()->postJson($this->api('scan'), ['code' => $code]);
    }

    public function test_a_typed_member_number_in_any_case_and_the_v2_qr_code_find_the_member(): void
    {
        $this->scan(strtolower($this->ada->member_number))->assertOk()->assertJsonPath('member.id', $this->ada->id)->assertJsonPath('member.name', 'Ada Lovelace');
        $this->scan(json_encode(['member_number' => $this->grace->member_number, 'v' => 2]))->assertOk()->assertJsonPath('member.id', $this->grace->id);

        $event = ScanEvent::query()->latest('id')->first();
        $this->assertSame('success', $event->result);
        $this->assertSame($this->staffMember->id, (int) $event->staff_id);
        $this->assertNotNull($this->grace->fresh()->last_activity_at);
    }

    public function test_a_secure_token_is_used_once_per_use_and_says_why_it_cannot_be_used(): void
    {
        $token = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('a', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1]);

        $this->scan($token->token)->assertOk()->assertJsonPath('member.id', $this->ada->id);
        $this->scan($token->token)->assertStatus(404)->assertJsonPath('error', 'used_up');

        $old = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('b', 64), 'signature' => 'x', 'issued_at' => now()->subHour(), 'expires_at' => now()->subMinute(), 'max_uses' => 5]);
        $this->scan($old->token)->assertStatus(404)->assertJsonPath('error', 'expired');

        $revoked = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('c', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 5, 'is_revoked' => true]);
        $this->scan($revoked->token)->assertStatus(404)->assertJsonPath('error', 'revoked');
    }

    public function test_another_organisations_token_reads_as_not_found_and_is_not_used_up(): void
    {
        $other = $this->otherOrganization();
        $theirs = QrToken::create(['member_id' => $other['member']->id, 'token' => str_repeat('d', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1]);

        $this->scan($theirs->token)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->scan($other['member']->member_number)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame(0, (int) $theirs->fresh()->use_count);
    }

    public function test_an_nfc_card_however_the_reader_spaced_it_and_an_inactive_member(): void
    {
        NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04A2B3C4D5', 'is_active' => true]);

        $this->scan('04:a2:b3:c4:d5')->assertOk()->assertJsonPath('member.id', $this->grace->id);

        $this->grace->update(['is_active' => false]);
        $this->scan('04A2B3C4D5')->assertStatus(404)->assertJsonPath('error', 'inactive');
        $this->scan($this->grace->member_number)->assertStatus(404)->assertJsonPath('error', 'inactive');
    }

    public function test_nothing_found_is_recorded_too(): void
    {
        $this->scan('NOPE-123')->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame('member_not_found', ScanEvent::query()->latest('id')->first()->result);
        $this->asStaffMember()->postJson($this->api('scan'), [])->assertStatus(422);
    }

    // ─── Release 5 (spec 2026-10-23 §2, §3): every form the reading takes ─

    private function finds(string $code, LoyaltyMember $member, string $type): void
    {
        $this->scan($code)->assertOk()->assertJsonPath('member.id', $member->id);
        $event = ScanEvent::query()->latest('id')->first();
        $this->assertSame([$type, 'success', 'verify', $member->id], [$event->scan_type, $event->result, $event->action_taken, (int) $event->member_id], $code);
    }

    private function nobody(string $code): void
    {
        $this->scan($code)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame('member_not_found', ScanEvent::query()->latest('id')->first()->result, $code);
    }

    public function test_the_number_as_the_wallet_pass_shows_it_without_its_hyphen_and_in_any_case(): void
    {
        $number = $this->ada->member_number;
        $this->finds('#' . $number, $this->ada, 'manual');
        $this->finds(str_replace('-', '', $number), $this->ada, 'manual');
        $this->finds(' ' . strtolower(str_replace('-', ' ', $number)) . ' ', $this->ada, 'manual');
        $this->assertSame(3, AuditLog::where('action', 'qr_scanned')->where('subject_id', $this->ada->id)->count());
    }

    public function test_the_digits_alone_find_the_one_member_whose_number_ends_with_them_and_never_guess(): void
    {
        $this->ada->update(['member_number' => 'LS-001001']);
        $this->grace->update(['member_number' => 'LS-002002']);

        $this->finds('001001', $this->ada, 'manual');
        $this->finds('2002', $this->grace, 'manual');

        $this->makeMember('Alan Turing', 'alan@example.test', ['member_number' => 'LS-101001']);
        $this->nobody('01001');
        $this->nobody('001');
    }

    public function test_two_numbers_that_read_alike_only_the_one_typed_exactly_counts(): void
    {
        $this->ada->update(['member_number' => 'LS-1001']);
        $this->grace->update(['member_number' => 'LS1001']);

        $this->finds('ls1001', $this->grace, 'manual');
        $this->finds('LS-1001', $this->ada, 'manual');
        $this->nobody('LS 1001');
    }

    public function test_the_apps_code_however_a_keyboard_layout_bent_it(): void
    {
        $this->ada->update(['member_number' => 'LS-001001']);

        $this->finds('ÜÄtzpeÄÖÄhotel?lozaltzÄ,Ämember?numberÄÖÄLSß001001Ä,ÄversionÄÖ2*', $this->ada, 'qr');
        $this->finds('ХЭензуЭЖЭрщеуд_дщнфденЭбЭьуьиук_тгьиукЭЖЭДЫ-001001ЭбЭмукышщтЭЖ2Ъ', $this->ada, 'qr');
        $this->finds('{@type@:@hotel_loyalty@,@member_number@:@LS-001001@,@version@:2}', $this->ada, 'qr');
        $this->nobody('{@type@:@hotel_loyalty@,@member_number@:@LS-009009@,@version@:2}');
    }

    public function test_french_and_spanish_layouts_the_apps_code_and_a_bare_member_number(): void
    {
        // Release 6: a US-layout scanner's keys as AZERTY and the Spanish layout type them (CodeReader's key maps).
        $this->ada->update(['member_number' => 'LS-001001']);
        $this->grace->update(['member_number' => 'EL-000123']);

        $this->finds('¨%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%LS)àà&àà&%;%version%Mé£', $this->ada, 'qr');
        $this->finds("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'001001¨,¨version¨Ñ2*", $this->ada, 'qr');
        $this->finds("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨ÑËL'000123¨,¨version¨Ñ2*", $this->grace, 'qr');
        $this->finds('LS)àà&àà&', $this->ada, 'manual');
        $this->finds("LS'001001", $this->ada, 'manual');
        $this->finds('#EL)ààà&é"', $this->grace, 'manual');
        $this->finds('LSß001001', $this->ada, 'manual');
        $this->nobody('LS)àà(àà(');
        $this->nobody("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'009009¨,¨version¨Ñ2*");
    }

    public function test_the_older_apps_token_a_link_and_the_wallet_pass_legacy_token(): void
    {
        $token = QrToken::create(['member_id' => $this->grace->id, 'token' => str_repeat('k', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 2]);
        $this->finds(json_encode(['type' => 'hotel_loyalty', 'token' => $token->token, 'version' => 1]), $this->grace, 'qr');
        $this->assertSame(1, (int) $token->fresh()->use_count);
        $this->finds('https://venue.example/card?token=' . $token->token, $this->grace, 'qr');
        $this->assertSame(2, (int) $token->fresh()->use_count);
        $this->scan(json_encode(['type' => 'hotel_loyalty', 'token' => $token->token, 'version' => 1]))->assertStatus(404)->assertJsonPath('error', 'used_up');

        $this->finds('https://venue.example/members/' . $this->ada->member_number, $this->ada, 'qr');
        $this->nobody('https://venue.example/members/LS-999999');

        $this->ada->update(['qr_code_token' => hash('sha256', 'wallet-pass-fixture')]);
        $this->finds(hash('sha256', 'wallet-pass-fixture'), $this->ada, 'qr');
    }

    public function test_a_card_id_in_hex_or_decimal_either_byte_order_counts_the_scan(): void
    {
        $card = NfcCard::create(['member_id' => $this->ada->id, 'uid' => '04A2B3C4', 'is_active' => true]);
        $long = NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04:a2:b3:c4:d5:e6:f7', 'is_active' => true]);

        $this->finds('04-a2-b3-c4', $this->ada, 'nfc');
        $this->finds('0077771716', $this->ada, 'nfc');   // decimal, as read
        $this->finds('3300106756', $this->ada, 'nfc');   // decimal, the bytes reversed
        $this->finds('c4b3a204', $this->ada, 'nfc');     // hex, the bytes reversed
        $this->finds('1304792892040951', $this->grace, 'nfc');
        $this->finds('69778125050061316', $this->grace, 'nfc');

        $card->refresh();
        $this->assertSame(4, (int) $card->scan_count);
        $this->assertSame($this->staffMember->id, (int) $card->last_scanned_by);
        $this->assertNotNull($card->last_scanned_at);
        $this->assertSame(2, (int) $long->fresh()->scan_count);
        $this->assertSame(6, AuditLog::where('action', 'nfc_scanned')->count());
    }

    public function test_a_switched_off_card_says_inactive_and_that_the_card_is_off(): void
    {
        NfcCard::create(['member_id' => $this->ada->id, 'uid' => '0411223344', 'is_active' => false]);

        $this->scan('04 11 22 33 44')->assertStatus(404)->assertJsonPath('error', 'inactive')->assertJsonPath('card', 'off');
        $this->assertSame('inactive_member', ScanEvent::query()->latest('id')->first()->result);

        $this->grace->update(['is_active' => false]);
        $this->scan($this->grace->member_number)->assertStatus(404)->assertJsonPath('error', 'inactive')->assertJsonMissingPath('card');
    }

    public function test_another_organisations_number_digits_token_and_card_are_never_found(): void
    {
        $other = $this->otherOrganization();
        LoyaltyMember::withoutGlobalScopes()->whereKey($other['member']->id)->update(['member_number' => 'ES-777001', 'qr_code_token' => hash('sha256', 'their-wallet-pass')]);
        $theirs = QrToken::create(['member_id' => $other['member']->id, 'token' => str_repeat('m', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 5]);
        $card = NfcCard::withoutGlobalScopes()->create(['organization_id' => $other['org']->id, 'member_id' => $other['member']->id, 'uid' => '04e1e2e3', 'is_active' => true]);
        NfcCard::withoutGlobalScopes()->whereKey($card->id)->update(['organization_id' => $other['org']->id]);

        foreach (['ES-777001', '#es777001', '777001', hash('sha256', 'their-wallet-pass'), '04:E1:E2:E3', (string) hexdec('04e1e2e3'),
            json_encode(['type' => 'hotel_loyalty', 'member_number' => 'ES-777001', 'version' => 2]),
            json_encode(['type' => 'hotel_loyalty', 'token' => $theirs->token, 'version' => 1]),
            'https://venue.example/members/ES-777001'] as $code) {
            $this->nobody($code);
        }
        $this->assertSame(0, (int) $theirs->fresh()->use_count);
        $this->assertSame(0, (int) NfcCard::withoutGlobalScopes()->find($card->id)->scan_count);
    }
}
