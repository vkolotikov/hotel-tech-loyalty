<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;

/**
 * The Ideas board (spec 2026-10-16 §4.1): the brand's posts without a day, in four columns by status, each its 50
 * most recently changed and its total. Published, skipped and archived posts stay on the Posts page.
 */
final class ContentIdeas
{
    public const COLUMNS = [
        'idea'   => ['idea'],
        'draft'  => ['draft'],
        'review' => ['needs_review', 'needs_visual'],
        'ready'  => ['approved', 'ready_to_publish'],
    ];

    public const PER_COLUMN = 50;

    /** @return array{columns: array<string, array{posts: list<array<string, mixed>>, total: int}>} */
    public static function for(ContentPlannerProfile $profile, ?string $platform, ?int $pillarId): array
    {
        $columns = [];
        foreach (self::COLUMNS as $column => $statuses) {
            $query = fn () => ContentPlannerPost::query()
                ->where('planner_profile_id', $profile->id)
                ->whereNull('scheduled_date')
                ->whereIn('status', $statuses)
                ->when($platform !== null, fn ($q) => $q->where('platform', $platform))
                ->when($pillarId !== null, fn ($q) => $q->where('pillar_id', $pillarId));
            $columns[$column] = [
                'posts' => $query()->with('visualBrief')->orderByDesc('updated_at')->orderByDesc('id')->limit(self::PER_COLUMN)->get()
                    ->map(fn (ContentPlannerPost $post) => ContentPostPresenter::card($post))->values()->all(),
                'total' => $query()->count(),
            ];
        }

        return ['columns' => $columns];
    }

    /** @return array{columns: array<string, array{posts: list<array<string, mixed>>, total: int}>} */
    public static function empty(): array
    {
        return ['columns' => array_map(fn () => ['posts' => [], 'total' => 0], self::COLUMNS)];
    }
}
