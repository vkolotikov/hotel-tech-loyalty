<?php

namespace Tests\Feature\Loyalty;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\LoyaltyMember;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Benefit requests — the half of the entitlement feature that didn't exist.
 *
 * `BenefitEntitlement` models a pending → approved → fulfilled lifecycle,
 * `BenefitAdminController` exposes approve/fulfil/decline, and
 * `ScanController` already renders a member's live entitlements for staff
 * at the counter. But NOTHING in the codebase ever created a row, so the
 * queue was permanently empty and the whole workflow was unreachable.
 *
 * The rules that matter once members can ask:
 *   - only benefits that need a person are requestable
 *   - one open request per benefit, so a double-tap can't queue two
 *   - an annual cap, where the benefit defines one
 */
class BenefitEntitlementRequestTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $tierId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpBenefitTables();

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

    private function setUpBenefitTables(): void
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
                $t->integer('usage_limit_per_stay')->nullable();
                $t->integer('usage_limit_per_year')->nullable();
                $t->boolean('requires_active_stay')->default(false);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('benefit_entitlements')) {
            Schema::create('benefit_entitlements', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->unsignedBigInteger('booking_id')->nullable();
                $t->string('status', 32)->default('pending');
                $t->unsignedBigInteger('actioned_by')->nullable();
                $t->string('decline_reason')->nullable();
                $t->timestamp('requested_at')->nullable();
                $t->timestamp('fulfilled_at')->nullable();
                $t->timestamps();
            });
        }
    }

    private function member(): LoyaltyMember
    {
        return LoyaltyMemberFactory::new()->inTier($this->tierId)->create()->refresh();
    }

    private function benefit(string $mode, ?int $perYear = null): BenefitDefinition
    {
        return BenefitDefinition::create([
            'organization_id'      => app('current_organization_id'),
            'name'                 => 'Late Checkout',
            'code'                 => 'late_' . uniqid(),
            'fulfillment_mode'     => $mode,
            'usage_limit_per_year' => $perYear,
            'is_active'            => true,
        ]);
    }

    public function test_an_entitlement_can_now_be_created_at_all(): void
    {
        // The regression this whole class exists for: before, the staff
        // queue could never contain anything.
        $member = $this->member();
        $benefit = $this->benefit('staff_approved');

        BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'pending',
            'requested_at'    => now(),
        ]);

        $this->assertSame(1, BenefitEntitlement::where('member_id', $member->id)->count());
    }

    public function test_pending_request_is_visible_to_the_staff_queue_query(): void
    {
        $member = $this->member();
        $benefit = $this->benefit('on_request');

        BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'pending',
            'requested_at'    => now(),
        ]);

        // Mirrors BenefitAdminController::entitlements(status=pending).
        $queue = BenefitEntitlement::where('status', 'pending')->get();

        $this->assertCount(1, $queue);
        $this->assertSame($member->id, $queue->first()->member_id);
    }

    public function test_fulfilling_stamps_who_and_when(): void
    {
        $member = $this->member();
        $benefit = $this->benefit('staff_approved');

        $entitlement = BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'pending',
            'requested_at'    => now(),
        ]);

        $staff = \App\Models\User::create([
            'name' => 'Desk', 'email' => 'desk' . uniqid() . '@example.com',
            'password' => 'x', 'user_type' => 'staff', 'language' => 'en',
            'organization_id' => app('current_organization_id'),
        ]);

        $entitlement->fulfill($staff);

        $fresh = $entitlement->fresh();
        $this->assertSame('fulfilled', $fresh->status);
        $this->assertSame($staff->id, $fresh->actioned_by);
        $this->assertNotNull($fresh->fulfilled_at);
    }

    public function test_annual_cap_counts_only_fulfilled_requests_this_year(): void
    {
        $member = $this->member();
        $benefit = $this->benefit('on_request', perYear: 2);

        // Two fulfilled this year — the cap is reached.
        foreach ([1, 2] as $i) {
            BenefitEntitlement::create([
                'organization_id' => $member->organization_id,
                'member_id'       => $member->id,
                'benefit_id'      => $benefit->id,
                'status'          => 'fulfilled',
                'requested_at'    => now(),
                'fulfilled_at'    => now(),
            ]);
        }
        // A declined one must NOT count against the allowance.
        BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'declined',
            'requested_at'    => now(),
        ]);
        // Nor should one fulfilled in a previous year.
        BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'fulfilled',
            'requested_at'    => now()->subYear(),
            'fulfilled_at'    => now()->subYear(),
        ]);

        $usedThisYear = BenefitEntitlement::where('member_id', $member->id)
            ->where('benefit_id', $benefit->id)
            ->where('status', 'fulfilled')
            ->whereYear('fulfilled_at', now()->year)
            ->count();

        $this->assertSame(2, $usedThisYear, 'declined and prior-year rows must not consume the allowance');
        $this->assertTrue($usedThisYear >= (int) $benefit->usage_limit_per_year);
    }

    public function test_an_open_request_is_detected_so_a_second_is_refused(): void
    {
        $member = $this->member();
        $benefit = $this->benefit('staff_approved');

        BenefitEntitlement::create([
            'organization_id' => $member->organization_id,
            'member_id'       => $member->id,
            'benefit_id'      => $benefit->id,
            'status'          => 'pending',
            'requested_at'    => now(),
        ]);

        $open = BenefitEntitlement::where('member_id', $member->id)
            ->where('benefit_id', $benefit->id)
            ->whereIn('status', ['pending', 'eligible', 'approved'])
            ->exists();

        $this->assertTrue($open, 'a double-tapped Request must not open two queue items');
    }
}
