<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerRead;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * The "For you" bell (spec 2026-10-16 §8), for one person and the current brand: the posts waiting for approval
 * (managers, while the switch is on; they stay until acted on), and the news since the person last opened the list —
 * "approved" and "sent back" on posts they wrote, comments by others on posts they wrote or commented on. News is at
 * most 30 days old; an item whose author has left stays, with no name. Release 5a adds the reminders (spec 2026-10-19
 * §4.3): today's posts once their time comes and the ones not marked as posted — like the waiting posts, they stay
 * until done and count while they last.
 */
final class ContentInbox
{
    public const LIMIT = 50;

    public const LOOKBACK_DAYS = 30;

    /** A send-back note or a comment is cut to this in the list; the panel shows it whole. */
    public const NOTE_LENGTH = 200;

    private const WITH = ['post:id,platform,title,hook,topic,scheduled_date,scheduled_time,status', 'user:id,name'];

    /** @return array{items: list<array<string, mixed>>, count: int, read_at: string} */
    public static function for(User $user, ?ContentPlannerProfile $profile): array
    {
        // What "seen" may cover: news that arrives while the list is open stays new.
        $readAt = CarbonImmutable::now()->toISOString();
        if (!$profile) {
            return ['items' => [], 'count' => 0, 'read_at' => $readAt];
        }
        $seenAt = self::seenAt($user, $profile);
        $since = self::since($seenAt);
        $items = [];
        $audience = ContentReminders::audience($user, $profile);

        $waiting = self::waiting($profile, $audience['manager']);
        if ($waiting) {
            foreach ($waiting->with('createdBy:id,name')->orderByDesc('updated_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $post) {
                $at = $post->waiting_since ? CarbonImmutable::parse($post->waiting_since) : CarbonImmutable::instance($post->updated_at);
                $items[] = self::item("waiting:{$post->id}", 'waiting', $post, $post->createdBy, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
        $orgId = (int) $profile->organization_id;
        $venueNow = VenueClock::now($orgId);
        $zone = VenueClock::zone($orgId);
        $reminders = ['to_post' => ContentReminders::today($user, $profile, $venueNow, false, $audience), 'not_posted' => ContentReminders::missed($user, $profile, $venueNow, $audience)];
        foreach ($reminders as $kind => $query) {
            foreach ($query->orderByDesc('scheduled_date')->orderByDesc('scheduled_time')->orderByDesc('id')->limit(self::LIMIT)->get() as $post) {
                $at = ContentReminders::appearsAt($post, $zone);
                $items[] = self::item("{$kind}:{$post->id}", $kind, $post, null, null, $at, $seenAt === null || $at->gt($seenAt));
            }
        }
        foreach (self::approvals($user, $profile, $since)->with(self::WITH)->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $event) {
            $items[] = self::item("event:{$event->id}", (string) $event->kind, $event->post, $event->user, $event->note, CarbonImmutable::instance($event->created_at), true);
        }
        foreach (self::comments($user, $profile, $since)->with(self::WITH)->orderByDesc('created_at')->orderByDesc('id')->limit(self::LIMIT)->get() as $comment) {
            $items[] = self::item("comment:{$comment->id}", 'comment', $comment->post, $comment->user, $comment->body, CarbonImmutable::instance($comment->created_at), true);
        }
        // Newest first; usort keeps the order above for items of the same second.
        usort($items, fn (array $a, array $b) => $b['at'] <=> $a['at']);

        // The count from what the list already read: who manages, the team and the last seen (final review).
        return ['items' => array_slice($items, 0, self::LIMIT), 'count' => self::tally($user, $profile, $audience, $since, $venueNow), 'read_at' => $readAt];
    }

    /** Everything waiting, and the news not yet seen. */
    public static function count(User $user, ?ContentPlannerProfile $profile): int
    {
        if (!$profile) {
            return 0;
        }

        return self::tally($user, $profile, ContentReminders::audience($user, $profile), self::since(self::seenAt($user, $profile)), VenueClock::now((int) $profile->organization_id));
    }

    /** @param array{manager: bool, members: list<int>} $audience */
    private static function tally(User $user, ContentPlannerProfile $profile, array $audience, CarbonImmutable $since, CarbonImmutable $venueNow): int
    {
        return (self::waiting($profile, $audience['manager'])?->count() ?? 0)
            + ContentReminders::today($user, $profile, $venueNow, false, $audience)->count()
            + ContentReminders::missed($user, $profile, $venueNow, $audience)->count()
            + self::approvals($user, $profile, $since)->count()
            + self::comments($user, $profile, $since)->count();
    }

    /** Marks the news up to `$at` (the list's `read_at`; now when none) as seen: never back, never ahead of now. */
    public static function markSeen(User $user, ContentPlannerProfile $profile, ?CarbonImmutable $at): void
    {
        $now = CarbonImmutable::now();
        $at = $at === null || $at->gt($now) ? $now : $at;
        $read = ContentPlannerRead::firstOrNew(['user_id' => $user->id, 'planner_profile_id' => $profile->id]);
        if ($read->seen_at !== null && $read->seen_at->gte($at)) {
            return;
        }
        $read->fill(['brand_id' => $profile->brand_id, 'seen_at' => $at])->save();
    }

    /** The posts waiting for approval, for a manager while the brand's switch is on; null for everyone else. */
    private static function waiting(ContentPlannerProfile $profile, bool $manager): ?Builder
    {
        if (!ContentApproval::isOn($profile) || !$manager) {
            return null;
        }

        return ContentPlannerPost::query()->where('planner_profile_id', $profile->id)->where('status', 'needs_review')
            ->addSelect(['waiting_since' => ContentPlannerPostEvent::select('created_at')
                ->whereColumn('post_id', 'content_planner_posts.id')
                ->whereIn('kind', ['sent_for_approval', 'changed_after_approval'])
                ->orderByDesc('id')->limit(1)]);
    }

    /** "Approved" and "sent back" by someone else on the posts the person wrote. */
    private static function approvals(User $user, ContentPlannerProfile $profile, CarbonImmutable $since): Builder
    {
        return ContentPlannerPostEvent::query()->whereIn('kind', ['approved', 'sent_back'])
            ->where('created_at', '>', $since)
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->whereIn('post_id', ContentPlannerPost::select('id')->where('planner_profile_id', $profile->id)->where('created_by', $user->id));
    }

    /** Comments by others on the posts the person wrote, and — on anyone else's post — after the person's own first one. */
    private static function comments(User $user, ContentPlannerProfile $profile, CarbonImmutable $since): Builder
    {
        return ContentPlannerPostComment::query()
            ->where('created_at', '>', $since)
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->whereIn('post_id', ContentPlannerPost::select('id')->where('planner_profile_id', $profile->id))
            ->where(fn ($q) => $q
                ->whereIn('post_id', ContentPlannerPost::select('id')->where('created_by', $user->id))
                ->orWhereExists(fn ($mine) => $mine->selectRaw('1')->from('content_planner_post_comments as mine')
                    ->whereColumn('mine.post_id', 'content_planner_post_comments.post_id')
                    ->where('mine.user_id', $user->id)
                    ->whereColumn('mine.created_at', '<', 'content_planner_post_comments.created_at')));
    }

    private static function seenAt(User $user, ContentPlannerProfile $profile): ?CarbonImmutable
    {
        $seen = ContentPlannerRead::where('user_id', $user->id)->where('planner_profile_id', $profile->id)->value('seen_at');

        return $seen ? CarbonImmutable::parse($seen) : null;
    }

    /** News counts from the later of the person's last look and 30 days ago. */
    private static function since(?CarbonImmutable $seenAt): CarbonImmutable
    {
        $floor = CarbonImmutable::now()->subDays(self::LOOKBACK_DAYS);

        return $seenAt !== null && $seenAt->gt($floor) ? $seenAt : $floor;
    }

    /** @return array<string, mixed> */
    private static function item(string $id, string $kind, ?ContentPlannerPost $post, ?User $by, ?string $note, CarbonImmutable $at, bool $unread): array
    {
        return [
            'id'     => $id,
            'kind'   => $kind,
            'post'   => $post ? [
                'id'             => (int) $post->id,
                'platform'       => (string) $post->platform,
                'title'          => $post->title,
                'hook'           => $post->hook,
                'topic'          => $post->topic,
                'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
                // The reminders' second line: its time, and its status when it is not ready yet (spec 2026-10-19 §4.3).
                'scheduled_time' => $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : null,
                'status'         => (string) $post->status,
            ] : null,
            'by'     => $by ? ['id' => (int) $by->id, 'name' => (string) $by->name] : null,
            'note'   => $note === null ? null : Str::limit($note, self::NOTE_LENGTH, '…'),
            'at'     => $at->toISOString(),
            'unread' => $unread,
        ];
    }
}
