<?php

namespace Tests\Feature\LoyaltyWorkspace;

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
}
