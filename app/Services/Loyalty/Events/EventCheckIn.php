<?php

namespace App\Services\Loyalty\Events;

use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\User;

/**
 * Checking a member in at an event (release 8, spec 2026-10-25 §4): AccessDecision first, then one attendance per
 * member per event, the event's points, and the visit. PRE-WIRED STUB: part E implements it; part A's scan calls it
 * for a scan with an event.
 */
class EventCheckIn
{
    /**
     * @return array{verdict: array<string, mixed>, checked_in: bool, already_in: ?string, signed_up: bool, points: int, attendance_id: ?int}
     */
    public function checkIn(LoyaltyEvent $event, LoyaltyMember $member, User $by, ?string $key = null, ?int $scanEventId = null): array
    {
        return ['verdict' => (new \App\Services\Loyalty\Access\AccessVerdict(true, \App\Services\Loyalty\Access\AccessVerdict::WELCOME))->toArray(), 'checked_in' => false, 'already_in' => null, 'signed_up' => false, 'points' => 0, 'attendance_id' => null];
    }
}
