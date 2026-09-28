<?php

namespace Tests\Feature\Loyalty;

use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\MakesAdminCaller;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Three security holes on the paths the member portal calls (spec §6.7):
 *
 *   - Admin\DiscountController::useOffer looked up a claim by id alone —
 *     any authenticated staff account, of ANY organisation, could mark
 *     another venue's claim used just by guessing/incrementing the id.
 *   - Member\OfferController::claim never checked `tier_ids` — a bronze
 *     member could claim a gold-only offer.
 *   - The three admin discount routes carried no staff.can gate at all.
 */
class OfferSecurityTest extends MemberEndpointTestCase
{
    use MakesAdminCaller;

    private function offersSchema(): void
    {
        $this->setUpLoyaltySchema();

        // setUpLoyaltySchema() builds the tier/member ladder but not the
        // offer tables themselves — mirrors the production shape from
        // database/migrations/2024_01_01_000007_create_special_offers_table.php
        // and .../000008_create_member_offers_table.php, plus the
        // organization_id tenant-scope columns and the phase-2 code/
        // applies_to columns those migrations later add.
        if (!Schema::hasTable('special_offers')) {
            Schema::create('special_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->string('type', 30)->nullable();
                $t->decimal('value', 8, 2)->default(0);
                $t->text('tier_ids')->nullable();
                $t->date('start_date')->nullable();
                $t->date('end_date')->nullable();
                $t->integer('usage_limit')->nullable();
                $t->integer('times_used')->default(0);
                $t->integer('per_member_limit')->nullable();
                $t->string('image_url')->nullable();
                $t->string('terms_conditions')->nullable();
                $t->boolean('is_active')->default(true);
                $t->boolean('is_featured')->default(false);
                $t->boolean('ai_generated')->default(false);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('member_offers')) {
            Schema::create('member_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('offer_id')->nullable();
                $t->boolean('ai_generated')->default(false);
                $t->text('ai_reason')->nullable();
                $t->timestamp('claimed_at')->nullable();
                $t->timestamp('used_at')->nullable();
                $t->string('used_reference', 32)->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->string('status', 20)->default('available');
                $t->timestamps();
            });
        }

        foreach (['code' => 'string', 'applies_to' => 'string'] as $col => $type) {
            if (!Schema::hasColumn('special_offers', $col)) Schema::table('special_offers', fn ($t) => $t->{$type}($col)->nullable());
        }
    }

    private function offer(int $orgId, array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create(array_merge(['organization_id' => $orgId, 'title' => 'Ten off', 'description' => '-', 'type' => 'discount', 'value' => 10, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true], $attrs));
    }

    public function test_a_gold_only_code_cannot_be_claimed_by_a_bronze_member(): void
    {
        $this->offersSchema();
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $gold = \App\Models\LoyaltyTier::create(['organization_id' => $org->id, 'name' => 'Gold', 'min_points' => 5000, 'earn_rate' => 2, 'is_active' => true]);
        $offer = $this->offer($org->id, ['tier_ids' => [$gold->id]]);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertStatus(422)->assertJsonPath('error', 'wrong_tier');
        $this->assertSame(0, MemberOffer::where('member_id', $member->id)->count());
    }

    public function test_an_offer_ending_today_can_still_be_claimed(): void
    {
        $this->offersSchema();
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $offer = $this->offer($org->id, ['end_date' => now()->toDateString()]);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk();
    }

    public function test_staff_of_one_venue_cannot_mark_another_venues_claim_used(): void
    {
        $this->offersSchema();
        $orgA = $this->tenant('A');
        $orgB = $this->tenant('B');
        ['member' => $memberB] = $this->member($orgB);
        $offerB = $this->offer($orgB->id);
        $claim = MemberOffer::create(['organization_id' => $orgB->id, 'member_id' => $memberB->id, 'offer_id' => $offerB->id, 'status' => 'claimed', 'claimed_at' => now()]);

        // Grants can_redeem_points so the 404 below is proven by the
        // organisation scope, not by the permission gate added alongside it.
        $staffA = $this->staffUser($orgA, ['can_redeem_points' => true]);
        $this->actingAs($staffA, 'sanctum')->postJson("/api/v1/admin/discounts/offers/{$claim->id}/use")->assertStatus(404);
        $this->assertNull($claim->fresh()->used_at);
    }

    public function test_staff_without_the_capability_cannot_use_the_route_at_all(): void
    {
        $this->offersSchema();
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $offer = $this->offer($org->id);
        $claim = MemberOffer::create(['organization_id' => $org->id, 'member_id' => $member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);

        $staff = $this->staffUser($org); // no capabilities granted
        $this->actingAs($staff, 'sanctum')->postJson("/api/v1/admin/discounts/offers/{$claim->id}/use")->assertStatus(403);
        $this->assertNull($claim->fresh()->used_at);
    }
}
