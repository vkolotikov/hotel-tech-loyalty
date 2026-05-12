<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin CRUD for time-bounded earn-rate boost events.
 *
 *  - GET    /v1/admin/earn-rate-events
 *  - POST   /v1/admin/earn-rate-events
 *  - GET    /v1/admin/earn-rate-events/{id}
 *  - PUT    /v1/admin/earn-rate-events/{id}
 *  - DELETE /v1/admin/earn-rate-events/{id}
 *
 * Read endpoint lazily groups events into active / upcoming /
 * past buckets so the admin page renders without client-side sort.
 */
class EarnRateEventController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = EarnRateEvent::orderByDesc('starts_at')->get();
        $now = now();
        return response()->json([
            'active'   => $rows->filter(fn ($e) => $e->is_active && $e->starts_at <= $now && $e->ends_at >= $now)->values(),
            'upcoming' => $rows->filter(fn ($e) => $e->is_active && $e->starts_at > $now)->values(),
            'past'     => $rows->filter(fn ($e) => $e->ends_at < $now || !$e->is_active)->values(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['event' => EarnRateEvent::findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        $event = EarnRateEvent::create($data);

        AuditLog::record('earn_rate_event_created', $event, $event->toArray(), [],
            $request->user(), "Earn-rate event '{$event->name}' created ({$event->multiplier}x)");

        return response()->json(['event' => $event], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $event = EarnRateEvent::findOrFail($id);
        $old = $event->toArray();
        $event->update($this->validatePayload($request));

        AuditLog::record('earn_rate_event_updated', $event, $event->toArray(), $old,
            $request->user(), "Earn-rate event '{$event->name}' updated");

        return response()->json(['event' => $event->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $event = EarnRateEvent::findOrFail($id);
        $name = $event->name;
        $event->delete();

        AuditLog::record('earn_rate_event_deleted', null, ['id' => $id, 'name' => $name], [],
            $request->user(), "Earn-rate event '{$name}' deleted");

        return response()->json(['success' => true]);
    }

    private function validatePayload(Request $request): array
    {
        $data = $request->validate([
            'name'         => 'required|string|max:120',
            'description'  => 'nullable|string|max:500',
            'multiplier'   => 'required|numeric|min:1|max:10',
            'starts_at'    => 'required|date',
            'ends_at'      => 'required|date|after:starts_at',
            'days_of_week' => 'sometimes|nullable|array',
            'days_of_week.*' => 'integer|min:0|max:6',
            'tier_ids'     => 'sometimes|nullable|array',
            'tier_ids.*'   => 'integer|exists:loyalty_tiers,id',
            'property_id'  => 'sometimes|nullable|integer|exists:properties,id',
            'is_active'    => 'sometimes|boolean',
        ]);
        // Normalise empty arrays to null so the appliesTo() shortcut
        // (empty = "no constraint") works consistently.
        if (isset($data['days_of_week']) && empty($data['days_of_week'])) $data['days_of_week'] = null;
        if (isset($data['tier_ids']) && empty($data['tier_ids'])) $data['tier_ids'] = null;
        return $data;
    }
}
