<?php

namespace App\Models;

use App\Models\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class KnowledgeCategory extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'name',
        'description',
        'priority',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'priority' => 'integer',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function items()
    {
        return $this->hasMany(KnowledgeItem::class, 'category_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
