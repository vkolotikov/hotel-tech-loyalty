<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Loyalty\Visits\Visit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The member's own stamp card (release 7, spec 2026-10-25 §2): `GET /v1/member/stamps` (the app's next build) and
 * `GET /v1/member/portal/stamps` (the portal) answer StampCards::forMember() without staff details, only the member's
 * own, and just `{enabled: false}` while the venue's stamp card is off and the member has none.
 */
class StampCardEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, VisitsSchema, CreditSchema, PushSchema;

    private const ENDPOINTS = ['/api/v1/member/stamps', '/api/v1/member/portal/stamps'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
    }

    private function asGrace(): static
    {
        return $this->actingAs(User::query()->findOrFail($this->grace->user_id), 'sanctum');
    }

    public function test_off_and_without_a_card_it_says_only_that(): void
    {
        foreach (self::ENDPOINTS as $url) {
            $this->asGrace()->getJson($url)->assertOk()->assertExactJson(['enabled' => false]);
        }
    }

    public function test_the_member_sees_their_own_card_without_staff_details(): void
    {
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 3, 'stamp_reward_points' => 150], $this->manager);
        $stamps = app(StampCards::class);
        $stamps->stamp($this->grace, new Visit(Visit::CHECK_IN, 'scan_event', 4, null, '2026-10-04', $this->staffMember));
        $stamps->stamp($this->ada, new Visit(Visit::CHECK_IN, 'scan_event', 5, null, '2026-10-04', $this->staffMember));

        foreach (self::ENDPOINTS as $url) {
            $json = $this->asGrace()->getJson($url)->assertOk()
                ->assertJsonPath('enabled', true)
                ->assertJsonPath('stamps_per_card', 3)
                ->assertJsonPath('reward', ['kind' => 'points', 'points' => 150])
                ->assertJsonPath('card.stamps_count', 1)
                ->assertJsonPath('card.stamps_needed', 3)
                ->assertJsonPath('card.stamps', [['venue_day' => '2026-10-04', 'source' => 'check_in']])
                ->assertJsonPath('completed_cards', 0)
                ->json();
            $this->assertSame([['venue_day' => '2026-10-04', 'source' => 'check_in', 'card_number' => 1]], $json['history']['stamps']);
            $this->assertStringNotContainsString($this->staffMember->name, json_encode($json));
        }
    }

    public function test_a_card_kept_after_the_venue_switched_it_off_still_shows_as_off(): void
    {
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => true], $this->manager);
        app(StampCards::class)->stamp($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 9, 40.0, '2026-10-04'));
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => false], $this->manager);

        $this->asGrace()->getJson('/api/v1/member/portal/stamps')->assertOk()
            ->assertJsonPath('enabled', false)
            ->assertJsonPath('card.stamps_count', 1);
    }

    public function test_a_venue_without_a_programme_shows_no_card(): void
    {
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => true], $this->manager);
        LoyaltyTier::query()->update(['is_active' => false]);

        $this->asGrace()->getJson('/api/v1/member/portal/stamps')->assertOk()->assertExactJson(['enabled' => false]);
    }

    public function test_staff_cannot_use_the_portals_door(): void
    {
        $this->asStaffMember()->getJson('/api/v1/member/portal/stamps')->assertStatus(403)->assertJsonPath('error', 'member_only');
    }
}
