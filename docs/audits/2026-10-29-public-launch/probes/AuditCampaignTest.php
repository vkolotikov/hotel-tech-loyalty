<?php

namespace Tests\Audit;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\EmailCampaign;
use App\Services\EmailComplianceService;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Event;
use Tests\Feature\Mail\CampaignDeliveriesTest;

class AuditCampaignTest extends CampaignDeliveriesTest
{
    private function auditCampaign(): array
    {
        $first = $this->makeMember('Audit One', 'audit-one@example.test', ['marketing_consent' => true, 'email_notifications' => true]);
        $second = $this->makeMember('Audit Two', 'audit-two@example.test', ['marketing_consent' => true, 'email_notifications' => true]);
        $campaign = EmailCampaign::create(['name' => 'Audit array transport only', 'subject' => 'Audit', 'body_html' => '<p>Audit</p>', 'body_blocks' => [], 'status' => EmailCampaign::STATUS_SENDING, 'recipient_count' => 2]);
        return [$campaign, [$first->id, $second->id]];
    }

    public function test_audit_cancel_during_last_chunk_remains_cancelled(): void
    {
        [$campaign, $ids] = $this->auditCampaign();
        Event::listen(MessageSending::class, function () use ($campaign) {
            EmailCampaign::withoutGlobalScopes()->whereKey($campaign->id)->update(['status' => EmailCampaign::STATUS_CANCELLED]);
        });
        (new SendEmailCampaignChunk($campaign->id, $ids))->handle(app(EmailComplianceService::class));
        $this->assertSame(EmailCampaign::STATUS_CANCELLED, $campaign->fresh()->status);
    }

    public function test_audit_partial_hourly_allowance_limits_recipients(): void
    {
        config(['mail.campaign_hourly_limit_per_org' => 1, 'mail.campaign_hourly_limit_global' => 6000]);
        [$campaign, $ids] = $this->auditCampaign();
        (new SendEmailCampaignChunk($campaign->id, $ids))->handle(app(EmailComplianceService::class));
        $this->assertSame(1, (int) $campaign->fresh()->sent_count);
    }
}
