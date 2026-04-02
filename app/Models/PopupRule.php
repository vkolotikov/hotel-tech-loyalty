<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class PopupRule extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'widget_config_id',
        'name',
        'is_active',
        'trigger_type',
        'trigger_value',
        'url_match_type',
        'url_match_value',
        'visitor_type',
        'language_targets',
        'message',
        'quick_replies',
        'priority',
        'impressions_count',
        'clicks_count',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'language_targets' => 'array',
        'quick_replies' => 'array',
        'priority' => 'integer',
        'impressions_count' => 'integer',
        'clicks_count' => 'integer',
    ];

    public function widgetConfig()
    {
        return $this->belongsTo(ChatWidgetConfig::class, 'widget_config_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
