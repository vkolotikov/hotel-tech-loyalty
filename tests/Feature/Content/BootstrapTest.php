<?php

namespace Tests\Feature\Content;

use App\Models\Brand;
use App\Services\Content\ContentRules;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class BootstrapTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_tells_the_portal_what_it_needs(): void
    {
        $defaultName = Brand::withoutGlobalScopes()->find($this->brandId)->name;

        $this->asManager()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('name', 'HexaTech Content')
            ->assertJsonPath('organization.name', 'Lumière Salon')
            ->assertJsonPath('organization.industry', 'beauty')
            ->assertJsonPath('brand', ['id' => $this->brandId, 'name' => $defaultName])
            ->assertJsonPath('brands', [['id' => $this->brandId, 'name' => $defaultName]])
            ->assertJsonPath('venue.timezone', 'UTC')
            ->assertJsonPath('venue.today', '2026-10-05')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('staff.can_manage', true)
            ->assertJsonPath('profile.id', $this->profile->id)
            ->assertJsonPath('profile.setup_completed', true)
            ->assertJsonPath('ai', ['status' => 'unlimited', 'percent' => null])
            ->assertJsonPath('platforms', ContentRules::PLATFORMS)
            ->assertJsonPath('statuses', ContentRules::STATUSES)
            ->assertJsonPath('rewrites', ContentRules::REWRITES);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.can_manage', false);
    }

    public function test_it_works_on_the_brand_the_portal_asks_for_and_lists_every_brand(): void
    {
        [$second] = $this->secondBrand();

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('brand.id', $second)
            ->assertJsonCount(2, 'brands');
    }

    public function test_a_brand_from_another_organisation_falls_back_to_the_default(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $other['brandId'])
            ->assertOk()
            ->assertJsonPath('brand.id', $this->brandId);
    }

    public function test_a_member_restricted_to_one_brand_works_on_it_and_may_not_ask_for_another(): void
    {
        [$second] = $this->secondBrand();
        DB::table('brand_user')->insert(['brand_id' => $second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('brand.id', $second)
            ->assertJsonPath('brands', [['id' => $second, 'name' => 'Second Studio']]);
        // A code, so the portal can drop a stored brand no longer allowed and ask again without one (spec §6.7).
        $this->asStaffMember()->getJson($this->api('bootstrap') . '?brand_id=' . $this->brandId)
            ->assertStatus(403)
            ->assertJsonPath('code', 'brand_not_allowed')
            // The full admin's screens read `error` and `message`: both keep the sentence they always had.
            ->assertJsonPath('error', 'You do not have access to this brand.')
            ->assertJsonPath('message', 'You do not have access to this brand.');
    }

    public function test_a_brand_without_a_profile_says_so_and_the_budget_is_reported(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $this->setAiCap(100, 85);

        $this->asManager()->getJson($this->api('bootstrap') . '?brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('profile', null)
            ->assertJsonPath('ai', ['status' => 'warn', 'percent' => 85]);
    }
}
