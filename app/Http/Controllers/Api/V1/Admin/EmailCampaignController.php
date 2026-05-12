<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\MemberSegmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Admin CRUD + send for proper email-broadcast campaigns.
 *
 * Endpoints (/v1/admin/email-campaigns):
 *   GET    /                — list (latest first)
 *   POST   /                — create draft
 *   GET    /{id}            — show
 *   PUT    /{id}            — update (only while status=draft)
 *   DELETE /{id}            — delete draft / cancelled
 *   POST   /{id}/send       — flip draft → sending → sent
 *
 * Send respects member.email_notifications opt-in. Recipients come
 * from the linked segment, or from explicit member_ids when none.
 * Synchronous send is fine for the existing 5000-recipient cap.
 */
class EmailCampaignController extends Controller
{
    public function __construct(protected MemberSegmentService $segments) {}

    public function index(): JsonResponse
    {
        $rows = EmailCampaign::with(['segment:id,name', 'createdBy:id,name', 'sentBy:id,name'])
            ->orderByDesc('created_at')
            ->paginate(25);
        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $row = EmailCampaign::with(['segment:id,name', 'createdBy:id,name', 'sentBy:id,name'])->findOrFail($id);
        return response()->json(['campaign' => $row]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        $campaign = EmailCampaign::create(array_merge($data, [
            'status'             => EmailCampaign::STATUS_DRAFT,
            'created_by_user_id' => $request->user()->id,
        ]));

        AuditLog::record('email_campaign_created', $campaign,
            ['name' => $campaign->name], [],
            $request->user(),
            "Email campaign '{$campaign->name}' drafted");

        return response()->json(['campaign' => $campaign], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);
        if ($campaign->status !== EmailCampaign::STATUS_DRAFT) {
            return response()->json([
                'message' => 'Sent or in-flight campaigns cannot be edited.',
            ], 422);
        }
        $campaign->update($this->validatePayload($request));
        return response()->json(['campaign' => $campaign->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);
        if (in_array($campaign->status, [EmailCampaign::STATUS_SENDING, EmailCampaign::STATUS_SENT], true)) {
            return response()->json([
                'message' => 'Sent campaigns are kept in history — cannot delete.',
            ], 422);
        }
        $name = $campaign->name;
        $campaign->delete();
        AuditLog::record('email_campaign_deleted', null, ['id' => $id, 'name' => $name], [],
            $request->user(), "Email campaign '{$name}' deleted");
        return response()->json(['success' => true]);
    }

    /**
     * Send the campaign synchronously. Audience = segment if linked,
     * otherwise the explicit member_ids in the request body. Member
     * email opt-in (member.email_notifications) is honoured.
     */
    public function send(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);
        if ($campaign->status !== EmailCampaign::STATUS_DRAFT) {
            return response()->json(['message' => "Campaign is already {$campaign->status}."], 422);
        }

        $request->validate([
            'member_ids'   => 'sometimes|array|max:5000',
            'member_ids.*' => 'integer|exists:loyalty_members,id',
        ]);

        // Resolve recipients
        $memberIds = [];
        if ($campaign->segment_id) {
            $segment = MemberSegment::find($campaign->segment_id);
            if ($segment) {
                $memberIds = $this->segments->memberIds($segment->definition ?? []);
            }
        } elseif (is_array($request->input('member_ids'))) {
            $memberIds = $request->input('member_ids');
        }

        if (empty($memberIds)) {
            return response()->json(['message' => 'No recipients — link a segment with members or provide member_ids.'], 422);
        }

        $campaign->forceFill([
            'status'          => EmailCampaign::STATUS_SENDING,
            'sent_by_user_id' => $request->user()->id,
            'recipient_count' => count($memberIds),
            'sent_count'      => 0,
            'failed_count'    => 0,
            'error_message'   => null,
        ])->save();

        $sent = 0;
        $failed = 0;

        try {
            LoyaltyMember::whereIn('id', $memberIds)
                ->with('user:id,name,email')
                ->where('email_notifications', true)
                ->chunk(200, function ($chunk) use ($campaign, &$sent, &$failed) {
                    foreach ($chunk as $m) {
                        $email = $m->user?->email;
                        if (!$email) { $failed++; continue; }
                        try {
                            Mail::html($campaign->body_html, function ($mail) use ($email, $campaign, $m) {
                                $mail->to($email, $m->user->name ?? null)
                                     ->subject($campaign->subject);
                            });
                            $sent++;
                        } catch (\Throwable $e) {
                            $failed++;
                            Log::warning('Email campaign send failed', [
                                'campaign_id' => $campaign->id,
                                'member_id'   => $m->id,
                                'error'       => $e->getMessage(),
                            ]);
                        }
                    }
                });

            $campaign->forceFill([
                'status'       => EmailCampaign::STATUS_SENT,
                'sent_count'   => $sent,
                'failed_count' => $failed,
                'sent_at'      => now(),
            ])->save();
        } catch (\Throwable $e) {
            $campaign->forceFill([
                'status'        => EmailCampaign::STATUS_FAILED,
                'error_message' => substr($e->getMessage(), 0, 500),
            ])->save();
            Log::error('Email campaign aborted', ['campaign_id' => $campaign->id, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Send aborted: ' . $e->getMessage()], 500);
        }

        AuditLog::record('email_campaign_sent', $campaign,
            ['sent' => $sent, 'failed' => $failed, 'recipients' => count($memberIds)],
            [], $request->user(),
            "Email campaign '{$campaign->name}' sent — {$sent} delivered, {$failed} failed");

        return response()->json([
            'campaign'   => $campaign->fresh(),
            'sent'       => $sent,
            'failed'     => $failed,
            'recipients' => count($memberIds),
        ]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'name'       => 'required|string|max:120',
            'segment_id' => 'sometimes|nullable|integer|exists:member_segments,id',
            'subject'    => 'required|string|max:200',
            'body_html'  => 'required|string',
            'body_text'  => 'nullable|string',
        ]);
    }
}
