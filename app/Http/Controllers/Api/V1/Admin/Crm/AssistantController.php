<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Services\Crm\BotGaps;
use App\Services\Crm\CrmRefused;
use App\Services\Crm\ReplyDrafter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech CRM's AI helpers (2026-11-07): the answers the assistant got wrong that are still to be taught (read only),
 * and a reply drafted for a person to edit and send. Behind `workspace:crm`; the drafts need the plan's `chatbot`.
 */
class AssistantController extends Controller
{
    public function gaps(BotGaps $gaps): JsonResponse
    {
        return response()->json(['data' => $gaps->list()]);
    }

    public function draft(Request $request, int $id, ReplyDrafter $drafter): JsonResponse
    {
        $validated = $request->validate(['instruction' => 'nullable|string|max:300']);
        // TenantScope: another organisation's conversation is not found.
        $conversation = ChatConversation::query()->find($id);
        if (!$conversation) {
            throw new CrmRefused('not_found', 'Not found.', 404);
        }

        return response()->json($drafter->draft($request->attributes->get('workspace_org'), $conversation, $validated['instruction'] ?? null));
    }
}
