<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** The redesigned lists use server filtering without widening the original tenant or channel boundaries. */
class CampaignListsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, PushSchema, SmsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        $this->buildSmsSchema();
        DB::table('organizations')->where('id', $this->org->id)->update(['plan_features' => json_encode(['campaigns' => true, 'push_notifications' => true])]);
        Http::preventStrayRequests();
        Queue::fake();
        Mail::fake();
    }

    private function row(string $channel, string $name, string $status = 'draft', ?int $org = null, string $message = ''): int
    {
        $table = ['campaigns' => 'email_campaigns', 'push' => 'notification_campaigns', 'sms' => 'sms_campaigns'][$channel];
        $attributes = ['organization_id' => $org ?? $this->org->id, 'name' => $name, 'status' => $status, 'created_at' => now(), 'updated_at' => now()];
        $attributes += match ($channel) {
            'campaigns' => ['subject' => $message, 'body_html' => '', 'body_blocks' => '[]'],
            'push' => ['title' => $message, 'body' => '', 'channel' => 'push', 'source' => 'loyalty'],
            'sms' => ['body' => $message],
        };
        return DB::table($table)->insertGetId($attributes);
    }

    public function test_filters_search_both_fields_before_pagination_and_preserve_tenant_totals(): void
    {
        $other = $this->otherOrganization()['org'];
        foreach (['campaigns', 'push', 'sms'] as $channel) {
            for ($i = 0; $i < 27; $i++) $this->row($channel, 'Autumn '.$i);
            $id = $this->row($channel, 'Internal title', 'sent', message: 'Autumn 50%_! Offer');
            $this->row($channel, 'Autumn hidden', org: $other->id);
            $field = $channel === 'campaigns' ? 'campaigns' : 'messages';
            $this->asManager()->getJson($this->api($channel.'?q=AuTuMn&page=2'))->assertOk()
                ->assertJsonPath('all_total', 28)->assertJsonPath('total', 28)->assertJsonPath('pages', 2)->assertJsonCount(3, $field);
            $this->getJson($this->api($channel.'?q=autumn&status=sent'))->assertOk()
                ->assertJsonPath('total', 1)->assertJsonPath('all_total', 28)->assertJsonPath($field.'.0.id', $id);
            $this->getJson($this->api($channel.'?'.http_build_query(['q' => '50%_!'])))->assertOk()->assertJsonPath('total', 1);
            $this->getJson($this->api($channel.'?q=hidden'))->assertOk()->assertJsonPath('total', 0);
            $this->getJson($this->api($channel.'?q=missing&page=99'))->assertOk()->assertJsonPath('page', 1)->assertJsonCount(0, $field);
        }
        Queue::assertNothingPushed();
        Mail::assertNothingSent();
    }

    public function test_filters_cannot_bypass_manager_or_plan_checks_and_validate_input(): void
    {
        foreach (['campaigns', 'push', 'sms'] as $channel) {
            $this->asStaffMember()->getJson($this->api($channel.'?q=secret'))->assertForbidden();
            $this->asManager()->getJson($this->api($channel.'?status=anything'))->assertUnprocessable();
            $this->getJson($this->api($channel.'?q[]=invalid'))->assertUnprocessable();
            $this->getJson($this->api($channel.'?q='.str_repeat('x', 201)))->assertUnprocessable();
        }
        DB::table('organizations')->where('id', $this->org->id)->update(['plan_features' => json_encode(['campaigns' => false, 'push_notifications' => false])]);
        $this->manager->setRelations([]);
        foreach (['campaigns', 'push', 'sms'] as $channel) $this->getJson($this->api($channel.'?q=secret'))->assertStatus(402);
    }

    public function test_push_lists_exclude_other_sources(): void
    {
        $id = $this->row('push', 'Shared word');
        $other = $this->row('push', 'Shared full admin');
        DB::table('notification_campaigns')->where('id', $other)->update(['source' => null]);
        $this->asManager()->getJson($this->api('push?q=shared'))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('all_total', 1)->assertJsonPath('messages.0.id', $id);
    }

    public function test_email_sender_and_test_recipient_are_the_existing_server_identities(): void
    {
        $setting = new HotelSetting();
        $setting->forceFill(['organization_id' => $this->org->id, 'key' => 'mail_from_name', 'value' => 'Our rewards team', 'type' => 'string', 'group' => 'integrations', 'label' => 'Sender', 'scope' => 'company'])->save();
        $id = $this->row('campaigns', 'Read only');
        $this->asManager()->getJson($this->api('campaigns'))->assertOk()->assertJsonPath('sender_name', 'Our rewards team');
        $this->getJson($this->api('campaigns/'.$id))->assertOk()->assertJsonPath('options.sender_name', 'Our rewards team')->assertJsonPath('options.test_recipient', $this->manager->email);
        Queue::assertNothingPushed();
        Mail::assertNothingSent();
    }
}
