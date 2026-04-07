<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\RealtimeEventService;
use Illuminate\Http\Request;

class RealtimeController extends Controller
{
    public function __construct(
        protected RealtimeEventService $events,
    ) {}

    /**
     * Polling endpoint — returns events since last_id as JSON.
     */
    public function poll(Request $request)
    {
        // init=1 → seed the client with the current max id WITHOUT replaying old events.
        // Used on first page load when the client has no stored last_id.
        if ($request->boolean('init')) {
            $maxId = (int) \App\Models\RealtimeEvent::max('id');
            return response()->json([
                'events'  => [],
                'last_id' => $maxId,
            ]);
        }

        $lastId = (int) $request->get('last_id', 0);
        $events = $this->events->since($lastId);

        return response()->json([
            'events'  => $events->map(fn($e) => [
                'id'    => $e->id,
                'type'  => $e->type,
                'title' => $e->title,
                'body'  => $e->body,
                'data'  => $e->data,
                'time'  => $e->created_at->toIso8601String(),
            ]),
            'last_id' => $events->isNotEmpty() ? $events->last()->id : $lastId,
        ]);
    }
}
