<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\PointsTransaction;
use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\MakesAdminCaller;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * A `bonus_points` offer gives its points when claimed (release 7, spec 2026-10-25 §4.1): POST member/offers/{id}/claim
 * writes one ledger line — type `bonus`, not qualifying, the offer named, key `offer_bonus_{member_offer_id}` — and the
 * claim is used at once. A repeated claim answers the same claim and pays nothing more; a claim held from before
 * release 7 pays when claimed again or when staff mark it used at the counter. Every other offer claims as it did.
 */
class OfferBonusClaimTest extends MemberEndpointTestCase
{
    use MakesAdminCaller;

    protected function setUp(): void
    {
        parent::setUp();
        // OfferSecurityTest's tables: the production shape of special_offers and member_offers, with the unique claim.
        $this->setUpLoyaltySchema();
        if (!Schema::hasTable('special_offers')) {
            Schema::create('special_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->string('type', 30)->nullable();
                $t->decimal('value', 8, 2)->default(0);
                $t->string('code', 24)->nullable();
                $t->string('applies_to', 12)->nullable();
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
                $t->unsignedBigInteger('offer_id');
                $t->boolean('ai_generated')->default(false);
                $t->text('ai_reason')->nullable();
                $t->timestamp('claimed_at')->nullable();
                $t->timestamp('used_at')->nullable();
                $t->string('used_reference', 60)->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->string('status', 20)->default('available');
                $t->timestamps();
                $t->unique(['member_id', 'offer_id']);
            });
        }
    }

    private function offer(int $orgId, array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'title' => 'Autumn bonus', 'description' => 'Points on us', 'type' => 'bonus_points', 'value' => 500,
            'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true,
        ], $attrs));
    }

    private function points(LoyaltyMember $member): int
    {
        return (int) LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('current_points');
    }

    public function test_claiming_a_bonus_points_offer_pays_its_points_once_and_uses_the_claim(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $offer = $this->offer($org->id);
        $before = $this->points($member);

        $reply = $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()->assertJsonPath('points_awarded', 500);

        $claim = MemberOffer::findOrFail($reply->json('member_offer.id'));
        $this->assertSame('used', $claim->status);
        $this->assertNotNull($claim->used_at);
        $this->assertSame($before + 500, $this->points($member));
        $line = PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "offer_bonus_{$claim->id}")->firstOrFail();
        $this->assertSame(['bonus', 500, 0], [$line->type, (int) $line->points, (int) $line->qualifying_points]);
        $this->assertStringContainsString('Autumn bonus', $line->description);
        $this->assertSame((int) $member->id, (int) $line->member_id);

        // Again (a double tap, a retry): the same claim, nothing more paid.
        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()
            ->assertJsonPath('member_offer.id', $claim->id)->assertJsonPath('points_awarded', 500);
        $this->assertSame($before + 500, $this->points($member));
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "offer_bonus_{$claim->id}")->count());
        $this->assertSame(1, (int) $offer->fresh()->times_used);
    }

    public function test_a_repeat_with_a_per_member_limit_of_one_still_answers_the_paid_claim(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $offer = $this->offer($org->id, ['per_member_limit' => 1, 'usage_limit' => 1]);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk();
        $before = $this->points($member);
        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()->assertJsonPath('points_awarded', 500);

        $this->assertSame($before, $this->points($member));
    }

    public function test_a_claim_held_from_before_pays_when_claimed_again(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $offer = $this->offer($org->id);
        $held = MemberOffer::create(['organization_id' => $org->id, 'member_id' => $member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()->subWeek()]);
        $before = $this->points($member);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()
            ->assertJsonPath('member_offer.id', $held->id)->assertJsonPath('points_awarded', 500);

        $this->assertSame($before + 500, $this->points($member));
        $this->assertSame('used', $held->fresh()->status);
    }

    public function test_staff_marking_an_unpaid_bonus_claim_used_pay_it_and_a_paid_one_is_refused(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $offer = $this->offer($org->id);
        $held = MemberOffer::create(['organization_id' => $org->id, 'member_id' => $member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()->subWeek()]);
        $staff = $this->staffUser($org, ['can_redeem_points' => true, 'can_manage_offers' => true]);
        $before = $this->points($member);

        $this->actingAs($staff, 'sanctum')->postJson("/api/v1/admin/discounts/offers/{$held->id}/use")->assertOk();

        $this->assertSame($before + 500, $this->points($member));
        $this->assertSame('used', $held->fresh()->status);
        $line = PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "offer_bonus_{$held->id}")->firstOrFail();
        $this->assertSame((int) $staff->id, (int) $line->staff_id);

        $this->actingAs($staff, 'sanctum')->postJson("/api/v1/admin/discounts/offers/{$held->id}/use")->assertStatus(422);
        $this->assertSame($before + 500, $this->points($member));
    }

    public function test_every_other_offer_claims_as_it_did(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $before = $this->points($member);

        foreach (['discount' => 10, 'points_multiplier' => 2, 'free_night' => 1] as $type => $value) {
            $offer = $this->offer($org->id, ['type' => $type, 'value' => $value, 'title' => ucfirst($type)]);
            $reply = $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()->assertJsonPath('points_awarded', 0);
            $claim = MemberOffer::findOrFail($reply->json('member_offer.id'));
            $this->assertSame('claimed', $claim->status, $type);
            $this->assertNull($claim->used_at, $type);
        }
        $this->assertSame($before, $this->points($member));
    }
}
