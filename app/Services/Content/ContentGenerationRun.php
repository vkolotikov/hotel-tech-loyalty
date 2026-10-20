<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\Content\PostController;
use App\Models\ContentPlannerPost;
use App\Support\SharedCache;
use Carbon\CarbonImmutable;

/**
 * A brand's Generate run, as the panel reads it while the job writes on the queue worker (2026-10-20: production cuts a
 * request off at 60 s, and one week takes longer). It lives in the cache the web app and the worker share, and belongs
 * to its run (the lock's owner): only that run's job writes it. A run reads as `running` while it waits in the queue
 * (up to ContentAiGate::QUEUED_SECONDS) and while its job runs (up to RUN_SECONDS from when the job started); past
 * either it has lost its job — it reads as failed, and the lock it held has run out, so a new run may start.
 */
final class ContentGenerationRun
{
    /** How long a finished run's result stays to be read: the dialog or the Plan reads it within seconds. */
    private const RESULT_SECONDS = 3600;

    /** Pressed Generate: waiting for the worker. */
    public static function queued(int $brandId, int $userId, string $from, string $to, string $owner): void
    {
        SharedCache::store()->put(self::key($brandId), [
            'status' => 'running', 'owner' => $owner, 'queued_at' => CarbonImmutable::now()->toIso8601String(), 'started_at' => null,
            'by' => $userId, 'from' => $from, 'to' => $to,
        ], ContentAiGate::QUEUED_SECONDS + ContentAiGate::RUN_SECONDS + 300);
    }

    /** The job has started: its run time counts from now. */
    public static function started(int $brandId, string $owner): void
    {
        $state = self::stateOf($brandId, $owner);
        if ($state !== null) {
            SharedCache::store()->put(self::key($brandId), ['started_at' => CarbonImmutable::now()->toIso8601String()] + $state,
                ContentAiGate::RUN_SECONDS + 300);
        }
    }

    /** @param array{created: iterable<ContentPlannerPost>, skipped_dates: array, failed_windows: array} $result */
    public static function finish(int $brandId, array $result, string $owner): void
    {
        if (self::stateOf($brandId, $owner) === null) {
            return;
        }
        $ids = collect($result['created'])->map(fn (ContentPlannerPost $post) => (int) $post->id)->values()->all();
        $incomplete = $result['failed_windows'] !== [];
        SharedCache::store()->put(self::key($brandId), [
            'status'         => $incomplete ? ($ids !== [] ? 'partial' : 'failed') : 'completed',
            'owner'          => $owner,
            'post_ids'       => $ids,
            'skipped'        => $result['skipped_dates'],
            'failed_windows' => $result['failed_windows'],
            'finished_at'    => CarbonImmutable::now()->toIso8601String(),
        ], self::RESULT_SECONDS);
    }

    /** A run that stopped before it could report (`no_channels`, `generation_failed`). */
    public static function fail(int $brandId, string $code, string $owner): void
    {
        if (self::stateOf($brandId, $owner) === null) {
            return;
        }
        SharedCache::store()->put(self::key($brandId), [
            'status' => 'failed', 'owner' => $owner, 'error' => $code, 'post_ids' => [], 'skipped' => [], 'failed_windows' => [],
            'finished_at' => CarbonImmutable::now()->toIso8601String(),
        ], self::RESULT_SECONDS);
    }

    /**
     * What the panel shows: `idle`; `running` (queued or writing, with when it was asked for); or the result as Generate
     * answers it — status, created_count, the posts as cards, skipped, failed_windows, and `error` when it stopped early.
     *
     * @return array<string, mixed>
     */
    public static function describe(int $brandId): array
    {
        $state = SharedCache::store()->get(self::key($brandId));
        if (!is_array($state)) {
            return ['status' => 'idle'];
        }
        if ($state['status'] === 'running') {
            $alive = $state['started_at']
                ? CarbonImmutable::parse($state['started_at'])->addSeconds(ContentAiGate::RUN_SECONDS)->isFuture()
                : CarbonImmutable::parse($state['queued_at'])->addSeconds(ContentAiGate::QUEUED_SECONDS)->isFuture();
            if ($alive) {
                return ['status' => 'running', 'started_at' => $state['started_at'] ?? $state['queued_at'], 'from' => $state['from'] ?? null, 'to' => $state['to'] ?? null];
            }
            $state = ['status' => 'failed', 'error' => 'generation_failed', 'post_ids' => [], 'skipped' => [], 'failed_windows' => []];
        }
        $posts = ContentPlannerPost::with(PostController::WITH)->withReview()->whereIn('id', $state['post_ids'] ?? [])->orderBy('scheduled_date')->orderBy('id')->get();

        return array_filter([
            'status'         => $state['status'],
            'created_count'  => count($state['post_ids'] ?? []),
            'posts'          => $posts->map(fn (ContentPlannerPost $post) => ContentPostPresenter::card($post))->values()->all(),
            'skipped'        => $state['skipped'] ?? [],
            'failed_windows' => $state['failed_windows'] ?? [],
            'error'          => $state['error'] ?? null,
            'finished_at'    => $state['finished_at'] ?? null,
        ], fn ($value) => $value !== null);
    }

    /** The run's state while it is still this owner's run; null once another run (or none) holds the brand. @return array<string, mixed>|null */
    private static function stateOf(int $brandId, string $owner): ?array
    {
        $state = SharedCache::store()->get(self::key($brandId));

        return is_array($state) && ($state['owner'] ?? null) === $owner && $state['status'] === 'running' ? $state : null;
    }

    private static function key(int $brandId): string
    {
        return "content:generation:{$brandId}";
    }
}
