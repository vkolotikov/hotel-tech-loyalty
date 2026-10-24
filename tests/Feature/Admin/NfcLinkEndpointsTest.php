<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\NfcCard;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's NFC linking, `POST nfc-cards` (ScanController::linkNfcCard) and `POST nfc/issue`
 * (NfcController::issue). The answers, their messages and the audit were pinned against the controllers as they were
 * before release 6; release 6 (spec 2026-10-23 §2 item 2) routes their storing and comparing through
 * App\Services\Loyalty\Cards\NfcCards. The tests build production's `nfc_cards_uid_unique`, which SQLite lacks.
 */
class NfcLinkEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (!Schema::hasIndex('nfc_cards', 'nfc_cards_uid_unique')) {
            Schema::table('nfc_cards', fn ($t) => $t->unique('uid', 'nfc_cards_uid_unique'));
        }
        // scan/nfc answers with the member's last stays (ScanEndpointsTest builds the table the same way).
        if (!Schema::hasTable('bookings')) {
            Schema::create('bookings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('member_id');
                $table->timestamps();
            });
        }
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/' . ltrim($path, '/');
    }

    private function link(int $memberId, string $uid, array $more = [])
    {
        return $this->asStaffMember()->postJson($this->admin('nfc-cards'), ['member_id' => $memberId, 'uid' => $uid] + $more);
    }

    private function issue(int $memberId, string $uid, array $more = [])
    {
        return $this->asStaffMember()->postJson($this->admin('nfc/issue'), ['member_id' => $memberId, 'uid' => $uid] + $more);
    }

    // ─── nfc-cards: the answers pinned ─────────────────────────────────────

    public function test_link_answers_201_with_the_card_and_audits_it(): void
    {
        $response = $this->link($this->grace->id, '04:A2:B3:C4', ['card_type' => 'NTAG215'])->assertCreated();
        $this->assertSame(['message', 'card'], array_keys($response->json()));
        $response->assertJsonPath('message', 'NFC card linked')
            ->assertJsonPath('card.member_id', $this->grace->id)
            ->assertJsonPath('card.card_type', 'NTAG215')
            ->assertJsonPath('card.is_active', true)
            ->assertJsonPath('card.issued_by', $this->staffMember->id);
        $this->assertSame(1, AuditLog::where('action', 'nfc_card_linked')->where('subject_id', $response->json('card.id'))->count());

        $this->link($this->ada->id, '04 A2 B3 D5')->assertCreated()->assertJsonPath('card.card_type', 'standard');
    }

    public function test_link_refuses_a_card_active_for_another_member_or_already_this_ones_in_the_same_words(): void
    {
        $this->link($this->grace->id, '04:A2:B3:C4')->assertCreated();

        $this->link($this->ada->id, '04:A2:B3:C4')->assertStatus(422)->assertExactJson(['message' => 'This NFC card is already linked to a member']);
        $this->link($this->grace->id, '04:A2:B3:C4')->assertStatus(422)->assertExactJson(['message' => 'This NFC card is already linked to a member']);
        $this->assertSame(1, NfcCard::query()->count());
    }

    public function test_link_and_issue_refuse_a_request_without_a_member_or_an_id_as_laravel_does(): void
    {
        foreach (['nfc-cards', 'nfc/issue'] as $path) {
            $this->asStaffMember()->postJson($this->admin($path), ['uid' => '04A2B3C4'])->assertStatus(422)->assertJsonValidationErrors(['member_id']);
            $this->asStaffMember()->postJson($this->admin($path), ['member_id' => $this->ada->id])->assertStatus(422)->assertJsonValidationErrors(['uid']);
            $this->asStaffMember()->postJson($this->admin($path), ['member_id' => 999999999, 'uid' => '04A2B3C4'])->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        }
        $this->assertSame(0, NfcCard::query()->count());
    }

    // ─── nfc/issue: the answers pinned ─────────────────────────────────────

    public function test_issue_answers_201_switches_the_members_other_cards_off_notes_the_card_and_audits(): void
    {
        $old = NfcCard::create(['member_id' => $this->ada->id, 'uid' => '04aabbcc', 'is_active' => true, 'issued_at' => now()->subMonth()]);

        $response = $this->issue($this->ada->id, '04:A2:B3:C4')->assertCreated();
        $this->assertSame(['message', 'card'], array_keys($response->json()));
        $response->assertJsonPath('message', 'NFC card issued')
            ->assertJsonPath('card.member_id', $this->ada->id)
            ->assertJsonPath('card.card_type', 'NTAG215')
            ->assertJsonPath('card.is_active', true)
            ->assertJsonPath('card.issued_by', $this->staffMember->id);

        $this->assertFalse((bool) $old->fresh()->is_active);
        $ada = $this->ada->fresh();
        $this->assertNotNull($ada->nfc_uid);
        $this->assertNotNull($ada->nfc_card_issued_at);
        $this->assertSame(1, AuditLog::where('action', 'nfc_issued')->where('subject_id', $this->ada->id)->count());

        $this->issue($this->grace->id, '04:11:22:33', ['card_type' => 'MIFARE'])->assertCreated()->assertJsonPath('card.card_type', 'MIFARE');
    }

    public function test_issue_refuses_an_id_already_stored_as_laravel_does(): void
    {
        $this->issue($this->ada->id, '04A2B3C4')->assertCreated();

        $this->issue($this->grace->id, '04A2B3C4')->assertStatus(422)->assertJsonValidationErrors(['uid'])
            ->assertJsonPath('errors.uid.0', 'The uid has already been taken.');
        $this->assertSame(1, NfcCard::query()->count());
    }

    // ─── Release 6: NfcCards' normalisation and rules, in these answers ────

    /** A card of another organisation (or switched off here), written as a row would have been. */
    private function stored(int $memberId, string $uid, bool $active = true, ?int $org = null): NfcCard
    {
        $card = NfcCard::withoutGlobalScopes()->create(['member_id' => $memberId, 'uid' => $uid, 'is_active' => $active, 'issued_at' => now()->subMonth(), 'scan_count' => 4]);
        NfcCard::withoutGlobalScopes()->whereKey($card->id)->update(['organization_id' => $org ?? $this->org->id]);

        return NfcCard::withoutGlobalScopes()->findOrFail($card->id);
    }

    public function test_link_stores_the_id_normalised_and_leaves_the_members_qr_code_alone(): void
    {
        $this->grace->update(['qr_code_token' => hash('sha256', 'wallet-pass-fixture')]);

        $this->link($this->grace->id, '04:A2:B3:C4')->assertCreated()->assertJsonPath('card.uid', '04a2b3c4');
        $this->assertSame(hash('sha256', 'wallet-pass-fixture'), $this->grace->fresh()->qr_code_token);
        $this->assertSame('admin', AuditLog::where('action', 'nfc_card_linked')->latest('id')->first()->new_values['via']);

        // A decimal entry is converted, and the full admin's scan/nfc finds the card by the decimal and by the hex.
        $this->link($this->ada->id, '1304792892040951')->assertCreated()->assertJsonPath('card.uid', '04a2b3c4d5e6f7');
        $this->mock(\App\Services\OpenAiService::class, fn ($mock) => $mock->shouldReceive('suggestUpsell')->andReturn(''));
        foreach (['1304792892040951', '04:A2:B3:C4:D5:E6:F7', '04a2b3c4d5e6f7'] as $tap) {
            $this->asStaffMember()->postJson($this->admin('scan/nfc'), ['uid' => $tap])->assertOk()->assertJsonPath('member.id', $this->ada->id);
        }
    }

    public function test_a_card_stored_in_another_form_is_never_given_a_second_row(): void
    {
        $this->stored($this->grace->id, '04a2b3c4');

        foreach (['04-A2-B3-C4', '04 a2 b3 c4', '0077771716'] as $typed) {
            $this->link($this->ada->id, $typed)->assertStatus(422)->assertExactJson(['message' => 'This NFC card is already linked to a member']);
            $this->link($this->grace->id, $typed)->assertStatus(422)->assertExactJson(['message' => 'This NFC card is already linked to a member']);
            $this->issue($this->ada->id, $typed)->assertStatus(422)->assertJsonPath('errors.uid.0', 'The uid has already been taken.');
        }
        $this->assertSame(1, NfcCard::query()->count());
    }

    public function test_a_card_switched_off_here_is_linked_or_issued_again_on_its_own_row(): void
    {
        $off = $this->stored($this->grace->id, '04:A2:B3:C4', false);

        $this->link($this->ada->id, '04a2b3c4')->assertCreated()->assertJsonPath('message', 'NFC card linked')->assertJsonPath('card.id', $off->id);
        $card = $off->fresh();
        $this->assertSame([$this->ada->id, true, 0], [(int) $card->member_id, (bool) $card->is_active, (int) $card->scan_count]);
        $this->assertSame(1, NfcCard::query()->count());

        $again = $this->stored($this->ada->id, '04112233', false);
        $this->issue($this->grace->id, '04:11:22:33')->assertCreated()->assertJsonPath('message', 'NFC card issued')->assertJsonPath('card.id', $again->id);
        $this->assertSame([$this->grace->id, true], [(int) $again->fresh()->member_id, (bool) $again->fresh()->is_active]);
        $this->assertSame('04112233', $this->grace->fresh()->nfc_uid);
        $this->assertSame(2, NfcCard::query()->count());
    }

    public function test_another_organisations_card_is_refused_naming_nobody_and_nothing_is_written(): void
    {
        $other = $this->otherOrganization();
        $this->stored($other['member']->id, '04A2B3C4', true, $other['org']->id);
        $this->stored($other['member']->id, '04556677', false, $other['org']->id);
        $mine = $this->stored($this->ada->id, '04998877');

        foreach (['04:a2:b3:c4', '04-55-66-77'] as $theirs) {
            $this->link($this->grace->id, $theirs)->assertStatus(422)->assertExactJson(['message' => 'This NFC card cannot be linked here']);
            $this->issue($this->ada->id, $theirs)->assertStatus(422)->assertJsonPath('errors.uid.0', 'The uid has already been taken.');
        }
        $this->assertSame(1, NfcCard::query()->count());
        $this->assertTrue((bool) $mine->fresh()->is_active, 'a refused issue switches none of the member\'s cards off');
        $this->assertNull($this->ada->fresh()->nfc_uid);
    }

    public function test_what_is_no_card_id_and_another_organisations_member_are_field_errors(): void
    {
        foreach (['link', 'issue'] as $call) {
            $this->{$call}($this->ada->id, 'not-a-card')->assertStatus(422)->assertJsonPath('errors.uid.0', 'The uid is not an NFC card ID.');
            $this->{$call}($this->ada->id, '04a2b')->assertStatus(422)->assertJsonValidationErrors(['uid']);
        }
        $other = $this->otherOrganization();
        $this->link($other['member']->id, '04A2B3C4')->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        $this->issue($other['member']->id, '04A2B3C4')->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        $this->asStaffMember()->postJson($this->admin('nfc-cards'), ['member_id' => 'abc', 'uid' => '04A2B3C4'])->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        $this->assertSame(0, NfcCard::withoutGlobalScopes()->count());
    }

    public function test_issue_stores_the_id_normalised_and_notes_it_on_the_member(): void
    {
        $this->issue($this->ada->id, '04:A2:B3:C4')->assertCreated()->assertJsonPath('card.uid', '04a2b3c4');
        $this->assertSame('04a2b3c4', $this->ada->fresh()->nfc_uid);
        $this->assertSame(0, AuditLog::where('action', 'nfc_card_linked')->count(), 'issue keeps its own audit, nfc_issued');
    }
}
