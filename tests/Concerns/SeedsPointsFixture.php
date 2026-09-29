<?php

namespace Tests\Concerns;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Shared fixture for the "points on a completed appointment" tests
 * (BookingPointsServiceTest, ServiceBookingPointsTest): a loyalty-on
 * organisation, a Gold tier, a member, the `points_per_currency` setting,
 * and a completed-appointment builder.
 *
 * 'beauty' is used as the organisation's industry because
 * PortalBootstrap::loyaltyOn() requires IndustryPromptService::for($industry)
 * ->hasLoyalty to be true, and every industry is one such industry today
 * (owner's decision, 2026-09-29 — medical included). The org needs at
 * least one *active* LoyaltyTier for loyaltyOn() to report true at all.
 *
 * Requires the consumer to also `use SetsUpMinimalSchema,
 * SetsUpServiceBookingSchema` — this trait builds on their
 * setUpLoyaltyAwardSchema() / setUpServiceBookingSchema() /
 * seedBookableService() rather than redeclaring those tables, and adds the
 * one thing neither sets up: `tier_benefits` + `benefit_definitions`.
 * LoyaltyService::pointsForSpend() calls DiscountService::pointsMultiplierFor()
 * for any member that has a tier, and that queries `tier_benefits`
 * unconditionally — an absent table crashes the query outright, it doesn't
 * just come back empty. (Shape mirrors SeedsDiscountFixture::
 * setUpDiscountTables(), kept separate here to avoid that trait's own
 * $orgId/$member property declarations colliding with these tests'.)
 */
trait SeedsPointsFixture
{
    protected function ensurePointsBenefitTables(): void
    {
        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('category')->nullable();
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
                $t->string('applies_to', 12)->default('all');
                $t->text('custom_description')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    /** @return array{orgId:int, tier: LoyaltyTier, member: LoyaltyMember} */
    protected function seedPointsFixture(string $orgName = 'Numa', float $pointsPerCurrency = 10, float $earnRate = 1.5): array
    {
        $this->ensurePointsBenefitTables();

        $orgId = Organization::create([
            'name'     => $orgName,
            'slug'     => 'org-' . uniqid('', true),
            'industry' => 'beauty',
        ])->id;
        app()->instance('current_organization_id', $orgId);

        $tier = LoyaltyTier::create([
            'organization_id' => $orgId,
            'name'            => 'Gold',
            'min_points'      => 0,
            'earn_rate'       => $earnRate,
            'is_active'       => true,
        ]);

        $user = User::create([
            'name'            => 'Ada',
            'email'           => 'ada_' . uniqid('', true) . '@example.test',
            'password'        => bcrypt('secret-pass-1'),
            'user_type'       => 'member',
            'organization_id' => $orgId,
        ]);

        $member = LoyaltyMember::create([
            'organization_id' => $orgId,
            'user_id'         => $user->id,
            'tier_id'         => $tier->id,
            'member_number'   => 'HL-' . $user->id,
            'current_points'  => 0,
            'lifetime_points' => 0,
        ]);

        HotelSetting::withoutGlobalScopes()->create([
            'organization_id' => $orgId,
            'key'             => 'points_per_currency',
            'value'           => (string) $pointsPerCurrency,
        ]);
        HotelSetting::flushCacheFor($orgId);

        return ['orgId' => $orgId, 'tier' => $tier, 'member' => $member];
    }

    /** A completed, paid appointment for $member — the shape a real spa booking ends in. */
    protected function pointsBooking(int $orgId, LoyaltyMember $member, array $attrs = []): ServiceBooking
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($orgId);

        return ServiceBooking::create(array_merge([
            'organization_id'   => $orgId,
            'service_id'        => $service->id,
            'service_master_id' => $master->id,
            'member_id'         => $member->id,
            'customer_name'     => 'Ada',
            'customer_email'    => 'ada@example.test',
            'start_at'          => now()->subDay(),
            'end_at'            => now()->subDay()->addMinutes(45),
            'duration_minutes'  => 45,
            'service_price'     => 60,
            'total_amount'      => 54,
            'list_amount'       => 60,
            'discount_amount'   => 6,
            'currency'          => 'EUR',
            'status'            => 'completed',
            'payment_status'    => 'paid',
            'source'            => 'member_portal',
        ], $attrs));
    }
}
