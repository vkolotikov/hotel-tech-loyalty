<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class PlannerDayNote extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'note_date', 'note_text'];

    protected $casts = [
        'note_date' => 'date',
    ];
}
