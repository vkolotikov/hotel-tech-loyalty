<?php

namespace Tests\Feature\Integration;

use App\Services\Integrations\ContactsFeed;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContactsFeedTest extends TestCase
{
    private const TOKEN = 'test-only-contacts-feed-token-not-a-real-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        config(['contacts_feed.brand_id' => 23, 'contacts_feed.token_hash' => hash('sha256', self::TOKEN)]);
        Schema::create('brands', function ($t) {
            $t->id();
            $t->integer('organization_id');
            $t->softDeletes();
        });
        Schema::create('visitors', function ($t) {
            $t->id();
            $t->integer('organization_id');
            $t->integer('brand_id');
            $t->integer('guest_id');
        });
        foreach (ContactsFeed::COLUMNS as $resource => $columns) {
            $table = ['profiles' => 'guests', 'leads' => 'inquiries', 'conversations' => 'chat_conversations', 'messages' => 'chat_messages', 'attachments' => 'inquiry_attachments'][$resource] ?? $resource;
            Schema::create($table, function ($t) use ($columns) {
                $t->id();
                $t->integer('organization_id');
                $t->integer('brand_id')->nullable();
                foreach ($columns as $column) {
                    $t->text($column)->nullable();
                }
            });
        }
        DB::table('brands')->insert(['id' => 23, 'organization_id' => 1]);
        foreach ([1, 2, 3, 4] as $id) {
            DB::table('guests')->insert(['id' => $id, 'organization_id' => $id === 3 ? 2 : 1,
                'full_name' => 'Customer '.$id, 'email' => 'customer'.$id.'@example.test']);
            DB::table('inquiries')->insert(['id' => $id, 'organization_id' => $id === 3 ? 2 : 1,
                'brand_id' => $id === 2 ? 42 : 23, 'guest_id' => $id, 'notes' => 'Lead '.$id]);
        }
        DB::table('chat_conversations')->insert(['id' => 10, 'organization_id' => 1, 'brand_id' => 23, 'inquiry_id' => 1]);
        DB::table('chat_conversations')->insert(['id' => 11, 'organization_id' => 1, 'brand_id' => 42, 'inquiry_id' => 1]);
        DB::table('chat_conversations')->insert(['id' => 12, 'organization_id' => 1, 'brand_id' => 23]);
        foreach ([10, 11] as $id) {
            DB::table('chat_messages')->insert(['id' => $id, 'organization_id' => 1,
                'conversation_id' => $id, 'sender_type' => 'visitor', 'content' => 'Conversation '.$id]);
        }
        DB::table('chat_messages')->insert(['id' => 12, 'organization_id' => 2, 'conversation_id' => 10, 'content' => 'FOREIGN']);
        foreach ([1 => 23, 2 => 42, 3 => null] as $id => $brand) {
            DB::table('activities')->insert([
                'id' => $id, 'organization_id' => 1, 'brand_id' => $brand, 'guest_id' => 1, 'inquiry_id' => 1, 'body' => 'Activity '.$id]);
        }
    }

    public function test_single_guest_lookup_keeps_the_fixed_brand_and_tenant_and_writes_nothing(): void
    {
        $url = '/api/v1/integrations/contacts-feed?limit=1&guest_id=';
        $this->withToken(self::TOKEN)->getJson($url.'1&brand_id=42&organization_id=2')->assertOk()->assertJsonCount(1, 'contacts')->assertJsonPath('contacts.0.external_id', 'guest:1')->assertJsonPath('next_cursor', null);
        $this->getJson($url.'2')->assertOk()->assertJsonCount(0, 'contacts');
        $this->getJson($url.'3')->assertOk()->assertJsonCount(0, 'contacts');
        $this->getJson($url.'99999')->assertOk()->assertJsonCount(0, 'contacts');
        $this->getJson($url.'1&cursor=anything')->assertUnprocessable();
        $this->assertSame(4, DB::table('guests')->count());
    }

    public function test_feed_requires_its_own_token_and_has_no_write_method(): void
    {
        $this->getJson('/api/v1/integrations/contacts-feed')->assertUnauthorized();
        $this->withToken('a-different-token-that-is-long-enough')->getJson('/api/v1/integrations/contacts-feed')->assertUnauthorized();
        $this->withToken(self::TOKEN)->postJson('/api/v1/integrations/contacts-feed')->assertStatus(405);
        config(['contacts_feed.token_hash' => '']);
        $this->withToken(self::TOKEN)->getJson('/api/v1/integrations/contacts-feed')->assertUnauthorized();
    }

    public function test_every_page_enforces_brand_and_tenant_even_with_conflicting_request_context(): void
    {
        app()->instance('current_organization_id', 2);
        app()->instance('current_brand_id', 42);
        $cursor = null;
        $contacts = [];
        $history = [];
        $pages = 0;
        do {
            $url = '/api/v1/integrations/contacts-feed?'.http_build_query(['limit' => 1, 'brand_id' => 42, 'organization_id' => 2, 'cursor' => $cursor]);
            $response = $this->withToken(self::TOKEN)->getJson($url)->assertOk()->assertJsonPath('account_id', 'hexatech:brand:23');
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
            $body = $response->json();
            array_push($contacts, ...$body['contacts']);
            array_push($history, ...$body['crm_records']);
            $cursor = $body['next_cursor'];
            $this->assertLessThan(20, ++$pages);
        } while ($cursor !== null);
        $this->assertSame(['guest:1', 'guest:4'], array_column($contacts, 'external_id'));
        $this->assertSame(['1', '4'], array_column(array_values(array_filter($history, fn ($r) => $r['type'] === 'leads')), 'external_id'));
        $messages = array_values(array_filter($history, fn ($r) => $r['type'] === 'messages'));
        $this->assertCount(1, $messages);
        $this->assertSame('guest:1', $messages[0]['contact_external_id']);
        $this->assertSame('Conversation 10', $messages[0]['data']['content']);
        $this->assertSame(['10'], array_column(array_values(array_filter($history, fn ($r) => $r['type'] === 'conversations')), 'external_id'));
        $this->assertSame(['1', '3'], array_column(array_values(array_filter($history, fn ($r) => $r['type'] === 'activities')), 'external_id'));
        $this->assertSame(4, DB::table('guests')->count());
    }

    public function test_tampered_and_cross_brand_cursors_are_rejected(): void
    {
        $this->withToken(self::TOKEN)->getJson('/api/v1/integrations/contacts-feed?cursor=bad')->assertUnprocessable();
        $cursor = Crypt::encryptString(json_encode(['resource' => 'profiles', 'after' => 0, 'org' => 1, 'brand' => 42]));
        $this->withToken(self::TOKEN)->getJson('/api/v1/integrations/contacts-feed?cursor='.urlencode($cursor))->assertUnprocessable();
        DB::table('brands')->where('id', 23)->update(['deleted_at' => now()]);
        $this->withToken(self::TOKEN)->getJson('/api/v1/integrations/contacts-feed')->assertForbidden();
    }

    public function test_invalid_email_is_retained_in_source_profile_but_not_copied_as_a_contact_address(): void
    {
        DB::table('guests')->where('id', 1)->update(['email' => 'invalid address']);
        $response = $this->withToken(self::TOKEN)->getJson('/api/v1/integrations/contacts-feed')->assertOk();
        $response->assertJsonPath('contacts.0.emails', [])->assertJsonPath('crm_records.0.data.email', 'invalid address');
    }
}
