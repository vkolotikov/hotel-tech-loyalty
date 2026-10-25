<?php

namespace App\Services\Loyalty\Access;

use App\Models\AccessPlace;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\ScanEvent;
use App\Models\User;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\MemberDirectory;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;

/**
 * A scan at a place's door (release 8, spec 2026-10-25 §1): the code is read as Scan reads it (CardLookup), the member
 * it names — whatever their state: a switched-off member is a red verdict with the member shown, not a refusal —
 * is decided by AccessDecision, and the entry is written to `scan_events`:
 *
 *   scan_type `access`, access_place_id, member_id, staff_id (who scanned), result `granted`|`denied`, action_taken the
 *   verdict's reason, token_value null (the raw code is never kept: a QR token or a card's ID is a credential).
 *
 * A code that names nobody (or a token that cannot be used, or a switched-off card) keeps its refusal — `not_found`,
 * `expired`, `revoked`, `used_up`, `inactive` (with `card: off`), 404 as the desk answers it — and is logged as a
 * `denied` row with that code in `action_taken` and no member: an entry without a member is always a refusal of the
 * code, never a decision. A granted entry is activity (`last_activity_at`); the entry row is the scan's record, so no
 * audit row is added for each person at a door.
 *
 * At an event, a code naming nobody is logged the same way as the event's own rows are (`scan_type` `event`, the event's
 * `loyalty_event_id`; EventScan); a member found is part E's EventCheckIn's, which writes the event's row itself.
 *
 * A scan sent again with its idempotency key answers the first answer (ScanReplay) and writes nothing: the key is
 * checked under an advisory lock on it, inside the transaction that writes the entry and keeps the answer, so a retry
 * racing the first waits for it.
 */
final class PlaceScan
{
    public const SCAN_TYPE = 'access';
    public const GRANTED = 'granted';
    public const DENIED = 'denied';

    public function __construct(
        private readonly CardLookup $cards,
        private readonly AccessDecision $decision,
    ) {
    }

    /**
     * `{ status, body }`: 200 with `{ member, verdict: AccessVerdict + { place: {id, name}, entry_id }, benefits }`, or
     * the code's refusal (404 `{ error, message[, card] }`).
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public function scan(AccessPlace $place, string $code, User $by, ?string $key = null): array
    {
        $orgId = (int) $place->organization_id;
        $replay = ScanReplay::for($orgId, $key, ['code' => trim($code), 'place_id' => (int) $place->id]);

        $work = function () use ($place, $code, $by, $replay, $orgId) {
            if (($seen = $replay->seen()) !== null) {
                return $seen;
            }

            $read = $this->cards->read(trim($code), $by);
            $member = $read->namedMember();
            if ($member === null) {
                $refusal = CardLookup::refusal($read);
                self::log($orgId, $by, self::DENIED, $refusal->errorCode, null, $place, null);
                $answer = ['status' => $refusal->status, 'body' => ['error' => $refusal->errorCode, 'message' => $refusal->getMessage()] + $refusal->extra];
                $replay->keep($answer['status'], $answer['body']);

                return $answer;
            }

            $verdict = $this->decision->decide($member, $place);
            $entry = self::log($orgId, $by, $verdict->granted ? self::GRANTED : self::DENIED, $verdict->reason, $member, $place, null);
            if ($verdict->granted) {
                LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->update(['last_activity_at' => now()]);
                $member->setAttribute('last_activity_at', now());
            }

            $member->loadMissing('user:id,name,email,phone');
            $answer = ['status' => 200, 'body' => [
                'member'   => MemberDirectory::row($member),
                'verdict'  => $verdict->toArray() + ['place' => ['id' => (int) $place->id, 'name' => (string) $place->name], 'entry_id' => (int) $entry->id],
                'benefits' => MemberBenefits::of($member),
            ]];
            $replay->keep($answer['status'], $answer['body']);

            return $answer;
        };

        return $replay->keyed() ? AdvisoryLock::transaction((string) $replay->lockKey(), $work) : DB::transaction($work);
    }

    /**
     * One entry (or, with an event, a refused code at the event's door) in the scan log. The device is noted as the
     * desk's scans note it; the code itself is not.
     */
    public static function log(int $orgId, User $by, string $result, string $reason, ?LoyaltyMember $member, ?AccessPlace $place, ?LoyaltyEvent $event, string $type = self::SCAN_TYPE): ScanEvent
    {
        $row = (new ScanEvent())->forceFill([
            'organization_id'  => $orgId,
            'member_id'        => $member?->id,
            'staff_id'         => $by->id,
            'property_id'      => $by->property_id ?? null,
            'scan_type'        => $type,
            'token_value'      => null,
            'result'           => $result,
            'action_taken'     => $reason,
            'access_place_id'  => $place?->id,
            'loyalty_event_id' => $event?->id,
            'device_id'        => mb_substr((string) request()?->header('X-Device-Id', ''), 0, 100) ?: null,
            'ip_address'       => request()?->ip(),
        ]);
        $row->save();

        return $row;
    }
}
