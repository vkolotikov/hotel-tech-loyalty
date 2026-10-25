<?php

namespace Tests\Feature\Loyalty;

use App\Models\EarnRateEvent;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A claimed `points_multiplier` offer is the member's own boost (release 7, spec 2026-10-25 §4.2): pointsForSpend()
 * takes the best of the running boosts and the member's claimed, live multiplier offers — never their product — and
 * then the tier's rates as before. Live means: claimed and not used, the offer this organisation's, switched on and
 * inside its dates, the claim not past its own expiry. The base rate is the venue's `points_per_currency`, read through
 * ProgrammeOptions.
 */
class OfferMultiplierEarnTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    private LoyaltyService $loyalty;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->loyalty = app(LoyaltyService::class);
    }

    private function offer(float $multiplier, array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create($attrs + [
            'organization_id' => $this->org->id, 'title' => "{$multiplier}x week", 'description' => 'Earn faster', 'type' => 'points_multiplier',
            'value' => $multiplier, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(5)->toDateString(), 'is_active' => true,
        ]);
    }

    private function claim(SpecialOffer $offer, array $attrs = []): MemberOffer
    {
        return MemberOffer::create($attrs + [
            'organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'offer_id' => $offer->id,
            'status' => 'claimed', 'claimed_at' => now(), 'expires_at' => $offer->end_date?->copy()->endOfDay(),
        ]);
    }

    private function boost(float $multiplier): EarnRateEvent
    {
        return EarnRateEvent::create(['name' => "{$multiplier}x boost", 'multiplier' => $multiplier, 'starts_at' => now()->subHour(), 'ends_at' => now()->addDay(), 'is_active' => true]);
    }

    private function earn(): int
    {
        return $this->loyalty->pointsForSpend($this->grace->fresh('tier'), 100);
    }

    public function test_a_claimed_live_multiplier_offer_is_a_personal_boost(): void
    {
        $this->assertSame(100, $this->earn());
        $this->claim($this->offer(2));

        $this->assertSame(200, $this->earn());
        $this->assertSame(2.0, $this->loyalty->bestOfferMultiplier($this->grace));
    }

    public function test_the_best_of_the_boosts_and_the_offers_wins_never_their_product(): void
    {
        $this->claim($this->offer(2));
        $this->boost(3);
        $this->assertSame(300, $this->earn());

        $this->claim($this->offer(4, ['title' => 'Four times']));
        $this->assertSame(400, $this->earn());
    }

    public function test_only_a_live_claim_counts(): void
    {
        $this->claim($this->offer(2), ['status' => 'available', 'claimed_at' => null]);           // offered, never claimed
        $this->claim($this->offer(3), ['status' => 'used', 'used_at' => now()->subDay()]);         // used
        $this->claim($this->offer(4), ['expires_at' => now()->subMinute()]);                       // the claim ran out
        $this->claim($this->offer(5, ['end_date' => now()->subDay()->toDateString(), 'start_date' => now()->subDays(9)->toDateString()]));
        $this->claim($this->offer(6, ['start_date' => now()->addDay()->toDateString()]));         // not started
        $this->claim($this->offer(7, ['is_active' => false]));                                     // switched off
        $this->claim($this->offer(8, ['type' => 'bonus_points']));                                 // not a multiplier

        $this->assertSame(100, $this->earn());
    }

    public function test_an_offer_ending_today_still_counts_and_another_members_claim_never(): void
    {
        $this->claim($this->offer(2, ['end_date' => now()->toDateString()]), ['expires_at' => now()->endOfDay()]);
        $this->claim($this->offer(9), ['member_id' => $this->ada->id]);

        $this->assertSame(200, $this->earn());
    }

    public function test_an_offers_multiplier_stops_at_the_boosts_ceiling(): void
    {
        $this->claim($this->offer(500));

        $this->assertSame(1000, $this->earn());
    }

    public function test_the_base_rate_is_the_venues_option_and_the_tier_rate_still_applies(): void
    {
        ProgrammeOptions::save($this->org->id, ['points_per_currency' => 2], $this->manager);
        $this->claim($this->offer(2));

        $this->assertSame(400, $this->earn());                                                     // 100 x 2 x 1.0 x 2
        $this->assertSame(250, $this->loyalty->pointsForSpend($this->ada->fresh('tier'), 100)); // Gold 1.25, no offer
    }
}
