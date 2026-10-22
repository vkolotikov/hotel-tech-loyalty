<?php

namespace App\Console\Commands;

use App\Models\EmailCampaign;
use App\Models\NotificationCampaign;
use App\Models\SmsCampaign;
use App\Services\Loyalty\Campaigns\CampaignStart;
use App\Services\Loyalty\Campaigns\SendLater;
use App\Services\Loyalty\Push\PushMessage;
use App\Services\Loyalty\Push\PushStart;
use App\Services\Loyalty\Sms\SmsMessage;
use App\Services\Loyalty\Sms\SmsStart;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Starts HexaTech Loyalty's scheduled sends that are due (release 4 §5, send later): email campaigns, push messages and
 * SMS campaigns with the status `scheduled` whose time has come, each through its own start service
 * (CampaignStart, PushStart, SmsStart `startScheduled()`), under its organisation. Each starts with one conditional
 * update (`scheduled` → `sending`), so a second run at the same minute — or two workers at once — starts nothing more;
 * it goes to whoever is eligible at that moment. One that cannot start is marked failed with the reason. Every minute
 * (routes/console.php).
 */
class SendScheduledLoyaltyMessages extends Command
{
    protected $signature = 'loyalty:send-scheduled {--limit=50 : At most this many of each kind in one run}';

    protected $description = 'Start the HexaTech Loyalty email campaigns, push messages and SMS campaigns whose scheduled time has come.';

    public function handle(CampaignStart $email, PushStart $push, SmsStart $sms): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $now = now();
        $outcomes = [];

        $kinds = [
            'email' => [EmailCampaign::withoutGlobalScopes()->where('status', SendLater::STATUS), fn ($row) => $email->startScheduled($row)],
            'push'  => [NotificationCampaign::withoutGlobalScopes()->where('source', PushMessage::SOURCE)->where('status', SendLater::STATUS), fn ($row) => $push->startScheduled($row)],
            'sms'   => [SmsCampaign::withoutGlobalScopes()->where('status', SmsMessage::STATUS_SCHEDULED), fn ($row) => $sms->startScheduled($row)],
        ];
        foreach ($kinds as $kind => [$query, $start]) {
            $due = $query->whereNotNull('scheduled_at')->where('scheduled_at', '<=', $now)->orderBy('scheduled_at')->orderBy('id')->limit($limit)->get();
            foreach ($due as $row) {
                $outcome = $this->underOrganization((int) $row->organization_id, function () use ($start, $row, $kind) {
                    try {
                        return $start($row);
                    } catch (\Throwable $e) {
                        Log::error('loyalty scheduled send could not start', ['kind' => $kind, 'id' => $row->id, 'error' => $e->getMessage()]);

                        return 'error';
                    }
                });
                $outcomes[] = "{$kind} #{$row->id}: {$outcome}";
            }
        }

        foreach ($outcomes as $line) {
            $this->line($line);
        }
        if ($outcomes !== []) {
            Log::info('loyalty scheduled sends', ['outcomes' => $outcomes]);
        }

        return self::SUCCESS;
    }

    /** Run under the organisation's tenant binding, and put back whatever was bound before. */
    private function underOrganization(int $orgId, \Closure $work): string
    {
        $had = app()->bound('current_organization_id');
        $previous = $had ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return (string) $work();
        } finally {
            $had ? app()->instance('current_organization_id', $previous) : app()->forgetInstance('current_organization_id');
        }
    }
}
