<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScheduledCommandRun extends Model
{
    protected $fillable = [
        'command',
        'expression',
        'status',
        'duration_ms',
        'output_excerpt',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'started_at'  => 'datetime',
        'finished_at' => 'datetime',
        'duration_ms' => 'integer',
    ];
}
