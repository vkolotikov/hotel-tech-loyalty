<?php

namespace Tests\Audit;

use Tests\Feature\LoyaltyWorkspace\TierMovesTest;

class AuditTierScheduleTest extends TierMovesTest
{
    public function test_audit_expired_tier_hold_catches_up_after_four_days(): void
    {
        $this->grace->forceFill(['tier_id' => $this->tiers['platinum']->id, 'tier_override_until' => now()->subDays(4), 'tier_effective_until' => null])->save();
        $this->artisan('loyalty:assess-tiers')->assertSuccessful();
        $this->assertSame($this->tiers['silver']->id, $this->grace->fresh()->tier_id);
    }
}
