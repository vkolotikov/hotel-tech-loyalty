<?php

namespace App\Services\Crm;

use App\Models\Activity;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * HexaTech CRM's team activity (round 5, owner 2026-11-12): the newest lines of the leads' and contacts' timelines
 * (`activities`, the one table every note, call, email, chat, stage move and completed task is written to), who logged
 * each, what it was, when, and the lead or contact it belongs to. Reads only.
 *
 * Scope: the organisation's rows (TenantScope). With a brand chosen (BrandMiddleware binds `current_brand_id`), a line
 * of a lead shows when the lead is that brand's — the lead's own BrandScope decides, as everywhere a lead is listed,
 * because not every writer stamps the line's own `brand_id` — and a line without a lead when its own `brand_id` is that
 * brand's. "All brands" shows every line of the organisation.
 */
final class CrmActivityFeed
{
    /** The line types the timeline writes (ActivityController, InquiryController, TaskController, the mail sync). */
    public const TYPES = ['note', 'call', 'email', 'meeting', 'chat', 'status_change', 'task_completed', 'file', 'system'];

    public const PER_PAGE = 20;

    public const MAX_PER_PAGE = 50;

    /**
     * @param  array{type?: string|null, page?: int, per_page?: int}  $filters
     * @return array{data: list<array<string, mixed>>, meta: array{current_page: int, last_page: int, total: int}}
     */
    public function page(array $filters): array
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, (int) ($filters['per_page'] ?? self::PER_PAGE)));
        $brand = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        $query = Activity::query()
            ->with([
                'creator:id,name',
                'inquiry:id,guest_id,status,brand_id',
                'inquiry.guest:id,full_name,email,company',
                'guest:id,full_name,email,company',
            ])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        if (!empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }
        if ($brand) {
            $query->where(fn ($q) => $q->whereHas('inquiry')
                ->orWhere(fn ($w) => $w->whereNull('inquiry_id')->where('activities.brand_id', (int) $brand)));
        }

        $page = $query->paginate($perPage, ['*'], 'page', max(1, (int) ($filters['page'] ?? 1)));

        return [
            'data' => array_map(fn (Activity $a) => $this->row($a), $page->items()),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ];
    }

    /** @return array<string, mixed> */
    private function row(Activity $a): array
    {
        /** @var Inquiry|null $lead */
        $lead = $a->inquiry_id ? $a->getRelation('inquiry') : null;
        /** @var Guest|null $leadGuest */
        $leadGuest = $lead?->getRelation('guest');
        /** @var Guest|null $guest */
        $guest = $a->getRelation('guest');
        $person = $leadGuest ?? $guest;
        $creator = $a->getRelation('creator');
        $metadata = is_array($a->metadata) ? $a->metadata : [];
        $body = trim((string) preg_replace('/\s+/u', ' ', strip_tags((string) $a->body)));

        return [
            'id'               => (int) $a->id,
            'type'             => (string) $a->type,
            'direction'        => $a->direction,
            'subject'          => $a->subject,
            'excerpt'          => $body === '' ? null : Str::limit($body, 160),
            'duration_minutes' => $a->duration_minutes,
            'occurred_at'      => $a->occurred_at->toIso8601String(),
            'by'               => $creator instanceof User ? ['id' => (int) $creator->id, 'name' => (string) $creator->name] : null,
            'lead'             => $lead ? ['id' => (int) $lead->id, 'name' => $leadGuest?->full_name ?: $leadGuest?->email, 'company' => $leadGuest?->company, 'status' => $lead->status] : null,
            'contact'          => $person ? ['id' => (int) $person->id, 'name' => $person->full_name ?: $person->email] : null,
            'conversation_id'  => isset($metadata['conversation_id']) && is_numeric($metadata['conversation_id']) ? (int) $metadata['conversation_id'] : null,
        ];
    }
}
