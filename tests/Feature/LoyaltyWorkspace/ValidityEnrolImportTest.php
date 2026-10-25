<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\Members\ImportProblems;
use App\Services\Loyalty\Members\MemberEnrolment;
use App\Services\Loyalty\Members\MembershipValidity;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A membership's end date given when a member joins (release 8, spec 2026-10-25 §3): an enrolment's optional
 * `valid_until` (the venue's today or later) and an import's optional `valid_until` column (YYYY-MM-DD; a bad one is a
 * row problem like the others, by code; a past one comes in as the member's history: expired). Both written through
 * MembershipValidity, never the model's date cast; no date means the membership never ends.
 */
class ValidityEnrolImportTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildValiditySchema();
        Mail::fake();
        Storage::fake();
    }

    private function enrol(string $email, ?string $validUntil): LoyaltyMember
    {
        return app(MemberEnrolment::class)->enrol(['name' => 'New Member', 'email' => $email, 'valid_until' => $validUntil], $this->manager, false)['member'];
    }

    public function test_an_enrolment_starts_with_the_end_date_given_or_none(): void
    {
        $member = $this->enrol('dated@example.test', '2027-10-04');
        $this->assertSame('2027-10-04', DB::table('loyalty_members')->where('id', $member->id)->value('membership_valid_until'));
        $this->assertSame(['valid_until' => '2027-10-04', 'state' => 'active'], MembershipValidity::summaryFor($member->fresh()));

        $plain = $this->enrol('plain@example.test', null);
        $this->assertNull(DB::table('loyalty_members')->where('id', $plain->id)->value('membership_valid_until'));
    }

    public function test_an_enrolment_with_a_past_or_unreadable_date_adds_nobody(): void
    {
        foreach (['2026-10-04', '2027-02-30', 'next year'] as $date) {
            try {
                $this->enrol("nope-{$date}@example.test", $date);
                $this->fail("{$date} was taken");
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('valid_until', $e->errors(), $date);
            }
        }
        $this->assertSame(0, DB::table('users')->where('email', 'like', 'nope-%')->count());
    }

    public function test_an_import_reads_the_valid_until_column_and_names_a_bad_one_by_code(): void
    {
        $csv = "name,email,Valid until\n"
            . "Alan Turing,alan@example.test,2027-06-30\n"
            . "Kurt Gödel,kurt@example.test,30/06/2027\n"
            . "Emmy Noether,emmy@example.test,\n"
            . "Old Timer,old@example.test,2025-01-31\n";

        $upload = $this->asManager()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent('club.csv', $csv)], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('preview.columns_used', ['name', 'email', 'valid_until'])
            ->assertJsonPath('preview.new', 3)
            ->assertJsonPath('preview.refused', 1);
        $this->assertSame([['line' => 3, 'email' => 'kurt@example.test', 'kind' => 'refused', 'code' => 'bad_valid_until']], $upload->json('preview.problems'));
        $this->assertStringNotContainsString('YYYY-MM-DD', $upload->getContent());

        $this->asManager()->postJson($this->api('members/imports/' . $upload->json('batch.id') . '/run'))->assertOk()
            ->assertJsonPath('batch.created', 3)->assertJsonPath('batch.refused', 1);

        $end = fn (string $email) => DB::table('loyalty_members')->join('users', 'users.id', '=', 'loyalty_members.user_id')
            ->where('users.email', $email)->value('loyalty_members.membership_valid_until');
        $this->assertSame('2027-06-30', $end('alan@example.test'));
        $this->assertNull($end('emmy@example.test'));
        $this->assertSame('2025-01-31', $end('old@example.test'));
        $this->assertSame(0, DB::table('users')->where('email', 'kurt@example.test')->count());

        $old = LoyaltyMember::query()->whereHas('user', fn ($q) => $q->where('email', 'old@example.test'))->firstOrFail();
        $this->assertSame('expired', MembershipValidity::summaryFor($old)['state']);
    }

    public function test_the_column_is_one_an_import_understands_and_its_sentence_has_a_code(): void
    {
        $this->assertContains('valid_until', ImportProblems::columns());
        $this->assertSame('bad_valid_until', ImportProblems::of(['status' => 'error', 'reason' => "The membership end date '31.12.27' is not a day written YYYY-MM-DD"])['code']);
    }
}
