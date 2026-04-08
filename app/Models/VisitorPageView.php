<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitorPageView extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'visitor_id',
        'url',
        'title',
        'referrer',
        'duration_seconds',
        'viewed_at',
    ];

    protected $casts = [
        'viewed_at'        => 'datetime',
        'duration_seconds' => 'integer',
    ];

    public function visitor(): BelongsTo
    {
        return $this->belongsTo(Visitor::class);
    }
}
