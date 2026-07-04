<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToOrganization;

class PlannerTask extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'employee_name', 'assigned_to_user_id',
        'title', 'task_date', 'start_time', 'end_time',
        'status', 'priority', 'task_group', 'task_category',
        'duration_minutes', 'completed', 'description',
        // Planner v2 — recurring task support.
        'recurring', 'recurring_until', 'recurring_parent_id',
        // Pool horizon (2026-07) — metadata on an unscheduled pool task:
        // 'general' | 'week' | 'day' (NULL == general). pool_due_date is the
        // target day for 'day' (and the week-end date for 'week').
        'pool_horizon', 'pool_due_date',
    ];

    protected $casts = [
        'task_date'        => 'date',
        'completed'        => 'boolean',
        'recurring_until'  => 'date',
        // date:Y-m-d so the API returns a plain 'YYYY-MM-DD' (a bare `date`
        // cast serialises to a full ISO datetime, which breaks front-end
        // date parsing/labels).
        'pool_due_date'    => 'date:Y-m-d',
    ];

    /**
     * Central invariant for the pool-horizon columns. A scheduled task
     * (task_date set) can NEVER carry a pool horizon — the calendar date
     * wins — so both columns are cleared here. Firing on `saving` covers
     * every write path (store / update / move / bulk / claim), so no
     * caller can leave a horizon stranded on a scheduled row.
     */
    protected static function booted(): void
    {
        static::saving(function (PlannerTask $t) {
            if (!is_null($t->task_date)) {
                $t->pool_horizon  = null;
                $t->pool_due_date = null;
                return;
            }
            // Blank string normalises to NULL (== general). 'general' keeps
            // its explicit value but never carries a due date.
            if ($t->pool_horizon === '') {
                $t->pool_horizon = null;
            }
            if (is_null($t->pool_horizon) || $t->pool_horizon === 'general') {
                $t->pool_due_date = null;
            }
        });
    }

    public function subtasks(): HasMany
    {
        return $this->hasMany(PlannerSubtask::class, 'task_id');
    }
}
