<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Versions per platform (spec 2026-10-19 §3): sibling posts for other platforms, linked by `group_id` (the original's
 * id, as `series_id` links a repeat). Each version is an ordinary post afterwards: its own day, status, approvals and
 * comments. Joining or leaving a group is not an edit: it never changes a post's `updated_at`.
 */
final class ContentVersions
{
    /** What a version takes from its original (§3.1); status, published details, series, comments and events stay behind. */
    public const COPIED = [
        'scheduled_date', 'scheduled_time', 'language', 'topic', 'title', 'goal', 'format', 'hook', 'main_copy', 'short_copy',
        'cta', 'hashtags', 'pillar_id', 'audience_id', 'campaign_id', 'strategy_id', 'weekday_role', 'funnel_stage',
        'post_type', 'strategic_reason', 'poster_id',
    ];

    /** The platforms already in the post's group; its own when it has none. @return list<string> */
    public static function platformsOf(ContentPlannerPost $post): array
    {
        if (!$post->group_id) {
            return [(string) $post->platform];
        }

        return ContentPlannerPost::where('group_id', $post->group_id)->pluck('platform')
            ->map(fn ($platform) => (string) $platform)->unique()->values()->all();
    }

    /**
     * Locks the group's key post — the post whose id is `group_id`, or the post itself outside a group — for the rest of
     * the caller's transaction, so every change to a group's platforms waits on one row whichever post it starts from
     * (5A-1 review). Unlink can re-key a group while this waits: then the new key is locked too. Refreshes `$post`.
     */
    public static function lockGroup(ContentPlannerPost $post): int
    {
        $key = (int) ($post->group_id ?: $post->id);
        ContentPlannerPost::whereKey($key)->lockForUpdate()->first();
        $post->refresh();
        $now = (int) ($post->group_id ?: $post->id);
        if ($now !== $key) {
            ContentPlannerPost::whereKey($now)->lockForUpdate()->first();
            $post->refresh();
        }

        return $now;
    }

    /** A save that moves a grouped post to a platform another post of its group has is refused: one post per platform. */
    public static function assertPlatformFree(ContentPlannerPost $post, string $platform): void
    {
        if ($post->group_id && ContentPlannerPost::where('group_id', $post->group_id)->where('id', '!=', $post->id)->where('platform', $platform)->exists()) {
            throw new ContentRefused('version_exists', 'Another version in this group is already for that platform.', 409);
        }
    }

    /**
     * The versions, made in one transaction, as drafts on the original's day and time, each with its own copy of the
     * original's visual brief and picture (Content never deletes a picture file, so two briefs may share one). A
     * platform already in the group refuses the whole call.
     *
     * @param list<string> $platforms
     * @return Collection<int, ContentPlannerPost>
     */
    public static function make(ContentPlannerPost $original, array $platforms, int $userId): Collection
    {
        return DB::transaction(function () use ($original, $platforms, $userId) {
            // Two calls at once for the same platform, from any posts of the group: the second waits here, then sees the
            // first one's version.
            self::lockGroup($original);
            if (array_intersect($platforms, self::platformsOf($original)) !== []) {
                throw new ContentRefused('version_exists', 'This post already has a version for that platform.', 409);
            }
            $groupId = (int) ($original->group_id ?: $original->id);
            if (!$original->group_id) {
                ContentPlannerPost::whereKey($original->id)->toBase()->update(['group_id' => $groupId]);
            }
            $brief = $original->visualBrief()->first();

            $versions = collect($platforms)->map(function (string $platform) use ($original, $groupId, $userId, $brief) {
                $version = ContentPlannerPost::create($original->only(self::COPIED) + [
                    'planner_profile_id' => $original->planner_profile_id,
                    'brand_id'           => $original->brand_id,
                    'platform'           => $platform,
                    'status'             => 'draft',
                    'group_id'           => $groupId,
                    'generated_by'       => 'version',
                    'created_by'         => $userId,
                ]);
                if ($brief) {
                    $copy = $brief->replicate(['post_id']);
                    $copy->post_id = $version->id;
                    $copy->save();
                }

                return $version;
            });
            // Each version gets its own short link to the same address (spec 2026-10-19 §5.1).
            ContentLinks::copyTo($original, $versions);

            return $versions;
        });
    }

    /**
     * Takes a post out of its group; the last one left is no longer a group either. When the post leaving is the one
     * whose id keys the group, the rest take the oldest one's id: otherwise its next versions would join them again.
     */
    public static function unlink(ContentPlannerPost $post): void
    {
        if (!$post->group_id) {
            return;
        }
        $groupId = (int) $post->group_id;
        DB::transaction(function () use ($post, $groupId) {
            ContentPlannerPost::whereKey($post->id)->toBase()->update(['group_id' => null]);
            $left = ContentPlannerPost::where('group_id', $groupId)->orderBy('id')->pluck('id');
            if ($left->count() === 1) {
                ContentPlannerPost::whereKey($left->first())->toBase()->update(['group_id' => null]);
            } elseif ($left->count() > 1 && (int) $post->id === $groupId) {
                ContentPlannerPost::whereIn('id', $left->all())->toBase()->update(['group_id' => (int) $left->first()]);
            }
        });
    }

    /**
     * What the panel shows of a post's group (§3.4): each post in it, oldest first, and which versions the AI is still
     * adapting or did not adapt. A group of one is not shown.
     *
     * @return array{id: int, posts: list<array<string, mixed>>, adapting: list<int>, kept_original: list<int>, kept_reason: ?string}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        if (!$post->group_id) {
            return null;
        }
        $posts = ContentPlannerPost::where('group_id', $post->group_id)->orderBy('id')
            ->get(['id', 'platform', 'status', 'scheduled_date', 'scheduled_time', 'created_at', 'updated_at']);
        if ($posts->count() < 2) {
            return null;
        }
        $ids = $posts->pluck('id')->map(fn ($id) => (int) $id)->all();
        $kept = (array) Cache::get(self::keptKey((int) $post->group_id), []);
        // A kept version a person has since changed is theirs now: nothing more to say about it.
        $untouched = $posts->filter(fn (ContentPlannerPost $p) => !$p->updated_at->gt($p->created_at))->pluck('id')->map(fn ($id) => (int) $id)->all();
        $keptIds = array_values(array_intersect(array_map('intval', (array) ($kept['ids'] ?? [])), $untouched));

        return [
            'id'            => (int) $post->group_id,
            'posts'         => $posts->map(fn (ContentPlannerPost $p) => [
                'id'             => (int) $p->id,
                'platform'       => (string) $p->platform,
                'status'         => (string) $p->status,
                'scheduled_date' => $p->scheduled_date?->format('Y-m-d'),
                'scheduled_time' => $p->scheduled_time ? substr((string) $p->scheduled_time, 0, 5) : null,
            ])->values()->all(),
            'adapting'      => array_values(array_intersect(array_map('intval', (array) Cache::get(self::adaptingKey((int) $post->group_id), [])), $ids)),
            'kept_original' => $keptIds,
            // The post's own reason when it is kept; otherwise the first kept version's (the panel words this post's).
            'kept_reason'   => $keptIds === [] ? null : self::reasonOf($kept, in_array((int) $post->id, $keptIds, true) ? (int) $post->id : $keptIds[0]),
        ];
    }

    /** Set while the AI adapts a group's versions (the panel's "Adapting for LinkedIn…"), as a repeat's rewording key. */
    public static function adaptingKey(int $groupId): string
    {
        return "content:version-adapt:{$groupId}";
    }

    /** The versions the AI did not adapt, and why (the panel says they keep the original's words), for a day. */
    public static function keptKey(int $groupId): string
    {
        return "content:version-kept:{$groupId}";
    }

    /** @param list<int> $ids the versions still to adapt; none ends the adapting */
    public static function stillAdapting(int $groupId, array $ids): void
    {
        $ids === []
            ? Cache::forget(self::adaptingKey($groupId))
            : Cache::put(self::adaptingKey($groupId), array_values(array_unique(array_map('intval', $ids))), now()->addMinutes(15));
    }

    /** @param list<int> $ids — each keeps the reason it was kept for (5A-1 review: a later batch does not relabel them). */
    public static function keep(int $groupId, array $ids, string $reason): void
    {
        $before = (array) Cache::get(self::keptKey($groupId), []);
        $reasons = (array) ($before['reasons'] ?? []);
        foreach ((array) ($before['ids'] ?? []) as $id) {
            // An entry written before reasons were kept per version: its one reason stands for each of its ids.
            $reasons[(int) $id] ??= $before['reason'] ?? $reason;
        }
        foreach ($ids as $id) {
            $reasons[(int) $id] = $reason;
        }
        Cache::put(self::keptKey($groupId), ['ids' => array_map('intval', array_keys($reasons)), 'reasons' => $reasons], now()->addDay());
    }

    /** @param array<string, mixed> $kept */
    private static function reasonOf(array $kept, int $id): ?string
    {
        $reasons = (array) ($kept['reasons'] ?? []);

        return isset($reasons[$id]) ? (string) $reasons[$id] : (isset($kept['reason']) ? (string) $kept['reason'] : null);
    }
}
