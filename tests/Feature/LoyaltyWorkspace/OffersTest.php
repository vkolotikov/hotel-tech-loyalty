<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Brand;
use App\Models\SpecialOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Offers (spec 2026-10-21 §4.6, §5, §6.4, §6.5, §6.6). */
class OffersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_it_lists_the_offers_newest_first_with_their_state_and_the_options(): void
    {
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => $this->offer('Theirs'));
        $live = $this->offer('Autumn spa', [
            'description' => '15% off treatments.', 'type' => 'discount', 'value' => 15, 'code' => 'AUTUMN15', 'applies_to' => 'services',
            'tier_ids' => [$this->tiers['gold']->id], 'start_date' => '2026-10-05', 'end_date' => '2026-10-31',
            'usage_limit' => 100, 'times_used' => 7, 'per_member_limit' => 1, 'is_featured' => true, 'created_at' => now()->subDays(3),
        ]);
        $this->offer('Winter', ['start_date' => '2026-12-01', 'end_date' => '2026-12-31', 'created_at' => now()->subDays(2)]);
        $this->offer('Summer', ['start_date' => '2026-07-01', 'end_date' => '2026-10-04', 'created_at' => now()->subDay()]);
        $this->offer('Paused', ['is_active' => false]);

        $response = $this->asStaffMember()->getJson($this->api('offers?brand_id=all'))->assertOk();

        $this->assertSame(['Paused', 'Summer', 'Winter', 'Autumn spa'], array_column($response->json('offers'), 'title'));
        $this->assertSame(['off', 'ended', 'upcoming', 'live'], array_column($response->json('offers'), 'state'));
        $response->assertJsonPath('offers.3', [
            // Made with no brand: every brand's (owner 2026-10-25), not the default's.
            'id' => $live->id, 'brand_id' => null, 'title' => 'Autumn spa', 'description' => '15% off treatments.', 'type' => 'discount', 'value' => 15,
            'code' => 'AUTUMN15', 'applies_to' => 'services', 'tier_ids' => [$this->tiers['gold']->id], 'start_date' => '2026-10-05',
            'end_date' => '2026-10-31', 'usage_limit' => 100, 'times_used' => 7, 'per_member_limit' => 1, 'is_active' => true,
            'is_featured' => true, 'image_url' => null, 'state' => 'live',
        ])
            ->assertJsonPath('offers.0.tier_ids', null)
            ->assertJsonPath('options.types', ['discount', 'points_multiplier', 'free_night', 'upgrade', 'bonus_points', 'cashback', 'fixed_amount'])
            ->assertJsonPath('options.applies_to', ['all', 'services', 'stays'])
            ->assertJsonPath('options.image', ['max_kb' => 2048, 'max_edge' => 4096, 'types' => ['image/jpeg', 'image/png', 'image/webp']]);
    }

    public function test_today_is_the_venues(): void
    {
        // 09:00 UTC on 5 October is still 4 October in Honolulu: an offer to the 4th has not ended there.
        $this->offer('To the fourth', ['start_date' => '2026-10-01', 'end_date' => '2026-10-04']);
        $this->asStaffMember()->getJson($this->api('offers'))->assertJsonPath('offers.0.state', 'ended');

        $this->org->forceFill(['timezone' => 'Pacific/Honolulu'])->save();
        app()->forgetScopedInstances();

        $this->asStaffMember()->getJson($this->api('offers'))->assertJsonPath('offers.0.state', 'live');
    }

    public function test_staff_with_manage_offers_add_one_its_code_normalised_and_its_tiers_integers(): void
    {
        $gold = $this->tiers['gold']->id;

        $response = $this->asManager()->postJson($this->api('offers?brand_id=all'), $this->offerBody([
            'code' => ' welcome10 ', 'tier_ids' => [(string) $gold], 'applies_to' => null, 'usage_limit' => 50,
        ]))->assertCreated();

        $id = $response->json('offer.id');
        $response->assertJsonPath('offer', [
            // Sent with no brand: every brand's (owner 2026-10-25), not the default's.
            'id' => $id, 'brand_id' => null, 'title' => 'Welcome', 'description' => 'Ten percent off the first visit.', 'type' => 'discount', 'value' => 10,
            'code' => 'WELCOME10', 'applies_to' => 'all', 'tier_ids' => [$gold], 'start_date' => '2026-10-05', 'end_date' => '2026-11-05',
            'usage_limit' => 50, 'times_used' => 0, 'per_member_limit' => null, 'is_active' => true, 'is_featured' => false, 'image_url' => null,
            'state' => 'live',
        ]);
        $stored = SpecialOffer::withoutGlobalScopes()->find($id);
        $this->assertSame([$gold], $stored->tier_ids);
        $this->assertSame($this->manager->id, (int) $stored->created_by);
        $this->assertNull($stored->brand_id, 'every brand');

        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_manage_offers' => true]);
        $this->asStaffMember()->postJson($this->api('offers'), $this->offerBody(['title' => 'Second', 'tier_ids' => []]))
            ->assertCreated()->assertJsonPath('offer.tier_ids', null)->assertJsonPath('offer.code', null);
    }

    public function test_staff_without_manage_offers_are_refused(): void
    {
        $offer = $this->offer('Autumn spa');

        $this->asStaffMember()->postJson($this->api('offers'), $this->offerBody())
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->putJson($this->api("offers/{$offer->id}"), ['title' => 'Mine'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->assertSame(1, SpecialOffer::query()->count());
        $this->assertSame('Autumn spa', $offer->fresh()->title);
    }

    public function test_a_code_is_the_organisations_once_whatever_the_brand_and_free_in_another_organisation(): void
    {
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => $this->offer('Theirs', ['code' => 'SPA10']));
        $second = Brand::create(['name' => 'Second', 'slug' => 'second-' . uniqid(), 'is_default' => false]);
        $this->offer('Other brand', ['code' => 'TAKEN1', 'brand_id' => $second->id]);

        $this->asManager()->postJson($this->api('offers'), $this->offerBody(['code' => 'spa10']))
            ->assertCreated()->assertJsonPath('offer.code', 'SPA10');
        $this->asManager()->postJson($this->api('offers'), $this->offerBody(['code' => 'SPA10']))
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
        // Read as the default brand, the other brand's offer is out of sight, and its code still taken.
        $this->asManager()->postJson($this->api("offers?brand_id={$this->brandId}"), $this->offerBody(['code' => 'taken1']))
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
    }

    public function test_the_form_keeps_the_full_admins_rules_and_this_organisations_tiers(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->postJson($this->api('offers'), $this->offerBody(['type' => 'mystery', 'code' => 'no', 'end_date' => '2026-10-01', 'applies_to' => 'rooms']))
            ->assertStatus(422)->assertJsonValidationErrors(['type', 'code', 'end_date', 'applies_to']);
        $this->asManager()->postJson($this->api('offers'), $this->offerBody(['code' => 'BAD CODE!']))
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->asManager()->postJson($this->api('offers'), $this->offerBody(['tier_ids' => [$this->tiers['gold']->id, $other['tier']->id]]))
            ->assertStatus(422)->assertJsonValidationErrors(['tier_ids.1'])->assertJsonMissingValidationErrors(['tier_ids.0']);

        $this->assertSame(0, SpecialOffer::query()->count());
    }

    public function test_a_change_takes_any_field_alone(): void
    {
        $offer = $this->offer('Autumn spa', ['code' => 'AUTUMN15', 'tier_ids' => [$this->tiers['gold']->id], 'type' => 'legacy_kind']);
        $taken = $this->offer('Other', ['code' => 'WINTER20']);

        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['is_active' => false, 'tier_ids' => [], 'value' => 12.5])
            ->assertOk()
            ->assertJsonPath('offer.state', 'off')
            ->assertJsonPath('offer.tier_ids', null)
            ->assertJsonPath('offer.value', 12.5)
            // A type written before the list (or by the AI generator) may stay.
            ->assertJsonPath('offer.type', 'legacy_kind')
            ->assertJsonPath('offer.code', 'AUTUMN15');

        // Its own code is not a clash; another offer's is.
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['code' => 'autumn15'])->assertOk();
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['code' => 'winter20'])
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['code' => null])->assertOk()->assertJsonPath('offer.code', null);

        // A date sent alone is held against the stored other one (the offer runs to 31 October).
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['end_date' => '2026-09-01'])
            ->assertStatus(422)->assertJsonValidationErrors(['end_date']);
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['start_date' => '2026-11-15'])
            ->assertStatus(422)->assertJsonValidationErrors(['start_date']);
        $this->asManager()->putJson($this->api("offers/{$offer->id}"), ['type' => 'another_unknown'])
            ->assertStatus(422)->assertJsonValidationErrors(['type']);
        $this->assertSame('WINTER20', $taken->fresh()->code);
    }

    public function test_another_organisations_offer_is_not_found(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->inOrganization($other['org']->id, fn () => $this->offer('Theirs'));

        $this->asManager()->putJson($this->api("offers/{$theirs->id}"), ['title' => 'Mine now'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->getJson($this->api('offers'))->assertJsonPath('offers', []);
        $this->assertSame('Theirs', SpecialOffer::withoutGlobalScopes()->find($theirs->id)->title);
    }

    /** An offer of the organisation bound now, live through October unless told otherwise. */
    protected function offer(string $title, array $attributes = []): SpecialOffer
    {
        $offer = SpecialOffer::create($attributes + [
            'title' => $title, 'description' => 'An offer.', 'type' => 'discount', 'value' => 10,
            'start_date' => '2026-10-01', 'end_date' => '2026-10-31', 'is_active' => true,
        ]);
        if (isset($attributes['created_at'])) {
            $offer->forceFill(['created_at' => $attributes['created_at']])->save();
        }

        return $offer;
    }

    /** @return array<string, mixed> A whole offer form, live on the fixed clock (Monday 5 October 2026). */
    protected function offerBody(array $overrides = []): array
    {
        return $overrides + [
            'title' => 'Welcome', 'description' => 'Ten percent off the first visit.', 'type' => 'discount', 'value' => 10,
            'start_date' => '2026-10-05', 'end_date' => '2026-11-05',
        ];
    }

    /** Runs $make under another organisation's tenant and hands back what it made, ours restored. */
    protected function inOrganization(int $orgId, callable $make): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $make();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }
}
