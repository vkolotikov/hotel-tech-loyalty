<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Provider calls happen before this boundary; only the result commit holds the post lock. */
final class ContentPostWrites
{
    public function apply(ContentPlannerPost $snapshot, callable $write): ContentPlannerPost
    {
        $seen = $snapshot->updated_at?->toISOString() ?? '';

        return DB::transaction(function () use ($snapshot, $seen, $write) {
            ContentExecution::check(true);
            $current = ContentPlannerPost::whereKey($snapshot->id)->lockForUpdate()->first()
                ?? throw new ContentRefused('not_found', 'This post no longer exists.', 404);
            self::assertFresh($current, $seen);
            $write($current);

            return $current;
        }, 3);
    }

    public static function assertFresh(ContentPlannerPost $post, string $seen): void
    {
        $sent = rescue(fn () => CarbonImmutable::parse($seen), null, false);
        if ($seen === '' || $sent === null || $post->updated_at === null || !$sent->equalTo($post->updated_at)) {
            throw new ContentRefused('changed_elsewhere', 'Someone else changed this post — reload to see their version.', 409,
                ['post' => ContentPostPresenter::detail($post)]);
        }
    }

    /** A visual lives on its own row, but belongs to the post's revision and approval. */
    public static function visualChanged(ContentPlannerPost $post): void
    {
        $before = (string) $post->status;
        $user = auth()->user();
        $profile = $post->profile;
        if ($post->status === 'needs_visual') $post->status = 'needs_review';
        if ($user) ContentApproval::beforeSave($post, $before, $user, $profile, true);
        $post->touch();
        if ($user) ContentApproval::afterAi($post, $before, $user, $profile);
    }
}
