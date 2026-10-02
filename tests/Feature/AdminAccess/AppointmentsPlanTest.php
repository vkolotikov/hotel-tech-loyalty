<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_billing_decides_from_the_products_then_the_plan_slug(): void
    {
        $cases = [
            [['appointments', 'booking'], null, true],
            [['appointments'], null, true],
            [['crm', 'loyalty', 'booking', 'chat'], null, false],
            [['appointments', 'crm'], null, false],
            [['booking'], null, false],
            [[], 'appointments', true],
            [[], 'growth', false],
            [[], null, false],
            [['crm', 'loyalty'], 'appointments', false], // a product list decides over the slug
        ];

        foreach ($cases as [$products, $slug, $only]) {
            $this->org->forceFill(['entitled_products' => $products, 'plan_slug' => $slug])->save();
            $org = $this->org->fresh();
            $this->assertSame($only, $org->appointmentsOnly(), json_encode([$products, $slug]));
            $this->assertSame($only ? 'plan' : null, $org->appointmentsOnlySource(), json_encode([$products, $slug]));
            $this->assertSame($only, Organization::isAppointmentsOnly($this->org->id));
        }
        $this->assertFalse(Organization::isAppointmentsOnly(null));
    }

    public function test_an_operator_mark_decides_over_billing_and_can_be_removed(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm', 'loyalty', 'booking', 'chat']])->save();
        $this->org->setAppointmentsOnly(true);
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
        $this->assertSame('operator', $this->org->fresh()->appointmentsOnlySource());

        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $this->org->setAppointmentsOnly(false);
        $this->assertFalse($this->org->fresh()->appointmentsOnly());
        $this->assertSame('operator', $this->org->fresh()->appointmentsOnlySource());

        $this->org->setAppointmentsOnly(null);
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
        $this->assertSame('plan', $this->org->fresh()->appointmentsOnlySource());
        $this->assertNull(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
    }

    public function test_the_workspace_is_on_and_where_they_land_whatever_was_stored(): void
    {
        // Switched off before it became appointments-only: the workspace is still all it has.
        $this->org->setWorkspace('appointments', false);
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $org = $this->org->fresh();

        $this->assertSame(['enabled' => true, 'landing' => true], $org->workspace('appointments'));
        $this->assertTrue($org->workspaceEnabled('appointments'));
        $this->assertTrue($org->workspaceIsException('appointments'));
        $this->assertSame(['appointments' => ['landing' => true, 'has_services' => true, 'only' => true]], $org->workspacesPayload());
    }

    public function test_switching_the_workspace_keeps_the_operator_mark(): void
    {
        $this->org->setAppointmentsOnly(false);
        $this->org->setWorkspace('appointments', true, landing: true);

        $this->assertFalse(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('appointments'));

        // A mark alone makes an exception for --list, even with the default switch.
        $this->org->setWorkspace('appointments', true);
        $this->assertTrue($this->org->fresh()->workspaceIsException('appointments'));
    }

    public function test_a_full_customer_is_told_only_false_and_is_otherwise_unchanged(): void
    {
        $this->assertSame(['appointments' => ['landing' => false, 'has_services' => true, 'only' => false]], $this->org->fresh()->workspacesPayload());
        $this->assertSame(['enabled' => true, 'landing' => false], $this->org->fresh()->workspace('appointments'));
        $this->assertFalse($this->org->fresh()->workspaceIsException('appointments'));
    }

    public function test_the_sign_in_answer_carries_only(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->actingAs($this->staff, 'sanctum')->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('workspaces.appointments.only', true)
            ->assertJsonPath('workspaces.appointments.landing', true);
    }

    public function test_billing_unreachable_falls_back_to_the_plans_products(): void
    {
        $products = new \ReflectionMethod(AuthController::class, 'getPlanProducts');
        $controller = app(AuthController::class);

        $this->assertSame(['appointments', 'booking'], $products->invoke($controller, 'appointments'));
        $this->assertSame(['crm', 'loyalty', 'booking', 'chat'], $products->invoke($controller, 'growth'));
        $this->assertSame(['crm', 'loyalty'], $products->invoke($controller, 'starter'));
    }
}
