<?php

namespace Tests\Feature;

use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Staff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Covers the six scenarios spec'd for POST /v1/integrations/leads:
 *
 *   1. POST without token → 401
 *   2. POST with invalid token → 401
 *   3. POST with valid token + valid payload → 201, Lead scoped to org
 *   4. POST same payload twice → second call 200 with same id (idempotent)
 *   5. POST with missing required field → 422, no Lead created
 *   6. Two different users' tokens with same external_id → no cross-account
 *      collision (each user's org gets its own Lead)
 */
class LeadIntakeApiTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = '/api/v1/integrations/leads';

    /** RefreshDatabase rebuilds every table: only this dedicated PostgreSQL database may be used. */
    protected function beforeRefreshingDatabase(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Lead intake migration coverage requires PostgreSQL (production migrations use pg_indexes).');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('hexa_leadintake_test', DB::connection()->getDatabaseName(), 'Run this destructive migration suite only on its dedicated hexa_leadintake_test database.');
    }

    private function makeOrgWithStaff(string $orgName = 'Acme Hotels'): array
    {
        $org = Organization::create([
            'name' => $orgName,
            'slug' => str()->slug($orgName . '-' . uniqid()),
        ]);

        // Bind tenant scope so any creates below land in this org.
        app()->instance('current_organization_id', $org->id);

        // Default pipeline + open stage so the controller's lookup succeeds.
        $pipeline = Pipeline::create([
            'organization_id' => $org->id,
            'name'            => 'Sales',
            'slug'            => 'sales',
            'is_default'      => true,
        ]);
        PipelineStage::create([
            'organization_id' => $org->id,
            'pipeline_id'     => $pipeline->id,
            'name'            => 'New',
            'slug'            => 'new',
            'kind'            => 'open',
            'sort_order'      => 1,
        ]);

        $user = User::create([
            'name'            => 'Test Staff',
            'email'           => 'staff_' . uniqid() . '@example.com',
            'password'        => bcrypt('secret-secret'),
            'user_type'       => 'staff',
            'organization_id' => $org->id,
        ]);
        Staff::create([
            'organization_id' => $org->id, 'user_id' => $user->id,
            'role' => 'staff', 'is_active' => true,
        ]);

        return [$org, $user];
    }

    /** Use real personal tokens and make middleware prove the organization, independently of fixture bindings. */
    private function authenticate(User $user): void
    {
        $this->app['auth']->forgetGuards();
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        $this->withToken($user->createToken('lead-intake-test')->plainTextToken);
    }

    private function validPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'external_source' => 'fds_card_builder',
            'external_id'     => 'e3bb7fba-d240-46ac-adfd-392b90bd167f',
            'external_url'    => 'https://builder.fds-cards.co.uk/admin/inquiries/5556',
            'submitted_at'    => '2026-05-17T12:34:56Z',
            'contact'         => [
                'name'     => 'John Smith',
                'email'    => 'john@acme.com',
                'phone'    => '+44 7123 456789',
                'company'  => 'Acme Ltd',
                'position' => 'Director',
            ],
            'amount'      => 1584.00,
            'currency'    => 'GBP',
            'description' => "Card type: Metal NFC\nQuantity: 100",
        ], $overrides);
    }

    /** Scenario 1 — POST without token → 401 */
    public function test_unauthenticated_request_is_rejected(): void
    {
        $resp = $this->postJson(self::ENDPOINT, $this->validPayload());
        $resp->assertStatus(401);
        $this->assertDatabaseCount('inquiries', 0);
    }

    /** Scenario 2 — POST with invalid token → 401 */
    public function test_invalid_token_is_rejected(): void
    {
        $resp = $this->withHeader('Authorization', 'Bearer notarealtoken123')
            ->postJson(self::ENDPOINT, $this->validPayload());
        $resp->assertStatus(401);
        $this->assertDatabaseCount('inquiries', 0);
    }

    /** Scenario 3 — POST with valid token + valid payload → 201 */
    public function test_valid_payload_creates_lead_scoped_to_token_user(): void
    {
        [$org, $user] = $this->makeOrgWithStaff();
        $this->authenticate($user);

        $resp = $this->postJson(self::ENDPOINT, $this->validPayload());

        $resp->assertStatus(201)
            ->assertJsonStructure(['id', 'url']);

        $this->assertDatabaseHas('inquiries', [
            'organization_id' => $org->id,
            'external_source' => 'fds_card_builder',
            'external_id'     => 'e3bb7fba-d240-46ac-adfd-392b90bd167f',
            'total_value'     => 1584.00,
            'currency'        => 'GBP',
        ]);

        // Guest created and linked.
        $inquiry = Inquiry::withoutGlobalScopes()->where('organization_id', $org->id)->findOrFail($resp->json('id'));
        $this->assertNotNull($inquiry->guest_id);
        $this->assertDatabaseHas('guests', [
            'id'              => $inquiry->guest_id,
            'organization_id' => $org->id,
            'email'           => 'john@acme.com',
        ]);
        $this->assertDatabaseHas('pipelines', ['id' => $inquiry->pipeline_id, 'organization_id' => $org->id, 'is_default' => true]);
        $this->assertDatabaseHas('pipeline_stages', ['id' => $inquiry->pipeline_stage_id, 'pipeline_id' => $inquiry->pipeline_id, 'kind' => 'open']);

        // URL is shape we promised.
        $this->assertStringContainsString('/inquiries/' . $inquiry->id, $resp->json('url'));
    }

    /** Scenario 4 — Same payload twice → second call 200 with same id (idempotent) */
    public function test_replay_returns_existing_lead_without_duplicating(): void
    {
        [, $user] = $this->makeOrgWithStaff();
        $this->authenticate($user);

        $first = $this->postJson(self::ENDPOINT, $this->validPayload());
        $first->assertStatus(201);
        $firstId = $first->json('id');

        $second = $this->postJson(self::ENDPOINT, $this->validPayload());
        $second->assertStatus(200);
        $this->assertSame($firstId, $second->json('id'));
        $this->assertDatabaseCount('guests', 1);

        // No duplicate created.
        $this->assertSame(
            1,
            Inquiry::withoutGlobalScopes()
                ->where('external_source', 'fds_card_builder')
                ->where('external_id', 'e3bb7fba-d240-46ac-adfd-392b90bd167f')
                ->count()
        );
    }

    /** Scenario 5 — Missing required field → 422 */
    public function test_missing_required_field_returns_422(): void
    {
        [, $user] = $this->makeOrgWithStaff();
        $this->authenticate($user);

        $payload = $this->validPayload();
        unset($payload['contact']['email']);

        $resp = $this->postJson(self::ENDPOINT, $payload);
        $resp->assertStatus(422)
            ->assertJsonValidationErrors(['contact.email']);

        $this->assertDatabaseCount('inquiries', 0);
        $this->assertDatabaseCount('guests', 0);
    }

    /** Scenario 6 — Two users' tokens, same external_id → no cross-account collision */
    public function test_different_orgs_can_share_external_id(): void
    {
        [$orgA, $userA] = $this->makeOrgWithStaff('Org A');
        $this->authenticate($userA);
        $respA = $this->postJson(self::ENDPOINT, $this->validPayload());
        $respA->assertStatus(201);
        $idA = $respA->json('id');

        [$orgB, $userB] = $this->makeOrgWithStaff('Org B');
        $this->authenticate($userB);
        $respB = $this->postJson(self::ENDPOINT, $this->validPayload());
        $respB->assertStatus(201);
        $idB = $respB->json('id');

        $this->assertNotSame($idA, $idB);
        $this->assertDatabaseHas('inquiries', ['id' => $idA, 'organization_id' => $orgA->id]);
        $this->assertDatabaseHas('inquiries', ['id' => $idB, 'organization_id' => $orgB->id]);
        $leadA = Inquiry::withoutGlobalScopes()->findOrFail($idA);
        $leadB = Inquiry::withoutGlobalScopes()->findOrFail($idB);
        $this->assertNotSame($leadA->guest_id, $leadB->guest_id, 'The same contact email must not link guests across organizations.');
        $this->assertDatabaseHas('guests', ['id' => $leadA->guest_id, 'organization_id' => $orgA->id]);
        $this->assertDatabaseHas('guests', ['id' => $leadB->guest_id, 'organization_id' => $orgB->id]);
        $this->assertDatabaseHas('pipelines', ['id' => $leadA->pipeline_id, 'organization_id' => $orgA->id]);
        $this->assertDatabaseHas('pipelines', ['id' => $leadB->pipeline_id, 'organization_id' => $orgB->id]);

        // Two distinct inquiries with the same external_id but different orgs.
        $this->assertSame(
            2,
            Inquiry::withoutGlobalScopes()
                ->where('external_id', 'e3bb7fba-d240-46ac-adfd-392b90bd167f')
                ->count()
        );
    }
}
