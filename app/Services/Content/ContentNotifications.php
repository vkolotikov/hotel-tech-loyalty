<?php

namespace App\Services\Content;

use App\Jobs\SendContentNotification;
use App\Models\ContentNotification;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\User;

final class ContentNotifications
{
    /** Same policy as the approval inbox: managers review; only the writer hears its outcome. */
    public static function approval(ContentPlannerPost $post, ContentPlannerPostEvent $event): void
    {
        $team = ContentTeam::of((int) $post->brand_id);
        $recipients = in_array($event->kind, ['sent_for_approval', 'changed_after_approval'], true)
            ? $team->where('role', 'manager')->pluck('id')->all()
            : $team->where('id', (int) $post->created_by)->pluck('id')->all();
        self::keep($post, 'event', (int) $event->id, (string) $event->kind, $event->user_id, $recipients, $event->created_at);
    }

    public static function mentions(ContentPlannerPost $post, ContentPlannerPostComment $comment): void
    {
        self::keep($post, 'comment', (int) $comment->id, 'mention', $comment->user_id,
            array_column($comment->mentions ?? [], 'id'), $comment->created_at);
    }

    private static function keep(ContentPlannerPost $post, string $source, int $id, string $kind, ?int $actor, array $recipients, mixed $at): void
    {
        foreach (array_unique($recipients) as $recipient) {
            if ((int) $recipient === $actor) continue;
            $notification = ContentNotification::firstOrCreate([
                'recipient_id' => $recipient, 'source_type' => $source, 'source_id' => $id,
            ], [
                'organization_id' => $post->organization_id, 'brand_id' => $post->brand_id,
                'post_id' => $post->id, 'kind' => $kind, 'created_at' => $at,
            ]);
            // Off means no queued mail, including old news when a person opts in later.
            if ($notification->wasRecentlyCreated && User::whereKey($recipient)->where('wants_content_collaboration_email', true)->exists()) {
                SendContentNotification::dispatch((int) $notification->id)->afterCommit();
            }
        }
    }
}
