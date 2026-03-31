<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Models\NotificationCampaign;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(private NotificationService $notifications) {}

    public function index(): JsonResponse
    {
        $campaigns = NotificationCampaign::orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'campaigns' => $campaigns,
            'total'     => $campaigns->count(),
        ]);
    }

    public function createCampaign(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'              => 'required|string|max:255',
            'title'             => 'required|string|max:255',
            'body'              => 'required|string',
            'segment_rules'     => 'nullable|array',
            'scheduled_at'      => 'nullable|date',
            'channel'           => 'nullable|in:push,email,both',
            'email_template_id' => 'nullable|exists:email_templates,id',
            'email_subject'     => 'nullable|string|max:255',
        ]);

        $channel = $validated['channel'] ?? 'push';
        $sendEmail = in_array($channel, ['email', 'both']);
        $sendPush  = in_array($channel, ['push', 'both']);

        // Validate email template when email channel selected
        $emailTemplate = null;
        if ($sendEmail) {
            if (empty($validated['email_template_id'])) {
                return response()->json(['message' => 'Email template is required for email campaigns'], 422);
            }
            $emailTemplate = EmailTemplate::findOrFail($validated['email_template_id']);
        }

        $campaign = NotificationCampaign::create([
            'name'              => $validated['name'],
            'title'             => $validated['title'],
            'body'              => $validated['body'],
            'channel'           => $channel,
            'email_template_id' => $validated['email_template_id'] ?? null,
            'email_subject'     => $validated['email_subject'] ?? $emailTemplate?->subject,
            'segment_rules'     => $validated['segment_rules'] ?? [],
            'status'            => 'sending',
            'created_by'        => $request->user()->id,
            'scheduled_at'      => $validated['scheduled_at'] ?? null,
        ]);

        // Build member query based on segment rules
        $rules = $validated['segment_rules'] ?? [];
        $query = LoyaltyMember::with(['user', 'tier'])->where('is_active', true);

        if (!empty($rules['tiers'])) {
            $query->whereHas('tier', fn($q) => $q->whereIn('name', $rules['tiers']));
        }
        if (!empty($rules['points_min'])) {
            $query->where('current_points', '>=', $rules['points_min']);
        }
        if (!empty($rules['points_max'])) {
            $query->where('current_points', '<=', $rules['points_max']);
        }

        // For push-only, require push token; for email-only, require email consent
        if ($channel === 'push') {
            $query->whereNotNull('expo_push_token');
        }

        $members = $query->get();
        $pushCount = 0;
        $emailCount = 0;

        foreach ($members as $member) {
            // Send push notification
            if ($sendPush && $member->expo_push_token) {
                try {
                    $this->notifications->send($member, [
                        'type'  => 'campaign',
                        'title' => $validated['title'],
                        'body'  => $validated['body'],
                        'data'  => ['campaign_id' => $campaign->id],
                    ]);
                    $pushCount++;
                } catch (\Exception) {}
            }

            // Send email
            if ($sendEmail && $emailTemplate) {
                if ($this->notifications->sendCampaignEmail($member, $emailTemplate)) {
                    $emailCount++;
                }
            }
        }

        $campaign->update([
            'status'           => 'sent',
            'sent_count'       => $pushCount,
            'email_sent_count' => $emailCount,
        ]);

        $parts = [];
        if ($pushCount > 0) $parts[] = "{$pushCount} push";
        if ($emailCount > 0) $parts[] = "{$emailCount} email";
        $summary = implode(' + ', $parts) ?: '0';

        return response()->json([
            'message'          => "Campaign sent: {$summary}",
            'campaign'         => $campaign->fresh(),
            'sent_count'       => $pushCount,
            'email_sent_count' => $emailCount,
        ]);
    }
}
