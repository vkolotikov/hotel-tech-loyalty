<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Services\Booking\CouponResolver;
use App\Services\MemberMergeService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class PersonalOffersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, \Tests\Concerns\LoyaltyWorkspace\CampaignsSchema, \Tests\Concerns\LoyaltyWorkspace\PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (!Schema::hasTable('member_offers')) Schema::create('member_offers', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('offer_id');
            $t->string('status')->default('available'); $t->timestamp('claimed_at')->nullable(); $t->timestamp('used_at')->nullable(); $t->timestamp('expires_at')->nullable(); $t->timestamps();
        });
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        $migration = database_path('migrations/2026_11_11_100000_add_personal_offer_delivery.php');
        if (is_file($migration) && !Schema::hasColumn('special_offers', 'audience')) (require $migration)->up();
    }

    public function test_selected_members_are_saved_and_every_other_member_is_excluded(): void
    {
        $response = $this->asManager()->postJson($this->api('offers'), $this->body([
            'audience' => 'members', 'member_ids' => [$this->ada->id],
        ]))->assertCreated()->assertJsonPath('offer.audience', 'members')->assertJsonPath('offer.member_ids', [$this->ada->id]);
        $offer = SpecialOffer::findOrFail($response->json('offer.id'));
        $this->assertTrue($offer->allowsMembership($this->ada));
        $this->assertFalse($offer->allowsMembership($this->grace));
        $this->actingAs($this->grace->user, 'sanctum')->getJson('/api/v1/member/offers')->assertOk()->assertJsonCount(0, 'general');
        $this->postJson('/api/v1/member/offers/'.$offer->id.'/claim')->assertNotFound();
        $this->actingAs($this->ada->user, 'sanctum')->getJson('/api/v1/member/offers')->assertOk()->assertJsonCount(1, 'general');
    }

    public function test_an_empty_private_audience_never_becomes_everyone_and_cross_tenant_ids_are_refused(): void
    {
        $this->asManager()->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => []]))
            ->assertUnprocessable()->assertJsonValidationErrors('member_ids');
        $other = $this->otherOrganization();
        $this->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => [$other['member']->id]]))
            ->assertUnprocessable()->assertJsonValidationErrors('member_ids.0');
    }

    public function test_a_private_offer_cannot_be_claimed_through_a_guessed_booking_code(): void
    {
        $reply = $this->asManager()->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => [$this->ada->id]]))->assertCreated();
        $this->expectException(\App\Services\Booking\CouponException::class);
        app(CouponResolver::class)->resolveCode($this->grace, 'CHRISTMAS');
    }

    public function test_a_partial_edit_keeps_the_private_audience_and_a_recipient_can_be_removed(): void
    {
        $id = $this->asManager()->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => [$this->ada->id, $this->grace->id]]))->json('offer.id');
        $this->putJson($this->api('offers/'.$id), ['title' => 'Christmas voucher'])->assertOk()->assertJsonPath('offer.audience', 'members')->assertJsonCount(2, 'offer.member_ids');
        $this->putJson($this->api('offers/'.$id), ['member_ids' => [$this->grace->id]])->assertOk();
        $this->assertFalse(SpecialOffer::findOrFail($id)->allowsMembership($this->ada));
    }

    private function body(array $more = []): array
    {
        return $more + ['title' => 'Christmas gift', 'description' => 'A personal voucher.', 'type' => 'discount', 'value' => 10,
            'code' => 'CHRISTMAS', 'start_date' => '2026-10-01', 'end_date' => '2026-12-31'];
    }

    public function test_attachment_is_durable_private_and_validated_by_actual_content(): void
    {
        $id = $this->asManager()->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => [$this->ada->id]]))->json('offer.id');
        $pdf = "%PDF-1.4\nVoucher\n%%EOF";
        $this->postJson($this->api("offers/$id/attachment"), ['attachment' => \Illuminate\Http\UploadedFile::fake()->createWithContent('Christmas.pdf', $pdf)])
            ->assertOk()->assertJsonPath('attachment.mime', 'application/pdf');
        $this->assertSame(base64_encode($pdf), DB::table('special_offer_files')->where('offer_id', $id)->value('content'));
        $this->postJson($this->api("offers/$id/attachment"), ['attachment' => \Illuminate\Http\UploadedFile::fake()->createWithContent('unsafe.pdf', '<svg xmlns="http://www.w3.org/2000/svg"/>')])->assertUnprocessable();
        $this->actingAs($this->grace->user, 'sanctum')->getJson("/api/v1/member/portal/offers/$id/attachment")->assertNotFound();
        $this->actingAs($this->ada->user, 'sanctum')->get("/api/v1/member/portal/offers/$id/attachment")->assertOk()->assertContent($pdf)->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    public function test_raster_files_and_size_limits_and_attachment_permissions(): void
    {
        $id = $this->asManager()->postJson($this->api('offers'), $this->body())->json('offer.id');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZioAAAAASUVORK5CYII=');
        $file = fn () => \Illuminate\Http\UploadedFile::fake()->createWithContent('voucher.png', $png);
        $this->postJson($this->api("offers/$id/attachment"), ['attachment' => $file()])->assertOk()->assertJsonPath('attachment.mime', 'image/png');
        $this->asStaffMember()->postJson($this->api("offers/$id/attachment"), ['attachment' => $file()])->assertForbidden();
        $this->asManager()->postJson($this->api("offers/$id/attachment"), ['attachment' => \Illuminate\Http\UploadedFile::fake()->create('large.pdf', 5121, 'application/pdf')])->assertUnprocessable();
        $other = $this->otherOrganization();
        $this->actingAs($other['member']->user, 'sanctum')->getJson("/api/v1/member/portal/offers/$id/attachment")->assertNotFound();
    }

    public function test_preview_send_and_retry_keep_one_portal_message_and_one_campaign_with_an_immutable_file(): void
    {
        \Illuminate\Support\Facades\Queue::fake();
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $id = $this->asManager()->postJson($this->api('offers'), $this->body(['audience' => 'members', 'member_ids' => [$this->ada->id]]))->json('offer.id');
        $pdf = "%PDF-1.4\nOriginal Christmas\n%%EOF";
        $this->postJson($this->api("offers/$id/attachment"), ['attachment' => \Illuminate\Http\UploadedFile::fake()->createWithContent('gift.pdf', $pdf)])->assertOk();
        $preview = $this->postJson($this->api("offers/$id/send-preview"), ['member_ids' => [$this->ada->id, $this->grace->id]])->assertOk()->assertJsonPath('counts.email', 1)->assertJsonPath('counts.portal', 1)->assertJsonPath('counts.ineligible', 1);
        $body = ['member_ids' => [$this->ada->id, $this->grace->id], 'revision' => $preview->json('revision'), 'idempotency_key' => 'christmas-send-1'];
        $this->postJson($this->api("offers/$id/send"), $body)->assertOk();
        $this->postJson($this->api("offers/$id/send"), $body)->assertOk();
        $this->assertSame(1, DB::table('push_notifications')->where('member_id', $this->ada->id)->count());
        $this->assertSame(0, DB::table('push_notifications')->where('member_id', $this->grace->id)->count());
        $this->assertSame(1, DB::table('email_campaigns')->where('organization_id', $this->org->id)->count());
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\SendEmailCampaignChunk::class, 1);
        $this->deleteJson($this->api("offers/$id/attachment"))->assertOk();
        $send = \App\Models\SpecialOfferSend::firstOrFail();
        $this->assertSame($pdf, base64_decode($send->attachment_content));
        $this->assertSame('gift.pdf', $send->snapshot['attachment']['name']);
        config(['mail.default' => 'array']);
        $mail = new \Illuminate\Mail\MailManager($this->app);
        \Illuminate\Support\Facades\Mail::swap($mail);
        $job = new \App\Jobs\SendEmailCampaignChunk($send->campaign_id, [$this->ada->id]);
        $job->handle(app(\App\Services\EmailComplianceService::class));
        $job->handle(app(\App\Services\EmailComplianceService::class));
        $messages = $mail->mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $attachment = $messages->first()->getOriginalMessage()->getAttachments()[0];
        $this->assertSame('gift.pdf', $attachment->getFilename());
        $this->assertSame($pdf, $attachment->getBody());
        $this->postJson($this->api("offers/$id/send"), array_replace($body, ['member_ids' => [$this->ada->id]]))->assertConflict();
    }

    public function test_changed_preview_is_refused_and_message_preferences_are_respected(): void
    {
        $this->ada->update(['marketing_consent' => false, 'notification_preferences' => ['offers' => false]]);
        $id = $this->asManager()->postJson($this->api('offers'), $this->body())->json('offer.id');
        $preview = $this->postJson($this->api("offers/$id/send-preview"), ['member_ids' => [$this->ada->id]])->assertOk()->assertJsonPath('counts.email', 0)->assertJsonPath('counts.portal', 0);
        $this->putJson($this->api("offers/$id"), ['description' => 'Changed voucher'])->assertOk();
        $this->postJson($this->api("offers/$id/send"), ['member_ids' => [$this->ada->id], 'revision' => $preview->json('revision'), 'idempotency_key' => 'changed-1'])->assertConflict();
        $this->assertSame(0, DB::table('special_offer_sends')->where('organization_id', $this->org->id)->count());
    }

    public function test_queue_failure_can_be_retried_without_duplicating_portal_messages(): void
    {
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $id = $this->asManager()->postJson($this->api('offers'), $this->body())->json('offer.id');
        $preview = $this->postJson($this->api("offers/$id/send-preview"), ['member_ids' => [$this->ada->id]])->assertOk();
        $body = ['member_ids' => [$this->ada->id], 'revision' => $preview->json('revision'), 'idempotency_key' => 'retry-queue-1'];
        $dispatcher = $this->app->make(\Illuminate\Contracts\Bus\Dispatcher::class);
        $this->app->instance(\Illuminate\Contracts\Bus\Dispatcher::class, \Mockery::mock(\Illuminate\Contracts\Bus\Dispatcher::class)->shouldReceive('dispatch')->once()->andThrow(new \RuntimeException('isolated queue unavailable'))->getMock());
        $this->postJson($this->api("offers/$id/send"), $body)->assertStatus(503);
        $this->app->instance(\Illuminate\Contracts\Bus\Dispatcher::class, $dispatcher);
        \Illuminate\Support\Facades\Queue::fake();
        $this->postJson($this->api("offers/$id/send"), $body)->assertOk();
        $this->assertSame(1, DB::table('push_notifications')->where('member_id', $this->ada->id)->count());
        $this->assertSame(1, DB::table('email_campaigns')->where('organization_id', $this->org->id)->count());
        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\SendEmailCampaignChunk::class, 1);
    }

    public function test_offer_delivery_history_cannot_be_reset_or_edited_as_an_ordinary_campaign(): void
    {
        \Illuminate\Support\Facades\Queue::fake(); $this->campaignsOn();
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $id = $this->asManager()->postJson($this->api('offers'), $this->body())->json('offer.id');
        $preview = $this->postJson($this->api("offers/$id/send-preview"), ['member_ids' => [$this->ada->id]])->assertOk();
        $body = ['member_ids' => [$this->ada->id], 'revision' => $preview->json('revision'), 'idempotency_key' => 'source-locked-1'];
        $this->postJson($this->api("offers/$id/send"), $body)->assertOk();
        $campaign = \App\Models\EmailCampaign::firstOrFail();
        $this->putJson($this->api("campaigns/$campaign->id"), ['name' => 'Changed'])->assertConflict()->assertJsonPath('error', 'offer_delivery_locked');
        $copy = $this->postJson($this->api("campaigns/$campaign->id/duplicate"))->assertCreated();
        $this->assertNull(\App\Models\EmailCampaign::findOrFail($copy->json('campaign.id'))->getAttribute('offer_send_id'));
        $campaign->forceFill(['status' => 'cancelled'])->save();
        $url = rtrim(config('app.url'), '/')."/api/v1/admin/email-campaigns/$campaign->id/reset?brand_id=all";
        $this->postJson($url)->assertConflict()->assertJsonPath('error', 'offer_delivery_locked');
        $this->postJson($this->api("offers/$id/send"), $body)->assertConflict()->assertJsonPath('error', 'offer_delivery_stopped');
        $this->assertSame(1, DB::table('push_notifications')->where('member_id', $this->ada->id)->count());
    }

    public function test_long_offer_titles_fit_the_campaign_and_removed_recipients_cannot_earn_or_get_email(): void
    {
        \Illuminate\Support\Facades\Queue::fake();
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $id = $this->asManager()->postJson($this->api('offers'), $this->body(['title' => str_repeat('Gift ', 35), 'type' => 'points_multiplier', 'value' => 2, 'audience' => 'members', 'member_ids' => [$this->ada->id, $this->grace->id]]))->json('offer.id');
        $claim = MemberOffer::create(['member_id' => $this->ada->id, 'offer_id' => $id, 'status' => 'claimed']);
        $this->assertSame(2.0, app(\App\Services\LoyaltyService::class)->bestOfferMultiplier($this->ada));
        $preview = $this->postJson($this->api("offers/$id/send-preview"), ['member_ids' => [$this->ada->id]])->assertOk();
        $this->postJson($this->api("offers/$id/send"), ['member_ids' => [$this->ada->id], 'revision' => $preview->json('revision'), 'idempotency_key' => 'long-1'])->assertOk();
        $campaign = \App\Models\EmailCampaign::firstOrFail();
        $this->assertLessThanOrEqual(120, mb_strlen($campaign->name));
        $this->putJson($this->api("offers/$id"), ['member_ids' => [$this->grace->id]])->assertOk();
        $this->assertSame(1.0, app(\App\Services\LoyaltyService::class)->bestOfferMultiplier($this->ada));
        (new \App\Jobs\SendEmailCampaignChunk($campaign->id, [$this->ada->id]))->handle(app(\App\Services\EmailComplianceService::class));
        $this->assertSame('suppressed', DB::table('email_campaign_deliveries')->where('campaign_id', $campaign->id)->value('status'));
        $offer = SpecialOffer::findOrFail($id); $offer->update(['type' => 'bonus_points']);
        $this->expectException(\App\Services\Loyalty\LoyaltyRefused::class);
        app(\App\Services\Loyalty\Offers\OfferBonus::class)->pay($claim, $offer, $this->ada);
    }
}
