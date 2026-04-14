<?php

namespace App\Http\Controllers\Api\V1\Public;

use App\Http\Controllers\Controller;
use App\Models\CampaignRecipient;
use App\Models\NotificationCampaign;
use App\Scopes\TenantScope;
use Illuminate\Http\Response;

class CampaignTrackingController extends Controller
{
    /**
     * 1x1 transparent GIF served for email open tracking. Hit by the
     * inline pixel embedded in campaign emails; bumps opened_at and the
     * per-campaign opened_count counter.
     */
    public function open(int $recipientId): Response
    {
        $recipient = CampaignRecipient::withoutGlobalScope(TenantScope::class)->find($recipientId);

        if ($recipient) {
            $firstOpen = $recipient->opened_at === null;
            $recipient->forceFill([
                'opened_at'  => $recipient->opened_at ?? now(),
                'open_count' => $recipient->open_count + 1,
            ])->save();

            if ($firstOpen) {
                NotificationCampaign::withoutGlobalScope(TenantScope::class)
                    ->where('id', $recipient->campaign_id)
                    ->increment('opened_count');
            }
        }

        // 1x1 transparent GIF
        $gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

        return response($gif, 200, [
            'Content-Type'  => 'image/gif',
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma'        => 'no-cache',
        ]);
    }
}
