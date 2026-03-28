<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlannerSubtask extends Model
{
    public $timestamps = false;

    protected $fillable = ['task_id', 'title', 'is_done', 'created_at'];

    protected $casts = [
        'is_done'    => 'boolean',
        'created_at' => 'datetime',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(PlannerTask::class, 'task_id');
    }
}
