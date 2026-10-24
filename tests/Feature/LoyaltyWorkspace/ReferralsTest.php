<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Referral;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Referrals: the numbers and the list, read only (spec 2026-10-21 §4.6, §6.4). */
class ReferralsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_it_gives_the_figures_and_the_list_newest_first(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        Referral::create(['referrer_id' => $other['member']->id, 'referee_id' => $other['member']->id, 'status' => 'rewarded', 'referrer_points_awarded' => 900, 'referee_points_awarded' => 900]);
        app()->instance('current_organization_id', $prior);

        $linus = $this->makeMember('Linus Torvalds', 'linus@example.test');
        $rewarded = Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $this->grace->id, 'status' => 'rewarded', 'referrer_points_awarded' => 250, 'referee_points_awarded' => 100]);
        $rewarded->forceFill(['created_at' => now()->subDays(10)])->save();
        $pending = Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $linus->id, 'status' => 'pending']);

        $response = $this->asStaffMember()->getJson($this->api('referrals'))->assertOk();

        $response->assertJsonPath('figures', ['total' => 2, 'rewarded' => 1, 'pending' => 1, 'points_paid' => 350])
            ->assertJsonPath('page', 1)->assertJsonPath('pages', 1)->assertJsonPath('total', 2);
        $this->assertSame([$pending->id, $rewarded->id], array_column($response->json('referrals'), 'id'));
        $response->assertJsonPath('referrals.1', [
            'id'       => $rewarded->id,
            'referrer' => ['id' => $this->ada->id, 'name' => 'Ada Lovelace'],
            'referee'  => ['id' => $this->grace->id, 'name' => 'Grace Hopper'],
            'state'    => 'rewarded',
            'points'   => ['referrer' => 250, 'referee' => 100],
            'at'       => '2026-09-25T09:00:00+00:00',
        ])
            ->assertJsonPath('referrals.0.points', ['referrer' => 0, 'referee' => 0])
            ->assertJsonPath('referrals.0.referee.name', 'Linus Torvalds');
    }

    public function test_it_comes_25_a_page_and_an_empty_programme_answers_zeroes(): void
    {
        $this->asStaffMember()->getJson($this->api('referrals'))
            ->assertOk()
            ->assertJsonPath('figures', ['total' => 0, 'rewarded' => 0, 'pending' => 0, 'points_paid' => 0])
            ->assertJsonPath('referrals', [])
            ->assertJsonPath('pages', 1);

        // One referral per referee (referrals_referrer_id_referee_id_unique): Ada brought in 26 guests.
        foreach (range(1, 26) as $i) {
            $referee = $this->makeMember("Referee {$i}", "referee{$i}@example.test");
            Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $referee->id, 'status' => 'pending']);
        }

        $this->asStaffMember()->getJson($this->api('referrals'))->assertJsonCount(25, 'referrals')->assertJsonPath('pages', 2);
        $this->asStaffMember()->getJson($this->api('referrals?page=2'))->assertJsonCount(1, 'referrals')->assertJsonPath('page', 2);
    }
}
