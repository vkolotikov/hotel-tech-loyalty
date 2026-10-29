<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\Email\CampaignTags;
use App\Services\Loyalty\Campaigns\CampaignStart;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\MemberSegmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
 * Delivery runs through the shared campaign queue, capped at 5000 eligible recipients.
 */
class EmailCampaignController extends Controller
{
    public function __construct(protected MemberSegmentService $segments) {}

    public function index(Request $request): JsonResponse
    {
        // Status filter — drives the All/Draft/Sent/Failed pill bar.
        $status = $request->get('status');
        $allowed = [
            EmailCampaign::STATUS_DRAFT,
            EmailCampaign::STATUS_SENDING,
            EmailCampaign::STATUS_SENT,
            EmailCampaign::STATUS_FAILED,
        ];

        $rows = EmailCampaign::with(['segment:id,name', 'createdBy:id,name', 'sentBy:id,name'])
            ->when($status && in_array($status, $allowed, true), fn($q) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate(25);
        return response()->json($rows);
    }

    /**
     * Header KPI strip. Cheap aggregates over email_campaigns so the
     * Campaigns page can show at-a-glance health without a full list scan.
     */
    public function stats(): JsonResponse
    {
        $monthStart = now()->startOfMonth();

        $sentThisMonth     = (int) EmailCampaign::where('status', EmailCampaign::STATUS_SENT)
            ->where('sent_at', '>=', $monthStart)
            ->sum('sent_count');
        $campaignsThisMo   = (int) EmailCampaign::where('status', EmailCampaign::STATUS_SENT)
            ->where('sent_at', '>=', $monthStart)
            ->count();
        $draftCount        = (int) EmailCampaign::where('status', EmailCampaign::STATUS_DRAFT)->count();
        $totalReached      = (int) EmailCampaign::where('status', EmailCampaign::STATUS_SENT)->sum('sent_count');
        $failedThisMonth   = (int) EmailCampaign::where('status', EmailCampaign::STATUS_SENT)
            ->where('sent_at', '>=', $monthStart)
            ->sum('failed_count');

        return response()->json([
            'sent_this_month'       => $sentThisMonth,
            'campaigns_this_month'  => $campaignsThisMo,
            'drafts'                => $draftCount,
            'total_reached'         => $totalReached,
            'failed_this_month'     => $failedThisMonth,
        ]);
    }

    /**
     * Clone a campaign as a fresh draft. Resets all send-state and
     * appends "(copy)" to the internal name so the list stays distinct.
     */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $source = EmailCampaign::findOrFail($id);
        $copy = $source->replicate([
            'status', 'sent_at', 'sent_count', 'failed_count',
            'recipient_count', 'error_message', 'sent_by_user_id',
        ]);
        $copy->name               = mb_substr($source->name . ' (copy)', 0, 120);
        $copy->status             = EmailCampaign::STATUS_DRAFT;
        $copy->created_by_user_id = $request->user()->id;
        $copy->sent_at            = null;
        $copy->sent_count         = 0;
        $copy->failed_count       = 0;
        $copy->recipient_count    = 0;
        $copy->error_message      = null;
        $copy->sent_by_user_id    = null;
        $copy->save();

        return response()->json(['campaign' => $copy->fresh()], 201);
    }

    /**
     * Send a single test email to the staff user calling the endpoint.
     * Used to QA template rendering before broadcasting. Does NOT
     * change the campaign's status or counters.
     */
    public function test(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);
        $user     = $request->user();
        $email    = $user?->email;

        if (!$email) {
            return response()->json(['message' => 'Your staff account has no email on file.'], 422);
        }
        if (EmailSuppression::isSuppressed($email, (int) $campaign->organization_id)) {
            return response()->json(['message' => 'Your address is on the list that is never emailed.', 'error' => 'suppressed'], 422);
        }

        // Tags filled as a member's would be, with the sender's own name as the sample (CampaignTags::sample): the
        // test shows the personalisation without putting any member's details in a staff inbox.
        $sample = CampaignTags::sample($user, (int) $campaign->organization_id);

        try {
            Mail::html(CampaignTags::html((string) $campaign->body_html, $sample), function ($mail) use ($email, $campaign, $user, $sample) {
                $mail->to($email, $user->name ?? null)
                     ->subject('[TEST] ' . CampaignTags::subject((string) $campaign->subject, $sample));
            });
        } catch (\Throwable $e) {
            Log::warning('Email campaign test send failed', [
                'campaign_id' => $campaign->id,
                'exception'   => $e::class,
            ]);
            return response()->json(['message' => 'The test email could not be sent. Please try again later.', 'error' => 'test_failed'], 502);
        }

        return response()->json([
            'success' => true,
            'message' => "Test sent to {$email}",
        ]);
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
     * Queue the campaign. Audience = segment if linked,
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

        try {
            $campaign = app(CampaignStart::class)->startFullAdmin($campaign, $request->user(), $request->input('member_ids', []));
        } catch (LoyaltyRefused $e) {
            return response()->json(['message' => $e->getMessage(), 'error' => $e->errorCode], $e->status);
        }
        $recipientCount = (int) $campaign->recipient_count;

        return response()->json([
            'campaign'   => $campaign->fresh(),
            'queued'     => true,
            'recipients' => $recipientCount,
            'message'    => "Sending to {$recipientCount} recipients. Progress updates as it goes.",
        ]);
    }

    /**
     * Stop a campaign mid-flight.
     *
     * The chained job checks this status before each chunk, so cancelling
     * takes effect within one chunk rather than needing the queue drained.
     * Messages already sent stay sent — this is a stop, not an undo.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);

        if ($campaign->status !== EmailCampaign::STATUS_SENDING) {
            return response()->json([
                'message' => "Only a sending campaign can be cancelled — this one is {$campaign->status}.",
            ], 422);
        }

        $campaign->forceFill([
            'status'        => EmailCampaign::STATUS_CANCELLED,
            'error_message' => 'Cancelled by ' . ($request->user()->name ?? 'an admin'),
        ])->save();

        AuditLog::record('email_campaign_cancelled', $campaign,
            ['sent_before_cancel' => $campaign->sent_count],
            [], $request->user(),
            "Email campaign '{$campaign->name}' cancelled after {$campaign->sent_count} sent");

        return response()->json(['campaign' => $campaign->fresh()]);
    }

    /**
     * Put a failed or cancelled campaign back in draft so it can be
     * edited and sent again.
     *
     * Previously the only way out of a stuck campaign was duplicate(),
     * which also duplicates every delivery already made.
     */
    public function reset(Request $request, int $id): JsonResponse
    {
        $campaign = EmailCampaign::findOrFail($id);

        if (!in_array($campaign->status, [EmailCampaign::STATUS_FAILED, EmailCampaign::STATUS_CANCELLED], true)) {
            return response()->json([
                'message' => "Only a failed or cancelled campaign can be reset — this one is {$campaign->status}.",
            ], 422);
        }

        $alreadySent = (int) $campaign->sent_count;

        $campaign->forceFill([
            'status'        => EmailCampaign::STATUS_DRAFT,
            'error_message' => null,
        ])->save();

        // The record of who this send reached belongs to that send. A reset is the choice to send again, to everyone
        // (the warning below says so); left in place, the record would make the next send pass those members over.
        DB::table('email_campaign_deliveries')->where('campaign_id', $campaign->id)->delete();

        return response()->json([
            'campaign' => $campaign->fresh(),
            // Said plainly: re-sending mails everyone again, including the
            // ones who already received it.
            'warning'  => $alreadySent > 0
                ? "{$alreadySent} recipients already received this. Sending again will email them a second time."
                : null,
        ]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'name'        => 'required|string|max:120',
            'segment_id'  => 'sometimes|nullable|integer|exists:member_segments,id',
            'subject'     => 'required|string|max:200',
            'body_html'   => 'required|string',
            'body_text'   => 'nullable|string',
            // body_blocks: structured snapshot from the visual builder.
            // body_html is still authoritative (sent as-is), blocks are
            // there so the next edit can resume in the builder.
            'body_blocks' => 'sometimes|nullable|array|max:100',
        ]);
    }
}
