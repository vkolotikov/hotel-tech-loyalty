<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatWidgetConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Throwable;

class ChatWidgetConfigController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        try {
            $orgId = $request->user()->organization_id;
            $config = ChatWidgetConfig::getForOrg($orgId);

            return response()->json($config);
        } catch (Throwable $e) {
            return $this->debugError($e);
        }
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name'         => 'nullable|string|max:180',
            'welcome_message'      => 'nullable|string|max:1000',
            'primary_color'        => 'nullable|string|max:7',
            'header_text_color'    => 'nullable|string|max:7',
            'user_bubble_color'    => 'nullable|string|max:7',
            'user_bubble_text'     => 'nullable|string|max:7',
            'bot_bubble_color'     => 'nullable|string|max:7',
            'bot_bubble_text'      => 'nullable|string|max:7',
            'chat_bg_color'        => 'nullable|string|max:7',
            'font_family'          => 'nullable|string|max:60',
            'border_radius'        => 'nullable|integer|min:0|max:24',
            'show_branding'        => 'nullable|boolean',
            'header_style'         => 'nullable|in:solid,gradient',
            'header_gradient_end'  => 'nullable|string|max:7',
            'launcher_size'        => 'nullable|integer|min:40|max:80',
            'position'             => 'nullable|in:bottom-right,bottom-left',
            'icon_style'           => 'nullable|string|max:30',
            'launcher_shape'       => 'nullable|in:circle,rounded-square,pill,square',
            'launcher_icon'        => 'nullable|in:chat,message,support,quote,question,sales',
            'lead_capture_enabled' => 'nullable|boolean',
            'lead_capture_fields'  => 'nullable|array',
            'lead_capture_delay'   => 'nullable|integer|min:0|max:300',
            'offline_message'      => 'nullable|string|max:500',
            'is_active'            => 'nullable|boolean',
        ]);

        try {
            $orgId = $request->user()->organization_id;

            // Coalesce nulls to defaults for non-nullable columns
            $validated['company_name'] = $validated['company_name'] ?? '';

            $config = ChatWidgetConfig::where('organization_id', $orgId)->first();

            if (!$config) {
                $config = ChatWidgetConfig::create(array_merge($validated, [
                    'organization_id' => $orgId,
                    'widget_key'      => Str::uuid()->toString(),
                    'api_key'         => Str::random(48),
                ]));
            } else {
                $config->update($validated);
            }

            return response()->json($config);
        } catch (Throwable $e) {
            return $this->debugError($e);
        }
    }

    public function regenerateKey(Request $request): JsonResponse
    {
        try {
            $orgId = $request->user()->organization_id;
            // TenantScope filters by org; fall back gracefully if no config yet.
            $config = ChatWidgetConfig::getForOrg($orgId);

            if (!$config->exists) {
                return response()->json(['error' => 'No widget configuration found. Save a configuration first.'], 404);
            }

            $config->regenerateApiKey();

            return response()->json($config);
        } catch (Throwable $e) {
            return $this->debugError($e);
        }
    }

    public function embedCode(Request $request): JsonResponse
    {
        try {
            $orgId  = $request->user()->organization_id;
            $config = ChatWidgetConfig::getForOrg($orgId);

            // Auto-create a default config if none exists yet.
            if (!$config->exists) {
                $config = ChatWidgetConfig::create([
                    'organization_id' => $orgId,
                    'widget_key'      => Str::uuid()->toString(),
                    'api_key'         => Str::random(48),
                ]);
            }

            $baseUrl = config('app.url', $request->getSchemeAndHttpHost());

            return response()->json([
                'embed_code'  => $config->generateEmbedCode($baseUrl),
                'iframe_code' => $config->generateIframeCode($baseUrl),
                'api_info'    => $config->getApiInfo($baseUrl),
                'widget_key'  => $config->widget_key,
            ]);
        } catch (Throwable $e) {
            return $this->debugError($e);
        }
    }

    /**
     * Return a JSON error response with full debug info.
     * Exposed on all environments intentionally until the production
     * issue is diagnosed — restrict to non-production once resolved.
     */
    private function debugError(Throwable $e): JsonResponse
    {
        return response()->json([
            'error'   => $e->getMessage(),
            'class'   => get_class($e),
            'file'    => $e->getFile(),
            'line'    => $e->getLine(),
            'trace'   => collect($e->getTrace())->take(15)->toArray(),
        ], 500);
    }
}
