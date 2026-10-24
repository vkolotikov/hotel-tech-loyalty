<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use App\Services\OpenAiService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's Scan endpoints (`POST scan/qr`, `scan/nfc`, `nfc-cards`). Written against the controller as it was
 * before HexaTech Loyalty release 5 (spec 2026-10-23 §3) and kept passing after scanQr began to read codes through
 * CardLookup's tolerant reading: the same answers, the same messages, the same scan log and audit. What release 5
 * adds on purpose (R5-3) is at the end: forms the old code did not read now find the member, in the same answer.
 */
class ScanEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (!Schema::hasTable('bookings')) {
            Schema::create('bookings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('member_id');
                $table->timestamps();
            });
        }
        $this->mock(OpenAiService::class, fn ($mock) => $mock->shouldReceive('suggestUpsell')->andReturn('Offer a late checkout.'));
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/' . ltrim($path, '/');
    }

    private function qr(string $token)
    {
        return $this->asStaffMember()->postJson($this->admin('scan/qr'), ['token' => $token]);
    }

    private function token(LoyaltyMember $member, string $letter, array $more = []): QrToken
    {
        return QrToken::create($more + [
            'member_id' => $member->id, 'token' => str_repeat($letter, 64), 'signature' => 'x',
            'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1,
        ]);
    }

    private function lastScan(): ScanEvent
    {
        return ScanEvent::query()->latest('id')->firstOrFail();
    }

    private function assertMemberAnswer($response, LoyaltyMember $member): void
    {
        $response->assertOk()
            ->assertJsonStructure([
                'member' => ['id', 'member_number', 'name', 'email', 'phone', 'tier', 'current_points', 'lifetime_points', 'joined_at', 'last_stay', 'progress'],
                'tier_benefits', 'entitlements', 'ai_upsell_suggestion',
            ])
            ->assertJsonPath('member.id', $member->id)
            ->assertJsonPath('member.member_number', $member->member_number)
            ->assertJsonPath('member.name', $member->user->name)
            ->assertJsonPath('member.email', $member->user->email)
            ->assertJsonPath('member.current_points', (int) $member->current_points)
            ->assertJsonPath('member.tier.id', $member->tier_id)
            ->assertJsonPath('member.last_stay', null)
            ->assertJsonPath('tier_benefits', [])
            ->assertJsonPath('entitlements', [])
            ->assertJsonPath('ai_upsell_suggestion', 'Offer a late checkout.');
        $this->assertSame(['member', 'tier_benefits', 'entitlements', 'ai_upsell_suggestion'], array_keys($response->json()));
    }

    // ─── scanQr: the forms the old code read ──────────────────────────────

    public function test_the_v2_qr_code_finds_the_member_and_logs_the_number(): void
    {
        $code = json_encode(['type' => 'hotel_loyalty', 'member_number' => $this->ada->member_number, 'version' => 2]);

        $this->assertMemberAnswer($this->qr($code), $this->ada);

        $event = $this->lastScan();
        $this->assertSame(['qr', $this->ada->member_number, 'success', 'verify', $this->ada->id, $this->staffMember->id],
            [$event->scan_type, $event->token_value, $event->result, $event->action_taken, (int) $event->member_id, (int) $event->staff_id]);
        $this->assertNotNull($this->ada->fresh()->last_activity_at);
        $this->assertSame(1, AuditLog::where('action', 'qr_scanned')->where('subject_id', $this->ada->id)->count());
    }

    public function test_a_v2_qr_code_of_nobody_or_of_a_switched_off_member_says_member_not_found(): void
    {
        $this->qr(json_encode(['type' => 'hotel_loyalty', 'member_number' => 'LS-999999', 'version' => 2]))
            ->assertStatus(404)->assertExactJson(['message' => 'Member not found']);
        $event = $this->lastScan();
        $this->assertSame(['qr', 'LS-999999', 'member_not_found', null], [$event->scan_type, $event->token_value, $event->result, $event->member_id]);

        $this->grace->update(['is_active' => false]);
        $this->qr(json_encode(['type' => 'hotel_loyalty', 'member_number' => $this->grace->member_number, 'version' => 2]))
            ->assertStatus(404)->assertExactJson(['message' => 'Member not found']);
        $this->assertSame('member_not_found', $this->lastScan()->result);
        $this->assertSame(0, AuditLog::where('action', 'qr_scanned')->count());
    }

    public function test_a_secure_token_finds_the_member_once_and_logs_its_first_twenty_characters(): void
    {
        $token = $this->token($this->ada, 'a');

        $this->assertMemberAnswer($this->qr($token->token), $this->ada);
        $this->assertSame(1, (int) $token->fresh()->use_count);
        $event = $this->lastScan();
        $this->assertSame([str_repeat('a', 20) . '...', 'success'], [$event->token_value, $event->result]);

        $this->qr($token->token)->assertStatus(404)->assertExactJson(['message' => 'QR code has exceeded maximum uses']);
        $this->assertSame(['replay_detected', str_repeat('a', 20) . '...', null], [$this->lastScan()->result, $this->lastScan()->token_value, $this->lastScan()->member_id]);
    }

    public function test_an_expired_or_revoked_token_says_why(): void
    {
        $old = $this->token($this->ada, 'b', ['issued_at' => now()->subHour(), 'expires_at' => now()->subMinute(), 'max_uses' => 5]);
        $this->qr($old->token)->assertStatus(404)->assertExactJson(['message' => 'QR code has expired']);
        $this->assertSame('expired_token', $this->lastScan()->result);

        $revoked = $this->token($this->ada, 'c', ['max_uses' => 5, 'is_revoked' => true]);
        $this->qr($revoked->token)->assertStatus(404)->assertExactJson(['message' => 'QR code has been revoked']);
        $this->assertSame('invalid_token', $this->lastScan()->result);
    }

    public function test_the_legacy_token_finds_the_member(): void
    {
        $this->grace->update(['qr_code_token' => str_repeat('e', 64)]);

        $this->assertMemberAnswer($this->qr(str_repeat('e', 64)), $this->grace->fresh());
        $this->assertSame([str_repeat('e', 20) . '...', 'success'], [$this->lastScan()->token_value, $this->lastScan()->result]);
    }

    public function test_an_unknown_code_or_a_switched_off_members_token_says_invalid_or_expired(): void
    {
        $this->qr('nothing-anyone-has')->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
        $event = $this->lastScan();
        $this->assertSame(['qr', 'nothing-anyone-has...', 'inactive_member', null], [$event->scan_type, $event->token_value, $event->result, $event->member_id]);

        $this->grace->update(['is_active' => false, 'qr_code_token' => str_repeat('f', 64)]);
        $this->qr(str_repeat('f', 64))->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
        $token = $this->token($this->grace, 'g', ['max_uses' => 5]);
        $this->qr($token->token)->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
        $this->assertSame('inactive_member', $this->lastScan()->result);

        $this->asStaffMember()->postJson($this->admin('scan/qr'), [])->assertStatus(422);
    }

    public function test_another_organisations_member_is_never_found(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->token($other['member'], 'h', ['max_uses' => 5]);

        $this->qr(json_encode(['type' => 'hotel_loyalty', 'member_number' => $other['member']->member_number, 'version' => 2]))
            ->assertStatus(404)->assertExactJson(['message' => 'Member not found']);
        $this->qr($theirs->token)->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
        LoyaltyMember::withoutGlobalScopes()->whereKey($other['member']->id)->update(['qr_code_token' => str_repeat('i', 64)]);
        $this->qr(str_repeat('i', 64))->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
    }

    // ─── scanQr: what release 5 adds (R5-3), in the same answer ───────────

    public function test_the_tolerant_reading_finds_the_member_in_the_same_answer(): void
    {
        $german = 'ÜÄtzpeÄÖÄhotel?lozaltzÄ,Ämember?numberÄÖÄ' . str_replace('-', 'ß', $this->ada->member_number) . 'Ä,ÄversionÄÖ2*';
        $this->assertMemberAnswer($this->qr($german), $this->ada);
        $this->assertSame([$this->ada->member_number, 'success'], [$this->lastScan()->token_value, $this->lastScan()->result]);

        $token = $this->token($this->grace, 'j', ['max_uses' => 5]);
        $this->assertMemberAnswer($this->qr(json_encode(['type' => 'hotel_loyalty', 'token' => $token->token, 'version' => 1])), $this->grace);
        $this->assertSame([str_repeat('j', 20) . '...', 1], [$this->lastScan()->token_value, (int) $token->fresh()->use_count]);

        $this->assertMemberAnswer($this->qr('#' . strtolower(str_replace('-', '', $this->ada->member_number))), $this->ada);
        $this->assertSame(2, AuditLog::where('action', 'qr_scanned')->where('subject_id', $this->ada->id)->count());
    }

    public function test_french_and_spanish_layouts_find_the_member_in_the_same_answer(): void
    {
        // Release 6: the app's code and a bare member number as AZERTY and the Spanish layout type a US scanner's keys.
        $this->ada->update(['member_number' => 'LS-001001']);

        $this->assertMemberAnswer($this->qr('¨%type%M%hotel°loyqlty%;%,e,ber°nu,ber%M%LS)àà&àà&%;%version%Mé£'), $this->ada->fresh());
        $this->assertSame(['LS-001001', 'success'], [$this->lastScan()->token_value, $this->lastScan()->result]);
        $this->assertMemberAnswer($this->qr("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'001001¨,¨version¨Ñ2*"), $this->ada->fresh());
        $this->assertMemberAnswer($this->qr('LS)àà&àà&'), $this->ada->fresh());
        $this->assertMemberAnswer($this->qr("LS'001001"), $this->ada->fresh());
        $this->qr("^¨type¨Ñ¨hotel?loyalty¨,¨member?number¨Ñ¨LS'009009¨,¨version¨Ñ2*")->assertStatus(404)->assertExactJson(['message' => 'Member not found']);
    }

    public function test_a_bent_code_naming_nobody_says_member_not_found_and_another_organisations_token_is_not_used_up(): void
    {
        $this->qr('Ü@member_number@Ö@LS-999999@Ü')->assertStatus(404)->assertExactJson(['message' => 'Member not found']);
        $this->assertSame(['LS-999999', 'member_not_found'], [$this->lastScan()->token_value, $this->lastScan()->result]);

        $other = $this->otherOrganization();
        $theirs = $this->token($other['member'], 'k', ['max_uses' => 5]);
        $this->qr($theirs->token)->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
        $this->assertSame(0, (int) $theirs->fresh()->use_count);
        $this->qr('#' . $other['member']->member_number)->assertStatus(404)->assertExactJson(['message' => 'Invalid or expired QR code']);
    }

    // ─── scanNfc and linkNfcCard: unchanged ───────────────────────────────

    public function test_scan_nfc_finds_a_linked_card_however_it_is_spaced_and_counts_the_scan(): void
    {
        $card = NfcCard::create(['member_id' => $this->ada->id, 'uid' => '04A2B3C4D5E6F7', 'is_active' => true]);

        $response = $this->asStaffMember()->postJson($this->admin('scan/nfc'), ['uid' => '04:a2:b3:c4:d5:e6:f7']);

        $this->assertMemberAnswer($response, $this->ada);
        $card->refresh();
        $this->assertSame(1, (int) $card->scan_count);
        $this->assertNotNull($card->last_scanned_at);
        $this->assertSame($this->staffMember->id, (int) $card->last_scanned_by);
        $this->assertSame(1, AuditLog::where('action', 'nfc_scanned')->where('subject_id', $this->ada->id)->count());
    }

    public function test_scan_nfc_reads_the_unified_id_and_refuses_unknown_and_switched_off_cards(): void
    {
        $this->grace->update(['qr_code_token' => '04:11:22:33']);
        $this->assertMemberAnswer($this->asStaffMember()->postJson($this->admin('scan/nfc'), ['uid' => '04112233']), $this->grace->fresh());

        $this->asStaffMember()->postJson($this->admin('scan/nfc'), ['uid' => '04 99 88 77'])
            ->assertStatus(404)->assertExactJson(['message' => 'Card not registered — register this member', 'status' => 'card_not_found', 'uid' => '04 99 88 77']);

        NfcCard::create(['member_id' => $this->ada->id, 'uid' => '0455667788', 'is_active' => false]);
        $this->asStaffMember()->postJson($this->admin('scan/nfc'), ['uid' => '0455667788'])
            ->assertStatus(404)->assertExactJson(['message' => 'This card has been deactivated', 'status' => 'card_inactive', 'uid' => '0455667788']);
    }

    public function test_link_nfc_card_links_it_and_refuses_an_active_duplicate(): void
    {
        $token = $this->grace->qr_code_token;
        $response = $this->asStaffMember()->postJson($this->admin('nfc-cards'), ['member_id' => $this->grace->id, 'uid' => '04:AA:BB:CC'])
            ->assertCreated()
            ->assertJsonPath('message', 'NFC card linked')
            ->assertJsonPath('card.member_id', $this->grace->id)
            ->assertJsonPath('card.uid', '04aabbcc')
            ->assertJsonPath('card.card_type', 'standard')
            ->assertJsonPath('card.is_active', true);

        // Release 6 (spec 2026-10-23 §2 item 2): the ID is stored as NfcCards stores it, and the member's QR code is
        // left alone (it used to be set to the card's ID; tests/Feature/Admin/NfcLinkEndpointsTest.php says why not).
        $this->assertSame($token, $this->grace->fresh()->qr_code_token);
        $this->assertSame(1, AuditLog::where('action', 'nfc_card_linked')->where('subject_id', $response->json('card.id'))->count());

        $this->asStaffMember()->postJson($this->admin('nfc-cards'), ['member_id' => $this->ada->id, 'uid' => '04:AA:BB:CC'])
            ->assertStatus(422)->assertExactJson(['message' => 'This NFC card is already linked to a member']);
    }
}
