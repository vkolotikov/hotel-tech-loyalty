<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\MemberImportBatch;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\ImportProblems;
use App\Services\Loyalty\Members\ImportRefused;
use App\Services\Loyalty\Members\MemberImportRun;
use App\Support\AdvisoryLock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Member import in HexaTech Loyalty (spec 2026-10-21 release 2 §4.1, §4.2), a manager's: a CSV is read and judged
 * (the preview, a pending batch), then imported a chunk per call, driven by the page, with progress and Cancel. The
 * steps are MemberImportRun's and the reading MemberImportService's, the full admin's own; the accepted columns are
 * its aliases. Batches are the organisation's, read for every brand.
 *
 * A chunk runs under the advisory lock `loyalty-import:{batch}`, so two presses never import the same rows twice: a
 * call that waited for another's chunk, or that names a position (`from`) the batch has moved past, answers `busy`
 * (409) with the batch as it now stands and imports nothing. Once a batch is finished — completed, cancelled, failed
 * — its stored file is deleted: no step reads it again (MemberImportService::processChunk returns early for a finished
 * batch) and the full admin's view of a batch never reads it.
 *
 * Refusals are codes, the rows' problems too (ImportProblems): the service's English is never sent.
 */
class ImportController extends Controller
{
    /** Past imports listed. */
    public const RECENT = 20;

    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $batches = $this->batches()->orderByDesc('created_at')->orderByDesc('id')->limit(self::RECENT)->get();
        $names = User::query()->whereIn('id', $batches->pluck('created_by_user_id')->filter()->unique()->values())->pluck('name', 'id');

        return response()->json([
            'imports' => $batches->map(fn (MemberImportBatch $b) => self::batch($b, $names[$b->created_by_user_id] ?? null, false))->values(),
            'columns' => ImportProblems::columns(),
        ]);
    }

    /** The preview: rows, new, already members, the problems (at most 100), five sample rows; a pending batch. */
    public function store(Request $request, MemberImportRun $run): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:20480']);

        try {
            ['batch' => $batch, 'report' => $report, 'parsed' => $parsed, 'usage' => $usage] =
                $run->preview($request->file('file'), (int) app('current_organization_id'), $request->user());
        } catch (ImportRefused $e) {
            throw new LoyaltyRefused($e->errorCode, 'This file cannot be imported.', 422, $e->extra);
        }

        $rows = array_merge($parsed['parse_errors'], $report['rows']);
        $existing = count(array_filter($report['rows'], fn ($r) => ImportProblems::of($r)['code'] === 'already_member'));

        return response()->json([
            'batch'   => self::batch($batch, $request->user()->name, true),
            'preview' => [
                'rows'            => (int) $parsed['file_rows'],
                'new'             => (int) $report['ok'],
                'existing'        => $existing,
                'skipped'         => (int) $report['skip'] - $existing,
                'refused'         => (int) $report['error'] + count($parsed['parse_errors']),
                'points'          => (int) $report['points_awarded'],
                'columns_used'    => array_values($parsed['headers']),
                'columns_ignored' => array_values($parsed['unmapped']),
                'problems'        => ImportProblems::list($rows),
                'sample'          => array_values(array_map(fn ($r) => [
                    'line'   => (int) $r['line'],
                    'email'  => (string) $r['email'],
                    'tier'   => $r['tier'] ?? null,
                    'points' => (int) ($r['points'] ?? 0),
                ], array_slice(array_filter($report['rows'], fn ($r) => ($r['status'] ?? '') === 'ok'), 0, 5))),
                'plan_limit'      => $usage['limit'],
            ],
        ]);
    }

    public function show(Request $request, int $batch): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());

        return response()->json(['batch' => self::batch($this->find($batch), null, true)]);
    }

    /** One chunk; `from` is the number of rows processed the caller saw. */
    public function run(Request $request, int $batch, MemberImportRun $run): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['from' => 'sometimes|integer|min:0']);
        $seen = (int) ($data['from'] ?? $this->find($batch)->processed);

        $row = AdvisoryLock::transaction("loyalty-import:{$batch}", function () use ($batch, $seen, $run, $request) {
            $row = $this->find($batch);
            if ($row->isFinished()) {
                return $row;
            }
            // Someone else's chunk ran while this call waited, or the caller's view is old.
            if ((int) $row->processed !== $seen) {
                throw new LoyaltyRefused('busy', 'Another chunk of this import ran meanwhile.', 409, ['batch' => self::batch($row, null, true)]);
            }

            return $run->chunk($row, MemberImportRun::CHUNK, $request->user());
        });

        self::forgetFile($row);

        return response()->json(['batch' => self::batch($row, null, true)]);
    }

    public function cancel(Request $request, int $batch, MemberImportRun $run): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $row = AdvisoryLock::transaction("loyalty-import:{$batch}", fn () => $run->cancel($this->find($batch)));
        self::forgetFile($row);

        return response()->json(['batch' => self::batch($row, null, true)]);
    }

    /** @return Builder<MemberImportBatch> this organisation's batches (the tenant scope), every brand's */
    private function batches(): Builder
    {
        return MemberImportBatch::query()->withoutGlobalScope(BrandScope::class);
    }

    private function find(int $id): MemberImportBatch
    {
        return $this->batches()->find($id) ?? throw LoyaltyRefused::notFound();
    }

    /**
     * A batch as the page reads it; `problems` (the rows not imported, the last 100) only for one batch.
     *
     * @return array<string, mixed>
     */
    private static function batch(MemberImportBatch $b, ?string $by, bool $withProblems): array
    {
        $out = [
            'id'              => (int) $b->id,
            'filename'        => $b->original_filename,
            'state'           => (string) $b->status,
            'finished'        => $b->isFinished(),
            'rows'            => (int) $b->total_rows,
            'file_rows'       => (int) $b->file_rows,
            'processed'       => (int) $b->processed,
            'progress'        => $b->progressPercent(),
            'created'         => (int) $b->ok_count,
            'skipped'         => (int) $b->skip_count,
            'refused'         => (int) $b->error_count,
            'points'          => (int) $b->points_awarded,
            'columns_used'    => array_values($b->columns_used ?? []),
            'columns_ignored' => array_values($b->columns_ignored ?? []),
            'failure'         => $b->status === 'failed' ? (MemberImportRun::FILE_ERRORS[(string) $b->error_message] ?? 'file_unreadable') : null,
            'by'              => $by,
            'created_at'      => $b->created_at?->toIso8601String(),
            'started_at'      => $b->started_at?->toIso8601String(),
            'completed_at'    => $b->completed_at?->toIso8601String(),
        ];
        if ($withProblems) {
            $out['problems'] = ImportProblems::list(array_slice($b->results ?? [], -100));
        }

        return $out;
    }

    /** A finished batch's stored file, deleted when it is where imports keep their files. */
    private static function forgetFile(MemberImportBatch $b): void
    {
        $path = (string) $b->stored_path;
        if (!$b->isFinished() || $path === '' || !is_file($path)) {
            return;
        }
        $dir = realpath(Storage::path('member-imports'));
        $file = realpath($path);
        if ($dir !== false && $file !== false && str_starts_with($file, $dir . DIRECTORY_SEPARATOR)) {
            @unlink($file);
        }
    }
}
