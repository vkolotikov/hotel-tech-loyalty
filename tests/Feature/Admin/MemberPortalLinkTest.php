<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * No admin screen showed the portal join link; tenants had to assemble
 * `/portal/join?org=<token>` by hand from a widget snippet. This endpoint
 * is what the Members hub card reads.
 */
class MemberPortalLinkTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const ENDPOINT = '/api/v1/admin/member-portal/link';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        // BrandMiddleware (part of the admin chain) narrows a staff user to
        // their assigned brands through this pivot before falling back to
        // the org's default — same guard tests/Feature/Settings/SettingsSecretFallbackTest.php
        // adds for the same reason.
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
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('manager');
                $table->timestamps();
            });
        }
        config(['app.url' => 'https://app.example.test']);
    }

    private function staff(Organization $org): User
    {
        $user = User::create([
            'organization_id' => $org->id, 'name' => 'Desk', 'email' => 'desk_' . uniqid() . '@example.test',
            'password' => 'x', 'user_type' => 'staff',
        ]);
        DB::table('staff')->insert([
            'organization_id' => $org->id, 'user_id' => $user->id, 'role' => 'manager',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $user;
    }

    public function test_staff_get_the_join_link_the_claim_link_and_a_qr(): void
    {
        $org = Organization::create(['name' => 'Seaside', 'slug' => 'seaside-' . uniqid(), 'subscription_status' => 'ACTIVE']);
        Sanctum::actingAs($this->staff($org));

        $json = $this->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('https://app.example.test/portal/join?org=' . urlencode($org->fresh()->widget_token), $json['url']);
        $this->assertSame('https://app.example.test/portal/claim', $json['claim_url']);
        $this->assertStringStartsWith('data:image/', $json['qr']);
    }

    public function test_it_is_staff_only(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }
}
