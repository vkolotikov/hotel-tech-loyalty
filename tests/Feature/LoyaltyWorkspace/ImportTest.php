<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\LoyaltyMember;
use App\Models\MemberImportBatch;
use App\Services\Loyalty\Members\ImportProblems;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Member import in the workspace (spec 2026-10-21 release 2 §4.1, §4.2): a manager's; the preview in codes, never the
 * service's English; a run a chunk at a time under the batch's lock, a stale or second caller answered `busy`;
 * Cancel; the past imports of every brand; the stored file deleted once a batch is finished.
 */
class ImportTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        Storage::fake();
    }

    private function upload(string $csv, string $name = 'guests.csv'): TestResponse
    {
        return $this->asManager()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent($name, $csv)], ['Accept' => 'application/json']);
    }

    private function rows(int $n): string
    {
        $lines = ['name,email,points'];
        for ($i = 1; $i <= $n; $i++) {
            $lines[] = "Guest {$i},guest{$i}@example.test,10";
        }

        return implode("\n", $lines) . "\n";
    }

    public function test_the_preview_counts_new_and_existing_rows_and_names_each_problem_by_code(): void
    {
        $csv = "First Name,Surname,E-mail,Points,Tier,Shoe size\n"
            . "Alan,Turing,alan@example.test,1200,Gold,44\n"
            . "Ada,Again,{$this->ada->user->email},10,,40\n"
            . "No,Mail,,5,,40\n"
            . "Kurt,Gödel,kurt@example.test,0,Diamond,42\n"
            . "Alan,Twice,alan@example.test,3,,41\n";

        $response = $this->upload($csv)->assertOk()
            ->assertJsonPath('batch.state', 'pending')
            ->assertJsonPath('batch.filename', 'guests.csv')
            ->assertJsonPath('batch.rows', 5)
            ->assertJsonPath('batch.finished', false)
            ->assertJsonPath('batch.by', 'Staff')
            ->assertJsonPath('preview.rows', 5)
            ->assertJsonPath('preview.new', 1)
            ->assertJsonPath('preview.existing', 1)
            ->assertJsonPath('preview.skipped', 1)
            ->assertJsonPath('preview.refused', 2)
            ->assertJsonPath('preview.points', 1200)
            ->assertJsonPath('preview.columns_used', ['first_name', 'last_name', 'email', 'points', 'tier_name'])
            ->assertJsonPath('preview.columns_ignored', ['Shoe size'])
            ->assertJsonPath('preview.sample', [['line' => 2, 'email' => 'alan@example.test', 'tier' => 'Gold', 'points' => 1200]])
            ->assertJsonPath('preview.plan_limit', null);

        $this->assertSame([
            ['line' => 3, 'email' => $this->ada->user->email, 'kind' => 'skipped', 'code' => 'already_member'],
            ['line' => 4, 'email' => '', 'kind' => 'refused', 'code' => 'no_email'],
            ['line' => 5, 'email' => 'kurt@example.test', 'kind' => 'refused', 'code' => 'unknown_tier', 'tier' => 'Diamond'],
            ['line' => 6, 'email' => 'alan@example.test', 'kind' => 'skipped', 'code' => 'repeated', 'first_line' => 2],
        ], $response->json('preview.problems'));
        $this->assertStringNotContainsString('Already a member', $response->getContent());
        $this->assertSame(0, LoyaltyMember::query()->where('member_number', 'like', 'HL-%')->count());
    }

    public function test_a_file_that_cannot_be_imported_is_refused_by_code(): void
    {
        $this->upload("name,Contact\nAlan,alan@example.test\n")->assertStatus(422)
            ->assertJsonPath('error', 'no_email_column')->assertJsonPath('columns', ['Contact']);
        $this->upload("name,email\n")->assertStatus(422)->assertJsonPath('error', 'no_rows');
        $this->upload("\n\n")->assertStatus(422)->assertJsonPath('error', 'file_empty');
        $this->asManager()->post($this->api('members/imports'), [], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('file');
        $this->assertSame(0, MemberImportBatch::query()->count());
    }

    public function test_the_run_goes_a_chunk_at_a_time_and_a_stale_caller_hears_busy(): void
    {
        $id = $this->upload($this->rows(130))->json('batch.id');

        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 0])->assertOk()
            ->assertJsonPath('batch.state', 'running')
            ->assertJsonPath('batch.processed', 100)
            ->assertJsonPath('batch.created', 100)
            ->assertJsonPath('batch.progress', 76);

        // A second press that saw the batch at the start: nothing is imported twice.
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 0])->assertStatus(409)
            ->assertJsonPath('error', 'busy')->assertJsonPath('batch.processed', 100);
        $this->assertSame(100, LoyaltyMember::query()->where('member_number', 'like', 'HL-%')->count());

        $stored = MemberImportBatch::query()->findOrFail($id)->stored_path;
        $this->assertFileExists($stored);

        $this->asManager()->postJson($this->api("members/imports/{$id}/run"))->assertOk()
            ->assertJsonPath('batch.state', 'completed')
            ->assertJsonPath('batch.finished', true)
            ->assertJsonPath('batch.processed', 130)
            ->assertJsonPath('batch.created', 130)
            ->assertJsonPath('batch.points', 1300)
            ->assertJsonPath('batch.problems', []);
        $this->assertSame(130, LoyaltyMember::query()->where('member_number', 'like', 'HL-%')->count());
        $this->assertSame(1, AuditLog::where('action', 'members_bulk_import')->count());
        $this->assertFileDoesNotExist($stored);

        // Finished: another press answers as it stands.
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 0])->assertOk()->assertJsonPath('batch.created', 130);
        $this->assertSame(1, AuditLog::where('action', 'members_bulk_import')->count());

        // The full admin still reads the batch.
        $uuid = MemberImportBatch::query()->findOrFail($id)->uuid;
        $this->asManager()->getJson(rtrim((string) config('app.url'), '/') . "/api/v1/admin/members/imports/{$uuid}")
            ->assertOk()->assertJsonPath('batch.ok', 130)->assertJsonPath('batch.status', 'completed');
    }

    public function test_the_rows_refused_during_the_run_come_back_as_codes(): void
    {
        $id = $this->upload("name,email\nAlan Turing,alan@example.test\nAlan Again,alan@example.test\nNo Mail,\n")->json('batch.id');

        $this->asManager()->postJson($this->api("members/imports/{$id}/run"))->assertOk()
            ->assertJsonPath('batch.created', 1)
            ->assertJsonPath('batch.skipped', 1)
            ->assertJsonPath('batch.refused', 1)
            ->assertJsonPath('batch.problems', [
                ['line' => 3, 'email' => 'alan@example.test', 'kind' => 'skipped', 'code' => 'repeated', 'first_line' => 2],
                ['line' => 4, 'email' => '', 'kind' => 'refused', 'code' => 'no_email'],
            ]);
        $this->asManager()->getJson($this->api("members/imports/{$id}"))->assertOk()->assertJsonPath('batch.problems.1.code', 'no_email');
    }

    public function test_cancel_stops_a_run_keeps_what_was_created_and_deletes_the_file(): void
    {
        $id = $this->upload($this->rows(130))->json('batch.id');
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 0])->assertOk();
        $stored = MemberImportBatch::query()->findOrFail($id)->stored_path;

        $this->asManager()->postJson($this->api("members/imports/{$id}/cancel"))->assertOk()
            ->assertJsonPath('batch.state', 'cancelled')->assertJsonPath('batch.finished', true)->assertJsonPath('batch.created', 100);
        $this->assertFileDoesNotExist($stored);
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"), ['from' => 100])->assertOk()->assertJsonPath('batch.state', 'cancelled');
        $this->assertSame(100, LoyaltyMember::query()->where('member_number', 'like', 'HL-%')->count());
    }

    public function test_past_imports_are_every_brands_with_the_accepted_columns(): void
    {
        $second = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false]);
        $first = $this->upload("name,email\nAlan Turing,alan@example.test\n", 'first.csv')->json('batch.id');
        MemberImportBatch::query()->whereKey($first)->update(['brand_id' => $second->id, 'created_at' => now()->subDay()]);
        $latest = $this->upload("name,email\nKurt Gödel,kurt@example.test\n", 'second.csv')->json('batch.id');
        app()->instance('current_brand_id', $this->brandId);

        $response = $this->asManager()->getJson($this->api('members/imports'))->assertOk();

        $this->assertSame([$latest, $first], array_column($response->json('imports'), 'id'));
        $this->assertArrayNotHasKey('problems', $response->json('imports.0'));
        $this->assertSame(ImportProblems::columns(), $response->json('columns'));
        $this->assertContains('email', $response->json('columns'));
        $this->assertContains('marketing_consent', $response->json('columns'));
        $this->asManager()->getJson($this->api("members/imports/{$first}"))->assertOk()->assertJsonPath('batch.filename', 'first.csv');
    }

    public function test_import_is_a_managers_and_another_organisations_batch_is_not_found(): void
    {
        $this->asStaffMember()->getJson($this->api('members/imports'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->post($this->api('members/imports'), ['file' => UploadedFile::fake()->createWithContent('a.csv', "name,email\nA,a@example.test\n")], ['Accept' => 'application/json'])
            ->assertStatus(403);

        $id = $this->upload("name,email\nAlan Turing,alan@example.test\n")->json('batch.id');
        $this->asStaffMember()->postJson($this->api("members/imports/{$id}/run"))->assertStatus(403);
        $this->asStaffMember()->postJson($this->api("members/imports/{$id}/cancel"))->assertStatus(403);
        $this->asStaffMember()->getJson($this->api("members/imports/{$id}"))->assertStatus(403);

        MemberImportBatch::query()->whereKey($id)->update(['organization_id' => $this->otherOrganization()['org']->id]);
        $this->asManager()->getJson($this->api("members/imports/{$id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->postJson($this->api("members/imports/{$id}/run"))->assertStatus(404);
        $this->asManager()->postJson($this->api("members/imports/{$id}/cancel"))->assertStatus(404);
        $this->assertSame('pending', MemberImportBatch::withoutGlobalScopes()->find($id)->status);
    }

    /** Every sentence MemberImportService writes about a row has its code. */
    public function test_each_of_the_services_sentences_has_a_code(): void
    {
        $cases = [
            'No email address in this row'                         => 'no_email',
            'No name in this row'                                  => 'no_name',
            'That email address is not valid'                      => 'bad_email',
            'Appears earlier in this file (line 12)'               => 'repeated',
            'Already a member'                                     => 'already_member',
            "No tier called 'Diamond'. Available: Silver, Gold"    => 'unknown_tier',
            'Over your plan member limit (500)'                    => 'member_limit',
            'Over your plan member limit'                          => 'member_limit',
            'Could not create: SQLSTATE[23505] something'          => 'not_created',
            'Could not read this row (7 values for 5 columns).'    => 'unreadable',
            'Something new'                                        => 'other',
        ];
        foreach ($cases as $reason => $code) {
            $this->assertSame($code, ImportProblems::of(['line' => 2, 'email' => 'a@b.c', 'status' => 'error', 'reason' => $reason])['code'], $reason);
        }
        $this->assertSame(12, ImportProblems::of(['reason' => 'Appears earlier in this file (line 12)', 'status' => 'skip'])['first_line']);

        // The sentences are the service's: each one above is in its source, word for word (a change there fails here).
        $source = file_get_contents(app_path('Services/MemberImportService.php'));
        foreach (["'No email address in this row'", "'No name in this row'", "'That email address is not valid'", "'Appears earlier in this file (line '",
            "'Already a member'", "\"No tier called '{\$parsed['tier_name']}'. Available: {\$known}\"", "'Over your plan member limit'", "'Could not create: '"] as $literal) {
            $this->assertStringContainsString($literal, $source);
        }
    }
}
