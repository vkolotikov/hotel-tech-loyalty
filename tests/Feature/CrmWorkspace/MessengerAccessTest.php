<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * Facebook Messenger set-up from HexaTech CRM (round 5, 2026-11-12): AccessMap `admin/integrations/messenger` is product
 * `chat` (was the full admin's `admin`), still a manager's to read and change, so an organisation on CRM alone connects
 * the pages its inbox shows. The endpoints are the full admin's own (MessengerIntegrationController): the page token
 * is stored encrypted and never answered; another organisation's pages never show and cannot be touched.
 */
class MessengerAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['admin_access.mode' => 'enforce', 'services.meta.app_id' => '1234567890', 'services.meta.app_secret' => 'test-app-secret', 'services.meta.graph_url' => 'https://graph.example.test']);
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();

        if (!Schema::hasTable('chat_channel_accounts')) {
            Schema::create('chat_channel_accounts', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('channel', 32);
                $t->string('external_id')->nullable();
                $t->string('display_name')->nullable();
                $t->text('display_avatar_url')->nullable();
                $t->text('page_access_token')->nullable();
                $t->string('status', 32)->default('active');
                $t->timestamp('token_verified_at')->nullable();
                $t->timestamp('last_webhook_at')->nullable();
                $t->text('last_error')->nullable();
                $t->text('meta_config')->nullable();
                $t->unsignedBigInteger('connected_by_user_id')->nullable();
                $t->text('token_scopes')->nullable();
                $t->timestamp('token_expires_at')->nullable();
                $t->timestamp('data_access_expires_at')->nullable();
                $t->timestamps();
            });
        }
    }

    private function page(int $orgId, string $pageId, string $name): int
    {
        return DB::table('chat_channel_accounts')->insertGetId(['organization_id' => $orgId, 'channel' => 'messenger', 'external_id' => $pageId,
            'display_name' => $name, 'page_access_token' => Crypt::encryptString('EAAB-stored-page-token-' . $pageId), 'status' => 'active',
            'created_at' => now(), 'updated_at' => now()]);
    }

    private function otherOrganisation(): Organization
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);

        return $other;
    }

    public function test_a_crm_only_manager_reads_the_set_up_and_this_organisations_pages_without_a_token(): void
    {
        $mine = $this->page($this->org->id, '111', 'Harbour Clinic');
        $this->page($this->otherOrganisation()->id, '222', 'Elsewhere Page');

        $config = $this->asManager()->getJson($this->adminApi('integrations/messenger/config'))->assertOk();
        $this->assertSame([true, '1234567890'], [$config->json('configured'), $config->json('app_id')]);
        $this->assertStringNotContainsString('test-app-secret', $config->getContent());

        $list = $this->asManager()->getJson($this->adminApi('integrations/messenger'))->assertOk();
        $this->assertSame([[$mine, '111', 'Harbour Clinic']], array_map(fn ($a) => [$a['id'], $a['external_id'], $a['display_name']], $list->json('data')));
        $this->assertArrayNotHasKey('page_access_token', $list->json('data.0'));
        $this->assertStringNotContainsString('EAAB-stored-page-token', $list->getContent());
    }

    public function test_a_staff_member_and_another_module_are_refused_and_a_full_customer_keeps_it(): void
    {
        $this->asStaffMember()->getJson($this->adminApi('integrations/messenger'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->postJson($this->adminApi('integrations/messenger'), ['page_id' => '1', 'page_token' => str_repeat('x', 30)])->assertStatus(403);

        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();
        $this->asManager()->getJson($this->adminApi('integrations/messenger'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');

        $this->org->forceFill(['entitled_products' => []])->save();
        $this->asManager()->getJson($this->adminApi('integrations/messenger'))->assertOk();
    }

    public function test_connecting_stores_the_page_token_encrypted_and_answers_none_and_anothers_page_is_out_of_reach(): void
    {
        Http::fake([
            'graph.example.test/*/debug_token*' => Http::response(['data' => ['is_valid' => true, 'scopes' => ['pages_messaging'], 'expires_at' => 0]]),
            'graph.example.test/*/subscribed_apps' => Http::response(['success' => true]),
            '*' => Http::response(['data' => []]),
        ]);
        $token = 'EAAB-new-page-token-' . str_repeat('z', 20);

        $made = $this->asManager()->postJson($this->adminApi('integrations/messenger'), ['page_id' => '333', 'page_token' => $token, 'display_name' => 'Harbour Riga'])->assertCreated();
        $this->assertSame(['333', 'Harbour Riga', 'active', $this->brandId], [$made->json('external_id'), $made->json('display_name'), $made->json('status'), $made->json('brand_id')]);
        $this->assertStringNotContainsString($token, $made->getContent());
        $stored = (string) DB::table('chat_channel_accounts')->where('id', $made->json('id'))->value('page_access_token');
        $this->assertNotSame($token, $stored);
        $this->assertSame($token, Crypt::decryptString($stored));
        $this->assertStringNotContainsString($token, json_encode(DB::table('audit_logs')->get()));

        $theirs = $this->page($this->otherOrganisation()->id, '444', 'Theirs');
        $this->asManager()->postJson($this->adminApi("integrations/messenger/{$theirs}/verify"))->assertNotFound();
        $this->asManager()->postJson($this->adminApi("integrations/messenger/{$theirs}/reconnect"), ['page_token' => $token])->assertNotFound();
        $this->asManager()->deleteJson($this->adminApi("integrations/messenger/{$theirs}"))->assertNotFound();
        $this->assertSame(1, DB::table('chat_channel_accounts')->where('id', $theirs)->count());

        $this->asManager()->deleteJson($this->adminApi('integrations/messenger/' . $made->json('id')))->assertOk();
        $this->assertSame(0, DB::table('chat_channel_accounts')->where('id', $made->json('id'))->count());
    }
}
