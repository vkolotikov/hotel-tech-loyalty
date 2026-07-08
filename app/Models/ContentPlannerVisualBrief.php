<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentPlannerVisualBrief extends Model
{
    protected $fillable = [
        'post_id',
        'visual_type',
        'aspect_ratio',
        'style',
        'description',
        'scene',
        'mood',
        'composition',
        'text_overlay',
        'avoid',
        'video_script',
        'image_prompt_future',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
