<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\CrmAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CrmAiController extends Controller
{
    /**
     * Diagnostic endpoint — check AI service configuration.
     * GET /api/v1/admin/crm-ai/diagnose
     */
    public function diagnose(): JsonResponse
    {
        $checks = [];

        // 1. Config check — only expose boolean presence, never key content
        $apiKey = config("services.anthropic.api_key", "");
        $checks["anthropic_key_set"] = !empty($apiKey);
        $checks["anthropic_model"] = config("services.anthropic.model", "(not set)");
        $checks["config_cached"] = app()->configurationIsCached();

        // 3. DB connectivity
        try {
            $checks["db_driver"] = \Illuminate\Support\Facades\DB::getDriverName();
            $checks["crm_settings_count"] = \App\Models\CrmSetting::count();
            $checks["db_ok"] = true;
        } catch (\Throwable $e) {
            $checks["db_ok"] = false;
            $checks["db_error"] = $e->getMessage();
        }

        // 4. HTTP outbound check
        try {
            $r = \Illuminate\Support\Facades\Http::timeout(10)
                ->withHeaders(["x-api-key" => $apiKey, "anthropic-version" => "2023-06-01", "content-type" => "application/json"])
                ->post("https://api.anthropic.com/v1/messages", [
                    "model" => "claude-sonnet-4-20250514", "max_tokens" => 5,
                    "messages" => [["role" => "user", "content" => "Say hi"]],
                ]);
            $checks["api_status"] = $r->status();
            $checks["api_body_preview"] = substr($r->body(), 0, 200);
        } catch (\Throwable $e) {
            $checks["api_reachable"] = false;
            $checks["api_error"] = $e->getMessage();
        }

        return response()->json($checks);
    }

    public function chat(Request $request): JsonResponse
    {
        $request->validate([
            'messages'           => 'required|array|min:1',
            'messages.*.role'    => 'required|string|in:user,assistant',
            'messages.*.content' => 'required|string',
        ]);

        try {
            $result = (new CrmAiService())->chat($request->input('messages'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI chat failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'response' => 'AI service error: ' . $e->getMessage(),
                'actions'  => [],
                'error'    => true,
            ], 200); // Return 200 so frontend can display the message
        }
    }

    public function captureLead(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractLead($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-lead failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    public function captureMember(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractMember($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-member failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    public function captureCorporate(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractCorporate($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-corporate failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }
}
