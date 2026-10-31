<?php

namespace App\Jobs;

use App\Services\Loyalty\Staff\StaffAlerts;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;

/**
 * Tells staff phones of a member's new request (`StaffAlerts`). Dispatched after the response
 * (`dispatchAfterResponse`), so the member never waits on Expo and no queue worker is needed; anything that goes
 * wrong is logged and the member's request stands.
 */
class AlertStaffOfRequest
{
    use Dispatchable;

    /** @param 'benefit'|'reward' $kind */
    public function __construct(public readonly string $kind, public readonly int $organizationId, public readonly int $id) {}

    public function handle(StaffAlerts $alerts): void
    {
        try {
            $this->kind === 'reward'
                ? $alerts->rewardClaimed($this->organizationId, $this->id)
                : $alerts->benefitRequested($this->organizationId, $this->id);
        } catch (\Throwable $e) {
            Log::warning('Staff request alert failed', ['kind' => $this->kind, 'id' => $this->id, 'error' => $e->getMessage()]);
        }
    }
}
