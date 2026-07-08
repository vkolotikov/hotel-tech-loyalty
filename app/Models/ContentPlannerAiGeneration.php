<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentPlannerAiGeneration extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'user_id',
        'generation_type',
        'model',
        'prompt_hash',
        'prompt_text',
        'response_json',
        'tokens_input',
        'tokens_output',
        'cost_estimate',
        'status',
        'error_message',
    ];

    protected $casts = [
        'response_json' => 'array',
        'tokens_input' => 'integer',
        'tokens_output' => 'integer',
        'cost_estimate' => 'decimal:4',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('generation_type', $type);
    }

    public function scopeSuccessful($query)
    {
        return $query->where('status', 'success');
    }

    public function scopeRecent($query, $days = 30)
    {
        return $query->where('created_at', '>=', now()->subDays($days))->orderByDesc('created_at');
    }
}
