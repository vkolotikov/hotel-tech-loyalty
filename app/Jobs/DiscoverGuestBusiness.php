<?php

namespace App\Jobs;

use App\Exceptions\AiHelperRefused;
use App\Models\Guest;
use App\Services\AiUsageService;
use App\Services\Crm\BusinessDiscovery;
use App\Services\Crm\BusinessProfile;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class DiscoverGuestBusiness implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 125;

    public function __construct(public int $guestId, public int $orgId, public string $runId)
    {
        $this->onQueue('ai');
    }

    public function handle(BusinessProfile $profiles, BusinessDiscovery $discovery, AiUsageService $usage): void
    {
        if (! Guest::withoutGlobalScopes()->where('organization_id', $this->orgId)->whereKey($this->guestId)->exists()
            || ! ($run = $profiles->claim($this->guestId, $this->runId))) {
            return;
        }
        try {
            BusinessProfile::checkAvailability($this->orgId);
            $response = $discovery->research($run['identity']);
            $usage->recordUsage(
                $this->orgId, BusinessProfile::MODEL, (int) ($response['usage']['input_tokens'] ?? 0),
                (int) ($response['usage']['output_tokens'] ?? 0), 'crm_discovery',
                additionalCents: $response['searches'], userId: $run['requested_by'],
            );
            $result = $response['result'];
        } catch (AiHelperRefused $error) {
            $result = ['status' => 'failed', 'error' => $error->errorCode];
        } catch (Throwable $error) {
            Log::warning('CRM business discovery failed', ['org_id' => $this->orgId, 'exception' => $error::class]);
            $result = ['status' => 'failed', 'error' => 'ai_failed'];
        }
        $profiles->complete($this->guestId, $this->runId, $result);
    }

    public function failed(?Throwable $error): void
    {
        app(BusinessProfile::class)->complete($this->guestId, $this->runId, ['status' => 'failed', 'error' => 'ai_failed']);
    }
}
