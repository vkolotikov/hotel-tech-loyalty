<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Brand;
use App\Models\EarnRateEvent;
use App\Models\Reward;
use App\Models\SpecialOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Brand choice (release 4 part E): the options of Rewards, Offers and Program list the brands a new reward, offer or
 * boost may be put on — this organisation's, not deleted, the default first, narrowed to a staff member's own brands —
 * and a new one names its brand as `brand`; without one it lands where it always did (the default brand). Every brand
 * id is checked against that list; a change keeps the brand a row has.
 */
class BrandChoiceTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private Brand $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->second = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false, 'sort_order' => 2]);
    }

    /** @return array<string, array{0: string, 1: array<string, mixed>, 2: string}> list path, a new row's body, the row's key */
    private function areas(): array
    {
        return [
            'rewards' => ['rewards', ['name' => 'Free coffee', 'points_cost' => 120], 'reward'],
            'offers'  => ['offers', ['title' => 'Welcome', 'description' => 'Ten percent off.', 'type' => 'discount', 'value' => 10, 'start_date' => '2026-10-05', 'end_date' => '2026-11-05'], 'offer'],
            'boosts'  => ['program/boosts', ['name' => 'Weekend double', 'multiplier' => 2, 'starts_at' => '2026-10-04T00:00', 'ends_at' => '2026-10-11T00:00'], 'boost'],
        ];
    }

    private function brandOptions(string $area): array
    {
        $path = $area === 'boosts' ? 'program' : $area;

        return $this->asManager()->getJson($this->api("{$path}?brand_id=all"))->assertOk()->json('options.brands');
    }

    public function test_the_options_list_this_organisations_brands_the_default_first_and_not_a_deleted_one(): void
    {
        $gone = Brand::create(['name' => 'Closed Studio', 'slug' => 'closed-' . uniqid(), 'is_default' => false]);
        $gone->delete();
        $this->otherOrganization();

        foreach (array_keys($this->areas()) as $area) {
            $this->assertSame([
                'list'    => [
                    ['id' => $this->brandId, 'name' => 'Lumière Salon', 'is_default' => true],
                    ['id' => $this->second->id, 'name' => 'Second Studio', 'is_default' => false],
                ],
                'default' => $this->brandId,
            ], $this->brandOptions($area), $area);
        }
    }

    public function test_a_new_row_lands_on_the_brand_it_names_and_without_one_on_the_default(): void
    {
        foreach ($this->areas() as $area => [$path, $body, $key]) {
            $named = $this->asManager()->postJson($this->api("{$path}?brand_id=all"), $body + ['brand' => $this->second->id])->assertCreated();
            $named->assertJsonPath("{$key}.brand_id", $this->second->id);

            $plain = $this->asManager()->postJson($this->api("{$path}?brand_id=all"), ['code' => null] + $body)->assertCreated();
            $plain->assertJsonPath("{$key}.brand_id", $this->brandId);
        }
        $this->assertSame(1, Reward::query()->where('brand_id', $this->second->id)->count());
        $this->assertSame(1, SpecialOffer::query()->where('brand_id', $this->second->id)->count());
        $this->assertSame(1, EarnRateEvent::query()->where('brand_id', $this->second->id)->count());
    }

    public function test_another_organisations_brand_a_deleted_one_or_a_word_is_refused_on_the_field(): void
    {
        $other = $this->otherOrganization();
        $theirs = (int) Brand::withoutGlobalScopes()->where('organization_id', $other['org']->id)->value('id');
        $gone = Brand::create(['name' => 'Closed Studio', 'slug' => 'closed-' . uniqid(), 'is_default' => false]);
        $gone->delete();

        foreach ($this->areas() as $area => [$path, $body]) {
            foreach ([$theirs, $gone->id, 'all', 999999] as $brand) {
                $this->asManager()->postJson($this->api("{$path}?brand_id=all"), $body + ['brand' => $brand])
                    ->assertStatus(422)->assertJsonValidationErrors(['brand']);
            }
        }
        $this->assertSame(0, Reward::query()->count() + SpecialOffer::query()->count() + EarnRateEvent::query()->count());
    }

    public function test_a_staff_member_held_to_one_brand_is_offered_that_one_and_cannot_name_another(): void
    {
        DB::table('staff')->where('user_id', $this->manager->id)->update(['can_manage_offers' => true]);
        DB::table('brand_user')->insert(['brand_id' => $this->second->id, 'user_id' => $this->manager->id, 'created_at' => now(), 'updated_at' => now()]);

        foreach ($this->areas() as $area => [$path, $body, $key]) {
            $this->assertSame(['list' => [['id' => $this->second->id, 'name' => 'Second Studio', 'is_default' => false]], 'default' => $this->second->id], $this->brandOptions($area), $area);
            $this->asManager()->postJson($this->api("{$path}?brand_id=all"), $body + ['brand' => $this->brandId])
                ->assertStatus(422)->assertJsonValidationErrors(['brand']);
            $this->asManager()->postJson($this->api("{$path}?brand_id=all"), $body)->assertCreated()->assertJsonPath("{$key}.brand_id", $this->second->id);
        }
    }

    public function test_a_change_keeps_the_brand_a_row_has(): void
    {
        foreach ($this->areas() as $area => [$path, $body, $key]) {
            $id = $this->asManager()->postJson($this->api("{$path}?brand_id=all"), $body + ['brand' => $this->second->id])->assertCreated()->json("{$key}.id");
            $this->asManager()->putJson($this->api("{$path}/{$id}?brand_id=all"), $body + ['brand' => $this->brandId, 'brand_id' => $this->brandId])
                ->assertOk()->assertJsonPath("{$key}.brand_id", $this->second->id);
        }
    }
}
