<?php

namespace App\Services\Loyalty\Access;

use App\Models\LoyaltyEvent;
use App\Models\User;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\Events\EventCheckIn;
use App\Services\Loyalty\MemberDirectory;
use Illuminate\Support\Facades\DB;

/**
 * A scan at an event's door (release 8, spec 2026-10-25 §1, §4): the code is read as Scan reads it (CardLookup), and
 * the member it names — whatever their state — is handed to part E's EventCheckIn, which decides (AccessDecision),
 * writes the event's scan row and the attendance, gives the points and, after its commit, the visit. Nothing of that is
 * done here, and EventCheckIn runs outside any transaction of this class, so its after-commit work follows its own
 * commit.
 *
 * A code that names nobody keeps its refusal (as PlaceScan) and is logged as the event's attempts are (EventCheckIn:
 * `scan_type` `event`, the event's `loyalty_event_id`), `denied`, with no member and the refusal's code in
 * `action_taken`.
 *
 * Sent again with its idempotency key, the scan answers the first answer (ScanReplay) and reads the code no second
 * time; the key goes on to EventCheckIn, whose own retry rule (one check-in per member and event) holds when two
 * copies of a scan race.
 */
final class EventScan
{
    public function __construct(
        private readonly CardLookup $cards,
        private readonly EventCheckIn $checkIn,
    ) {
    }

    /**
     * `{ status, body }`: 200 with `{ member, verdict: checkIn's verdict + { event: {id, title}, entry_id (the check-in's
     * scan row) }, checked_in, already_in, signed_up, points, stamp, benefits }`, or the code's refusal (404 `{ error,
     * message[, card] }`).
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public function scan(LoyaltyEvent $event, string $code, User $by, ?string $key = null): array
    {
        $orgId = (int) $event->organization_id;
        $replay = ScanReplay::for($orgId, $key, ['code' => trim($code), 'event_id' => (int) $event->id]);
        if (($seen = $replay->seen()) !== null) {
            return $seen;
        }

        $read = DB::transaction(function () use ($code, $by, $event, $orgId) {
            $read = $this->cards->read(trim($code), $by);
            if ($read->namedMember() === null) {
                PlaceScan::log($orgId, $by, PlaceScan::DENIED, CardLookup::refusal($read)->errorCode, null, null, $event, EventCheckIn::SCAN_TYPE);
            }

            return $read;
        });

        $member = $read->namedMember();
        if ($member === null) {
            $refusal = CardLookup::refusal($read);
            $answer = ['status' => $refusal->status, 'body' => ['error' => $refusal->errorCode, 'message' => $refusal->getMessage()] + $refusal->extra];
            $replay->keep($answer['status'], $answer['body']);

            return $answer;
        }

        $done = $this->checkIn->checkIn($event, $member, $by, $key);

        $fresh = $member->fresh() ?? $member;
        $fresh->loadMissing('user:id,name,email,phone');
        $answer = ['status' => 200, 'body' => [
            'member'     => MemberDirectory::row($fresh),
            'verdict'    => (array) ($done['verdict'] ?? []) + [
                'event'    => ['id' => (int) $event->id, 'title' => (string) $event->title],
                'entry_id' => isset($done['scan_event_id']) ? (int) $done['scan_event_id'] : null,
            ],
            'checked_in' => (bool) ($done['checked_in'] ?? false),
            'already_in' => $done['already_in'] ?? null,
            'signed_up'  => (bool) ($done['signed_up'] ?? false),
            'points'     => (int) ($done['points'] ?? 0),
            'stamp'      => $done['stamp'] ?? null,
            'benefits'   => MemberBenefits::of($fresh),
        ]];
        $replay->keep($answer['status'], $answer['body']);

        return $answer;
    }
}
