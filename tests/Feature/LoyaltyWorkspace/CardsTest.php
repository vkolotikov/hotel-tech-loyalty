<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\NfcCard;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A member's NFC cards (release 5, spec 2026-10-23 §3, R5-2): list, link, switch off, for every staff member, only
 * ever in this organisation. The tests build production's `nfc_cards_uid_unique` (one ID across every organisation),
 * which the SQLite schema lacks, so they fail the way PostgreSQL would.
 */
class CardsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (!Schema::hasIndex('nfc_cards', 'nfc_cards_uid_unique')) {
            Schema::table('nfc_cards', fn ($t) => $t->unique('uid', 'nfc_cards_uid_unique'));
        }
    }

    private function link(int $memberId, string $uid)
    {
        return $this->asStaffMember()->postJson($this->api("members/{$memberId}/cards"), ['uid' => $uid]);
    }

    private function card(int $memberId, string $uid, bool $active = true, ?int $org = null): NfcCard
    {
        $card = NfcCard::withoutGlobalScopes()->create(['member_id' => $memberId, 'uid' => $uid, 'is_active' => $active, 'issued_at' => now()->subMonth()]);
        NfcCard::withoutGlobalScopes()->whereKey($card->id)->update(['organization_id' => $org ?? $this->org->id]);

        return NfcCard::withoutGlobalScopes()->findOrFail($card->id);
    }

    public function test_the_routes_are_every_staff_members_as_edit_details(): void
    {
        foreach (['GET api/v1/admin/loyalty/members/5/cards', 'POST api/v1/admin/loyalty/members/5/cards', 'POST api/v1/admin/loyalty/members/5/cards/9/off'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $rule = AccessMap::ruleFor(Route::getRoutes()->match(Request::create('/' . $uri, $method)));
            $this->assertSame(['admin/loyalty/members/{id}/cards', 'staff', 'staff', 'loyalty'], [$rule->key, $rule->read, $rule->change, $rule->product], $call);
        }
    }

    public function test_linking_stores_the_id_normalised_audits_and_leaves_the_qr_code_alone(): void
    {
        $this->ada->update(['qr_code_token' => hash('sha256', 'wallet-pass-fixture')]);

        $response = $this->link($this->ada->id, '04:A2:B3:C4')->assertCreated()
            ->assertJsonPath('linked', true)
            ->assertJsonPath('card.uid', '04a2b3c4')
            ->assertJsonPath('card.is_active', true)
            ->assertJsonPath('card.scans', 0)
            ->assertJsonPath('card.last_used_at', null);

        $card = NfcCard::query()->findOrFail($response->json('card.id'));
        $this->assertSame(['04a2b3c4', $this->ada->id, $this->staffMember->id, $this->org->id], [$card->uid, (int) $card->member_id, (int) $card->issued_by, (int) $card->organization_id]);
        $this->assertSame(hash('sha256', 'wallet-pass-fixture'), $this->ada->fresh()->qr_code_token);
        $this->assertSame(1, AuditLog::where('action', 'nfc_card_linked')->where('subject_id', $card->id)->count());

        // A decimal entry is converted; the scan then finds the member by the card.
        $this->link($this->grace->id, '1304792892040951')->assertCreated()->assertJsonPath('card.uid', '04a2b3c4d5e6f7');
        $this->asStaffMember()->postJson($this->api('scan'), ['code' => '04:a2:b3:c4:d5:e6:f7'])->assertOk()->assertJsonPath('member.id', $this->grace->id);
    }

    public function test_the_same_card_again_for_the_same_member_changes_nothing(): void
    {
        $this->link($this->ada->id, '04a2b3c4')->assertCreated();
        $this->link($this->ada->id, '04 A2 B3 C4')->assertOk()->assertJsonPath('linked', false)->assertJsonPath('card.uid', '04a2b3c4');

        $this->assertSame(1, NfcCard::query()->count());
        $this->assertSame(1, AuditLog::where('action', 'nfc_card_linked')->count());
    }

    public function test_a_card_another_member_here_has_is_refused_naming_nobody(): void
    {
        $this->card($this->grace->id, '04:A2:B3:C4');

        $this->link($this->ada->id, '04a2b3c4')->assertStatus(409)
            ->assertExactJson(['error' => 'card_in_use', 'message' => 'This card is linked to another member.']);
        // Read in the other byte order (a decimal reader's), it is the same card.
        $this->link($this->ada->id, (string) hexdec('c4b3a204'))->assertStatus(409)->assertJsonPath('error', 'card_in_use');
        $this->assertSame(0, NfcCard::query()->where('member_id', $this->ada->id)->count());
    }

    public function test_a_card_switched_off_here_is_linked_again_on_its_own_row(): void
    {
        $old = $this->card($this->grace->id, '04:A2:B3:C4', false);
        NfcCard::query()->whereKey($old->id)->update(['scan_count' => 7, 'last_scanned_at' => now()->subDay(), 'last_scanned_by' => $this->manager->id]);

        $this->link($this->ada->id, '04a2b3c4')->assertCreated()
            ->assertJsonPath('linked', true)
            ->assertJsonPath('card.id', $old->id)
            ->assertJsonPath('card.scans', 0)
            ->assertJsonPath('card.last_used_at', null);

        $card = $old->fresh();
        $this->assertSame([$this->ada->id, true, '04:A2:B3:C4'], [(int) $card->member_id, (bool) $card->is_active, $card->uid]);
        $this->assertSame(1, NfcCard::withoutGlobalScopes()->count());
        $audit = AuditLog::where('action', 'nfc_card_linked')->where('subject_id', $old->id)->firstOrFail();
        $this->assertSame($this->grace->id, $audit->old_values['member_id']);

        // The member's own card switched off and on again keeps its history.
        NfcCard::query()->whereKey($old->id)->update(['is_active' => false, 'scan_count' => 3]);
        $this->link($this->ada->id, '04:a2:b3:c4')->assertCreated()->assertJsonPath('card.scans', 3);
    }

    public function test_a_card_another_organisation_knows_is_refused_without_saying_whose(): void
    {
        $other = $this->otherOrganization();
        $this->card($other['member']->id, '04E1E2E3', true, $other['org']->id);
        $this->card($other['member']->id, '04f1f2f3', false, $other['org']->id);

        foreach (['04:e1:e2:e3', '04F1F2F3', (string) hexdec('04e1e2e3')] as $uid) {
            $this->link($this->ada->id, $uid)->assertStatus(409)
                ->assertExactJson(['error' => 'card_elsewhere', 'message' => 'This card cannot be linked here.']);
        }
        $this->assertSame(0, NfcCard::query()->count());
    }

    public function test_a_card_stored_a_moment_before_by_someone_else_is_answered_by_the_rule_not_the_violation(): void
    {
        // Another desk stores the card just after this link looked for it and before it inserts.
        $graceId = $this->grace->id;
        $done = false;
        DB::listen(function (QueryExecuted $query) use (&$done, $graceId) {
            // The link's own look-up: every organisation's cards by the normalised ID (CodeReader::UID_SQL).
            if (!$done && str_starts_with(strtolower($query->sql), 'select') && str_contains($query->sql, 'nfc_cards') && str_contains($query->sql, 'LOWER(REPLACE(')) {
                $done = true;
                DB::table('nfc_cards')->insert(['organization_id' => $this->org->id, 'member_id' => $graceId, 'uid' => '04998877', 'card_type' => 'standard', 'is_active' => true, 'scan_count' => 0, 'created_at' => now(), 'updated_at' => now()]);
            }
        });

        $this->link($this->ada->id, '04:99:88:77')->assertStatus(409)->assertJsonPath('error', 'card_in_use');
        $this->assertSame([$graceId], NfcCard::query()->pluck('member_id')->map(fn ($id) => (int) $id)->all());
    }

    public function test_what_is_no_card_id_and_a_deleted_or_another_organisations_member_are_refused(): void
    {
        foreach (['LS-001001', '04a2b', '1234'] as $uid) {
            $this->link($this->ada->id, $uid)->assertStatus(422)->assertJsonPath('error', 'bad_uid');
        }
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/cards"), [])->assertStatus(422)->assertJsonValidationErrors('uid');

        $this->ada->user->update(['email' => "deleted-member-{$this->ada->id}@deleted.local"]);
        $this->link($this->ada->id, '04a2b3c4')->assertStatus(409)->assertJsonPath('error', 'already_erased');

        $other = $this->otherOrganization();
        $this->link($other['member']->id, '04a2b3c4')->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->getJson($this->api("members/{$other['member']->id}/cards"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame(0, NfcCard::withoutGlobalScopes()->count());
    }

    public function test_the_list_shows_the_members_cards_active_first_and_nobody_elses(): void
    {
        $off = $this->card($this->ada->id, '04:11:22:33', false);
        $on = $this->card($this->ada->id, '04AABBCC');
        NfcCard::query()->whereKey($on->id)->update(['scan_count' => 4, 'last_scanned_at' => now()->subHour()]);
        $this->card($this->grace->id, '04DDEEFF');

        $response = $this->asStaffMember()->getJson($this->api("members/{$this->ada->id}/cards"))->assertOk();

        $this->assertSame([$on->id, $off->id], array_column($response->json('cards'), 'id'));
        $response->assertJsonPath('cards.0.uid', '04aabbcc')
            ->assertJsonPath('cards.0.is_active', true)
            ->assertJsonPath('cards.0.scans', 4)
            ->assertJsonPath('cards.0.last_used_at', now()->subHour()->toIso8601String())
            ->assertJsonPath('cards.0.linked_at', now()->subMonth()->toIso8601String())
            ->assertJsonPath('cards.1.uid', '04112233')
            ->assertJsonPath('cards.1.is_active', false);
        $this->assertSame(['id', 'uid', 'is_active', 'linked_at', 'last_used_at', 'scans'], array_keys($response->json('cards.0')));
    }

    public function test_switching_off_audits_once_and_the_scan_then_says_the_card_is_off(): void
    {
        $card = $this->card($this->ada->id, '04AABBCC');

        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/cards/{$card->id}/off"))->assertOk()->assertJsonPath('card.is_active', false);
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/cards/{$card->id}/off"))->assertOk()->assertJsonPath('card.is_active', false);
        $this->assertSame(1, AuditLog::where('action', 'nfc_deactivated')->where('subject_id', $this->ada->id)->count());

        $this->asStaffMember()->postJson($this->api('scan'), ['code' => '04aabbcc'])->assertStatus(404)->assertJsonPath('error', 'inactive')->assertJsonPath('card', 'off');
    }

    public function test_only_the_members_own_card_can_be_switched_off(): void
    {
        $graces = $this->card($this->grace->id, '04DDEEFF');
        $other = $this->otherOrganization();
        $theirs = $this->card($other['member']->id, '04E1E2E3', true, $other['org']->id);

        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/cards/{$graces->id}/off"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/cards/{$theirs->id}/off"))->assertStatus(404);
        $this->asStaffMember()->postJson($this->api("members/{$other['member']->id}/cards/{$theirs->id}/off"))->assertStatus(404);

        $this->assertTrue((bool) $graces->fresh()->is_active);
        $this->assertTrue((bool) NfcCard::withoutGlobalScopes()->find($theirs->id)->is_active);
        $this->assertSame(0, AuditLog::where('action', 'nfc_deactivated')->count());
    }

    public function test_a_manager_may_do_it_too(): void
    {
        $this->actingAs($this->manager, 'sanctum')->postJson($this->api("members/{$this->grace->id}/cards"), ['uid' => '04:12:34:56'])->assertCreated();
    }
}
