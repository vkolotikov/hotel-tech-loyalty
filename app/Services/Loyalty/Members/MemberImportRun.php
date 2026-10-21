<?php

namespace App\Services\Loyalty\Members;

use App\Models\AuditLog;
use App\Models\MemberImportBatch;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\MemberImportService;
use App\Services\PlanLimitGuard;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A member import's steps around MemberImportService, which reads the file and creates the members: the one place
 * the full admin's resumable import (`MemberImportController`) and HexaTech Loyalty's Import (spec 2026-10-21
 * release 2 §4.1) start a run and finish a chunk. Moved here unchanged from the controller, which keeps its answers.
 *
 * Preview: the file is read whole and judged exactly as a commit would judge it (the dry run is the same code path),
 * under the plan's member cap, and kept on the default disk for the life of the batch, which starts pending. A chunk:
 * the next slice of rows, and when the last one is done, the run is audited (`members_bulk_import`) and the
 * dashboard's figures are cleared.
 */
final class MemberImportRun
{
    /** Rows per chunk. Sized to stay well inside any proxy timeout. */
    public const CHUNK = 100;
    /** The file refusals, by the parser's own sentence (MemberImportService::parseFile). */
    public const FILE_ERRORS = [
        'Could not open the uploaded file.' => 'file_unreadable',
        'The file is empty.'                => 'file_empty',
        'The file has no header row.'       => 'no_header',
    ];

    public function __construct(private readonly MemberImportService $importer)
    {
    }

    /**
     * @return array{batch: MemberImportBatch, report: array<string, mixed>, parsed: array<string, mixed>, usage: array{count: int, limit: ?int}}
     * @throws ImportRefused the file cannot be imported (`file_unreadable`, `file_empty`, `no_header` with the parser's
     *   sentence; `no_rows`; `no_email_column` with the columns found; `too_many_rows` with the file's rows)
     */
    public function preview(UploadedFile $upload, int $orgId, ?User $by): array
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $parsed = $this->importer->parseFile($upload->getRealPath());
        if ($parsed['error']) {
            throw new ImportRefused(self::FILE_ERRORS[$parsed['error']] ?? 'file_unreadable', $parsed['error']);
        }
        if ($parsed['rows'] === []) {
            throw new ImportRefused('no_rows', 'No data rows found under the header row.');
        }
        if (!in_array('email', $parsed['headers'], true)) {
            throw new ImportRefused('no_email_column', 'Could not find an email column.', ['columns' => array_values($parsed['unmapped'])]);
        }
        if ($parsed['truncated']) {
            throw new ImportRefused('too_many_rows', 'The file has more rows than one import takes.', ['file_rows' => (int) $parsed['file_rows'], 'max_rows' => MemberImportService::MAX_ROWS]);
        }

        $usage = app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_MEMBERS);
        $capRemaining = $usage['limit'] !== null ? max(0, (int) $usage['limit'] - (int) $usage['count']) : PHP_INT_MAX;

        // Dry run: the same code path as the commit, so what the operator approves is exactly what they get.
        $report = $this->importer->process(
            rows: $parsed['rows'],
            dryRun: true,
            orgId: $orgId,
            capRemaining: $capRemaining,
            planLimit: $usage['limit'],
        );

        // Kept for the life of the batch; each chunk reads it again.
        $path = $upload->store('member-imports');

        $batch = MemberImportBatch::create([
            'uuid'               => (string) Str::uuid(),
            'organization_id'    => $orgId,
            'created_by_user_id' => $by?->id,
            'original_filename'  => $upload->getClientOriginalName(),
            'stored_path'        => Storage::path($path),
            'file_rows'          => $parsed['file_rows'],
            'total_rows'         => count($parsed['rows']),
            'status'             => 'pending',
            'columns_used'       => $parsed['headers'],
            'columns_ignored'    => $parsed['unmapped'],
        ]);

        return ['batch' => $batch, 'report' => $report, 'parsed' => $parsed, 'usage' => $usage];
    }

    /** The next slice of a batch; a finished one is answered as it stands. */
    public function chunk(MemberImportBatch $batch, int $size, ?User $by): MemberImportBatch
    {
        @set_time_limit(300);
        if ($batch->isFinished()) {
            return $batch;
        }

        $batch = $this->importer->processChunk($batch, $size);

        if ($batch->status === 'completed') {
            AuditLog::record('members_bulk_import', null, [
                'batch_id'       => $batch->uuid,
                'file'           => $batch->original_filename,
                'imported'       => $batch->ok_count,
                'skipped'        => $batch->skip_count,
                'errors'         => $batch->error_count,
                'points_awarded' => $batch->points_awarded,
            ], [], $by,
                "Member import finished: {$batch->ok_count} created, {$batch->skip_count} skipped, {$batch->error_count} errors");
            AnalyticsService::clearDashboardCache();
        }

        return $batch;
    }

    /** Stop a run. Members already created stay: this is not a rollback. */
    public function cancel(MemberImportBatch $batch): MemberImportBatch
    {
        if (!$batch->isFinished()) {
            $batch->update(['status' => 'cancelled', 'completed_at' => now()]);
        }

        return $batch;
    }
}
