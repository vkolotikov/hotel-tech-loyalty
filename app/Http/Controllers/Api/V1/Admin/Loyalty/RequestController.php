<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\RequestQueue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The benefit-request queue (spec 2026-10-21 §4.4): every active staff member works it, as in the full admin. */
class RequestController extends Controller
{
    public function index(Request $request, RequestQueue $queue): JsonResponse
    {
        $tab = (string) $request->query('state', 'waiting');

        return response()->json($queue->page(array_key_exists($tab, RequestQueue::TABS) ? $tab : 'waiting', (int) $request->query('page', 1)));
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
