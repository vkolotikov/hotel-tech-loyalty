<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;
use ZipArchive;

class PhysicalCardsTest extends TestCase
{
    use DatabaseTransactions, MembershipSchema, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        \Illuminate\Support\Facades\Mail::fake();
    }

    private function batch(string $first = '10001', string $last = '10003', string $prefix = 'AF'): int
    {
        return $this->asManager()->postJson($this->api('card-batches'), compact('prefix', 'first', 'last'))
            ->assertCreated()->json('batch.id');
    }

    private function stock(?int $batch = null): array
    {
        $url = $batch === null ? $this->api('physical-cards') : $this->api("physical-cards")."?batch_id={$batch}";

        return $this->asStaffMember()->getJson($url)->assertOk()->json('cards');
    }

    private function printedCode(int $card): string
    {
        return $this->asStaffMember()->getJson($this->api("physical-cards/{$card}/qr"))->assertOk()->json('code');
    }

    public function test_a_range_makes_printable_stock_without_creating_members(): void
    {
        $members = LoyaltyMember::query()->count();
        $batch = $this->batch('10001', '10100', 'af');
        $firstPage = $this->stock($batch);
        $this->assertSame(['AF 10001', null, 'unassigned', null], array_values(array_intersect_key(
            $firstPage[0], array_flip(['number', 'uid', 'status', 'member'])
        )));
        $this->assertSame($members, LoyaltyMember::query()->count());
        $this->assertEquals(100, DB::table('nfc_cards')->where('card_batch_id', $batch)->count());
        $this->assertTrue(DB::table('nfc_cards')->where('card_batch_id', $batch)->where('printed_number', 'AF 10100')->exists());

        $card = $firstPage[0]['id'];
        $qr = $this->asStaffMember()->getJson($this->api("physical-cards/{$card}/qr"))->assertOk();
        $this->assertStringStartsWith('HTCARD:PRINT:', $qr->json('code'));
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $qr->json('qr_svg'));
        $this->postJson($this->api('scan'), ['code' => $qr->json('code')])->assertNotFound();

        $download = $this->asManager()->get($this->api("card-batches/{$batch}/qr"))->assertOk()
            ->assertDownload("loyalty-cards-{$batch}.zip");
        $file = $download->baseResponse->getFile()->getPathname();
        try {
            $zip = new ZipArchive();
            $this->assertTrue($zip->open($file));
            $this->assertSame(101, $zip->numFiles);
            $this->assertSame(base64_decode(explode(',', $qr->json('qr_svg'), 2)[1]), $zip->getFromName('AF 10001.svg'));
            $this->assertStringContainsString($qr->json('code'), $zip->getFromName('cards.csv'));
            $zip->close();
        } finally {
            unlink($file);
        }
    }

    public function test_retry_and_overlapping_ranges_keep_the_original_codes(): void
    {
        $batch = $this->batch('0001', '0003');
        $row = $this->stock($batch)[0];
        $code = $this->printedCode($row['id']);
        $this->assertSame('AF 0001', $row['number']);

        $this->asManager()->postJson($this->api('card-batches'), ['prefix' => 'af', 'first' => '0001', 'last' => '0003'])
            ->assertOk()->assertJsonPath('batch.id', $batch);
        $this->asManager()->postJson($this->api('card-batches'), ['prefix' => 'AF', 'first' => '0003', 'last' => '0005'])
            ->assertConflict()->assertJsonPath('error', 'card_number_exists');
        $this->asManager()->postJson($this->api('card-batches'), ['prefix' => 'AF', 'first' => '1', 'last' => '501'])
            ->assertUnprocessable()->assertJsonPath('error', 'bad_range');

        $this->assertCount(3, $this->stock());
        $this->assertSame($code, $this->printedCode($row['id']));
    }

    public function test_nfc_can_be_reserved_and_the_same_printed_qr_follows_each_assignment(): void
    {
        $batch = $this->batch();
        [$first, $second] = $this->stock($batch);
        $id = $first['id'];
        $code = $this->printedCode($id);
        $personal = $this->ada->fresh()->qr_code_token;

        $this->asStaffMember()->putJson($this->api("physical-cards/{$id}/nfc"), ['uid' => '04:A2:B3:C4', 'expected_uid' => null])
            ->assertOk()->assertJsonPath('card.uid', '04a2b3c4')->assertJsonPath('next.id', $second['id']);
        $this->putJson($this->api("physical-cards/{$id}/nfc"), ['uid' => '04:a2:ff:ff', 'expected_uid' => null])
            ->assertConflict()->assertJsonPath('error', 'card_changed');
        $this->putJson($this->api("physical-cards/{$second['id']}/nfc"), ['uid' => 'C4:B3:A2:04', 'expected_uid' => null])
            ->assertConflict()->assertJsonPath('error', 'card_in_use');
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:04a2b3c4'])->assertNotFound();

        $this->putJson($this->api("physical-cards/{$id}/assignment"), ['member_id' => $this->ada->id])
            ->assertOk()->assertJsonPath('card.member.id', $this->ada->id);
        $this->putJson($this->api("physical-cards/{$id}/assignment"), ['member_id' => $this->grace->id])
            ->assertConflict()->assertJsonPath('error', 'card_in_use');
        $this->putJson($this->api("physical-cards/{$id}/nfc"), ['uid' => '04:a2:ff:ff', 'expected_uid' => null])
            ->assertConflict()->assertJsonPath('error', 'card_in_use');

        foreach ([$code, 'HTCARD:04a2b3c4'] as $lookup) {
            $this->postJson($this->api('scan'), ['code' => $lookup])->assertOk()->assertJsonPath('member.id', $this->ada->id);
        }
        $this->assertSame($personal, $this->ada->fresh()->qr_code_token);

        $this->postJson($this->api("members/{$this->ada->id}/cards/{$id}/off"))->assertOk();
        $this->postJson($this->api('scan'), ['code' => $code])->assertNotFound();
        $this->putJson($this->api("physical-cards/{$id}/assignment"), ['member_id' => $this->grace->id])->assertOk();
        $this->getJson($this->api("members/{$this->grace->id}/cards/{$id}/qr"))
            ->assertOk()->assertJsonPath('code', $code);
        $this->postJson($this->api('scan'), ['code' => $code])->assertOk()->assertJsonPath('member.id', $this->grace->id);
    }

    public function test_staff_permissions_and_organisation_boundaries_apply_to_every_card(): void
    {
        $batch = $this->batch();
        $card = $this->stock($batch)[0]['id'];
        $other = $this->otherOrganization();

        $this->asStaffMember()->postJson($this->api('card-batches'), ['prefix' => 'AF', 'first' => '20', 'last' => '25'])->assertForbidden();
        $this->get($this->api("card-batches/{$batch}/qr"))->assertForbidden();
        $this->putJson($this->api("physical-cards/{$card}/assignment"), ['member_id' => $other['member']->id])
            ->assertUnprocessable()->assertJsonValidationErrors('member_id');

        $code = $this->printedCode($card);
        $this->putJson($this->api("physical-cards/{$card}/nfc"), ['uid' => '04:a2:b3:c4', 'expected_uid' => null])->assertOk();

        $this->actingAs($this->staffUser($other['org']), 'sanctum')->getJson($this->api("physical-cards/{$card}/qr"))->assertNotFound();
        $this->postJson($this->api('scan'), ['code' => $code])->assertNotFound();
        $this->getJson($this->api('physical-cards'))->assertOk()->assertJsonCount(0, 'cards');

        // The printed serial belongs to the organisation, but a tag may be registered only once across the platform.
        $this->postJson($this->api('card-batches'), ['prefix' => 'AF', 'first' => '10001', 'last' => '10003'])->assertCreated();
        $foreign = $this->getJson($this->api('physical-cards'))->assertOk()->json('cards.0.id');
        $this->putJson($this->api("physical-cards/{$foreign}/nfc"), ['uid' => 'c4:b3:a2:04', 'expected_uid' => null])
            ->assertConflict()->assertJsonPath('error', 'card_elsewhere');
    }

    public function test_creating_a_member_and_assigning_the_card_succeed_or_fail_together(): void
    {
        $batch = $this->batch();
        $id = $this->stock($batch)[0]['id'];
        $body = ['name' => 'Card Recipient', 'email' => 'stock-recipient@example.test', 'physical_card_id' => $id, 'send_welcome' => false];

        $member = $this->postJson($this->api('members'), $body)->assertCreated()->json('member.id');
        $this->assertSame($member, $this->stock($batch)[0]['member']['id']);

        $otherEmail = 'second-stock-recipient@example.test';
        $this->postJson($this->api('members'), array_replace($body, ['email' => $otherEmail]))
            ->assertConflict()->assertJsonPath('error', 'card_in_use');
        $this->assertFalse(User::query()->where('email', $otherEmail)->exists());
    }

    public function test_erasing_a_member_unassigns_numbered_stock_and_rejects_its_old_assignment(): void
    {
        $batch = $this->batch();
        $id = $this->stock($batch)[0]['id'];
        $code = $this->printedCode($id);
        $this->putJson($this->api("physical-cards/{$id}/assignment"), ['member_id' => $this->ada->id])->assertOk();

        $this->asManager()->postJson($this->api("members/{$this->ada->id}/erase"), ['confirm_name' => $this->ada->user->name])->assertOk();
        $row = $this->stock($batch)[0];
        $this->assertSame($id, $row['id']);
        $this->assertSame('unassigned', $row['status']);
        $this->assertNull($row['member']);
        $this->assertSame($code, $this->printedCode($id));
        $this->postJson($this->api('scan'), ['code' => $code])->assertNotFound();
    }

    public function test_nfc_workflow_pairs_and_assigns_existing_and_new_members_in_one_write(): void
    {
        $batch = $this->batch();
        [$first, $second, $third] = $this->stock($batch);
        $tag = ['uid' => '04:39:AB:CD:12:34:56', 'expected_uid' => null];

        $this->asStaffMember()->putJson($this->api("physical-cards/{$first['id']}/assignment"), $tag + ['member_id' => $this->ada->id])
            ->assertOk()->assertJsonPath('card.uid', '0439abcd123456')->assertJsonPath('card.member.id', $this->ada->id);
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:0439abcd123456'])->assertOk()->assertJsonPath('member.id', $this->ada->id);
        $this->putJson($this->api("physical-cards/{$second['id']}/assignment"), $tag + ['member_id' => $this->grace->id])
            ->assertConflict()->assertJsonPath('error', 'card_in_use');
        $this->assertNull($this->stock($batch)[1]['member']);

        $body = [
            'name' => 'New tag recipient', 'email' => 'tag-recipient@example.test', 'send_welcome' => false,
            'physical_card_id' => $third['id'], 'physical_card_uid' => $tag['uid'], 'physical_card_expected_uid' => null,
        ];
        $this->postJson($this->api('members'), $body)->assertConflict()->assertJsonPath('error', 'card_in_use');
        $this->assertFalse(User::query()->where('email', $body['email'])->exists());
        $member = $this->postJson($this->api('members'), array_replace($body, ['physical_card_uid' => '04:22:43:FE:ED:02:0A']))
            ->assertCreated()->json('member.id');
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:042243feed020a'])->assertOk()->assertJsonPath('member.id', $member);
    }

    public function test_nfc_workflow_releases_a_tag_in_its_home_company_and_keeps_its_printed_qr(): void
    {
        $source = $this->stock($this->batch())[0]['id'];
        $print = $this->printedCode($source);
        $uid = '04:FE:AB:CD:12:34:56';
        $this->putJson($this->api("physical-cards/{$source}/nfc"), ['uid' => $uid, 'expected_uid' => null])->assertOk();
        $this->putJson($this->api("physical-cards/{$source}/assignment"), ['member_id' => $this->ada->id])->assertOk();
        $release = $this->api("physical-cards/{$source}/nfc");
        $this->asStaffMember()->deleteJson($release, ['expected_uid' => $uid])->assertForbidden();
        $this->asManager()->deleteJson($release, ['expected_uid' => '04:FE:AB:CD:12:34:55'])
            ->assertConflict()->assertJsonPath('error', 'card_changed');

        $other = $this->otherOrganization();
        $otherManager = $this->staffUser($other['org']);
        $this->actingAs($otherManager, 'sanctum')->postJson($this->api('physical-cards/tag-lookup'), ['uid' => $uid])
            ->assertOk()->assertJsonCount(0, 'cards');
        $this->deleteJson($release, ['expected_uid' => $uid])->assertNotFound();
        $this->postJson($this->api('card-batches'), ['prefix' => 'AE', 'first' => '00001', 'last' => '00001'])->assertCreated();
        $target = $this->getJson($this->api('physical-cards'))->assertOk()->json('cards.0.id');
        $move = ['member_id' => $other['member']->id, 'uid' => $uid, 'expected_uid' => null];
        $this->putJson($this->api("physical-cards/{$target}/assignment"), $move)
            ->assertConflict()->assertJsonPath('error', 'card_elsewhere')->assertJsonMissingPath('source_company');

        config(['services.saas.platform_admin_emails' => $otherManager->email]);
        $otherManager->forceFill(['email_verified_at' => null])->save();
        $this->putJson($this->api("physical-cards/{$target}/assignment"), $move)
            ->assertConflict()->assertJsonMissingPath('source_company');
        $otherManager->forceFill(['email_verified_at' => now()])->save();
        $this->putJson($this->api("physical-cards/{$target}/assignment"), $move)
            ->assertConflict()->assertJsonPath('source_company', $this->org->name)->assertJsonMissingPath('member');
        $this->deleteJson($release, ['expected_uid' => $uid])->assertNotFound();
        $this->postJson($this->api('physical-cards/tag-lookup'), ['uid' => $uid])->assertOk()->assertJsonCount(0, 'cards');

        $this->asManager()->postJson($this->api('physical-cards/tag-lookup'), ['uid' => $uid])
            ->assertOk()->assertJsonPath('cards.0.id', $source)->assertJsonPath('cards.0.number', 'AF 10001');
        $this->deleteJson($release, ['expected_uid' => $uid])->assertNoContent();
        $this->deleteJson($release, ['expected_uid' => $uid])->assertNoContent();
        $this->postJson($this->api('scan'), ['code' => $print])->assertOk()->assertJsonPath('member.id', $this->ada->id);
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:'.$uid])->assertNotFound();
        $this->assertDatabaseHas('audit_logs', ['action' => 'nfc_tag_released', 'subject_id' => $source]);

        $this->actingAs($otherManager, 'sanctum')->putJson($this->api("physical-cards/{$target}/assignment"), $move)
            ->assertOk()->assertJsonPath('card.member.id', $other['member']->id);
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:'.$uid])->assertOk()->assertJsonPath('member.id', $other['member']->id);
    }

    public function test_nfc_workflow_allows_managers_to_correct_an_issued_tag_in_place(): void
    {
        $id = $this->stock($this->batch())[0]['id'];
        $this->asStaffMember()->putJson($this->api("physical-cards/{$id}/nfc"), ['uid' => '02:09:20:00:50:01', 'expected_uid' => null])->assertOk();
        $this->putJson($this->api("physical-cards/{$id}/assignment"), ['member_id' => $this->ada->id])->assertOk();

        $change = ['uid' => '04:12:AB:CD:12:34:56', 'expected_uid' => '020920005001', 'replace_active' => true];
        $this->putJson($this->api("physical-cards/{$id}/nfc"), $change)->assertForbidden();
        $this->asManager()->putJson($this->api("physical-cards/{$id}/nfc"), $change)->assertOk()
            ->assertJsonPath('card.uid', '0412abcd123456')->assertJsonPath('card.member.id', $this->ada->id);
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:020920005001'])->assertNotFound();
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:0412abcd123456'])->assertOk()->assertJsonPath('member.id', $this->ada->id);
    }

    public function test_nfc_workflow_can_release_an_older_unnumbered_registration(): void
    {
        $uid = '04:86:AB:CD';
        $id = $this->asManager()->postJson($this->api("members/{$this->ada->id}/cards"), ['uid' => $uid])
            ->assertCreated()->json('card.id');
        $this->postJson($this->api('physical-cards/tag-lookup'), ['uid' => $uid])->assertOk()
            ->assertJsonPath('cards.0.id', $id)->assertJsonPath('cards.0.number', null);
        $this->deleteJson($this->api("physical-cards/{$id}/nfc"), ['expected_uid' => $uid])->assertNoContent();
        $this->getJson($this->api("members/{$this->ada->id}/cards"))->assertOk()->assertJsonCount(0, 'cards');
        $this->postJson($this->api('scan'), ['code' => 'HTCARD:'.$uid])->assertNotFound();
        $this->assertDatabaseHas('nfc_cards', ['id' => $id, 'member_id' => $this->ada->id, 'uid' => null, 'is_active' => false]);
    }
}
