<?php

namespace Tests\Feature\Loyalty;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyMember;
use App\Models\TierBenefit;
use App\Services\DiscountService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The discount engine — the thing that turns a tier benefit from a
 * sentence on a screen into a number off a bill.
 *
 * Before this, `tier_benefits.value` was free-form prose whose only
 * consumer printed it for a human to read out. Nothing computed a
 * discount, and the one enforceable field (`earn_rate`) was dead because
 * `calculateEarnedPoints()` had no call sites.
 *
 * Two rules are load-bearing and tested here:
 *   - the best single rule wins; discounts never stack
 *   - a discount never exceeds the bill
 */
class DiscountServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private DiscountService $svc;
    private int $tierId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpBenefitSchema();
        $this->svc = app(DiscountService::class);

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        $this->tierId = LoyaltyTierFactory::new()->bronze()->create()->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** benefit_definitions + tier_benefits, sqlite-safe. */
    private function setUpBenefitSchema(): void
    {
        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('category')->nullable();
                $t->text('description')->nullable();
                $t->string('fulfillment_mode')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('tier_benefits')) {
            Schema::create('tier_benefits', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('tier_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('value')->nullable();
                $t->string('value_type', 24)->default('text');
                $t->decimal('value_amount', 12, 2)->nullable();
                $t->text('custom_description')->nullable();
                $t->boolean('is_active')->default(true);
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
                $t->timestamp('expires_at')->nullable();
                $t->string('status', 32)->nullable();
                $t->timestamps();
            });
        }
    }

    private function member(): LoyaltyMember
    {
        return LoyaltyMemberFactory::new()->inTier($this->tierId)->create()->refresh();
    }

    private function benefit(string $type, ?float $amount, string $name = 'Perk'): TierBenefit
    {
        $def = BenefitDefinition::create([
            'organization_id' => app('current_organization_id'),
            'name' => $name, 'code' => strtolower($name) . uniqid(), 'is_active' => true,
        ]);

        return TierBenefit::create([
            'organization_id' => app('current_organization_id'),
            'tier_id'      => $this->tierId,
            'benefit_id'   => $def->id,
            'value'        => $name,
            'value_type'   => $type,
            'value_amount' => $amount,
            'is_active'    => true,
        ]);
    }

    public function test_prose_only_benefit_produces_no_discount(): void
    {
        $this->benefit(DiscountService::TEXT, null, 'Free newspaper');

        $quote = $this->svc->quote($this->member(), 200.0);

        $this->assertSame(0.0, $quote['discount'], 'an untyped benefit cannot be computed with');
        $this->assertSame(200.0, $quote['total']);
        $this->assertNull($quote['applied']);
    }

    public function test_percentage_benefit_comes_off_the_bill(): void
    {
        $this->benefit(DiscountService::PERCENT, 10, 'Dining discount');

        $quote = $this->svc->quote($this->member(), 200.0);

        $this->assertSame(20.0, $quote['discount']);
        $this->assertSame(180.0, $quote['total']);
        $this->assertSame('Dining discount', $quote['applied']['label']);
    }

    public function test_fixed_amount_benefit_comes_off_the_bill(): void
    {
        $this->benefit(DiscountService::FIXED, 25, 'Voucher');

        $quote = $this->svc->quote($this->member(), 200.0);

        $this->assertSame(25.0, $quote['discount']);
        $this->assertSame(175.0, $quote['total']);
    }

    public function test_best_rule_wins_and_discounts_do_not_stack(): void
    {
        // 10% of 200 = 20; the fixed 50 is worth more and must win alone.
        $this->benefit(DiscountService::PERCENT, 10, 'Ten percent');
        $this->benefit(DiscountService::FIXED, 50, 'Fifty off');

        $quote = $this->svc->quote($this->member(), 200.0);

        $this->assertSame(50.0, $quote['discount'], 'stacking would give 70 and is deliberately not done');
        $this->assertSame('Fifty off', $quote['applied']['label']);
        $this->assertCount(1, $quote['considered'], 'the loser is still reported, for "why?"');
    }

    public function test_discount_never_exceeds_the_bill(): void
    {
        $this->benefit(DiscountService::FIXED, 50, 'Big voucher');

        $quote = $this->svc->quote($this->member(), 20.0);

        $this->assertSame(20.0, $quote['discount']);
        $this->assertSame(0.0, $quote['total'], 'a bill can reach zero but never go negative');
    }

    public function test_percentage_over_one_hundred_is_capped(): void
    {
        // Defence in depth: the controller rejects >100, but a row written
        // by an older migration or by hand must not hand money back.
        $this->benefit(DiscountService::PERCENT, 150, 'Broken config');

        $quote = $this->svc->quote($this->member(), 80.0);

        $this->assertSame(80.0, $quote['discount']);
        $this->assertSame(0.0, $quote['total']);
    }

    public function test_inactive_benefit_is_ignored(): void
    {
        $this->benefit(DiscountService::PERCENT, 10, 'Retired perk')->update(['is_active' => false]);

        $this->assertSame(0.0, $this->svc->quote($this->member(), 100.0)['discount']);
    }

    public function test_points_multiplier_defaults_to_one(): void
    {
        $this->assertSame(1.0, $this->svc->pointsMultiplierFor($this->member()));
    }

    public function test_points_multiplier_reads_the_typed_benefit(): void
    {
        $this->benefit(DiscountService::MULTIPLIER, 2, 'Double points');

        $this->assertSame(2.0, $this->svc->pointsMultiplierFor($this->member()));
    }

    public function test_highest_multiplier_wins_rather_than_the_product(): void
    {
        // 2x and 3x must give 3x, not 6x — the same non-stacking rule.
        $this->benefit(DiscountService::MULTIPLIER, 2, 'Double');
        $this->benefit(DiscountService::MULTIPLIER, 3, 'Triple');

        $this->assertSame(3.0, $this->svc->pointsMultiplierFor($this->member()));
    }

    public function test_multiplier_benefit_is_not_treated_as_money(): void
    {
        $this->benefit(DiscountService::MULTIPLIER, 2, 'Double points');

        $this->assertSame(0.0, $this->svc->quote($this->member(), 100.0)['discount']);
    }

    public function test_member_without_a_tier_gets_nothing(): void
    {
        $member = $this->member();
        $member->forceFill(['tier_id' => null])->save();

        $this->assertTrue($this->svc->benefitsFor($member->refresh())->isEmpty());
        $this->assertSame(0.0, $this->svc->quote($member, 100.0)['discount']);
    }
}
