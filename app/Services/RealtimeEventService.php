<?php

namespace App\Services;

use App\Models\RealtimeEvent;

class RealtimeEventService
{
    /**
     * Dispatch a realtime event that SSE clients will pick up.
     */
    public function dispatch(string $type, string $title, ?string $body = null, array $data = []): RealtimeEvent
    {
        return RealtimeEvent::create([
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => $data ?: null,
            'created_at' => now(),
        ]);
    }

    /**
     * Get events newer than the given ID (for SSE streaming).
     */
    public function since(int $lastId): \Illuminate\Support\Collection
    {
        return RealtimeEvent::where('id', '>', $lastId)
            ->orderBy('id')
            ->limit(50)
            ->get();
    }

    /**
     * Purge events older than N minutes (called periodically).
     */
    public function cleanup(int $minutes = 10): int
    {
        return RealtimeEvent::where('created_at', '<', now()->subMinutes($minutes))->delete();
    }
}
