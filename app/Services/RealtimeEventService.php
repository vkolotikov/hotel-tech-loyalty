<?php

namespace App\Services;

use App\Models\RealtimeEvent;

class RealtimeEventService
{
    /**
     * Dispatch a realtime event that SSE clients will pick up.
     *
     * `$orgId` is optional and only needed when calling from a context
     * that doesn't bind `current_organization_id` (console commands,
     * queue workers, public webhook handlers). Web requests rely on
     * `BelongsToOrganization`'s auto-fill via TenantMiddleware and can
     * skip it.
     */
    public function dispatch(string $type, string $title, ?string $body = null, array $data = [], ?int $orgId = null): RealtimeEvent
    {
        $payload = [
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => $data ?: null,
            'created_at' => now(),
        ];
        if ($orgId !== null) {
            $payload['organization_id'] = $orgId;
        }
        return RealtimeEvent::create($payload);
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
