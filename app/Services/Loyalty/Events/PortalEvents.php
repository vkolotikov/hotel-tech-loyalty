<?php

namespace App\Services\Loyalty\Events;

/**
 * What the member portal shows of events (release 8, spec 2026-10-25 §4). PRE-WIRED STUB: part E implements it.
 */
class PortalEvents
{
    /** Whether the venue has a published event that has not ended (the portal's menu offers Events then). */
    public function offered(int $orgId): bool
    {
        return false;
    }
}
