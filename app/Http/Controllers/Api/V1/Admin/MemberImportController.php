<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\MemberImportBatch;
use App\Services\AnalyticsService;
use App\Services\MemberImportService;
use App\Services\PlanLimitGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Resumable CSV import of existing customers.
 *
 * Three steps, deliberately separated:
 *
 *   1. `preview`  — upload once. Parses the whole file, reports which
 *                   columns were understood and which were ignored, and
 *                   returns the exact per-row verdicts a commit would
 *                   produce. Creates nothing.
 *   2. `process`  — called repeatedly by the SPA. Each call does a bounded
 *                   slice of the work and returns progress.
 *   3. `show`     — poll a batch (also lets a reopened tab pick a run back up).
 *
 * The old single-shot endpoint could not do this: 5 000 members is ~12
 * minutes of database work, so it silently kept the first 500 rows and
 * reported "500 of 500 imported".
 */
class MemberImportController extends Controller
{
    /** Rows per `process` call. Sized to stay well inside any proxy timeout. */
    private const CHUNK = 100;

    public function __construct(private MemberImportService $importer)
    {
    }

    /**
     * Upload + validate. Creates a batch but no members.
     */
    public function preview(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:20480',
        ]);

        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $orgId = $this->orgId($request);
        if (!$orgId) {
            return response()->json(['error' => 'No organization context.'], 422);
        }

        $upload = $request->file('file');
        $parsed = $this->importer->parseFile($upload->getRealPath());

        if ($parsed['error']) {
            return response()->json(['error' => $parsed['error']], 422);
        }
        if ($parsed['rows'] === []) {
            return response()->json(['error' => 'No data rows found under the header row.'], 422);
        }
        if (!in_array('email', $parsed['headers'], true)) {
            $found = $parsed['unmapped'] ? implode(', ', array_slice($parsed['unmapped'], 0, 8)) : 'none';
            return response()->json([
                'error' => "Could not find an email column. Columns found: {$found}. "
                         . 'Every member needs an email address — rename that column to "email" and try again.',
            ], 422);
        }
        if ($parsed['truncated']) {
            return response()->json([
                'error' => "This file has {$parsed['file_rows']} rows, above the "
                         . MemberImportService::MAX_ROWS . '-row limit for a single import. '
                         . 'Split it so no customers are silently dropped.',
            ], 422);
        }

        $usage = app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_MEMBERS);
        $capRemaining = $usage['limit'] !== null
            ? max(0, (int) $usage['limit'] - (int) $usage['count'])
            : PHP_INT_MAX;

        // Dry run: identical code path to the commit, so what the operator
        // approves is exactly what they get.
        $report = $this->importer->process(
            rows: $parsed['rows'],
            dryRun: true,
            orgId: $orgId,
            capRemaining: $capRemaining,
            planLimit: $usage['limit'],
        );

        // Keep the file for the life of the batch; each chunk re-parses it.
        $path = $upload->store('member-imports');
        $absolute = Storage::path($path);

        $batch = MemberImportBatch::create([
            'uuid'               => (string) Str::uuid(),
            'organization_id'    => $orgId,
            'created_by_user_id' => $request->user()?->id,
            'original_filename'  => $upload->getClientOriginalName(),
            'stored_path'        => $absolute,
            'file_rows'          => $parsed['file_rows'],
            'total_rows'         => count($parsed['rows']),
            'status'             => 'pending',
            'columns_used'       => $parsed['headers'],
            'columns_ignored'    => $parsed['unmapped'],
        ]);

        $problems = array_values(array_filter($report['rows'], fn ($r) => ($r['status'] ?? '') !== 'ok'));

        return response()->json([
            'batch'   => $this->payload($batch),
            'preview' => [
                'will_create'     => $report['ok'],
                'will_skip'       => $report['skip'],
                'will_error'      => $report['error'] + count($parsed['parse_errors']),
                'points_to_award' => $report['points_awarded'],
                'file_rows'       => $parsed['file_rows'],
                'columns_used'    => $parsed['headers'],
                'columns_ignored' => $parsed['unmapped'],
                // Bounded: the operator needs to see what is wrong, not all
                // 5 000 verdicts.
                'problems'        => array_slice(array_merge($parsed['parse_errors'], $problems), 0, 100),
                'sample'          => array_slice(array_filter($report['rows'], fn ($r) => ($r['status'] ?? '') === 'ok'), 0, 5),
                'plan_limit'      => $usage,
            ],
        ]);
    }

    /**
     * Do the next slice of work. The SPA calls this until `is_finished`.
     */
    public function process(Request $request, string $uuid): JsonResponse
    {
        @set_time_limit(300);

        $batch = $this->findBatch($request, $uuid);
        if (!$batch) {
            return response()->json(['error' => 'Import not found.'], 404);
        }
        if ($batch->isFinished()) {
            return response()->json(['batch' => $this->payload($batch)]);
        }

        $size = (int) $request->integer('size', self::CHUNK);
        $size = max(10, min($size, 250));

        $batch = $this->importer->processChunk($batch, $size);

        if ($batch->status === 'completed') {
            AuditLog::record(
                'members_bulk_import',
                null,
                [
                    'batch_id'       => $batch->uuid,
                    'file'           => $batch->original_filename,
                    'imported'       => $batch->ok_count,
                    'skipped'        => $batch->skip_count,
                    'errors'         => $batch->error_count,
                    'points_awarded' => $batch->points_awarded,
                ],
                [],
                $request->user(),
                "Member import finished: {$batch->ok_count} created, {$batch->skip_count} skipped, {$batch->error_count} errors"
            );
            AnalyticsService::clearDashboardCache();
        }

        return response()->json(['batch' => $this->payload($batch)]);
    }

    /** Poll a batch — lets a reopened tab resume a run in progress. */
    public function show(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->findBatch($request, $uuid);

        return $batch
            ? response()->json(['batch' => $this->payload($batch)])
            : response()->json(['error' => 'Import not found.'], 404);
    }

    /** Stop a run. Members already created stay — this is not a rollback. */
    public function cancel(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->findBatch($request, $uuid);
        if (!$batch) {
            return response()->json(['error' => 'Import not found.'], 404);
        }
        if (!$batch->isFinished()) {
            $batch->update(['status' => 'cancelled', 'completed_at' => now()]);
        }

        return response()->json(['batch' => $this->payload($batch)]);
    }

    /** Recent imports, so an interrupted run is findable. */
    public function index(Request $request): JsonResponse
    {
        $batches = MemberImportBatch::orderByDesc('created_at')->limit(20)->get();

        return response()->json([
            'data' => $batches->map(fn ($b) => $this->payload($b, false))->all(),
        ]);
    }

    private function findBatch(Request $request, string $uuid): ?MemberImportBatch
    {
        // TenantScope already narrows to the caller's organisation.
        return MemberImportBatch::where('uuid', $uuid)->first();
    }

    private function payload(MemberImportBatch $b, bool $withResults = true): array
    {
        return array_filter([
            'uuid'            => $b->uuid,
            'filename'        => $b->original_filename,
            'status'          => $b->status,
            'is_finished'     => $b->isFinished(),
            'file_rows'       => (int) $b->file_rows,
            'total_rows'      => (int) $b->total_rows,
            'processed'       => (int) $b->processed,
            'remaining'       => $b->remaining(),
            'progress'        => $b->progressPercent(),
            'ok'              => (int) $b->ok_count,
            'skip'            => (int) $b->skip_count,
            'error'           => (int) $b->error_count,
            'points_awarded'  => (int) $b->points_awarded,
            'columns_used'    => $b->columns_used,
            'columns_ignored' => $b->columns_ignored,
            'error_message'   => $b->error_message,
            'started_at'      => $b->started_at?->toIso8601String(),
            'completed_at'    => $b->completed_at?->toIso8601String(),
            'created_at'      => $b->created_at?->toIso8601String(),
            'problems'        => $withResults ? array_slice($b->results ?? [], -100) : null,
        ], fn ($v) => $v !== null);
    }

    private function orgId(Request $request): ?int
    {
        $id = $request->user()?->organization_id
            ?? (app()->bound('current_organization_id') ? app('current_organization_id') : null);

        return $id ? (int) $id : null;
    }
}
