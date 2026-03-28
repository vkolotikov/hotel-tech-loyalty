<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\CrmAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CrmAiController extends Controller
{
    public function chat(Request $request): JsonResponse
    {
        $request->validate([
            'messages'           => 'required|array|min:1',
            'messages.*.role'    => 'required|string|in:user,assistant',
            'messages.*.content' => 'required|string',
        ]);

        $result = (new CrmAiService())->chat($request->input('messages'));

        return response()->json($result);
    }

    public function captureLead(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        $result = (new CrmAiService())->extractLead($request->input('text'));

        return response()->json($result);
    }
}
