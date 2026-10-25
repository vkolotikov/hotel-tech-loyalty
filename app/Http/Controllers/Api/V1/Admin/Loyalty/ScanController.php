<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AccessPlace;
use App\Models\LoyaltyEvent;
use App\Services\Loyalty\Access\EventScan;
use App\Services\Loyalty\Access\PlaceScan;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Scan (spec 2026-10-21 §4.7): what a card reader or a typed entry gave, to
 * the member it names. The member's card itself is the member's page's
 * (`members/{id}`), which the workspace reads next; no AI call here.
 *
 * Release 8 (spec 2026-10-25 §1): `POST scan` `{ code, place_id?, event_id?, idempotency_key? }` (the
 * `Idempotency-Key` header when the body has none) scans for a context:
 *  - neither: the desk, exactly as before — `{ member }`, or the code's refusal;
 *  - `place_id`: an entry at the place (PlaceScan) — `{ member, verdict, benefits }`;
 *  - `event_id`: a check-in at the event (EventScan, then part E's EventCheckIn) — `{ member, verdict, checked_in,
 *    already_in, signed_up, points, benefits }`.
 * The place or the event must be this organisation's (404 `not_found`, with `gone: place|event` so the screen can tell
 * it from a code that names nobody). Every active staff member may scan, as at the desk.
 */
class ScanController extends Controller
{
    public function scan(Request $request, CardLookup $cards, PlaceScan $places, EventScan $events): JsonResponse
    {
        $data = $request->validate([
            'code'            => 'required|string|max:2000',
            'place_id'        => 'nullable|integer|min:1|prohibits:event_id',
            'event_id'        => 'nullable|integer|min:1',
            'idempotency_key' => 'nullable|string|max:64',
        ]);

        if (!isset($data['place_id']) && !isset($data['event_id'])) {
            $member = $cards->find($data['code'], $request->user());
            $member->loadMissing('user:id,name,email,phone');

            return response()->json(['member' => MemberDirectory::row($member)]);
        }

        $key = $this->key($request, $data['idempotency_key'] ?? null);
        if (isset($data['place_id'])) {
            $place = AccessPlace::query()->find((int) $data['place_id'])
                ?? throw new LoyaltyRefused('not_found', 'This place is not in your programme.', 404, ['gone' => 'place']);
            $answer = $places->scan($place, $data['code'], $request->user(), $key);
        } else {
            $event = LoyaltyEvent::query()->find((int) $data['event_id'])
                ?? throw new LoyaltyRefused('not_found', 'This event is not in your programme.', 404, ['gone' => 'event']);
            $answer = $events->scan($event, $data['code'], $request->user(), $key);
        }

        return response()->json($answer['body'], $answer['status']);
    }

    /** The body's key, or the header's when the body has none (a long header kept as its hash). */
    private function key(Request $request, ?string $sent): ?string
    {
        $key = $sent ?: trim((string) $request->header('Idempotency-Key', ''));

        return $key === '' ? null : (mb_strlen($key) > 64 ? sha1($key) : $key);
    }
}
