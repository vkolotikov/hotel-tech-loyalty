<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentApproval;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentTeam;
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

        $query = ContentPlannerPost::with(self::WITH)->withReview()
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

        $posts = ContentPlan::search(ContentPlannerPost::with(self::WITH)->withReview()->where('planner_profile_id', $profile->id), $words)
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
        // The Link (spec 2026-10-19 §5.1) is not a post column: its short link lives in content_links.
        $link = ContentLinks::clean($request->input('link'));
        ContentTeam::assertPoster($data['poster_id'] ?? null, null, (int) $profile->brand_id);
        ContentApproval::guardStatus($data['status'] ?? null, null, $request->user(), $profile);
        // A post without a day has no time either (as a move to the tray, and as update, keep it).
        if (($data['scheduled_date'] ?? null) === null) {
            $data['scheduled_time'] = null;
        }

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

        if ($link !== null) {
            ContentLinks::set($post, $link);
        }
        if ($kind = ContentApproval::onCreate($post, $request->user(), $profile)) {
            ContentApproval::record($post, $kind, $request->user()->id);
        }

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::panel(self::find($id), $request->user())]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $data = $request->validate(['updated_at' => 'required|string'] + ContentRules::postFields());
        self::assertFresh($post, $data['updated_at']);
        // The Link (spec 2026-10-19 §5.1): refused whole before anything is saved; a new address is a change of the post.
        $link = $request->has('link') ? ContentLinks::clean($request->input('link')) : null;
        $linkChanges = $request->has('link') && ContentLinks::changes($post, $link);

        $fields = Arr::except($data, ['updated_at']);
        ContentTeam::assertPoster($fields['poster_id'] ?? null, $post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id);
        if ($post->status === 'published' && array_key_exists('scheduled_date', $fields)
            && $fields['scheduled_date'] !== $post->scheduled_date?->format('Y-m-d')) {
            self::refusePublishedMove();
        }
        $profile = ContentContext::profile();
        $before = (string) $post->status;
        // Spec 2026-10-16 §6.2: refused whole, before anything of the save is filled.
        ContentApproval::guardStatus($fields['status'] ?? null, $before, $request->user(), $profile);
        $post->fill($fields);
        // A post without a day has no time either — also when only a time was sent for it.
        if ($post->scheduled_date === null) {
            $post->scheduled_time = null;
        }
        if ($linkChanges) {
            // Its version moves on, so a panel still holding the old Link cannot save it back (F3).
            $post->updated_at = $post->freshTimestamp();
        }
        $kind = ContentApproval::beforeSave($post, $before, $request->user(), $profile, $linkChanges);
        $post->save();
        if ($linkChanges) {
            ContentLinks::set($post, $link);
        } elseif ($post->wasChanged(['platform', 'campaign_id'])) {
            ContentLinks::retag($post);
        }
        if ($kind) {
            ContentApproval::record($post, $kind, $request->user()->id);
        }

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
            // Ideas → Schedule asks who posts it (spec 2026-10-19 §4.1).
            'poster_id'      => 'sometimes|nullable|integer',
        ]);
        self::assertFresh($post, $data['updated_at']);
        if ($post->status === 'published') {
            self::refusePublishedMove();
        }
        ContentTeam::assertPoster($data['poster_id'] ?? null, $post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id);

        $post->scheduled_date = $data['scheduled_date'];
        if (array_key_exists('scheduled_time', $data)) {
            $post->scheduled_time = $data['scheduled_time'];
        }
        if (array_key_exists('poster_id', $data)) {
            $post->poster_id = $data['poster_id'];
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
        // A copy made by hand is not in the original's repeat series, nor in its group of versions.
        $original = self::find($id);
        $copy = $original->replicate(['published_url', 'published_at', 'status', 'series_id', 'group_id']);
        $copy->status = 'draft';
        $copy->created_by = $request->user()->id;
        $copy->scheduled_date = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()))->addDays(7)->format('Y-m-d');
        $copy->save();
        // Its own short link to the same address (spec 2026-10-19 §5.1).
        ContentLinks::copyTo($original, [$copy]);

        return response()->json(['post' => ContentPostPresenter::detail($copy->fresh(self::WITH))], 201);
    }

    public function markReady(Request $request, int $id): JsonResponse
    {
        $post = self::find($id);
        $before = (string) $post->status;
        ContentApproval::guardStatus('ready_to_publish', $before, $request->user(), ContentContext::profile());
        $post->update(['status' => 'ready_to_publish']);
        ContentApproval::afterMark($post, $before, $request->user(), ContentContext::profile());

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(self::WITH))]);
    }

    public function markPublished(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['published_url' => 'nullable|url|max:255']);
        $post = self::find($id);
        $before = (string) $post->status;
        ContentApproval::guardPublish($post, $request->user(), ContentContext::profile());
        $post->update(['status' => 'published', 'published_at' => now(), 'published_url' => $data['published_url'] ?? null]);
        ContentApproval::afterMark($post, $before, $request->user(), ContentContext::profile());

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
