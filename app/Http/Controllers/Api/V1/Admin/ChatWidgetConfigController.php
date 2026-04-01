<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatWidgetConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChatWidgetConfigController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $config = ChatWidgetConfig::getForOrg($orgId);

        return response()->json($config);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name'         => 'nullable|string|max:180',
            'welcome_message'      => 'nullable|string|max:1000',
            'primary_color'        => 'nullable|string|max:7',
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

        $orgId = $request->user()->organization_id;

        $config = ChatWidgetConfig::where('organization_id', $orgId)->first();

        if (!$config) {
            $config = ChatWidgetConfig::create(array_merge($validated, [
                'organization_id' => $orgId,
                'widget_key' => Str::uuid()->toString(),
                'api_key' => Str::random(48),
            ]));
        } else {
            $config->update($validated);
        }

        return response()->json($config);
    }

    public function regenerateKey(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $config = ChatWidgetConfig::where('organization_id', $orgId)->firstOrFail();
        $config->regenerateApiKey();

        return response()->json($config);
    }

    public function embedCode(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $config = ChatWidgetConfig::where('organization_id', $orgId)->firstOrFail();
        $baseUrl = config('app.url', $request->getSchemeAndHttpHost());

        return response()->json([
            'embed_code'  => $config->generateEmbedCode($baseUrl),
            'iframe_code' => $config->generateIframeCode($baseUrl),
            'api_info'    => $config->getApiInfo($baseUrl),
            'widget_key'  => $config->widget_key,
        ]);
    }
}
