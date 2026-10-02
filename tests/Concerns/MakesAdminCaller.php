<?php

namespace Tests\Concerns;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Builds a staff caller that can reach an admin route of a given
 * organisation: `actingAs($user, 'sanctum')` plus this trait's table
 * set-up is enough to satisfy the admin middleware chain (`tenant`,
 * `brand`, `admin`, `check.subscription`, `staff.can:<capability>`).
 *
 * Table shapes mirror tests/Feature/Admin/MemberPortalLinkTest.php and the
 * staff-token fixture in tests/Feature/Member/Portal/PortalBootstrapTest.php
 * (brand_user pivot + staff table), extended with the capability columns
 * RequireStaffCapability reads (see database/migrations/2024_01_01_000004_
 * create_staff_table.php), and the `admin_access_refusals` table the
 * `admin.access` middleware writes. Every create is guarded by hasTable/hasColumn —
 * other suites' setUp may already have built a narrower `staff` table in
 * the same test run, so the capability columns are added on top rather
 * than assumed to come from the table create.
 */
trait MakesAdminCaller
{
    /**
     * @param array<string, bool> $can Capability flags to grant, e.g.
     *   ['can_redeem_points' => true]. Anything not listed defaults to false.
     */
    protected function staffUser(Organization $org, array $can = []): User
    {
        // BrandMiddleware (part of the admin chain) narrows a staff user to
        // their assigned brands through this pivot before falling back to
        // "unrestricted" when the staff user has no rows.
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('manager');
                $table->string('hotel_name')->nullable();
                $table->string('department')->nullable();
                $table->text('allowed_nav_groups')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        foreach (['can_award_points', 'can_redeem_points', 'can_manage_offers', 'can_view_analytics'] as $flag) {
            if (!Schema::hasColumn('staff', $flag)) {
                Schema::table('staff', fn ($table) => $table->boolean($flag)->default(false));
            }
        }

        // The admin access map's record (AccessRecorder). Production builds it
        // with the 2026_10_02 migration; every admin call may write to it.
        if (!Schema::hasTable('admin_access_refusals')) {
            Schema::create('admin_access_refusals', function ($table) {
                $table->bigIncrements('id');
                $table->date('day');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->nullable();
                $table->string('rule', 191);
                $table->string('method', 10);
                $table->string('reason', 32);
                $table->boolean('enforced')->default(false);
                $table->unsignedInteger('hits')->default(1);
                $table->timestamp('first_seen_at');
                $table->timestamp('last_seen_at');
            });
        }

        // check.subscription (part of the admin chain) 403s an org without
        // an active/trialing subscription.
        if ($org->subscription_status !== 'ACTIVE') {
            $org->forceFill(['subscription_status' => 'ACTIVE'])->save();
        }

        $user = User::create([
            'organization_id' => $org->id,
            'name'            => 'Staff',
            'email'           => 'staff-' . uniqid('', true) . '@example.test',
            'password'        => bcrypt('secret-pass-1'),
            'user_type'       => 'staff',
        ]);

        DB::table('staff')->insert(array_merge([
            'organization_id'    => $org->id,
            'user_id'            => $user->id,
            'role'               => 'manager',
            'can_award_points'   => false,
            'can_redeem_points'  => false,
            'can_manage_offers'  => false,
            'can_view_analytics' => false,
            'is_active'          => true,
            'created_at'         => now(),
            'updated_at'         => now(),
        ], $can));

        return $user;
    }
}
