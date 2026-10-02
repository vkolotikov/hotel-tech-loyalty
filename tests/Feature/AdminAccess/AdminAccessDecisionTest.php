<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\AdminAccess;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * The access map's decision, called with the route production would
 * dispatch to and a next step that answers "passed" (planning ruling R5).
 * Enforce mode unless a test says otherwise.
 */
class AdminAccessDecisionTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config(['admin_access.mode' => 'enforce']);
    }

    private function decide(User $user, string $method, string $uri, ?RoutingRoute $route = null): Response
    {
        $request = Request::create('/' . ltrim($uri, '/'), $method);
        $route ??= Route::getRoutes()->match($request);
        $request->setRouteResolver(fn () => $route);
        $request->setUserResolver(fn () => $user);

        return app(AdminAccess::class)->handle($request, fn () => response('passed'));
    }

    private function as(string $role, array $more = []): User
    {
        return $this->staffUser($this->org, array_merge(['role' => $role], $more));
    }

    private function assertPassed(Response $response, string $why = ''): void
    {
        $this->assertSame('passed', $response->getContent(), $why . ' ' . $response->getContent());
    }

    private function assertRefused(string $code, Response $response, string $why = ''): void
    {
        $this->assertSame(403, $response->getStatusCode(), $why . ' ' . $response->getContent());
        $this->assertSame($code, json_decode($response->getContent(), true)['error'], $why);
    }

    private function onTheAppointmentsPlan(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
    }

    public function test_managers_change_settings_and_everyone_else_may_only_read_them(): void
    {
        foreach (['super_admin', 'manager'] as $role) {
            $this->assertPassed($this->decide($this->as($role), 'PUT', 'api/v1/admin/settings'), $role);
        }
        foreach (['staff', 'receptionist'] as $role) {
            $this->assertRefused('not_allowed', $this->decide($this->as($role), 'PUT', 'api/v1/admin/settings'), $role);
        }

        $refused = $this->decide($this->as('staff'), 'POST', 'api/v1/admin/team/invite');
        $this->assertSame(['error' => 'not_allowed', 'message' => 'Only an owner or a manager can do this.'], json_decode($refused->getContent(), true));

        $this->assertPassed($this->decide($this->as('staff'), 'GET', 'api/v1/admin/settings'));
    }

    public function test_head_is_a_read(): void
    {
        $this->assertPassed($this->decide($this->as('staff'), 'HEAD', 'api/v1/admin/settings'));
    }

    public function test_sensitive_reads_are_for_managers(): void
    {
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'GET', 'api/v1/admin/audit-logs'));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/audit-logs'));
    }

    public function test_pages_for_everyone_stay_open_and_the_overrides_hold(): void
    {
        $staff = $this->as('staff');

        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/guests'), 'guests');
        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/admin/bookings'), 'bookings');
        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/admin/team'), 'team list for the Planner');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/email-templates/7/send'), 'send a template');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/reviews/invitations'), 'ask for a review');

        $this->assertRefused('not_allowed', $this->decide($staff, 'GET', 'api/v1/admin/bookings/submissions'), 'submissions');
        $this->assertRefused('not_allowed', $this->decide($staff, 'PUT', 'api/v1/admin/email-templates/7'), 'edit a template');
    }

    public function test_tabs_and_wizards_on_pages_for_everyone_stay_open(): void
    {
        // Final review: these sit on pages every staff member opens (Leads → Lead forms, the
        // Members onboarding wizard, the first-run Setup wizard); refused, a receptionist is stuck.
        $staff = $this->as('staff');

        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/lead-forms'), 'Leads → Lead forms');
        $this->assertPassed($this->decide($staff, 'PUT', 'api/v1/admin/lead-forms/3'), 'Leads → Lead forms, save');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/loyalty-presets/skip'), 'Members onboarding: skip');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/loyalty-presets/apply'), 'Members onboarding: apply');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/setup/initialize'), 'first-run Setup wizard');
    }

    public function test_a_capability_rule_admits_managers_and_staff_whose_flag_is_set(): void
    {
        $refused = $this->decide($this->as('staff'), 'GET', 'api/v1/admin/reporting/forecast');
        $this->assertRefused('not_allowed', $refused);
        $this->assertSame('Your account does not have permission for this.', json_decode($refused->getContent(), true)['message']);

        $this->assertPassed($this->decide($this->as('staff', ['can_view_analytics' => true]), 'GET', 'api/v1/admin/reporting/forecast'));
        // The fixture's manager has every flag off: managers meet every rule, as the menu shows them every page.
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/reporting/forecast'));
    }

    public function test_a_deactivated_or_foreign_account_is_refused_and_the_operator_is_not(): void
    {
        $this->assertRefused('staff_inactive', $inactive = $this->decide($this->as('manager', ['is_active' => false]), 'GET', 'api/v1/admin/dashboard/arrivals-today'));
        $this->assertSame(
            ['error' => 'staff_inactive', 'message' => 'Your access to this organisation has been switched off. Ask an owner or a manager.'],
            json_decode($inactive->getContent(), true),
        );

        // A manager of another organisation only: no staff row here.
        $foreign = $this->staffUser($this->otherOrganization());
        $this->assertRefused('staff_inactive', $this->decide($foreign, 'GET', 'api/v1/admin/dashboard/arrivals-today'));

        config(['services.saas.platform_admin_emails' => $foreign->email]);
        $this->assertPassed($this->decide($foreign, 'PUT', 'api/v1/admin/settings'));
    }

    public function test_billing_and_the_industry_are_for_managers(): void
    {
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'POST', 'api/v1/auth/billing/checkout'));
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'POST', 'api/v1/auth/apply-industry'));
        $this->assertPassed($this->decide($this->staff, 'POST', 'api/v1/auth/billing/checkout'));
    }

    public function test_a_member_token_on_lead_intake_is_refused(): void
    {
        $this->assertRefused('staff_inactive', $this->decide(User::findOrFail($this->member->user_id), 'POST', 'api/v1/integrations/leads'));
    }

    public function test_a_route_no_key_matches_is_for_managers_and_named_in_the_record(): void
    {
        $probe = new RoutingRoute(['GET'], 'api/v1/admin/zz-unmapped-probe', fn () => null);

        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'GET', 'api/v1/admin/zz-unmapped-probe', $probe));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/zz-unmapped-probe', $probe));
        $this->assertTrue(DB::table('admin_access_refusals')->where('rule', 'unmapped:admin/zz-unmapped-probe')->exists());
    }

    public function test_report_mode_records_what_it_would_refuse_and_lets_it_through(): void
    {
        config(['admin_access.mode' => 'report']);
        $staff = $this->as('staff');

        $this->assertPassed($this->decide($staff, 'PUT', 'api/v1/admin/settings'));
        $this->assertPassed($this->decide($staff, 'PUT', 'api/v1/admin/settings'));
        $this->assertPassed($this->decide($this->as('manager', ['is_active' => false]), 'GET', 'api/v1/admin/dashboard/arrivals-today'));
        $this->assertPassed($this->decide($this->staff, 'PUT', 'api/v1/admin/settings')); // a manager: nothing to record

        $row = DB::table('admin_access_refusals')->where('reason', 'not_allowed')->first();
        $this->assertSame(['admin/settings', 'PUT', 'staff', 2, 0], [$row->rule, $row->method, $row->role, (int) $row->hits, (int) $row->enforced]);
        $this->assertSame(1, DB::table('admin_access_refusals')->where('reason', 'staff_inactive')->where('rule', 'admin/dashboard')->count());
        $this->assertSame(2, DB::table('admin_access_refusals')->count());
    }

    public function test_enforce_mode_records_what_it_refuses(): void
    {
        $this->decide($this->as('staff'), 'PUT', 'api/v1/admin/settings');

        $this->assertSame(1, (int) DB::table('admin_access_refusals')->where('rule', 'admin/settings')->value('enforced'));
    }

    public function test_the_appointments_plan_reaches_the_workspace_and_the_callers_own_account_only(): void
    {
        $this->onTheAppointmentsPlan();

        foreach (['GET api/v1/admin/appointments/bootstrap', 'GET api/v1/admin/me/preferences', 'GET api/v1/admin/branding/theme', 'POST api/v1/admin/push-token'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertPassed($this->decide($this->staff, $method, $uri), $call);
        }

        $refused = $this->decide($this->staff, 'GET', 'api/v1/admin/members');
        $this->assertSame(['error' => 'not_in_plan', 'message' => "This is not part of your organisation's HexaTech plan."], json_decode($refused->getContent(), true));
        foreach (['POST api/v1/auth/billing/checkout', 'POST api/v1/auth/apply-industry', 'POST api/v1/integrations/leads', 'POST mcp', 'GET api/v1/admin/service-bookings'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertRefused('not_in_plan', $this->decide($this->staff, $method, $uri), $call);
        }

        $this->assertSame(1, (int) DB::table('admin_access_refusals')->where('reason', 'not_in_plan')->where('rule', 'admin/members')->value('enforced'));
    }

    public function test_the_plans_lock_holds_in_report_mode_and_for_nobody_but_the_operator(): void
    {
        config(['admin_access.mode' => 'report']);
        $this->onTheAppointmentsPlan();

        $this->assertRefused('not_in_plan', $this->decide($this->staff, 'GET', 'api/v1/admin/members'));

        $operator = $this->staffUser($this->otherOrganization());
        config(['services.saas.platform_admin_emails' => $operator->email]);
        $this->assertPassed($this->decide($operator, 'GET', 'api/v1/admin/members'));
    }

    public function test_a_customer_with_appointments_and_more_is_a_full_customer(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'crm']])->save();

        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/members'));
    }
}
