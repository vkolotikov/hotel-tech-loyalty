<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** One filter contract for the Posts screen and its authenticated exports. */
final class ContentPostQuery
{
    public static function filters(Request $request, bool $paged = false): array
    {
        return $request->validate([
            'q' => 'nullable|string|max:100',
            'status' => ['nullable', Rule::in(ContentRules::STATUSES)],
            'platform' => ['nullable', Rule::in(ContentRules::PLATFORMS)],
            'platforms' => 'nullable|array|max:8',
            'platforms.*' => ['string', Rule::in(ContentRules::PLATFORMS)],
            'exclude_archived' => 'nullable|boolean',
            'pillar_id' => ['nullable', 'integer', ContentRules::owned('content_planner_pillars')],
            'campaign_id' => ['nullable', 'integer', ContentRules::owned('content_planner_campaigns')],
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'unscheduled' => 'nullable|boolean',
        ] + ($paged ? ['page' => 'nullable|integer|min:1'] : []));
    }

    /** @return Builder<ContentPlannerPost> */
    public static function query(array $data): Builder
    {
        return ContentPlannerPost::query()->where('planner_profile_id', ContentContext::profile()->id ?? 0)
            ->when($data['status'] ?? null, fn ($q, $v) => $q->where('status', $v), fn ($q) => $q->where('status', '!=', 'archived'))
            ->when($data['platform'] ?? null, fn ($q, $v) => $q->where('platform', $v))
            ->when($data['platforms'] ?? null, fn ($q, $v) => $q->whereIn('platform', $v))
            ->when($data['exclude_archived'] ?? false, fn ($q) => $q->where('status', '!=', 'archived'))
            ->when($data['pillar_id'] ?? null, fn ($q, $v) => $q->where('pillar_id', $v))
            ->when($data['campaign_id'] ?? null, fn ($q, $v) => $q->where('campaign_id', $v))
            ->when($data['from'] ?? null, fn ($q, $v) => $q->whereDate('scheduled_date', '>=', $v))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->whereDate('scheduled_date', '<=', $v))
            ->when($data['unscheduled'] ?? false, fn ($q) => $q->whereNull('scheduled_date'))
            ->when(trim((string) ($data['q'] ?? '')) !== '', fn ($q) => ContentPlan::search($q, $data['q']))
            ->orderByRaw('CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END')->orderByDesc('scheduled_date')
            ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 1 ELSE 0 END')->orderByDesc('scheduled_time')->orderByDesc('id');
    }
}
