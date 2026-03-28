<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlannerTask extends Model
{
    protected $fillable = [
        'employee_name', 'title', 'task_date', 'start_time', 'end_time',
        'status', 'priority', 'task_group', 'task_category',
        'duration_minutes', 'completed', 'description',
    ];

    protected $casts = [
        'task_date'  => 'date',
        'completed'  => 'boolean',
    ];

    public function subtasks(): HasMany
    {
        return $this->hasMany(PlannerSubtask::class, 'task_id');
    }
}
