<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlannerDayNote extends Model
{
    protected $fillable = ['note_date', 'note_text'];

    protected $casts = [
        'note_date' => 'date',
    ];
}
