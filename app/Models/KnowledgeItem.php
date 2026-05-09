<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class KnowledgeItem extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'category_id',
        'question',
        'answer',
        'keywords',
        'priority',
        'use_count',
        'is_active',
    ];

    protected $casts = [
        'keywords' => 'array',
        'priority' => 'integer',
        'use_count' => 'integer',
        'is_active' => 'boolean',
    ];

    public function category()
    {
        return $this->belongsTo(KnowledgeCategory::class, 'category_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function incrementUseCount(): void
    {
        $this->increment('use_count');
    }
}
