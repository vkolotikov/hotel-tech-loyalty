<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberImportBatch;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's resumable member import (MemberImportController), whose preview and completion steps HexaTech
 * Loyalty release 2 (§4.3) shares through App\Services\Loyalty\Members\MemberImportRun. Written against the controller
 * as it was and kept passing on the new code: the same refusals in the same words, the same preview, the same
 * progress, the same audit when a run completes.
 */
class MemberImportEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        Storage::fake();
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/members/imports' . ($path === '' ? '' : '/' . ltrim($path, '/'));
    }

    private function file(string $csv): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('guests.csv', $csv);
    }

    private function preview(string $csv): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->post($this->admin('preview'), ['file' => $this->file($csv)], ['Accept' => 'application/json']);
    }

    public function test_preview_reports_what_a_commit_would_do_and_keeps_a_pending_batch(): void
    {
        $csv = "First Name,Surname,E-mail,Points,Tier,Shoe size\n"
            . "Alan,Turing,alan@example.test,1200,Gold,44\n"
            . "Ada,Again,{$this->ada->user->email},10,,40\n"
            . "No,Mail,,5,,40\n"
            . "Kurt,Gödel,kurt@example.test,0,Diamond,42\n";

        $response = $this->preview($csv)->assertOk()
            ->assertJsonPath('batch.status', 'pending')
            ->assertJsonPath('batch.filename', 'guests.csv')
            ->assertJsonPath('batch.total_rows', 4)
            ->assertJsonPath('batch.processed', 0)
            ->assertJsonPath('batch.is_finished', false)
            ->assertJsonPath('preview.will_create', 1)
            ->assertJsonPath('preview.will_skip', 1)
            ->assertJsonPath('preview.will_error', 2)
            ->assertJsonPath('preview.points_to_award', 1200)
            ->assertJsonPath('preview.file_rows', 4)
            ->assertJsonPath('preview.columns_used', ['first_name', 'last_name', 'email', 'points', 'tier_name'])
            ->assertJsonPath('preview.columns_ignored', ['Shoe size'])
            ->assertJsonPath('preview.plan_limit', ['count' => 2, 'limit' => null]);

        $this->assertSame([
            ['line' => 3, 'email' => $this->ada->user->email, 'status' => 'skip', 'reason' => 'Already a member'],
            ['line' => 4, 'email' => '', 'status' => 'error', 'reason' => 'No email address in this row'],
            ['line' => 5, 'email' => 'kurt@example.test', 'status' => 'error', 'reason' => "No tier called 'Diamond'. Available: Silver, Gold, Platinum"],
        ], $response->json('preview.problems'));
        $this->assertSame([['line' => 2, 'email' => 'alan@example.test', 'status' => 'ok', 'tier' => 'Gold', 'points' => 1200]], array_values($response->json('preview.sample')));
        $this->assertSame(0, LoyaltyMember::query()->where('member_number', 'like', 'HL-%')->count());

        $batch = MemberImportBatch::query()->where('uuid', $response->json('batch.uuid'))->firstOrFail();
        $this->assertFileExists($batch->stored_path);
        $this->assertSame($this->manager->id, (int) $batch->created_by_user_id);
    }

    public function test_preview_refuses_a_file_without_an_email_column_or_without_rows_in_its_own_words(): void
    {
        $this->preview("name,Contact\nAlan,alan@example.test\n")->assertStatus(422)->assertExactJson([
            'error' => 'Could not find an email column. Columns found: Contact. Every member needs an email address — rename that column to "email" and try again.',
        ]);
        $this->preview("name,email\n")->assertStatus(422)->assertExactJson(['error' => 'No data rows found under the header row.']);
        $this->preview('')->assertStatus(422);
        $this->assertSame(0, MemberImportBatch::query()->count());
    }

    public function test_process_runs_to_completion_and_audits_the_run_once(): void
    {
        $uuid = $this->preview("name,email,points\nAlan Turing,alan@example.test,300\nKurt Gödel,kurt@example.test,\n")->json('batch.uuid');

        $this->asManager()->postJson($this->admin("{$uuid}/process"))->assertOk()
            ->assertJsonPath('batch.status', 'completed')
            ->assertJsonPath('batch.processed', 2)
            ->assertJsonPath('batch.ok', 2)
            ->assertJsonPath('batch.points_awarded', 300)
            ->assertJsonPath('batch.progress', 100)
            ->assertJsonPath('batch.is_finished', true);

        $this->assertSame(300, (int) LoyaltyMember::query()->whereHas('user', fn ($q) => $q->where('email', 'alan@example.test'))->value('current_points'));
        $audit = AuditLog::where('action', 'members_bulk_import')->firstOrFail();
        $this->assertSame(['batch_id' => $uuid, 'file' => 'guests.csv', 'imported' => 2, 'skipped' => 0, 'errors' => 0, 'points_awarded' => 300], $audit->new_values);
        $this->assertSame('Member import finished: 2 created, 0 skipped, 0 errors', $audit->description);

        // A finished run answers as it stands and does nothing more.
        $this->asManager()->postJson($this->admin("{$uuid}/process"))->assertOk()->assertJsonPath('batch.ok', 2);
        $this->assertSame(1, AuditLog::where('action', 'members_bulk_import')->count());
    }

    public function test_show_cancel_and_index(): void
    {
        $uuid = $this->preview("name,email\nAlan Turing,alan@example.test\n")->json('batch.uuid');

        $this->asManager()->getJson($this->admin($uuid))->assertOk()->assertJsonPath('batch.uuid', $uuid)->assertJsonPath('batch.problems', []);
        $this->asManager()->postJson($this->admin("{$uuid}/cancel"))->assertOk()->assertJsonPath('batch.status', 'cancelled')->assertJsonPath('batch.is_finished', true);
        $this->asManager()->postJson($this->admin("{$uuid}/process"))->assertOk()->assertJsonPath('batch.status', 'cancelled')->assertJsonPath('batch.ok', 0);

        $list = $this->asManager()->getJson($this->admin(''))->assertOk()->json('data');
        $this->assertSame([$uuid], array_column($list, 'uuid'));
        $this->assertArrayNotHasKey('problems', $list[0]);

        $this->asManager()->getJson($this->admin('00000000-0000-0000-0000-000000000000'))->assertNotFound()->assertExactJson(['error' => 'Import not found.']);
    }
}
