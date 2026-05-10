<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * First-class planned activity on a deal / contact / company.
 *
 * A task with `completed_at IS NULL` and a `due_at` is "open" — that's
 * what surfaces on the daily Today bar (Overdue / Due Today / Due Soon)
 * and the standalone Tasks page that ships in CRM Phase 3.
 *
 * Replaces the legacy `inquiries.next_task_*` columns. The CRM Phase 1
 * migration seeds existing next_task_* into individual task rows so
 * old data doesn't disappear — see CRM_IMPROVEMENT_PLAN.md.
 *
 * Marking complete writes a sibling `Activity(type=task_completed,
 * subject=task.title)` so completed work flows into the timeline
 * without callers needing to remember.
 */
class Task extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'brand_id',
        'inquiry_id', 'guest_id', 'corporate_account_id',
        'type', 'title', 'description',
        'due_at', 'assigned_to', 'created_by',
        'completed_at', 'outcome', 'recurring_rule',
        // CRM Phase 7 — admin-defined custom fields (entity='task').
        'custom_data',
    ];

    protected $casts = [
        'due_at'         => 'datetime',
        'completed_at'   => 'datetime',
        'recurring_rule' => 'array',
        'custom_data'    => 'array',
    ];

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(Inquiry::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** True when the task is past due and not yet completed. */
    public function isOverdue(): bool
    {
        return $this->completed_at === null
            && $this->due_at !== null
            && $this->due_at->isPast();
    }

    public function scopeOpen($query)
    {
        return $query->whereNull('completed_at');
    }

    public function scopeOverdue($query)
    {
        return $query->whereNull('completed_at')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now());
    }

    public function scopeDueToday($query)
    {
        return $query->whereNull('completed_at')
            ->whereBetween('due_at', [now()->startOfDay(), now()->endOfDay()]);
    }
}
