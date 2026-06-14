<?php

namespace Tests\Feature\Loyalty;

use App\Models\SpecialOffer;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the SpecialOffer model contract — the master offer
 * catalog (members claim offers via MemberOffer).
 *
 * Why this matters:
 *
 *   scopeActive composes 3 predicates: is_active + start_date
 *   <= now + end_date >= now. Drives the "what offers can I
 *   show to members today?" SPA card on /members. A regression
 *   in any predicate silently surfaces expired offers OR hides
 *   live ones.
 *
 *   scopeForTier handles the tier-targeting filter. NULL tier_ids
 *   = available to ALL tiers; non-null = restricted to those
 *   tier IDs (whereJsonContains predicate).
 *
 *   brand_id NULL semantic = "applies to all brands in the org"
 *   (per source docblock). Same opt-out pattern as
 *   NotificationCampaign (locked in DD3).
 *
 * Contract:
 *
 *   - scopeActive: composite is_active + start_date <= now +
 *     end_date >= now
 *   - scopeForTier: matches tier_ids=NULL OR
 *     whereJsonContains(tier_ids, tierId)
 *   - Casts: tier_ids array; start_date + end_date date; 3 bools
 *     (is_active, is_featured, ai_generated); value decimal:2
 *   - memberOffers HasMany (FK 'offer_id')
 *   - createdBy BelongsTo User (FK 'created_by')
 *   - BelongsToOrganization + BelongsToBrand + tenant isolation
 */
class SpecialOfferModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('special_offers')) {
            Schema::create('special_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->string('type', 32)->nullable();
                $t->decimal('value', 12, 2)->default(0);
                $t->text('tier_ids')->nullable();
                $t->date('start_date');
                $t->date('end_date');
                $t->integer('usage_limit')->nullable();
                $t->integer('times_used')->default(0);
                $t->integer('per_member_limit')->nullable();
                $t->string('image_url')->nullable();
                $t->text('terms_conditions')->nullable();
                $t->boolean('is_active')->default(true);
                $t->boolean('is_featured')->default(false);
                $t->boolean('ai_generated')->default(false);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    private function offer(array $attrs = []): SpecialOffer
    {
        return SpecialOffer::create(array_merge([
            'organization_id' => $this->orgId,
            'title'           => 'Test offer',
            'type'            => 'percent_off',
            'value'           => 20.00,
            'start_date'      => now()->subDay(),
            'end_date'        => now()->addDays(30),
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── scopeActive composite predicate ─── */

    public function test_scope_active_includes_currently_running_active_offer(): void
    {
        // Within window + is_active=true → surfaces.
        $this->offer([
            'title'      => 'Live',
            'is_active'  => true,
            'start_date' => now()->subDay(),
            'end_date'   => now()->addDay(),
        ]);

        $active = SpecialOffer::active()->get();

        $this->assertCount(1, $active);
        $this->assertSame('Live', $active->first()->title);
    }

    public function test_scope_active_excludes_inactive_offer(): void
    {
        // is_active=false → hidden regardless of date window.
        $this->offer([
            'title'      => 'Paused',
            'is_active'  => false,
            'start_date' => now()->subDay(),
            'end_date'   => now()->addDay(),
        ]);

        $this->assertCount(0, SpecialOffer::active()->get(),
            'scopeActive MUST exclude is_active=false offers.');
    }

    public function test_scope_active_excludes_future_offer(): void
    {
        // start_date > now → not yet live.
        $this->offer([
            'title'      => 'Tomorrow',
            'start_date' => now()->addDays(2),
            'end_date'   => now()->addDays(10),
        ]);

        $this->assertCount(0, SpecialOffer::active()->get(),
            'scopeActive MUST exclude future offers (start_date > now).');
    }

    public function test_scope_active_excludes_expired_offer(): void
    {
        // end_date < now → expired.
        $this->offer([
            'title'      => 'Expired',
            'start_date' => now()->subDays(30),
            'end_date'   => now()->subDay(),
        ]);

        $this->assertCount(0, SpecialOffer::active()->get(),
            'scopeActive MUST exclude expired offers (end_date < now).');
    }

    public function test_scope_active_composes_all_3_predicates(): void
    {
        // Compose: is_active + within window. Mixed bag → only
        // the truly-active one surfaces.
        $this->offer(['title' => 'Live',    'is_active' => true,  'start_date' => now()->subDay(), 'end_date' => now()->addDay()]);
        $this->offer(['title' => 'Paused',  'is_active' => false, 'start_date' => now()->subDay(), 'end_date' => now()->addDay()]);
        $this->offer(['title' => 'Future',  'is_active' => true,  'start_date' => now()->addDays(2), 'end_date' => now()->addDays(10)]);
        $this->offer(['title' => 'Expired', 'is_active' => true,  'start_date' => now()->subDays(30), 'end_date' => now()->subDay()]);

        $active = SpecialOffer::active()->get();
        $this->assertCount(1, $active);
        $this->assertSame('Live', $active->first()->title);
    }

    /* ─── scopeForTier whereJsonContains ─── */

    public function test_scope_for_tier_includes_offers_with_null_tier_ids(): void
    {
        // CRITICAL: tier_ids=NULL = "available to ALL tiers" per
        // the documented semantic. Pre-fix a regression that
        // checked tier_ids only via whereJsonContains would
        // EXCLUDE null-tier offers from every tier's view —
        // breaking the "everyone sees this" offer pattern.
        $this->offer(['title' => 'Universal', 'tier_ids' => null]);
        $this->offer(['title' => 'Gold only', 'tier_ids' => [3]]);

        $forBronze = SpecialOffer::forTier(1)->get();
        $titles = $forBronze->pluck('title')->sort()->values()->toArray();

        $this->assertContains('Universal', $titles,
            'tier_ids=NULL MUST surface for ALL tier queries.');
    }

    public function test_scope_for_tier_includes_offers_matching_tier_id(): void
    {
        // tier_ids containing the requested tier → surfaces.
        $this->offer(['title' => 'Gold target', 'tier_ids' => [3]]);
        $this->offer(['title' => 'Silver target', 'tier_ids' => [2]]);

        $forGold = SpecialOffer::forTier(3)->get();
        $titles = $forGold->pluck('title')->values()->toArray();

        $this->assertContains('Gold target', $titles);
        $this->assertNotContains('Silver target', $titles);
    }

    public function test_scope_for_tier_excludes_offers_with_non_matching_tier_ids(): void
    {
        // tier_ids set + does NOT contain requested tier →
        // excluded (the "Gold only" gate).
        $this->offer(['title' => 'Gold only', 'tier_ids' => [3]]);

        $forBronze = SpecialOffer::forTier(1)->get();
        $titles = $forBronze->pluck('title')->values()->toArray();

        $this->assertNotContains('Gold only', $titles,
            'Non-matching tier_ids list MUST exclude the offer.');
    }

    /* ─── Casts ─── */

    public function test_tier_ids_round_trips_through_array_cast(): void
    {
        $tiers = [1, 3, 5];
        $offer = $this->offer(['tier_ids' => $tiers]);

        $this->assertSame($tiers, $offer->fresh()->tier_ids);
    }

    public function test_start_date_and_end_date_cast_to_carbon(): void
    {
        $offer = $this->offer([
            'start_date' => '2026-07-01',
            'end_date'   => '2026-08-31',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $offer->start_date);
        $this->assertInstanceOf(\Carbon\Carbon::class, $offer->end_date);
    }

    public function test_value_casts_to_decimal_2_string(): void
    {
        // Money-safe BCMath cast.
        $offer = $this->offer(['value' => 25.50]);

        $this->assertSame('25.50', $offer->fresh()->value);
    }

    public function test_all_3_boolean_casts(): void
    {
        // is_active + is_featured + ai_generated all bool.
        // is_featured drives the SPA's "Featured" carousel;
        // ai_generated tracks OpenAiService::personalizeOffer output.
        $offer = $this->offer([
            'is_active'    => true,
            'is_featured'  => false,
            'ai_generated' => true,
        ]);

        $this->assertTrue($offer->is_active);
        $this->assertFalse($offer->is_featured);
        $this->assertTrue($offer->ai_generated);
        $this->assertIsBool($offer->ai_generated);
    }

    /* ─── brand_id NULL semantic ─── */

    public function test_brand_id_null_means_org_wide_offer(): void
    {
        // Documented: NULL brand_id = "applies to all brands"
        // (org-wide). Lock the persistence.
        $orgWide = $this->offer(['brand_id' => null, 'title' => 'Org-wide']);
        $branded = $this->offer(['brand_id' => 100, 'title' => 'Brand 100']);

        $this->assertNull($orgWide->fresh()->brand_id);
        $this->assertSame(100, (int) $branded->fresh()->brand_id);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_member_offers_relationship_uses_offer_id_foreign_key(): void
    {
        // CRITICAL: FK is 'offer_id', NOT 'special_offer_id'.
        // Sister MemberOffer.offer (locked in AA3) uses the same
        // name — both must stay in sync.
        $offer = $this->offer();
        $rel = $offer->memberOffers();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('offer_id', $rel->getForeignKeyName(),
            'memberOffers FK MUST be offer_id (NOT special_offer_id).');
    }

    public function test_created_by_relationship_uses_created_by_foreign_key(): void
    {
        $offer = $this->offer();
        $rel = $offer->createdBy();

        $this->assertSame('created_by', $rel->getForeignKeyName(),
            'createdBy FK MUST be created_by.');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_tenant_scope_isolates_offers_cross_org(): void
    {
        $orgB = OrganizationFactory::new()->create()->id;

        $this->offer(['title' => 'Org A offer']);
        \DB::table('special_offers')->insert([
            'organization_id' => $orgB,
            'title'           => 'Org B offer',
            'type'            => 'percent_off',
            'value'           => 10.00,
            'start_date'      => now()->subDay(),
            'end_date'        => now()->addDay(),
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = SpecialOffer::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A offer', $aRows->first()->title);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = SpecialOffer::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B offer', $bRows->first()->title);
    }
}
