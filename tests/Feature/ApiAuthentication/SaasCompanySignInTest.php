<?php

namespace Tests\Feature\ApiAuthentication;

use App\Models\Organization;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\MakesAdminCaller;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class SaasCompanySignInTest extends TestCase
{
    use DatabaseTransactions, MakesAdminCaller, SetsUpMinimalSchema;

    public function test_saas_sign_in_opens_the_selected_company_for_the_same_email(): void
    {
        $this->setUpServiceCatalogSchema();
        $this->setUpLoyaltySchema();
        if (!Schema::hasTable('personal_access_tokens')) {
            (require database_path('migrations/2019_12_14_000001_create_personal_access_tokens_table.php'))->up();
        }
        if (Schema::hasIndex('users', 'users_email_unique', 'unique')) {
            Schema::table('users', fn ($table) => $table->dropUnique(['email']));
        }

        $home = Organization::create([
            'name' => 'Home Company',
            'slug' => 'home-company',
            'saas_org_id' => 'saas-home-company',
            'industry' => 'hotel',
        ]);
        $selected = Organization::create([
            'name' => 'Selected Company',
            'slug' => 'selected-company',
            'saas_org_id' => 'saas-selected-company',
            'industry' => 'fitness',
        ]);
        $homeStaff = $this->staffUser($home);
        $selectedStaff = $this->staffUser($selected);
        $selectedStaff->update(['email' => $homeStaff->email]);

        $signingKey = str_repeat('x', 32);
        config([
            'services.saas.jwt_secret' => $signingKey,
            'services.saas.api_url' => null,
        ]);

        $handoff = JWT::encode([
            'userId' => 'saas-staff-user',
            'email' => $homeStaff->email,
            'currentOrgId' => $selected->saas_org_id,
            'currentOrgName' => $selected->name,
            'role' => 'ADMIN',
            'exp' => time() + 300,
        ], $signingKey, 'HS256');

        $this->getJson('/api/v1/auth/me', ['Authorization' => 'Bearer '.$handoff])
            ->assertOk()
            ->assertJsonPath('id', $selectedStaff->id)
            ->assertJsonPath('email', $selectedStaff->email)
            ->assertJsonPath('industry', 'fitness')
            ->assertJsonPath('staff.user_id', $selectedStaff->id)
            ->assertJsonPath('staff.role', 'manager');
    }
}
