<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Reminders (spec 2026-10-19 §4.2–§4.3): the posts a person is to put out — the ones they post, and, for a manager,
 * the ones nobody on the team posts — on their day ("to post today") and for seven days after, while nobody has
 * marked them published, skipped or archived ("not marked as posted"). Built from the posts on every read; the bell
 * and the morning email share them.
 */
final class ContentReminders
{
    /** A post with one of these needs no reminder. */
    public const DONE = ['published', 'skipped', 'archived'];

    public const MISSED_DAYS = 7;

    /**
     * Today's posts for the person, by `$venueNow` (the venue's wall clock): those whose time has come — a post with no
     * time from the start of the day — or, with `$wholeDay`, all of them (the morning email lists the day).
     */
    public static function today(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, bool $wholeDay = false, ?array $audience = null): Builder
    {
        return self::mine($user, $profile, $audience)->whereDate('scheduled_date', $venueNow->format('Y-m-d'))
            ->when(!$wholeDay, fn (Builder $q) => $q->where(fn (Builder $t) => $t->whereNull('scheduled_time')
                ->orWhere('scheduled_time', '<=', $venueNow->format('H:i:s'))));
    }

    /** The person's posts from the seven days before today that nobody marked as done. */
    public static function missed(User $user, ContentPlannerProfile $profile, CarbonImmutable $venueNow, ?array $audience = null): Builder
    {
        return self::mine($user, $profile, $audience)
            ->whereDate('scheduled_date', '>=', $venueNow->subDays(self::MISSED_DAYS)->format('Y-m-d'))
            ->whereDate('scheduled_date', '<', $venueNow->format('Y-m-d'));
    }

    /** When a reminder appears: its day's start, or its time, on the venue's clock, as a moment. */
    public static function appearsAt(ContentPlannerPost $post, string $zone): CarbonImmutable
    {
        $time = $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : '00:00';

        return CarbonImmutable::createFromFormat('Y-m-d H:i', $post->scheduled_date->format('Y-m-d') . ' ' . $time, $zone)->utc();
    }

    /**
     * Who the reminders are for, to read once per request (5A-1 review: the bell asks every minute per open tab): whether
     * the person manages, and — for a manager — the brand's team. @return array{manager: bool, members: list<int>}
     */
    public static function audience(User $user, ContentPlannerProfile $profile): array
    {
        $manager = ContentAccess::canManage($user);

        return ['manager' => $manager, 'members' => $manager ? ContentTeam::memberIds((int) $profile->brand_id) : []];
    }

    /**
     * Posts not done that the person posts, or — for a manager — that nobody on the team posts.
     *
     * @param array{manager: bool, members: list<int>}|null $audience from audience(); null: read here
     */
    private static function mine(User $user, ContentPlannerProfile $profile, ?array $audience = null): Builder
    {
        ['manager' => $manager, 'members' => $members] = $audience ?? self::audience($user, $profile);

        return ContentPlannerPost::query()->where('planner_profile_id', $profile->id)->whereNotIn('status', self::DONE)
            ->where(function (Builder $q) use ($user, $manager, $members) {
                $q->where('poster_id', $user->id);
                if ($manager) {
                    $q->orWhereNull('poster_id')->orWhereNotIn('poster_id', $members);
                }
            });
    }
}
