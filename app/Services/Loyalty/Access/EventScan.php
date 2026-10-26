<?php

namespace App\Services\Loyalty\Access;

use App\Models\LoyaltyEvent;
use App\Models\User;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\Events\EventCheckIn;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use App\Support\SharedCache;
use Illuminate\Contracts\Cache\LockTimeoutException;
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
 * time. Copies of one keyed scan are taken one at a time under a SharedCache lock on the key — not an advisory lock in a
 * transaction, since EventCheckIn must commit before its after-commit visit runs: a second copy arriving while the
 * first is checking in waits for it and answers its answer, so a single-use QR code is read once and the member is not
 * shown "used up". A copy that cannot get the lock within LOCK_WAIT_SECONDS is 409 `in_progress` (nothing written; the
 * door retries). The key goes on to EventCheckIn too, whose own rule (one check-in per member and event) stands behind.
 */
final class EventScan
{
    /** How long a keyed scan's lock lives if its holder never lets go: longer than a check-in with its visit takes. */
    public const LOCK_SECONDS = 30;

    /** How long a second copy of a keyed scan waits for the first (`loyalty.scan_lock_wait`, default this). */
    public const LOCK_WAIT_SECONDS = 10;

    public function __construct(
        private readonly CardLookup $cards,
        private readonly EventCheckIn $checkIn,
    ) {
    }

    /**
     * `{ status, body }`: 200 with `{ member, verdict: checkIn's verdict + { event: {id, title}, entry_id (the check-in's
     * scan row) }, checked_in, already_in, signed_up, points, stamp, benefits }`, or the code's refusal (404 `{ error,
     * message[, card] }`), or — a keyed copy still waiting on the first — 409 `in_progress`.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    public function scan(LoyaltyEvent $event, string $code, User $by, ?string $key = null): array
    {
        $orgId = (int) $event->organization_id;
        $replay = ScanReplay::for($orgId, $key, ['code' => trim($code), 'event_id' => (int) $event->id]);
        if (!$replay->keyed()) {
            return $this->attempt($event, $code, $by, null, $replay);
        }

        $lock = SharedCache::store()->lock((string) $replay->lockKey(), self::LOCK_SECONDS);
        try {
            $lock->block(max(0, (int) config('loyalty.scan_lock_wait', self::LOCK_WAIT_SECONDS)));
        } catch (LockTimeoutException) {
            throw new LoyaltyRefused('in_progress', 'This scan is still being handled. Try again in a moment.', 409);
        }
        try {
            return $replay->seen() ?? $this->attempt($event, $code, $by, $key, $replay);
        } finally {
            // Always released: the next copy never waits out the lock's life.
            $lock->release();
        }
    }

    /**
     * One scan, read and handed to the check-in, its answer kept for the key's retries.
     *
     * @return array{status: int, body: array<string, mixed>}
     */
    private function attempt(LoyaltyEvent $event, string $code, User $by, ?string $key, ScanReplay $replay): array
    {
        $orgId = (int) $event->organization_id;
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
        // The visit after the check-in may have moved the member up a tier (tiers by visits): the chip names the tier the
        // benefits below are read from, the member's tier now (release 9).
        $verdict = (array) ($done['verdict'] ?? []);
        if ($fresh->tier_id !== null && (int) ($verdict['tier']['id'] ?? 0) !== (int) $fresh->tier_id) {
            $tier = \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $fresh->organization_id)->find($fresh->tier_id);
            if ($tier !== null) {
                $verdict['tier'] = ['id' => (int) $tier->id, 'name' => (string) $tier->name, 'color' => $tier->color_hex];
            }
        }
        $answer = ['status' => 200, 'body' => [
            'member'     => MemberDirectory::row($fresh),
            'verdict'    => $verdict + [
                'event'    => ['id' => (int) $event->id, 'title' => (string) $event->title],
                'entry_id' => isset($done['scan_event_id']) ? (int) $done['scan_event_id'] : null,
            ],
            'checked_in' => (bool) ($done['checked_in'] ?? false),
            'already_in' => $done['already_in'] ?? null,
            'already_in_at' => $done['already_in_at'] ?? null,
            'signed_up'  => (bool) ($done['signed_up'] ?? false),
            'points'     => (int) ($done['points'] ?? 0),
            'stamp'      => $done['stamp'] ?? null,
            'benefits'   => MemberBenefits::of($fresh),
        ]];
        $replay->keep($answer['status'], $answer['body']);

        return $answer;
    }
}
