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

    /**
     * Preview how many members match a set of segment rules, with a small
     * sample so the campaign wizard can show who will receive the message.
     */
    public function previewAudience(Request $request): JsonResponse
    {
        $rules = (array) $request->input('segment_rules', []);
        $channel = $request->input('channel', 'push');

        $query = LoyaltyMember::with(['user', 'tier'])->where('is_active', true);

        if (!empty($rules['tiers'])) {
            $query->whereHas('tier', fn($q) => $q->whereIn('name', $rules['tiers']));
        }
        if (!empty($rules['points_min'])) {
            $query->where('current_points', '>=', (int) $rules['points_min']);
        }
        if (!empty($rules['points_max'])) {
            $query->where('current_points', '<=', (int) $rules['points_max']);
        }

        $total = (clone $query)->count();
        $pushReady = (clone $query)->whereNotNull('expo_push_token')->count();
        $emailReady = (clone $query)
            ->where('email_notifications', true)
            ->whereHas('user', fn($q) => $q->whereNotNull('email'))
            ->count();

        $sample = $query->limit(5)->get()->map(fn($m) => [
            'id'        => $m->id,
            'name'      => $m->user->name ?? 'Member',
            'email'     => $m->user->email ?? null,
            'tier'      => $m->tier->name ?? null,
            'points'    => (int) $m->current_points,
            'push'      => (bool) $m->expo_push_token,
            'email_opt' => (bool) $m->email_notifications,
        ]);

        return response()->json([
            'total'       => $total,
            'push_ready'  => $pushReady,
            'email_ready' => $emailReady,
            'reachable'   => match ($channel) {
                'email' => $emailReady,
                'push'  => $pushReady,
                'both'  => max($pushReady, $emailReady),
                default => $total,
            },
            'sample'      => $sample,
        ]);
    }

    /**
     * Send a one-off test of a campaign (or plain push) to a specific
     * address so the admin can review it before sending to all members.
     */
    public function sendTest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email_template_id' => 'nullable|exists:email_templates,id',
            'email_subject'     => 'nullable|string|max:255',
            'to_email'          => 'nullable|email',
        ]);

        $user = $request->user();
        $toEmail = $validated['to_email'] ?? $user->email ?? null;
        if (!$toEmail) {
            return response()->json(['message' => 'No destination email available'], 422);
        }
        if (empty($validated['email_template_id'])) {
            return response()->json(['message' => 'Email template is required'], 422);
        }

        $template = EmailTemplate::findOrFail($validated['email_template_id']);

        $sampleMember = LoyaltyMember::with(['user', 'tier'])
            ->where('is_active', true)
            ->first();

        if (!$sampleMember) {
            return response()->json(['message' => 'No sample member available to render the template'], 422);
        }

        $rendered = $template->render($sampleMember);
        $subject = $validated['email_subject']
            ? str_replace(array_keys(EmailTemplate::AVAILABLE_TAGS), '', $validated['email_subject'])
            : $rendered['subject'];
        $subject = '[TEST] ' . ($subject ?: $template->subject);

        try {
            \Mail::html($rendered['html'], function ($message) use ($toEmail, $subject) {
                $message->to($toEmail)->subject($subject);
            });
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Send failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['message' => "Test sent to {$toEmail}"]);
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
