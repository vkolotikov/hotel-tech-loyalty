<?php

namespace Tests\Feature\Middleware;

use App\Http\Middleware\RequireStaffCapability;
use App\Models\Staff;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the RequireStaffCapability contract.
 *
 * The `staff` table has carried can_award_points, can_redeem_points,
 * can_manage_offers and can_view_analytics for a long time, and TeamController
 * lets an admin set them per person — but only the points flags were ever
 * checked. can_manage_offers was stored, returned to the client and rendered in
 * the UI as though it meant something, while any authenticated staff account
 * could create, edit and delete the organisation's offers and benefits.
 *
 * This middleware closes that. The behaviours worth pinning:
 *
 *   PASS  — flag is true
 *   403   — flag is false, with code `permission_denied` and the capability
 *           name so the client can explain WHICH permission is missing
 *   403   — NO Staff row at all: fail closed, matching the
 *           `!$staff ||` convention in MemberAdminController
 *   401   — unauthenticated
 *   PASS  — platform admin bypass, mirroring RequireFeature
 *   throw — an unknown capability name is a programming error, not a denial
 */
class RequireStaffCapabilityTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private RequireStaffCapability $middleware;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // UserFactory stamps columns the minimal users schema omits.
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', function ($t) {
                $t->timestamp('email_verified_at')->nullable();
                $t->string('remember_token', 100)->nullable();
            });
        }

        // The minimal schema has no staff table — this is the only suite that
        // needs one.
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('user_id');
                $t->string('role')->default('receptionist');
                $t->boolean('can_award_points')->default(false);
                $t->boolean('can_redeem_points')->default(false);
                $t->boolean('can_manage_offers')->default(false);
                $t->boolean('can_view_analytics')->default(false);
                $t->timestamps();
            });
        }

        // Staff is tenant-scoped and TenantScope fails CLOSED when unbound, so
        // without this every lookup returns nothing and every test would pass
        // for the wrong reason.
        app()->instance('current_organization_id', 1);

        $this->middleware = new RequireStaffCapability();
    }

    /** A logged-in user, optionally with a staff row carrying $caps. */
    private function loginAs(?array $caps, string $email = 'staff@example.com'): User
    {
        $user = UserFactory::new()->create(['email' => $email, 'organization_id' => 1]);

        if ($caps !== null) {
            Staff::withoutGlobalScopes()->create(array_merge([
                'organization_id'    => 1,
                'user_id'            => $user->id,
                'role'               => 'receptionist',
                'can_award_points'   => false,
                'can_redeem_points'  => false,
                'can_manage_offers'  => false,
                'can_view_analytics' => false,
            ], $caps));
        }

        Auth::login($user);
        return $user;
    }

    private function invoke(string $capability): SymfonyResponse
    {
        return $this->middleware->handle(
            Request::create('/v1/admin/offers', 'POST'),
            fn () => new Response('PASS', 200),
            $capability,
        );
    }

    public function test_passes_when_the_capability_is_granted(): void
    {
        $this->loginAs(['can_manage_offers' => true]);

        $res = $this->invoke('can_manage_offers');

        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame('PASS', $res->getContent());
    }

    public function test_denies_with_403_when_the_capability_is_missing(): void
    {
        $this->loginAs(['can_manage_offers' => false]);

        $res = $this->invoke('can_manage_offers');

        $this->assertSame(403, $res->getStatusCode());
        $body = json_decode($res->getContent(), true);
        $this->assertSame('permission_denied', $body['error']);
        // The client needs to know WHICH permission, to tell the user who to ask.
        $this->assertSame('can_manage_offers', $body['capability']);
        $this->assertStringContainsString('manage offers', $body['message']);
    }

    public function test_fails_closed_when_the_user_has_no_staff_row(): void
    {
        // SaasAuthMiddleware repairs missing Staff rows every request, so a
        // null here means that repair failed too. Granting write access to an
        // account in an unknown permission state is the wrong way to fail.
        $this->loginAs(null);

        $this->assertSame(403, $this->invoke('can_manage_offers')->getStatusCode());
    }

    public function test_capabilities_are_independent_of_one_another(): void
    {
        // Holding the points permissions must not imply offer management.
        $this->loginAs([
            'can_award_points'  => true,
            'can_redeem_points' => true,
            'can_manage_offers' => false,
        ]);

        $this->assertSame(200, $this->invoke('can_award_points')->getStatusCode());
        $this->assertSame(403, $this->invoke('can_manage_offers')->getStatusCode());
    }

    public function test_unauthenticated_requests_get_401(): void
    {
        Auth::logout();

        $this->assertSame(401, $this->invoke('can_manage_offers')->getStatusCode());
    }

    public function test_platform_admin_bypasses_the_capability(): void
    {
        // Same operator escape hatch RequireFeature grants, so support can act
        // on a tenant without being provisioned into it.
        //
        // Note the config is a comma-separated STRING, not an array —
        // User::isPlatformAdmin does `explode(',', (string) $raw)`, so passing
        // an array casts to "Array" and silently matches nobody.
        Config::set('services.saas.platform_admin_emails', 'ops@hotel-tech.ai');

        // Deliberately no staff row AND no capability.
        $this->loginAs(null, 'ops@hotel-tech.ai');

        $this->assertSame(200, $this->invoke('can_manage_offers')->getStatusCode());
    }

    public function test_an_unknown_capability_is_a_programming_error(): void
    {
        // Reading an arbitrary column would yield null, i.e. permanent denial —
        // a confusing outage from a route-file typo. Fail loudly instead.
        $this->loginAs(['can_manage_offers' => true]);

        $this->expectException(\InvalidArgumentException::class);
        $this->invoke('can_do_anything');
    }
}
