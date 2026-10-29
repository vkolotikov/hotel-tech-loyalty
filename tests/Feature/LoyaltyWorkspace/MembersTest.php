<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\Brand;
use App\Models\PointsTransaction;
use App\Models\TierBenefit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** The members list, Find, a member's page and their history (spec 2026-10-21 §4.2, §4.3, §4.8). */
class MembersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_new_this_month_counts_the_day_a_member_joined_not_the_day_the_row_was_made(): void
    {
        $base = $this->asStaffMember()->getJson($this->api('members'))->json('figures.new_this_month');

        // Imported today with last year's join date: not new. Made today: new, by the day it was made (enrolment
        // stamps the join date with the row; joined_at is NOT NULL in production).
        $this->makeMember('Imported Member', 'imported@example.test', ['joined_at' => now()->subYear()]);
        $this->makeMember('Walk-in Member', 'walkin@example.test', ['joined_at' => now()]);

        $this->asStaffMember()->getJson($this->api('members'))->assertJsonPath('figures.new_this_month', $base + 1);
    }

    public function test_the_list_holds_this_organisations_active_members_newest_first_with_the_figures(): void
    {
        $this->otherOrganization();
        $this->ada->forceFill(['created_at' => now()->subMonths(2)])->save();
        $this->grace->forceFill(['joined_at' => now()])->save();
        $gone = $this->makeMember('Former Member', 'former@example.test', ['is_active' => false]);

        $response = $this->asStaffMember()->getJson($this->api('members'))->assertOk();

        $this->assertSame(['Grace Hopper', 'Ada Lovelace'], array_column($response->json('members'), 'name'));
        $response->assertJsonPath('total', 2)
            ->assertJsonPath('pages', 1)
            ->assertJsonPath('figures.total', 3)
            ->assertJsonPath('figures.active', 2)
            ->assertJsonPath('figures.new_this_month', 1)
            ->assertJsonPath('figures.average_points', 850)
            ->assertJsonPath('members.1.points', 1500)
            ->assertJsonPath('members.1.tier_id', $this->tiers['gold']->id);
        $this->assertSame([(string) $this->tiers['silver']->id => 1, (string) $this->tiers['gold']->id => 1], $response->json('figures.tiers'));

        $this->asStaffMember()->getJson($this->api('members?state=inactive'))->assertJsonPath('members.0.id', $gone->id);
        $this->asStaffMember()->getJson($this->api('members?state=all'))->assertJsonPath('total', 3);
    }

    public function test_it_searches_name_email_number_and_phone_digits_and_filters_by_tier(): void
    {
        $this->grace->user->update(['phone' => '+371 26 123 456']);

        $this->assertSame([$this->ada->id], array_column($this->asStaffMember()->getJson($this->api('members?q=LOVE'))->json('members'), 'id'));
        $this->assertSame([$this->ada->id], array_column($this->asStaffMember()->getJson($this->api('members?q=' . urlencode($this->ada->member_number)))->json('members'), 'id'));
        $this->assertSame([$this->grace->id], array_column($this->asStaffMember()->getJson($this->api('members?q=26123456'))->json('members'), 'id'));
        $this->assertSame([$this->grace->id], array_column($this->asStaffMember()->getJson($this->api('members?tier_id=' . $this->tiers['silver']->id))->json('members'), 'id'));
    }

    public function test_search_words_are_literal(): void
    {
        $this->asStaffMember()->getJson($this->api('members?q=' . urlencode('%')))->assertJsonPath('total', 0);
        $this->asStaffMember()->getJson($this->api('members?q=' . urlencode('a_a')))->assertJsonPath('total', 0);
    }

    public function test_it_sorts_by_points_name_and_last_activity(): void
    {
        $this->grace->update(['last_activity_at' => now()->subDay()]);

        $this->assertSame([$this->ada->id, $this->grace->id], array_column($this->asStaffMember()->getJson($this->api('members?sort=points'))->json('members'), 'id'));
        $this->assertSame([$this->ada->id, $this->grace->id], array_column($this->asStaffMember()->getJson($this->api('members?sort=name'))->json('members'), 'id'));
        // Never active comes last.
        $this->assertSame([$this->grace->id, $this->ada->id], array_column($this->asStaffMember()->getJson($this->api('members?sort=activity'))->json('members'), 'id'));
    }

    public function test_find_answers_from_two_letters_with_eight_at_most(): void
    {
        foreach (range(1, 9) as $i) {
            $this->makeMember("Adams {$i}", "adams{$i}@example.test");
        }

        $this->asStaffMember()->getJson($this->api('find?q=a'))->assertJsonPath('members', []);
        $this->assertCount(8, $this->asStaffMember()->getJson($this->api('find?q=ad'))->json('members'));
    }

    public function test_a_members_page_carries_progress_benefits_and_open_requests(): void
    {
        $benefit = BenefitDefinition::create(['name' => 'Late checkout', 'code' => 'late', 'category' => 'accommodation', 'fulfillment_mode' => 'on_request']);
        TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $benefit->id, 'value' => 'Until 2 pm', 'applies_to' => 'stays', 'is_active' => true]);
        $waiting = BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $benefit->id, 'status' => 'pending']);
        BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $benefit->id, 'status' => 'fulfilled']);

        $this->asStaffMember()->getJson($this->api('members/' . $this->ada->id))
            ->assertOk()
            ->assertJsonPath('member.name', 'Ada Lovelace')
            ->assertJsonPath('member.points', 1500)
            ->assertJsonPath('progress.next_tier.name', 'Platinum')
            ->assertJsonPath('progress.needed', 3500)
            ->assertJsonPath('progress.percent', 12)
            ->assertJsonPath('benefits.0.name', 'Late checkout')
            ->assertJsonPath('benefits.0.value', 'Until 2 pm')
            ->assertJsonPath('benefits.0.applies_to', 'stays')
            ->assertJsonPath('benefits.0.fulfillment_mode', 'on_request')
            ->assertJsonCount(1, 'requests')
            ->assertJsonPath('requests.0.id', $waiting->id);
    }

    public function test_the_top_tier_has_no_next_tier_and_a_member_without_a_tier_still_opens(): void
    {
        $this->ada->update(['tier_id' => $this->tiers['platinum']->id]);
        $this->asStaffMember()->getJson($this->api('members/' . $this->ada->id))->assertJsonPath('progress.next_tier', null)->assertJsonPath('progress.percent', 100);

        // Keep production's required FK while simulating an unavailable (foreign programme) tier relation.
        $this->grace->update(['tier_id' => $this->otherOrganization()['tier']->id]);
        $this->asStaffMember()->getJson($this->api('members/' . $this->grace->id))->assertOk()->assertJsonPath('benefits', [])->assertJsonPath('progress.next_tier.name', 'Gold');
    }

    public function test_another_organisations_member_is_not_found(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->getJson($this->api('members/' . $other['member']->id))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->getJson($this->api('members/' . $other['member']->id . '/history'))->assertStatus(404);
    }

    public function test_the_history_is_the_whole_ledger_of_every_brand_newest_first(): void
    {
        $second = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false]);
        $this->line(['points' => 100, 'type' => 'earn', 'brand_id' => $this->brandId, 'created_at' => now()->subDays(2)]);
        $this->line(['points' => 50, 'type' => 'bonus', 'brand_id' => $second->id, 'created_at' => now()->subDay(), 'staff_id' => $this->manager->id]);
        // Bound to one brand, as a staff member restricted to it would be: the member's ledger still shows both.
        app()->instance('current_brand_id', $this->brandId);

        $response = $this->asStaffMember()->getJson($this->api('members/' . $this->ada->id . '/history'))->assertOk();

        $this->assertSame([50, 100], array_column($response->json('lines'), 'points'));
        $response->assertJsonPath('lines.0.by', 'Staff')->assertJsonPath('lines.0.can_reverse', true)->assertJsonPath('total', 2);
    }

    public function test_directory_page_sizes_are_bounded_and_do_not_change_tenant_or_search_scope(): void
    {
        $this->otherOrganization();
        foreach (range(1, 29) as $i) {
            $this->makeMember("Pagination {$i}", "pagination{$i}@example.test");
        }
        $this->asStaffMember()->getJson($this->api('members?per_page=10'))->assertOk()
            ->assertJsonCount(10, 'members')->assertJsonPath('total', 31)->assertJsonPath('pages', 4)->assertJsonPath('per_page', 10);
        $this->asStaffMember()->getJson($this->api('members?per_page=10&page=99'))->assertOk()
            ->assertJsonCount(1, 'members')->assertJsonPath('page', 4);
        $this->asStaffMember()->getJson($this->api('members?per_page=25&q=Pagination'))->assertOk()
            ->assertJsonCount(25, 'members')->assertJsonPath('total', 29)->assertJsonPath('pages', 2);
        foreach (['', '?per_page=100000', '?per_page=0', '?per_page=-1'] as $query) {
            $this->asStaffMember()->getJson($this->api('members'.$query))->assertOk()
                ->assertJsonPath('per_page', 50)->assertJsonCount(31, 'members');
        }
    }

    public function test_history_filters_before_pagination_and_keeps_member_and_organisation_boundaries(): void
    {
        $other = $this->otherOrganization();
        foreach (range(1, 27) as $i) {
            $this->line(['type' => 'earn', 'points' => $i, 'created_at' => now()->subMinutes($i)]);
        }
        foreach (['bonus', 'adjust', 'redeem', 'expire', 'reverse', 'referral'] as $type) {
            $this->line(['type' => $type, 'points' => 5, 'created_at' => now()]);
        }
        $this->line(['type' => 'earn', 'points' => 999, 'created_at' => now(), 'member_id' => $this->grace->id]);
        $url = 'members/'.$this->ada->id.'/history';
        $response = $this->asStaffMember()->getJson($this->api($url.'?type=earn&page=2'))->assertOk()
            ->assertJsonCount(2, 'lines')->assertJsonPath('total', 27)->assertJsonPath('pages', 2);
        $this->assertSame(['earn'], array_values(array_unique(array_column($response->json('lines'), 'type'))));
        foreach (['bonus', 'adjust', 'redeem', 'expire', 'reverse', 'referral'] as $type) {
            $this->asStaffMember()->getJson($this->api($url.'?type='.$type))->assertOk()
                ->assertJsonPath('total', 1)->assertJsonPath('lines.0.type', $type);
        }
        foreach (['all', 'unknown', 'earn%27'] as $type) {
            $this->asStaffMember()->getJson($this->api($url.'?type='.$type))->assertOk()->assertJsonPath('total', 33);
        }
        $this->asStaffMember()->getJson($this->api('members/'.$other['member']->id.'/history?type=earn'))->assertNotFound();
    }

    private function line(array $attributes): PointsTransaction
    {
        $line = PointsTransaction::withoutGlobalScopes()->create($attributes + [
            'organization_id' => $this->org->id,
            'member_id'       => $this->ada->id,
            'description'     => 'Visit',
            'balance_after'   => 1500,
            'idempotency_key' => uniqid('t', true),
        ]);
        $line->forceFill(['created_at' => $attributes['created_at']])->save();

        return $line;
    }
}
