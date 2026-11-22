<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class WhatsAppCaptureTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    public function test_only_fds_cards_records_call_the_contacts_bridge_with_saved_phone_numbers(): void
    {
        $this->setUpCrmWorkspace();
        config(['crm_mail.token' => 'test-token-for-local-whatsapp-outbound-fake']);
        DB::table('brands')->insert([
            'id' => 23, 'organization_id' => $this->org->id, 'name' => 'FDS Test', 'slug' => 'fds-test',
            'is_default' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $lead = $this->lead(['brand_id' => 23]);
        $other = $this->lead();
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['phone' => '+32 470 82 60 01']);
        Http::preventStrayRequests();
        Http::fake(['contacts.hexa-tech.uk/api/integrations/crm-whatsapp/*' => Http::response(['state' => 'connected', 'messages' => [['body' => 'Private test message']]])]);

        $this->asStaffMember()->getJson($this->adminApi("inquiries/$lead/whatsapp-history?brand_id=23&phones[]=12025550132"))
            ->assertOk()->assertJsonPath('messages.0.body', 'Private test message');
        $this->getJson($this->adminApi("inquiries/$other/whatsapp-history?brand_id=23"))->assertOk()->assertJsonPath('available', false);
        $this->getJson($this->adminApi("guests/$guest/whatsapp-history?brand_id=".$this->brandId))->assertOk()->assertJsonPath('available', false);
        $this->getJson($this->crmApi('whatsapp-status?brand_id=23'))->assertForbidden();
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/'.$guest)
            && $request['phones'] === ['32470826001'] && $request['page'] === 1);
        $this->asManager()->getJson($this->crmApi('whatsapp-status?brand_id=23'))->assertOk()->assertJsonPath('state', 'connected');
    }
}
