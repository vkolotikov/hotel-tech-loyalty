<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\User;

/**
 * A post's comments and approval steps in one timeline (spec 2026-10-16 §7.1): oldest first, the newest 200. A comment
 * or step whose author has left has no `user` (the portal says "Former team member").
 */
final class ContentTimeline
{
    public const LIMIT = 200;

    /** @return list<array<string, mixed>> */
    public static function for(ContentPlannerPost $post, ?User $viewer): array
    {
        $comments = $post->comments()->with('user:id,name')->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get()
            ->map(fn (ContentPlannerPostComment $comment) => self::comment($comment, $viewer));
        $events = $post->events()->with('user:id,name')->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get()
            ->map(fn (ContentPlannerPostEvent $event) => [
                'type' => 'event',
                'id'   => (int) $event->id,
                'kind' => (string) $event->kind,
                'user' => self::person($event->user),
                'note' => $event->note,
                'at'   => $event->created_at?->toISOString(),
            ]);

        return $comments->concat($events)
            ->sort(fn (array $a, array $b) => [$b['at'], $b['type'], $b['id']] <=> [$a['at'], $a['type'], $a['id']])
            ->take(self::LIMIT)->reverse()->values()->all();
    }

    /** One comment as the timeline and the comment endpoints send it. @return array<string, mixed> */
    public static function comment(ContentPlannerPostComment $comment, ?User $viewer): array
    {
        return [
            'type'   => 'comment',
            'id'     => (int) $comment->id,
            'user'   => self::person($comment->user),
            'body'   => (string) $comment->body,
            'edited' => $comment->edited_at !== null,
            'mine'   => $viewer !== null && $comment->user_id !== null && (int) $comment->user_id === (int) $viewer->id,
            'at'     => $comment->created_at?->toISOString(),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private static function person(?User $user): ?array
    {
        return $user ? ['id' => (int) $user->id, 'name' => (string) $user->name] : null;
    }
}
