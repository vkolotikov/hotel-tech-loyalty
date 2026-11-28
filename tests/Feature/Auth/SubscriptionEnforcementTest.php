<?php

namespace Tests\Feature\Auth;

use App\Models\ContentPlannerPost;
use App\Models\Staff;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class SubscriptionEnforcementTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['services.saas.api_url' => null, 'services.saas.platform_admin_emails' => '', 'admin_access.mode' => 'enforce']);
        Http::preventStrayRequests();
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', fn ($table) => $table->timestamp('email_verified_at')->nullable());
        }
        $this->org->forceFill(['subscription_status' => 'EXPIRED', 'entitled_products' => ['content'], 'plan_slug' => 'content'])->save();
    }

    public function test_expired_customer_owners_managers_and_staff_cannot_read_or_create_content(): void
    {
        foreach (['super_admin', 'manager', 'staff'] as $role) {
            Staff::where('user_id', $this->manager->id)->update(['role' => $role]);
            $this->manager->unsetRelation('staff');
            $this->actingAs($this->manager, 'sanctum')->getJson($this->api('posts'))
                ->assertForbidden()->assertJsonPath('error', 'subscription_required');
            $this->postJson($this->api('posts'), ['title' => 'Expired draft', 'platform' => 'instagram'])
                ->assertForbidden()->assertJsonPath('error', 'subscription_required');
        }
        $this->assertSame(0, ContentPlannerPost::where('title', 'Expired draft')->count());
    }

    public function test_an_actual_platform_operator_is_exempt_without_the_customer_owner_role(): void
    {
        config(['services.saas.platform_admin_emails' => $this->manager->email]);
        $this->manager->forceFill(['email_verified_at' => now()])->save();
        Staff::where('user_id', $this->manager->id)->update(['role' => 'staff']);
        $this->assertTrue($this->manager->isPlatformAdmin());
        $this->actingAs($this->manager, 'sanctum')->getJson($this->api('posts'))->assertOk();
    }

    public function test_expired_customers_can_still_reach_account_recovery_routes(): void
    {
        Staff::where('user_id', $this->manager->id)->update(['role' => 'super_admin']);
        $this->actingAs($this->manager, 'sanctum')->getJson('/api/v1/auth/subscription')->assertOk();
        $this->getJson('/api/v1/auth/modules')->assertOk()->assertJsonPath('subscription.status', 'EXPIRED');
    }
}
