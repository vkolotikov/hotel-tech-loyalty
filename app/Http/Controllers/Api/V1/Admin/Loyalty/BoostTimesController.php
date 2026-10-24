<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "These times are right" on Program (release 6, spec 2026-10-23 §2 item 6). A boost whose times were last saved before
 * every save read them as the venue's wall clock (no `earn_rate_events.times_venue_at`, at a venue not on UTC: R4-6)
 * says "check the time" until it is saved again. A manager who has looked at the times, as Program lists them on the
 * venue's clock, confirms them here together: each named boost still flagged gets `times_venue_at` stamped, with one
 * conditional update, and nothing else — its start and end stay exactly as stored — and the confirmation is audited
 * (`earn_rate_event_times_confirmed`, with the times confirmed). A boost saved meanwhile (which stamped it) or one not
 * flagged is left as it is and named as such. Managers only, as every Program change (AccessMap
 * `admin/loyalty/program/boosts/confirm-times`).
 */
class BoostTimesController extends Controller
{
    public function confirm(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate([
            'ids'   => 'required|array|min:1|max:500',
            'ids.*' => ['bail', 'integer', 'distinct', OwnRows::rule('earn_rate_events')],
        ]);
        $orgId = (int) app('current_organization_id');
        $ids = array_map('intval', $data['ids']);

        // Read through the tenant and brand scopes: a boost this request cannot see is not this request's to confirm.
        $boosts = EarnRateEvent::query()->whereKey($ids)->orderBy('id')->get();
        if ($boosts->count() !== count($ids)) {
            throw LoyaltyRefused::notFound();
        }

        $confirmed = [];
        $unchanged = [];
        $named = VenueClock::isNamed($orgId);
        foreach ($boosts as $boost) {
            $stamp = now();
            // Flagged only at a venue not on UTC, and only until a save (or this) stamps it.
            $changed = $named && $boost->times_venue_at === null
                ? EarnRateEvent::query()->whereKey($boost->id)->whereNull('times_venue_at')->update(['times_venue_at' => $stamp])
                : 0;
            if ($changed !== 1) {
                $unchanged[] = (int) $boost->id;
                continue;
            }
            $confirmed[] = (int) $boost->id;
            AuditLog::record('earn_rate_event_times_confirmed', $boost,
                ['times_venue_at' => $stamp->toIso8601String(), 'starts_at' => $boost->starts_at?->toIso8601String(), 'ends_at' => $boost->ends_at?->toIso8601String()],
                ['times_venue_at' => null], $request->user(), "Times of earn-rate event '{$boost->name}' confirmed as the venue's");
        }

        return response()->json(['confirmed' => $confirmed, 'unchanged' => $unchanged]);
    }
}
