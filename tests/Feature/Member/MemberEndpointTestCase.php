<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Shared fixture for the member-facing (mobile app) endpoints.
 *
 * A member is created the way the app creates one — through the public
 * POST /v1/auth/register with the org's own token — so every test below
 * holds a REAL Sanctum token minted by the real code path, not
 * Sanctum::actingAs(). That matters here: the password change revokes
 * other tokens by id, and the wallet link is the answer to the question
 * "what can a member do WITHOUT putting that token in a URL" — neither can
 * be asserted against a transient fake.
 *
 * The schema is PublicRegisterTenantIsolationTest's, verbatim: the loyalty
 * award schema plus the columns register() writes that the minimal tables
 * do not carry, plus personal_access_tokens for the real token mint.
 */
abstract class MemberEndpointTestCase extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected const REGISTER = '/api/v1/auth/register';

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpLoyaltyAwardSchema();

        if (!Schema::hasColumn('brands', 'logo_url')) {
            Schema::table('brands', fn ($table) => $table->string('logo_url')->nullable());
        }
        if (!Schema::hasColumn('brands', 'sort_order')) {
            Schema::table('brands', fn ($table) => $table->integer('sort_order')->default(0));
        }
        if (!Schema::hasColumn('users', 'date_of_birth')) {
            Schema::table('users', fn ($table) => $table->date('date_of_birth')->nullable());
        }
        if (!Schema::hasColumn('users', 'nationality')) {
            Schema::table('users', fn ($table) => $table->string('nationality', 100)->nullable());
        }
        if (!Schema::hasColumn('loyalty_members', 'qr_code_token')) {
            Schema::table('loyalty_members', fn ($table) => $table->string('qr_code_token', 191)->nullable());
        }
        if (!Schema::hasColumn('loyalty_members', 'referral_code')) {
            Schema::table('loyalty_members', fn ($table) => $table->string('referral_code', 20)->nullable());
        }
        if (!Schema::hasColumn('loyalty_members', 'referred_by')) {
            Schema::table('loyalty_members', fn ($table) => $table->unsignedBigInteger('referred_by')->nullable());
        }

        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($table) {
                $table->bigIncrements('id');
                $table->string('tokenable_type');
                $table->unsignedBigInteger('tokenable_id');
                $table->text('name');
                $table->string('token', 64)->unique();
                $table->text('abilities')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
                $table->index(['tokenable_type', 'tokenable_id']);
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /** A tenant with a live default-tier loyalty programme, so register() enrols rather than 422s. */
    protected function tenant(string $name = 'Seaside Hotel'): Organization
    {
        $org = Organization::create([
            'name'                => $name,
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        LoyaltyTier::create([
            'organization_id' => $org->id,
            'name'            => 'Bronze',
            'min_points'      => 0,
            'is_active'       => true,
        ]);

        return $org;
    }

    /**
     * Register a member into the org through the real public endpoint and
     * return the user, their member row and the plain-text token the app
     * would hold.
     *
     * @return array{user: User, member: LoyaltyMember, token: string}
     */
    protected function member(Organization $org, string $password = 'Sup3rSecret!1'): array
    {
        $email = 'member_' . uniqid('', true) . '@example.test';

        $response = $this->postJson(self::REGISTER, [
            'name'                  => 'App Member',
            'email'                 => $email,
            'password'              => $password,
            'password_confirmation' => $password,
            'org_token'             => $org->fresh()->widget_token,
        ]);

        $response->assertStatus(201);

        $token = (string) $response->json('token');
        $this->assertNotSame('', $token, 'register() minted no token; the fixture cannot drive the member endpoints.');

        $user = User::withoutGlobalScopes()->where('email', $email)->firstOrFail();
        $member = LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->firstOrFail();

        // The middleware binds the tenant per request, and the auth guards
        // memoise the user they resolved for the whole process; the fixture
        // must not leave the registration's state behind for the next request.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        $this->app['auth']->forgetGuards();

        return ['user' => $user, 'member' => $member, 'token' => $token];
    }
}
