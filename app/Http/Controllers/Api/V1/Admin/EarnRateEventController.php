<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyForms;
use Carbon\CarbonImmutable;
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
 *
 * Times (HexaTech Loyalty release 4, R4-6): the form sends the time it shows
 * without an offset, and that is the venue's wall clock — read through
 * LoyaltyForms::instant(), as the workspace's Program reads it, and stored as
 * the UTC instant; a time with an offset is the instant written. Before, a
 * bare time was stored as if it were UTC. Every save sets `times_venue_at`.
 * Each event also carries `starts_at_venue` / `ends_at_venue`, its instants
 * on the venue's clock (`YYYY-MM-DDTHH:mm`), which the page shows and edits,
 * and the list names the venue's `timezone`. The rest of every answer is as
 * it was (tests/Feature/Admin/EarnRateEventEndpointsTest.php).
 */
class EarnRateEventController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = EarnRateEvent::orderByDesc('starts_at')->get();
        $now = now();
        $zone = self::zone();
        $present = fn ($rows) => $rows->map(fn (EarnRateEvent $e) => self::present($e, $zone))->values();

        return response()->json([
            'active'   => $present($rows->filter(fn ($e) => $e->is_active && $e->starts_at <= $now && $e->ends_at >= $now)),
            'upcoming' => $present($rows->filter(fn ($e) => $e->is_active && $e->starts_at > $now)),
            'past'     => $present($rows->filter(fn ($e) => $e->ends_at < $now || !$e->is_active)),
            'timezone' => $zone,
        ]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['event' => self::present(EarnRateEvent::findOrFail($id), self::zone())]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        $event = EarnRateEvent::create($data);

        AuditLog::record('earn_rate_event_created', $event, $event->toArray(), [],
            $request->user(), "Earn-rate event '{$event->name}' created ({$event->multiplier}x)");

        return response()->json(['event' => self::present($event, self::zone())], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $event = EarnRateEvent::findOrFail($id);
        $old = $event->toArray();
        $event->update($this->validatePayload($request));

        AuditLog::record('earn_rate_event_updated', $event, $event->toArray(), $old,
            $request->user(), "Earn-rate event '{$event->name}' updated");

        return response()->json(['event' => self::present($event->fresh(), self::zone())]);
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

        // R4-6: a time without an offset is the venue's wall clock (the workspace's rule, one helper for both).
        $orgId = (int) app('current_organization_id');
        $data['starts_at'] = LoyaltyForms::instant((string) $data['starts_at'], $orgId);
        $data['ends_at'] = LoyaltyForms::instant((string) $data['ends_at'], $orgId);
        $data['times_venue_at'] = now();

        return $data;
    }

    private static function zone(): string
    {
        return VenueClock::zone((int) app('current_organization_id'));
    }

    /** @return array<string, mixed> The event as before, with its instants on the venue's clock beside them. */
    private static function present(EarnRateEvent $e, string $zone): array
    {
        $wall = fn ($at) => $at ? CarbonImmutable::instance($at)->setTimezone($zone)->format(VenueClock::WALL) : null;

        return $e->toArray() + [
            'starts_at_venue' => $wall($e->starts_at),
            'ends_at_venue'   => $wall($e->ends_at),
        ];
    }
}
