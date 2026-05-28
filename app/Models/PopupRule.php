<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class PopupRule extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
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

    /**
     * Bust the WidgetChatController::getConfig cache whenever a rule
     * is added/changed/deleted. The cached config payload embeds the
     * popup rule list inline; without this, rule edits would take up
     * to 60 s to appear on the embedded widget.
     */
    protected static function booted(): void
    {
        $bust = function (self $rule) {
            $widgetKey = ChatWidgetConfig::withoutGlobalScopes()
                ->where('organization_id', $rule->organization_id)
                ->value('widget_key');
            if ($widgetKey) {
                \Illuminate\Support\Facades\Cache::forget('widget:config:' . $widgetKey);
            }
        };
        static::saved($bust);
        static::deleted($bust);
    }

    public function widgetConfig()
    {
        return $this->belongsTo(ChatWidgetConfig::class, 'widget_config_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
