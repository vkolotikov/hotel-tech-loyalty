<?php

namespace Tests\Feature\LeadForm;

use App\Models\EmailSuppression;
use App\Models\EmailTemplate;
use App\Models\LeadForm;
use App\Models\LeadFormSubmission;
use App\Services\LeadForms\AutoReply;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class AutoReplyTest extends TestCase
{
    use \Illuminate\Foundation\Testing\DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LeadForm $form;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        if (!Schema::hasColumn('organizations', 'email')) Schema::table('organizations', fn ($t) => $t->string('email')->nullable());
        DB::table('organizations')->updateOrInsert(['id' => 1], ['name' => 'Forest venue', 'slug' => 'auto-reply-test', 'email' => 'reply@example.test']);
        DB::table('organizations')->updateOrInsert(['id' => 2], ['name' => 'Other venue', 'slug' => 'other-auto-reply-test']);
        app()->instance('current_organization_id', 1);
        if (!Schema::hasTable('brands')) Schema::create('brands', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('name');
            $t->boolean('is_default')->default(false); $t->softDeletes(); $t->timestamps();
        });
        foreach (['lead_forms' => '2026_05_10_140000_create_lead_forms.php', 'email_templates' => '2026_03_28_100004_create_email_templates_table.php', 'email_suppressions' => '2026_08_14_090000_create_email_suppressions_table.php'] as $table => $file) {
            if (!Schema::hasTable($table)) (require database_path('migrations/'.$file))->up();
        }
        if (!Schema::hasColumn('email_templates', 'organization_id')) Schema::table('email_templates', fn ($t) => $t->unsignedBigInteger('organization_id'));
        if (!Schema::hasColumn('email_templates', 'brand_id')) Schema::table('email_templates', fn ($t) => $t->unsignedBigInteger('brand_id')->nullable());
        if (!Schema::hasTable('hotel_settings')) Schema::create('hotel_settings', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable();
            $t->string('key'); $t->text('value')->nullable(); $t->string('group')->nullable(); $t->timestamps();
        });
        if (!Schema::hasTable('loyalty_members')) Schema::create('loyalty_members', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('user_id');
            $t->boolean('email_notifications')->default(true); $t->timestamp('unsubscribed_at')->nullable(); $t->timestamps();
        });
        $migration = database_path('migrations/2026_11_16_180000_create_lead_form_email_deliveries.php');
        if (is_file($migration)) (require $migration)->up();
        config(['mail.default' => 'array', 'mail.from.address' => 'noreply@example.test', 'mail.from.name' => 'Platform', 'cache.shared' => 'array']);
        $template = EmailTemplate::create([
            'name' => 'Coupon reply', 'subject' => 'Your requested code',
            'html_body' => '<html><body><p>EARLYFOR20</p><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a></body></html>',
            'category' => 'campaign', 'is_active' => true,
        ]);
        $this->form = LeadForm::create([
            'name' => 'Newsletter', 'embed_key' => str_repeat('a', 32), 'is_active' => true,
            'fields' => [
                ['key' => 'email', 'type' => 'email', 'enabled' => true, 'required' => true],
                ['key' => 'consent', 'type' => 'checkbox', 'enabled' => true, 'required' => true, 'label' => 'I agree to venue news'],
            ],
            'design' => ['auto_reply' => [
                'enabled' => true, 'template_id' => $template->id, 'consent_field' => 'consent',
                'expires_at' => '2026-11-23T00:00:00+02:00',
            ]],
        ]);
        $this->travelTo(new \DateTimeImmutable('2026-11-16T18:00:00+02:00'));
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        parent::tearDown();
    }

    private function submission(array $payload = [], array $attributes = []): LeadFormSubmission
    {
        return LeadFormSubmission::create(array_merge([
            'lead_form_id' => $this->form->id, 'guest_id' => 1, 'inquiry_id' => 1, 'status' => 'processed',
            'payload' => array_merge(['email' => 'guest@example.test', 'consent' => true], $payload),
        ], $attributes));
    }

    public function test_requested_code_is_sent_once_to_the_submitted_address_with_a_working_unsubscribe(): void
    {
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        $this->assertNotNull($id);
        $reply->deliver($id);
        $reply->deliver($id);
        $this->assertNull($reply->capture($this->form, $this->submission(['email' => 'GUEST@example.test'])));
        $messages = Mail::mailer()->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $email = $messages->first()->getOriginalMessage();
        $this->assertSame('guest@example.test', $email->getTo()[0]->getAddress());
        $this->assertSame('Forest venue', $email->getFrom()[0]->getName());
        $this->assertStringContainsString('EARLYFOR20', $email->getHtmlBody());
        $this->assertStringNotContainsString('{{', $email->getHtmlBody());
        $this->assertStringContainsString('EARLYFOR20', $email->getTextBody());
        $this->assertNotNull($email->getHeaders()->get('List-Unsubscribe-Post'));
        $delivery = DB::table('lead_form_email_deliveries')->find($id);
        $this->assertSame('sent', $delivery->status);
        $this->get('/api/v1/public/lead-form-mail/unsubscribe/'.$delivery->unsubscribe_token)->assertOk();
        $this->assertNotNull(DB::table('lead_form_email_deliveries')->find($id)->unsubscribed_at);
        $this->assertFalse(EmailSuppression::isSuppressed('guest@example.test', 1), 'Opting out of marketing must not block booking confirmations.');
        $this->assertFalse(EmailSuppression::isSuppressed('guest@example.test', 2));
        $other = $this->form->replicate();
        $other->embed_key = str_repeat('b', 32); $other->save();
        $submission = $this->submission([], ['lead_form_id' => $other->id]);
        $this->assertNull($reply->capture($other, $submission));
    }

    public function test_no_reply_is_claimed_without_explicit_consent_or_for_an_unsaved_lead(): void
    {
        $reply = app(AutoReply::class);
        foreach ([false, null, 0, 'false', 'yes'] as $value) {
            $this->assertNull($reply->capture($this->form, $this->submission(['consent' => $value])));
        }
        $this->assertNull($reply->capture($this->form, $this->submission([], ['status' => 'error'])));
        $this->assertNull($reply->capture($this->form, $this->submission([], ['inquiry_id' => null])));
        $this->assertSame(0, DB::table('lead_form_email_deliveries')->count());
    }

    public function test_other_forms_remain_off_by_default_and_other_organisations_cannot_supply_the_template(): void
    {
        $reply = app(AutoReply::class);
        $design = $this->form->design;
        $this->form->design = [];
        $this->assertNull($reply->capture($this->form, $this->submission()));
        $this->form->design = $design;
        DB::table('email_templates')->where('id', $design['auto_reply']['template_id'])->update(['organization_id' => 2]);
        $this->assertNull($reply->capture($this->form, $this->submission()));
    }

    public function test_campaign_expiry_uses_the_explicit_offset_and_stops_pending_mail(): void
    {
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        $this->travelTo(new \DateTimeImmutable('2026-11-22T22:00:00Z'));
        $reply->deliver($id);
        $this->assertNull($reply->capture($this->form, $this->submission(['email' => 'second@example.test'])));
        $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
        $this->assertSame('cancelled', DB::table('lead_form_email_deliveries')->find($id)->status);
    }

    public function test_a_suppression_added_after_signup_still_prevents_the_send(): void
    {
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        EmailSuppression::suppress('guest@example.test', EmailSuppression::MANUAL, 1);
        $reply->deliver($id);
        $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
        $this->assertSame('suppressed', DB::table('lead_form_email_deliveries')->find($id)->status);
    }

    public function test_exhausted_campaign_budget_defers_without_losing_or_duplicating_the_reply(): void
    {
        config(['mail.campaign_hourly_limit_per_org' => 1]);
        $limiter = app(\App\Services\CampaignRateLimiter::class);
        $reservation = $limiter->reserve(1, 1);
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        $reply->deliver($id);
        $this->assertSame('pending', DB::table('lead_form_email_deliveries')->find($id)->status);
        $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
        $limiter->release($reservation['id'], 1);
        $this->artisan('lead-forms:send-pending')->assertSuccessful();
        $this->artisan('lead-forms:send-pending')->assertSuccessful();
        $this->assertSame('sent', DB::table('lead_form_email_deliveries')->find($id)->status);
        $this->assertCount(1, Mail::mailer()->getSymfonyTransport()->messages());
    }

    public function test_existing_submissions_are_fulfilled_only_on_explicit_request_and_once(): void
    {
        $this->submission();
        $this->submission(['email' => 'GUEST@example.test']);
        $this->submission(['email' => 'no-consent@example.test', 'consent' => false]);
        $this->submission(['email' => 'failed-lead@example.test'], ['status' => 'error']);
        $controller = new \App\Http\Controllers\Api\V1\Admin\LeadFormController();
        $config = $this->form->design['auto_reply'];
        $controller->autoReply(\Illuminate\Http\Request::create('/', 'PUT', $config), $this->form->id);
        $this->assertSame(0, DB::table('lead_form_email_deliveries')->count());
        $request = \Illuminate\Http\Request::create('/', 'PUT', [...$config, 'send_existing' => true]);
        $controller->autoReply($request, $this->form->id);
        $controller->autoReply($request, $this->form->id);
        $this->app->terminate();
        $this->assertSame(1, DB::table('lead_form_email_deliveries')->count());
        $this->assertCount(1, Mail::mailer()->getSymfonyTransport()->messages());
    }

    public function test_ordinary_form_update_cannot_remove_or_enable_mail_configuration(): void
    {
        $this->expectException(ValidationException::class);
        (new \App\Http\Controllers\Api\V1\Admin\LeadFormController())->update(
            \Illuminate\Http\Request::create('/', 'PUT', ['design' => ['title' => 'New title']]), $this->form->id,
        );
    }

    public function test_delivery_restores_the_previous_tenant_and_brand_context(): void
    {
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        app()->instance('current_organization_id', 99);
        app()->instance('current_brand_id', 88);
        $reply->deliver($id);
        $this->assertSame(99, app('current_organization_id'));
        $this->assertSame(88, app('current_brand_id'));
        $this->assertCount(1, Mail::mailer()->getSymfonyTransport()->messages());
    }

    public function test_configuration_refuses_a_non_checkbox_consent_field(): void
    {
        $reply = app(AutoReply::class);
        $reply->validateSettings($this->form, []);
        $fields = $this->form->fields;
        $fields[1]['type'] = 'text';
        $this->expectException(ValidationException::class);
        $reply->validateSettings($this->form, ['fields' => $fields]);
    }

    public function test_unknown_member_tags_fail_closed_instead_of_using_another_members_data(): void
    {
        EmailTemplate::first()->update(['html_body' => '<p>{{member_name}}</p><a href="{{UNSUBSCRIBE_URL}}">Leave</a>']);
        $this->assertNull(app(AutoReply::class)->capture($this->form, $this->submission()));
        $this->assertSame(0, DB::table('lead_form_email_deliveries')->count());
    }

    public function test_an_unknown_mail_outcome_is_recorded_and_never_automatically_retried(): void
    {
        $reply = app(AutoReply::class);
        $id = $reply->capture($this->form, $this->submission());
        $mailer = Mail::mailer();
        $transport = $mailer->getSymfonyTransport();
        $mailer->setSymfonyTransport(new class extends \Symfony\Component\Mailer\Transport\AbstractTransport {
            public function __toString(): string { return 'simulated-failing-transport'; }
            protected function doSend(\Symfony\Component\Mailer\SentMessage $message): void { throw new \RuntimeException('simulated transport failure'); }
        });
        $reply->deliver($id);
        $this->assertSame('failed', DB::table('lead_form_email_deliveries')->find($id)->status);
        $this->assertNotNull(DB::table('lead_form_email_deliveries')->find($id)->attempted_at);
        $mailer->setSymfonyTransport($transport);
        $reply->deliver($id);
        $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
    }

    public function test_public_configuration_does_not_disclose_delivery_settings_and_false_consent_is_refused(): void
    {
        $controller = new \App\Http\Controllers\Api\V1\Public\LeadFormPublicController(
            $this->createMock(\App\Services\RealtimeEventService::class), new \App\Services\CustomFieldService(),
        );
        $config = $controller->show($this->form->embed_key)->getData(true);
        $this->assertArrayNotHasKey('auto_reply', $config['design']);
        $this->expectException(ValidationException::class);
        $controller->submit(\Illuminate\Http\Request::create('/', 'POST', ['email' => 'guest@example.test', 'consent' => false]), $this->form->embed_key);
    }

    public function test_expired_campaign_refuses_public_submissions(): void
    {
        $this->travelTo(new \DateTimeImmutable('2026-11-22T22:00:00Z'));
        $controller = new \App\Http\Controllers\Api\V1\Public\LeadFormPublicController(
            $this->createMock(\App\Services\RealtimeEventService::class), new \App\Services\CustomFieldService(),
        );
        $this->assertSame(410, $controller->show($this->form->embed_key)->getStatusCode());
        $this->assertSame(410, $controller->submit(\Illuminate\Http\Request::create('/', 'POST'), $this->form->embed_key)->getStatusCode());
    }

    public function test_successful_public_submit_reserves_a_reply_and_runs_it_after_the_response(): void
    {
        $this->setUpCrmPresetSchema();
        if (!Schema::hasColumn('inquiries', 'lead_form_id')) Schema::table('inquiries', function ($t) {
            $t->unsignedBigInteger('lead_form_id')->nullable();
            $t->string('source')->nullable(); $t->string('priority')->nullable(); $t->string('inquiry_type')->default('General');
            $t->unsignedBigInteger('property_id')->nullable(); $t->string('assigned_to')->nullable();
            $t->date('check_in')->nullable(); $t->date('check_out')->nullable(); $t->integer('num_adults')->default(1);
            $t->text('special_requests')->nullable(); $t->json('custom_data')->nullable();
        });
        $controller = new \App\Http\Controllers\Api\V1\Public\LeadFormPublicController(
            $this->createMock(\App\Services\RealtimeEventService::class), new \App\Services\CustomFieldService(),
        );
        $response = $controller->submit(\Illuminate\Http\Request::create('/', 'POST', ['email' => 'signup@example.test', 'consent' => true]), $this->form->embed_key);
        $this->assertSame(200, $response->getStatusCode(), $response->getContent());
        $this->assertSame(1, DB::table('inquiries')->count());
        $this->assertSame(1, DB::table('lead_form_email_deliveries')->count());
        $this->app->terminate();
        $this->assertCount(1, Mail::mailer()->getSymfonyTransport()->messages());
    }
}
