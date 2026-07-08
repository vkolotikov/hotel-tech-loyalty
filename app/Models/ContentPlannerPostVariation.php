<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentPlannerPostVariation extends Model
{
    protected $fillable = [
        'post_id',
        'variation_type',
        'copy',
        'notes',
        'ai_output',
    ];

    protected $casts = [
        'ai_output' => 'array',
    ];

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
