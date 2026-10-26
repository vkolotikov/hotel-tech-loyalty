<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\Reward;
use App\Models\ScanEvent;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** "Start here" (release 10, owner 2026-10-26): the setup steps, each done as the venue stands now. */
class StartTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // Ways to earn's checks read what can be booked and the events (ProgrammeAdvice).
        $this->buildProgrammeAdviceSchema();
    }

    /** @return array<string, bool> */
    private function done(): array
    {
        $answer = $this->asStaffMember()->getJson($this->api('start'))->assertOk();

        return array_column($answer->json('steps'), 'done', 'key');
    }

    public function test_every_staff_member_reads_the_steps_in_order_with_what_each_counts(): void
    {
        $answer = $this->asStaffMember()->getJson($this->api('start'))->assertOk();

        $this->assertSame(['programme', 'tiers', 'ways', 'rewards', 'logo', 'member', 'scan'], array_column($answer->json('steps'), 'key'));
        // The workspace's own ladder is in use and it has members (Ada and Grace); nothing else is set up yet: the wizard was neither
        // applied nor skipped, Ways to earn finds warnings (no reward to spend points on, nothing earns at this salon),
        // no reward, no logo, no scan.
        $this->assertSame(
            ['programme' => false, 'tiers' => true, 'ways' => false, 'rewards' => false, 'logo' => false, 'member' => true, 'scan' => false],
            array_column($answer->json('steps'), 'done', 'key'),
        );
        $answer->assertJsonPath('steps.1.count', 3)
            ->assertJsonPath('done', 2)
            ->assertJsonPath('total', 7);
        $this->assertGreaterThan(0, $answer->json('steps.2.count'));
    }

    public function test_each_step_ticks_itself_as_the_venue_sets_it_up(): void
    {
        ProgrammeOptions::markSetUp($this->org->id);
        Reward::create(['name' => 'Free coffee', 'points_cost' => 100, 'is_active' => true]);
        // Something earns points at a salon without bookings: purchases at the desk.
        ProgrammeOptions::save($this->org->id, ['desk_earn_enabled' => true], null);
        HotelSetting::create(['key' => 'company_logo', 'value' => 'https://cdn.example.test/logos/lumiere.png', 'type' => 'string', 'group' => 'branding']);
        ScanEvent::create(['scan_type' => 'qr', 'result' => 'ok']);

        $this->assertSame(
            ['programme' => true, 'tiers' => true, 'ways' => true, 'rewards' => true, 'logo' => true, 'member' => true, 'scan' => true],
            $this->done(),
        );
    }

    public function test_a_switched_off_ladder_or_reward_does_not_count_and_another_organisations_rows_never_do(): void
    {
        LoyaltyTier::query()->update(['is_active' => false]);
        Reward::create(['name' => 'Retired', 'points_cost' => 100, 'is_active' => false]);
        // Elsewhere Spa has its own tier in use, a reward, a logo and a scan: none of them is this venue's.
        $other = $this->otherOrganization();
        app()->instance('current_organization_id', $other['org']->id);
        Reward::create(['name' => 'Their coffee', 'points_cost' => 100, 'is_active' => true]);
        HotelSetting::create(['key' => 'company_logo', 'value' => 'https://cdn.example.test/logos/elsewhere.png', 'type' => 'string', 'group' => 'branding']);
        ScanEvent::create(['scan_type' => 'qr', 'result' => 'ok']);
        app()->instance('current_organization_id', $this->org->id);

        $done = $this->done();
        $this->assertFalse($done['tiers']);
        $this->assertFalse($done['rewards']);
        $this->assertFalse($done['logo']);
        $this->assertFalse($done['scan']);
    }
}
