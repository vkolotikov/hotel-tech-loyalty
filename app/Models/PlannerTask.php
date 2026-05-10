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
    ];

    protected $casts = [
        'task_date'        => 'date',
        'completed'        => 'boolean',
        'recurring_until'  => 'date',
    ];

    public function subtasks(): HasMany
    {
        return $this->hasMany(PlannerSubtask::class, 'task_id');
    }
}
