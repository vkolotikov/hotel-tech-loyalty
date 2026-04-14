<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
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
        'header_title',
        'header_subtitle',
        'welcome_message',
        'welcome_title',
        'welcome_subtitle',
        'input_placeholder',
        'input_hint_text',
        'show_suggestions',
        'suggestions',
        'assistant_avatar_url',
        'branding_text',
        'agent_status',
        'primary_color',
        'header_text_color',
        'user_bubble_color',
        'user_bubble_text',
        'bot_bubble_color',
        'bot_bubble_text',
        'chat_bg_color',
        'font_family',
        'border_radius',
        'show_branding',
        'header_style',
        'header_gradient_end',
        'window_style',
        'launcher_size',
        'position',
        'icon_style',
        'launcher_shape',
        'launcher_icon',
        'lead_capture_enabled',
        'lead_capture_fields',
        'lead_capture_delay',
        'offline_message',
        'is_active',
        'business_hours',
        'timezone',
        'gdpr_consent_required',
        'gdpr_consent_text',
        'inbox_sound_enabled',
        'rating_prompt_enabled',
        'rating_prompt_text',
        'canned_responses',
        'launcher_animation',
    ];

    protected $casts = [
        'lead_capture_fields' => 'array',
        'suggestions' => 'array',
        'show_suggestions' => 'boolean',
        'lead_capture_enabled' => 'boolean',
        'lead_capture_delay' => 'integer',
        'is_active' => 'boolean',
        'show_branding' => 'boolean',
        'border_radius' => 'integer',
        'launcher_size' => 'integer',
        'business_hours' => 'array',
        'canned_responses' => 'array',
        'gdpr_consent_required' => 'boolean',
        'inbox_sound_enabled' => 'boolean',
        'rating_prompt_enabled' => 'boolean',
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
        // Append the widget JS file's mtime as a cache-buster so each deploy
        // forces customer browsers to fetch the new version instead of
        // running an indefinitely-cached old build.
        $mtime = @filemtime(public_path('widget/hotel-chat.js')) ?: time();
        $src = $baseUrl . '/widget/hotel-chat.js?v=' . $mtime;

        return <<<HTML
<script>
(function(){var w=window,d=document;w.HotelChat={key:"{$key}",api:"{$apiBase}"};var s=d.createElement("script");s.src="{$src}";s.async=true;d.head.appendChild(s)})();
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
