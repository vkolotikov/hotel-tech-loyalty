<?php

namespace App\Models;

use App\Models\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ChatWidgetConfig extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'widget_key',
        'api_key',
        'company_name',
        'welcome_message',
        'primary_color',
        'position',
        'icon_style',
        'launcher_shape',
        'launcher_icon',
        'lead_capture_enabled',
        'lead_capture_fields',
        'lead_capture_delay',
        'offline_message',
        'is_active',
    ];

    protected $casts = [
        'lead_capture_fields' => 'array',
        'lead_capture_enabled' => 'boolean',
        'lead_capture_delay' => 'integer',
        'is_active' => 'boolean',
    ];

    public static function getForOrg(int $orgId): self
    {
        return static::where('organization_id', $orgId)->first()
            ?? new static([
                'organization_id' => $orgId,
                'widget_key' => Str::uuid()->toString(),
                'api_key' => Str::random(48),
                'company_name' => '',
                'primary_color' => '#c9a84c',
                'position' => 'bottom-right',
                'icon_style' => 'classic',
                'launcher_shape' => 'circle',
                'launcher_icon' => 'chat',
                'lead_capture_enabled' => true,
                'lead_capture_fields' => ['name' => true, 'email' => true, 'phone' => false],
                'is_active' => true,
            ]);
    }

    public function regenerateApiKey(): void
    {
        $this->update(['api_key' => Str::random(48)]);
    }

    public function generateEmbedCode(string $baseUrl): string
    {
        return '<script src="' . $baseUrl . '/widget/chat-widget.js" data-widget-key="' . $this->widget_key . '"></script>';
    }
}
