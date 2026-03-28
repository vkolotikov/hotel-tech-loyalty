<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\RealtimeEventService;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RealtimeController extends Controller
{
    public function __construct(
        protected RealtimeEventService $events,
    ) {}

    /**
     * SSE endpoint — streams realtime events to the admin dashboard.
     * Connection stays open for ~30s, then client auto-reconnects.
     */
    public function stream(Request $request): StreamedResponse|\Illuminate\Http\JsonResponse
    {
        // Authenticate via query token (EventSource can't send headers)
        $token = $request->get('token');
        if (!$token || !PersonalAccessToken::findToken($token)) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $lastId = (int) ($request->header('Last-Event-ID') ?? $request->get('last_id', 0));

        // Purge stale events on ~10% of connections
        if (random_int(1, 10) === 1) {
            $this->events->cleanup(10);
        }

        return new StreamedResponse(function () use ($lastId) {
            // Disable output buffering
            if (function_exists('apache_setenv')) {
                apache_setenv('no-gzip', '1');
            }
            @ini_set('zlib.output_compression', '0');
            while (ob_get_level()) ob_end_clean();

            $start = time();
            $maxDuration = 30; // seconds
            $interval = 2;    // poll interval

            // Send initial connection event
            echo "event: connected\ndata: {\"status\":\"ok\"}\n\n";
            flush();

            while ((time() - $start) < $maxDuration) {
                $events = $this->events->since($lastId);

                foreach ($events as $event) {
                    $payload = json_encode([
                        'type'  => $event->type,
                        'title' => $event->title,
                        'body'  => $event->body,
                        'data'  => $event->data,
                        'time'  => $event->created_at->toIso8601String(),
                    ]);
                    echo "id: {$event->id}\nevent: notification\ndata: {$payload}\n\n";
                    $lastId = $event->id;
                }

                flush();

                if (connection_aborted()) break;

                sleep($interval);
            }

            // Tell client to reconnect
            echo "event: reconnect\ndata: {\"last_id\":{$lastId}}\n\n";
            flush();
        }, 200, [
            'Content-Type'                => 'text/event-stream',
            'Cache-Control'               => 'no-cache',
            'Connection'                  => 'keep-alive',
            'X-Accel-Buffering'           => 'no',  // Nginx
            'Access-Control-Allow-Origin' => '*',
        ]);
    }

    /**
     * Polling fallback — returns events since last_id as JSON.
     */
    public function poll(Request $request)
    {
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
