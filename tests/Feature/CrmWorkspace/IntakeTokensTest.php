<?php

namespace Tests\Feature\CrmWorkspace;

use App\Http\Controllers\Api\V1\Integrations\LeadIntakeController;
use App\Models\Organization;
use App\Services\Crm\IntakeTokens;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * HexaTech CRM's lead-intake API tokens (round 5, 2026-11-12): a CRM-only organisation's manager makes, lists and
 * revokes them (`admin/crm/intake-tokens`, AccessMap manager / crm); each sends leads into its own organisation through
 * `POST /v1/integrations/leads` and is no token at all anywhere else (IntakeTokens::admits, Sanctum's token check).
 */
class IntakeTokensTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private const INTAKE = '/api/v1/integrations/leads';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['admin_access.mode' => 'enforce']);
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();

        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function (Blueprint $t) {
                $t->id();
                $t->morphs('tokenable');
                $t->text('name');
                $t->string('token', 64)->unique();
                $t->text('abilities')->nullable();
                $t->timestamp('last_used_at')->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->timestamps();
            });
        }
        // What the intake writes beyond the workspace's own columns (production has them all).
        foreach (['external_source' => 'string', 'external_id' => 'string', 'external_url' => 'text', 'external_submitted_at' => 'timestamp',
            'priority' => 'string', 'inquiry_type' => 'string', 'currency' => 'string', 'notes' => 'text'] as $column => $type) {
            if (!Schema::hasColumn('inquiries', $column)) {
                Schema::table('inquiries', fn (Blueprint $t) => $t->{$type}($column)->nullable());
            }
        }
        foreach (['position_title', 'lead_source', 'first_name', 'last_name', 'company'] as $column) {
            if (!Schema::hasColumn('guests', $column)) {
                Schema::table('guests', fn (Blueprint $t) => $t->string($column)->nullable());
            }
        }
        $pipeline = DB::table('pipelines')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Sales', 'slug' => 'sales', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pipeline_stages')->insert(['organization_id' => $this->org->id, 'pipeline_id' => $pipeline, 'name' => 'New', 'slug' => 'new', 'kind' => 'open', 'sort_order' => 1, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** A new token from the CRM, as its manager: the plain token the answer carries once. */
    private function makeToken(string $label = 'Website form'): string
    {
        return (string) $this->asManager()->postJson($this->crmApi('intake-tokens'), ['label' => $label])->assertCreated()->json('token');
    }

    /** The next request carries only this bearer token: no signed-in user, no organisation bound by the test. */
    private function bearer(string $token): static
    {
        $this->app['auth']->forgetGuards();
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');

        return $this->withToken($token);
    }

    private function lead(array $overrides = []): array
    {
        return array_replace_recursive([
            'external_source' => 'website_form',
            'external_id'     => 'form-' . uniqid(),
            'contact'         => ['name' => 'Jane Doe', 'email' => 'jane.' . uniqid() . '@example.test'],
        ], $overrides);
    }

    public function test_a_crm_only_manager_makes_lists_and_revokes_a_token_the_plain_token_answered_once(): void
    {
        $made = $this->asManager()->postJson($this->crmApi('intake-tokens'), ['label' => 'Website form'])->assertCreated();
        $plain = (string) $made->json('token');
        $this->assertMatchesRegularExpression('/^\d+\|\S{20,}$/', $plain);
        $this->assertSame('website_form', $made->json('label'));
        $this->assertStringContainsString('no-store', (string) $made->headers->get('Cache-Control'));

        $row = PersonalAccessToken::query()->findOrFail((int) $made->json('id'));
        $this->assertSame(['integration:website_form', [IntakeTokens::ABILITY], $this->manager->id], [$row->name, $row->abilities, (int) $row->tokenable_id]);

        $list = $this->asManager()->getJson($this->crmApi('intake-tokens'))->assertOk();
        $this->assertSame([[(int) $made->json('id'), 'website_form']], array_map(fn ($t) => [$t['id'], $t['label']], $list->json('data')));
        $this->assertArrayNotHasKey('token', $list->json('data.0'));
        $this->assertStringNotContainsString(explode('|', $plain)[1], $list->getContent());

        // The audit names the token, never the token itself.
        $audit = DB::table('audit_logs')->where('action', 'api_token.created')->get();
        $this->assertCount(1, $audit);
        $this->assertStringNotContainsString(explode('|', $plain)[1], json_encode($audit));

        $this->asManager()->postJson($this->crmApi('intake-tokens'), ['label' => 'website form'])->assertStatus(422)->assertJsonPath('error', 'label_taken');
        $this->asManager()->postJson($this->crmApi('intake-tokens'), ['label' => '<script>'])->assertStatus(422);

        $this->asManager()->deleteJson($this->crmApi('intake-tokens/' . $made->json('id')))->assertOk();
        $this->assertSame([], $this->asManager()->getJson($this->crmApi('intake-tokens'))->json('data'));
        $this->assertNull(PersonalAccessToken::query()->find((int) $made->json('id')));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'api_token.revoked')->count());

        $this->bearer($plain)->postJson(self::INTAKE, $this->lead())->assertStatus(401);
    }

    public function test_a_staff_member_and_another_module_are_refused_and_nobody_sees_or_revokes_anothers_token(): void
    {
        $this->asStaffMember()->getJson($this->crmApi('intake-tokens'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->postJson($this->crmApi('intake-tokens'), ['label' => 'Mine'])->assertStatus(403);

        $colleague = $this->staffUser($this->org);
        $theirs = $colleague->createToken('integration:their_form', [IntakeTokens::ABILITY])->accessToken;
        $full = $this->manager->createToken('integration:full_admin')->accessToken; // a full admin token: not the CRM's to list
        $this->assertSame([], $this->asManager()->getJson($this->crmApi('intake-tokens'))->json('data'));
        $this->asManager()->deleteJson($this->crmApi('intake-tokens/' . $theirs->id))->assertNotFound();
        $this->asManager()->deleteJson($this->crmApi('intake-tokens/' . $full->id))->assertNotFound();
        $this->assertNotNull(PersonalAccessToken::query()->find($theirs->id));

        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();
        $this->asManager()->getJson($this->crmApi('intake-tokens'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
        $this->asManager()->postJson($this->crmApi('intake-tokens'), ['label' => 'Other'])->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_the_token_sends_leads_into_its_own_organisation_and_never_another_brand(): void
    {
        $plain = $this->makeToken();
        $other = $this->otherOrganisation();
        $theirBrand = (int) DB::table('brands')->where('organization_id', $other->id)->value('id');

        $id = (int) $this->bearer($plain)->postJson(self::INTAKE, $this->lead(['contact' => ['name' => 'Jane Doe']]))->assertCreated()->json('id');
        $this->assertSame((int) $this->org->id, (int) DB::table('inquiries')->where('id', $id)->value('organization_id'));
        $this->assertSame((int) $this->org->id, (int) DB::table('guests')->where('id', DB::table('inquiries')->where('id', $id)->value('guest_id'))->value('organization_id'));
        $this->assertNotNull(PersonalAccessToken::findToken($plain)?->last_used_at, 'the list shows when it was last used');

        $this->bearer($plain)->postJson(self::INTAKE, $this->lead(['brand_id' => $theirBrand]))->assertStatus(422);
        $this->assertSame(0, DB::table('inquiries')->where('organization_id', $other->id)->count());

        // Its owner's access switched off stops it (AccessMap asks for an active staff member).
        DB::table('staff')->where('user_id', $this->manager->id)->update(['is_active' => false]);
        $this->bearer($plain)->postJson(self::INTAKE, $this->lead())->assertStatus(403)->assertJsonPath('error', 'staff_inactive');
    }

    public function test_the_token_is_no_token_on_any_other_api(): void
    {
        $plain = $this->makeToken();
        foreach ([
            ['GET', $this->crmApi('bootstrap')],
            ['GET', $this->crmApi('intake-tokens')],
            ['POST', $this->crmApi('intake-tokens')],
            ['GET', $this->adminApi('inquiries')],
            ['GET', $this->adminApi('guests')],
            ['GET', $this->adminApi('chat-inbox')],
            ['GET', $this->adminApi('api-tokens')],
            ['POST', $this->adminApi('api-tokens')],
            ['GET', $this->adminApi('settings')],
            ['GET', '/api/v1/auth/me'],
            ['GET', self::INTAKE],
        ] as [$method, $uri]) {
            $this->bearer($plain)->json($method, $uri, ['label' => 'More'])->assertStatus($method === 'GET' && $uri === self::INTAKE ? 405 : 401);
        }

        // Every route Sanctum guards, the lead intake's POST alone excepted: the token's check says no on each.
        $token = PersonalAccessToken::findToken($plain);
        $this->assertInstanceOf(PersonalAccessToken::class, $token);
        $checked = 0;
        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (!in_array('auth:sanctum', $route->gatherMiddleware(), true)) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $request = Request::create('/' . $route->uri(), $method);
                $request->setRouteResolver(fn () => $route);
                $this->app->instance('request', $request);
                $intake = $method === 'POST' && $route->getActionName() === LeadIntakeController::class . '@store';
                $this->assertSame($intake, IntakeTokens::admits($token), "{$method} {$route->uri()}");
                $checked++;
            }
        }
        $this->assertGreaterThan(300, $checked, 'the sweep reached the admin API');
    }

    public function test_another_tokens_rules_are_unchanged_and_another_organisations_intake_is_out_of_reach(): void
    {
        // A full admin token (every ability) still reaches what its owner may.
        $full = $this->manager->createToken('integration:full_admin')->plainTextToken;
        $this->bearer($full)->getJson($this->crmApi('bootstrap'))->assertOk();

        // A token made by another organisation's manager sends leads only into that organisation.
        $other = $this->otherOrganisation();
        $theirManager = $this->staffUser($other);
        app()->instance('current_organization_id', $this->org->id);
        $theirs = $theirManager->createToken('integration:their_form', [IntakeTokens::ABILITY])->plainTextToken;
        $id = (int) $this->bearer($theirs)->postJson(self::INTAKE, $this->lead(['brand_id' => $this->brandId]))->assertStatus(422)->json('id');
        $this->assertSame(0, $id);
        $this->assertSame(0, DB::table('inquiries')->where('organization_id', $this->org->id)->count());
        $this->bearer($theirs)->getJson($this->crmApi('bootstrap'))->assertStatus(401);
    }

    private function otherOrganisation(): Organization
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        $other->forceFill(['entitled_products' => ['crm_chat']])->save();
        app()->instance('current_organization_id', $prior);

        return $other;
    }
}
