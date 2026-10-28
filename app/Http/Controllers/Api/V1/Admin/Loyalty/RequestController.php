<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\RequestQueue;
use App\Services\Loyalty\RequestsInbox;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The benefit-request queue (spec 2026-10-21 §4.4): every active staff member works it, as in the full admin. */
class RequestController extends Controller
{
    public function inbox(Request $request, RequestsInbox $inbox): JsonResponse
    {
        $filters = $request->validate([
            'type' => 'sometimes|in:all,benefit,redemption,referral',
            'view' => 'sometimes|in:open,closed,all,waiting,approved',
            'q' => 'sometimes|nullable|string|max:120',
            'sort' => 'sometimes|in:newest,oldest',
            'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|in:5,10,25',
            'selected_kind' => 'required_with:selected_id|in:benefit,redemption,referral',
            'selected_id' => 'required_with:selected_kind|integer|min:1',
        ]);
        return response()->json($inbox->page($filters));
    }

    public function index(Request $request, RequestQueue $queue): JsonResponse
    {
        $tab = (string) $request->query('state', 'waiting');
        $data = $request->validate(['request' => 'sometimes|integer|min:1']);

        return response()->json($queue->page(array_key_exists($tab, RequestQueue::TABS) ? $tab : 'waiting', (int) $request->query('page', 1), null, isset($data['request']) ? (int) $data['request'] : null));
    }

    public function approve(Request $request, int $id, RequestQueue $queue): JsonResponse
    {
        return response()->json(['request' => RequestQueue::row($queue->approve($id, $request->user()))]);
    }

    public function done(Request $request, int $id, RequestQueue $queue): JsonResponse
    {
        return response()->json(['request' => RequestQueue::row($queue->done($id, $request->user()))]);
    }

    public function decline(Request $request, int $id, RequestQueue $queue): JsonResponse
    {
        $data = $request->validate(['reason' => 'required|string|min:2|max:255']);

        return response()->json(['request' => RequestQueue::row($queue->decline($id, $request->user(), trim($data['reason'])))]);
    }
}
