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

    /**
     * Generate a JavaScript embed snippet for website installation.
     */
    public function generateEmbedCode(string $baseUrl): string
    {
        $key = $this->widget_key;
        $apiBase = rtrim($baseUrl, '/') . '/api/v1/widget/' . $key;

        return <<<HTML
<script>
(function(){var w=window,d=document;w.HotelChat={key:"{$key}",api:"{$apiBase}"};var s=d.createElement("script");s.src="{$baseUrl}/widget/hotel-chat.js";s.async=true;d.head.appendChild(s)})();
</script>
HTML;
    }

    /**
     * Generate an iframe embed code for simple installation.
     */
    public function generateIframeCode(string $baseUrl): string
    {
        return '<iframe src="' . rtrim($baseUrl, '/') . '/widget/chat/' . $this->widget_key
            . '" style="position:fixed;bottom:20px;right:20px;width:400px;height:600px;border:none;z-index:9999;" allow="microphone"></iframe>';
    }

    /**
     * Generate API-only integration info for custom implementations.
     */
    public function getApiInfo(string $baseUrl): array
    {
        $apiBase = rtrim($baseUrl, '/') . '/api/v1/widget/' . $this->widget_key;
        return [
            'widget_key' => $this->widget_key,
            'api_base'   => $apiBase,
            'endpoints'  => [
                'config'      => ['method' => 'GET',  'url' => $apiBase . '/config'],
                'init'        => ['method' => 'POST', 'url' => $apiBase . '/init'],
                'message'     => ['method' => 'POST', 'url' => $apiBase . '/message'],
                'lead'        => ['method' => 'POST', 'url' => $apiBase . '/lead'],
                'popup_rules' => ['method' => 'GET',  'url' => $apiBase . '/popup-rules'],
            ],
        ];
    }
}
