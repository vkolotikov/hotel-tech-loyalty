<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

/** A brand's posts: written, read, saved, moved and marked by every staff member (spec 2026-10-14 §5.1). */
class PostController extends Controller
{
    public const WITH = ['visualBrief'];

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'           => 'nullable|string|max:100',
            'status'      => ['nullable', Rule::in(ContentRules::STATUSES)],
            'platform'    => ['nullable', Rule::in(ContentRules::PLATFORMS)],
            'pillar_id'   => 'nullable|integer',
            'from'        => 'nullable|date_format:Y-m-d',
            'to'          => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'unscheduled' => 'nullable|boolean',
            'page'        => 'nullable|integer|min:1',
        ]);
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['data' => [], 'meta' => ['page' => 1, 'pages' => 0, 'total' => 0]]);
        }

        $query = ContentPlannerPost::with(self::WITH)
            ->where('planner_profile_id', $profile->id)
            // Archived posts are put away: listed only when asked for by their status.
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status), fn ($q) => $q->where('status', '!=', 'archived'))
            ->when($data['platform'] ?? null, fn ($q, $platform) => $q->where('platform', $platform))
            ->when($data['pillar_id'] ?? null, fn ($q, $pillar) => $q->where('pillar_id', $pillar))
            ->when($data['from'] ?? null, fn ($q, $from) => $q->whereDate('scheduled_date', '>=', $from))
            ->when($data['to'] ?? null, fn ($q, $to) => $q->whereDate('scheduled_date', '<=', $to))
            ->when($request->boolean('unscheduled'), fn ($q) => $q->whereNull('scheduled_date'))
            ->when(trim((string) ($data['q'] ?? '')) !== '', fn ($q) => ContentPlan::search($q, $data['q']))
            // Newest scheduled first; untimed after timed within a day; posts without a date last (PostgreSQL sorts NULL first).
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_date')
            ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_time')->orderByDesc('id');

        $page = $query->paginate(50, ['*'], 'page', (int) ($data['page'] ?? 1));

        return response()->json([
            'data' => $page->getCollection()->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values(),
            'meta' => ['page' => $page->currentPage(), 'pages' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /** Find (`GET find`): up to eight posts, from two letters (spec §4.7). Not named find(): that is the lookup below. */
    public function search(Request $request): JsonResponse
    {
        $words = trim((string) ($request->validate(['q' => 'nullable|string|max:100'])['q'] ?? ''));
        $profile = ContentContext::profile();
        if (!$profile || mb_strlen($words) < 2) {
            return response()->json(['posts' => []]);
        }

        $posts = ContentPlan::search(ContentPlannerPost::with(self::WITH)->where('planner_profile_id', $profile->id), $words)
            ->where('status', '!=', 'archived')
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('scheduled_date')->orderByDesc('id')
            ->limit(8)->get();

        return response()->json(['posts' => $posts->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $data = $request->validate(
            ['platform' => ['required', Rule::in(ContentRules::PLATFORMS)]] + Arr::except(ContentRules::postFields(), ['platform'])
        );

        $post = ContentPlannerPost::create(array_merge(
            ['status' => 'draft', 'language' => $profile->default_language ?: 'en'],
            $data,
            [
                'planner_profile_id' => $profile->id,
                'brand_id'           => $profile->brand_id,
                'generated_by'       => 'manual',
                'created_by'         => $request->user()->id,
            ],
        ));

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))], 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::detail(self::find($id))]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $data = $request->validate(['updated_at' => 'required|string'] + ContentRules::postFields());
        self::assertFresh($post, $data['updated_at']);

        $fields = Arr::except($data, ['updated_at']);
        if ($post->status === 'published' && array_key_exists('scheduled_date', $fields)
            && $fields['scheduled_date'] !== $post->scheduled_date?->format('Y-m-d')) {
            self::refusePublishedMove();
        }
        // A post put back to "no day" has no time either (as a move to the tray does).
        if (array_key_exists('scheduled_date', $fields) && $fields['scheduled_date'] === null) {
            $fields['scheduled_time'] = null;
        }

        $post->fill($fields)->save();

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    /** A drag on the calendar, a keyboard move, or a drop on the Unscheduled tray (spec §4.2). */
    public function move(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $data = $request->validate([
            'updated_at'     => 'required|string',
            'scheduled_date' => 'present|nullable|date_format:Y-m-d',
            'scheduled_time' => 'sometimes|nullable|date_format:H:i',
        ]);
        self::assertFresh($post, $data['updated_at']);
        if ($post->status === 'published') {
            self::refusePublishedMove();
        }

        $post->scheduled_date = $data['scheduled_date'];
        if (array_key_exists('scheduled_time', $data)) {
            $post->scheduled_time = $data['scheduled_time'];
        }
        // The tray holds ideas without a day: no day, no time.
        if ($data['scheduled_date'] === null) {
            $post->scheduled_time = null;
        }
        $post->save();

        return response()->json(['post' => ContentPostPresenter::card($post->fresh(self::WITH))]);
    }

    public function duplicate(Request $request, int $id): JsonResponse
    {
        $copy = self::find($id)->replicate(['published_url', 'published_at', 'status']);
        $copy->status = 'draft';
        $copy->created_by = $request->user()->id;
        $copy->scheduled_date = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()))->addDays(7)->format('Y-m-d');
        $copy->save();

        return response()->json(['post' => ContentPostPresenter::detail($copy->fresh(self::WITH))], 201);
    }

    public function markReady(int $id): JsonResponse
    {
        $post = self::find($id);
        $post->update(['status' => 'ready_to_publish']);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    public function markPublished(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['published_url' => 'nullable|url|max:255']);
        $post = self::find($id);
        $post->update(['status' => 'published', 'published_at' => now(), 'published_url' => $data['published_url'] ?? null]);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    public function destroy(int $id): JsonResponse
    {
        self::find($id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** A post of this organisation and brand, or not_found (another brand's post does not exist here). */
    public static function find(int $id): ContentPlannerPost
    {
        return ContentPlannerPost::with(self::WITH)->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This post no longer exists.', 404);
    }

    /**
     * A save or a move made from a copy someone else has changed since is
     * refused, with the post as it is now (spec 2026-10-14 §7, F3). Versions
     * compare to the second, the precision the column keeps.
     */
    public static function assertFresh(ContentPlannerPost $post, string $seen): void
    {
        $sent = rescue(fn () => CarbonImmutable::parse($seen), null, false);
        if ($sent === null || $post->updated_at === null || $sent->getTimestamp() !== $post->updated_at->getTimestamp()) {
            throw new ContentRefused(
                'changed_elsewhere',
                'Someone else changed this post — reload to see their version.',
                409,
                ['post' => ContentPostPresenter::detail($post->fresh(self::WITH))],
            );
        }
    }

    private static function refusePublishedMove(): never
    {
        throw new ContentRefused('published_cannot_move', 'A published post keeps the date it went out.', 422);
    }
}
