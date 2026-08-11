<?php

namespace Tests\Feature\Loyalty;

use App\Models\SpecialOffer;
use App\Services\DiscountService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Offer capacity.
 *
 * `usage_limit` was never compared to `times_used` anywhere in the app —
 * the claim path incremented the counter unconditionally — so a
 * "first 100 guests" promotion had no cap at all and the admin list would
 * happily render "4,812 / 100 used".
 */
class OfferClaimLimitTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private DiscountService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpOfferSchema();
        $this->svc = app(DiscountService::class);

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function setUpOfferSchema(): void
    {
        // SpecialOffer carries BelongsToBrand, whose creating hook resolves
        // the org's default brand — so the table has to exist even though
        // nothing here reads it.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name')->nullable();
                $t->boolean('is_default')->default(false);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (Schema::hasTable('special_offers')) {
            return;
        }

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
            $t->boolean('is_active')->default(true);
            $t->boolean('is_featured')->default(false);
            $t->boolean('ai_generated')->default(false);
            $t->timestamps();
        });
    }

    private function offer(?int $limit, int $used): SpecialOffer
    {
        return SpecialOffer::create([
            'title'       => 'Promo',
            'description' => 'x',
            'type'        => 'percent_discount',
            'value'       => 10,
            'start_date'  => now()->subDay(),
            'end_date'    => now()->addMonth(),
            'usage_limit' => $limit,
            'times_used'  => $used,
            'is_active'   => true,
        ]);
    }

    public function test_offer_with_no_limit_always_has_capacity(): void
    {
        $this->assertTrue($this->svc->offerHasCapacity($this->offer(null, 10_000)));
    }

    public function test_offer_below_its_limit_has_capacity(): void
    {
        $this->assertTrue($this->svc->offerHasCapacity($this->offer(100, 99)));
    }

    public function test_offer_at_its_limit_is_full(): void
    {
        $this->assertFalse(
            $this->svc->offerHasCapacity($this->offer(100, 100)),
            'the 101st guest of a "first 100" promotion must be refused'
        );
    }

    public function test_offer_past_its_limit_is_full(): void
    {
        // The state legacy data is already in, because nothing enforced
        // the cap before.
        $this->assertFalse($this->svc->offerHasCapacity($this->offer(100, 4812)));
    }
}
