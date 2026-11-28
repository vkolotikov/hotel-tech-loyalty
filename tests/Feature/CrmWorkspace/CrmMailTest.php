<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Guest;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class CrmMailTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        if (! Schema::hasTable('activities')) {
            Schema::create('activities', function ($t) {
                $t->id();
                $t->integer('organization_id');
                $t->integer('brand_id');
                $t->integer('guest_id');
            });
        }
        Http::preventStrayRequests();
        config(['crm_mail.token' => 'testing-private-crm-mail-bridge-token']);
        DB::table('brands')->insert(['id' => 23, 'organization_id' => $this->org->id, 'name' => 'FDS Cards', 'slug' => 'fds-cards', 'widget_token' => 'test-widget-fds-cards']);
    }

    public function test_fds_lead_reads_the_server_owned_email_and_has_no_sending_action(): void
    {
        $lead = $this->lead(['brand_id' => 23]);
        $guest = Guest::findOrFail(DB::table('inquiries')->where('id', $lead)->value('guest_id'));
        Http::fake(['contacts.hexa-tech.uk/*' => Http::response(['messages' => [], 'total' => 0])]);
        $url = $this->adminApi('inquiries/'.$lead.'/email-history?brand_id=23&email=attacker@example.test');
        $response = $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('available', true);
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        Http::assertSent(fn ($r) => $r['email'] === strtolower($guest->email) && $r['action'] === 'list' && $r->hasHeader('Authorization', 'Bearer testing-private-crm-mail-bridge-token'));
        $this->asStaffMember()->postJson($url, ['action' => 'send'])->assertOk();
        Http::assertSent(fn ($r) => $r['action'] === 'refresh');
        Http::assertNotSent(fn ($r) => $r['action'] === 'send');
    }

    public function test_other_brands_cannot_read_mail_or_trigger_provider_calls(): void
    {
        $otherLead = $this->lead();
        $guest = DB::table('inquiries')->where('id', $otherLead)->value('guest_id');
        $this->asStaffMember()->getJson($this->adminApi('inquiries/'.$otherLead.'/email-history?brand_id=all'))->assertOk()->assertJsonPath('available', false);
        $this->asStaffMember()->getJson($this->adminApi('guests/'.$guest.'/email-history?brand_id=23'))->assertNotFound();
        $fdsLead = $this->lead(['brand_id' => 23]);
        $this->asStaffMember()->getJson($this->adminApi('inquiries/'.$fdsLead.'/email-history?brand_id='.$this->brandId))->assertOk()->assertJsonPath('available', false);
        Http::assertNothingSent();
    }

    public function test_foreign_records_and_brand_restricted_staff_cannot_access_fds_mail(): void
    {
        $lead = $this->lead(['brand_id' => 23]);
        DB::table('brand_user')->insert(['brand_id' => $this->brandId, 'user_id' => $this->staffMember->id]);
        $this->asStaffMember()->getJson($this->adminApi('inquiries/'.$lead.'/email-history?brand_id=all'))->assertOk()->assertJsonPath('available', false);
        $foreign = Organization::create(['name' => 'Other', 'slug' => 'other-mail-test']);
        DB::table('guests')->where('id', DB::table('inquiries')->where('id', $lead)->value('guest_id'))->update(['organization_id' => $foreign->id]);
        $this->asManager()->getJson($this->adminApi('inquiries/'.$lead.'/email-history?brand_id=23'))->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_missing_setup_and_review_conflicts_have_clear_states_and_provider_errors_are_sanitized(): void
    {
        $lead = $this->lead(['brand_id' => 23]);
        $url = $this->adminApi('inquiries/'.$lead.'/email-history?brand_id=23');
        config(['crm_mail.token' => '']);
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('code', 'mail_setup_required');
        config(['crm_mail.token' => 'testing-private-crm-mail-bridge-token']);
        Http::fake(['contacts.hexa-tech.uk/*' => Http::sequence()->push(['message' => 'private provider detail'], 409)->push('secret provider error', 500)]);
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('code', 'crm_contact_review_required');
        $this->asStaffMember()->getJson($url)->assertStatus(502)->assertDontSee('secret provider error');
    }

    public function test_reading_history_does_not_consume_the_zoho_refresh_allowance(): void
    {
        $lead = $this->lead(['brand_id' => 23]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $leadUrl = $this->adminApi('inquiries/'.$lead.'/email-history?brand_id=23');
        $guestUrl = $this->adminApi('guests/'.$guest.'/email-history?brand_id=23');
        Http::fake(['contacts.hexa-tech.uk/*' => Http::response(['messages' => [], 'total' => 0])]);
        $this->asStaffMember();
        for ($i = 0; $i < 12; $i++) {
            $this->getJson($i % 2 ? $leadUrl : $guestUrl)->assertOk();
        }
        for ($i = 0; $i < 10; $i++) {
            $this->postJson($i % 2 ? $leadUrl : $guestUrl)->assertOk();
        }
        $this->postJson($leadUrl)->assertStatus(429)->assertHeader('Retry-After');
        $this->getJson($guestUrl)->assertOk();
        $this->asManager()->postJson($leadUrl)->assertOk();
        $this->travel(61)->seconds();
        $this->asStaffMember()->postJson($guestUrl)->assertOk();
        Http::assertSentCount(25);
    }

    public function test_history_reads_keep_their_own_limit_across_contact_and_lead_routes(): void
    {
        $lead = $this->lead(['brand_id' => 23]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $leadUrl = $this->adminApi('inquiries/'.$lead.'/email-history?brand_id=23');
        $guestUrl = $this->adminApi('guests/'.$guest.'/email-history?brand_id=23');
        Http::fake(['contacts.hexa-tech.uk/*' => Http::response(['messages' => [], 'total' => 0])]);
        $this->asStaffMember();
        for ($i = 0; $i < 60; $i++) {
            $this->getJson($i % 2 ? $leadUrl : $guestUrl)->assertOk();
        }
        $this->getJson($leadUrl)->assertStatus(429)->assertHeader('Retry-After');
        $this->postJson($guestUrl)->assertOk();
        Http::assertSentCount(61);
    }
}
