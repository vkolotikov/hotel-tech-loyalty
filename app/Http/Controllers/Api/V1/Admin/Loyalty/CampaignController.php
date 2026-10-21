<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Campaigns\CampaignAudience;
use App\Services\Loyalty\Campaigns\CampaignBody;
use App\Services\Loyalty\Campaigns\CampaignStart;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Email campaigns (spec 2026-10-21 release 2 §6): the full admin's `email_campaigns`, read and written for this
 * organisation, sent by the shared pipeline (SendEmailCampaignChunk: consent, suppression, rate limits, the venue's
 * sender name), behind the plan's `campaigns` feature (the routes' `feature:campaigns`).
 *
 * Managers only, reads included: a draft is words not yet published, and the results name who sent what
 * (AccessMap `admin/loyalty/campaigns` records reads as staff; this controller is stricter). The body is blocks; the
 * server renders the email from them (CampaignBody) and the client never sends HTML. A draft is edited and sent here
 * only while its blocks are the workspace's subset; a draft with an image or with hand-written HTML stays the full
 * admin's. Send is CampaignStart's one conditional update; cancel and delete are conditional too, so two people
 * pressing at once act once. Every change, test, send and cancel is audited.
 */
class CampaignController extends Controller
{
    private const PER_PAGE = 25;

    public function __construct(private readonly CampaignStart $start)
    {
    }

    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $query = EmailCampaign::query()->with('segment:id,name')->orderByDesc('created_at')->orderByDesc('id');
        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, (int) $request->query('page', 1)), $pages);

        return response()->json([
            'campaigns' => $query->forPage($page, self::PER_PAGE)->get()->map(fn (EmailCampaign $c) => self::row($c))->values(),
            'page'      => $page,
            'pages'     => $pages,
            'total'     => $total,
        ]);
    }

    /** A new, empty draft under the name the workspace gives it; its page opens next. */
    public function store(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['name' => 'required|string|max:120']);

        $campaign = EmailCampaign::create([
            'name'               => trim($data['name']),
            'subject'            => '',
            'body_html'          => '',
            'body_blocks'        => [],
            'status'             => EmailCampaign::STATUS_DRAFT,
            'created_by_user_id' => $request->user()->id,
        ]);

        AuditLog::record('email_campaign_created', $campaign, ['name' => $campaign->name], [], $request->user(),
            "Email campaign '{$campaign->name}' drafted");

        return response()->json(self::answer($campaign->fresh()), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());

        return response()->json(self::answer($this->campaign($id)));
    }

    /**
     * Save a draft: its name, subject, audience and blocks; the HTML is rendered here from the blocks. A segment must
     * be this organisation's (422 on the field); a block's problems are field errors (`body_blocks.<i>.<key>`).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $this->campaign($id);
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'subject'     => 'nullable|string|max:200',
            'segment_id'  => ['nullable', 'integer', OwnRows::rule('member_segments')],
            'body_blocks' => 'present',
        ]);
        [$blocks, $problems] = CampaignBody::read($request->input('body_blocks'));
        if ($problems !== []) {
            throw ValidationException::withMessages($problems);
        }

        $values = [
            'name'        => trim($data['name']),
            'subject'     => trim((string) ($data['subject'] ?? '')),
            'segment_id'  => isset($data['segment_id']) ? (int) $data['segment_id'] : null,
            'body_blocks' => $blocks,
            'body_html'   => CampaignBody::render($blocks),
        ];

        // Under the row's lock: a Send that started it meanwhile wins, and this answers that it is no longer a draft.
        [$campaign, $old] = DB::transaction(function () use ($id, $values) {
            $campaign = EmailCampaign::query()->whereKey($id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            self::assertWorkable($campaign);
            $old = $campaign->only(['name', 'subject', 'segment_id']);
            $campaign->fill($values)->save();

            return [$campaign, $old];
        });

        AuditLog::record('email_campaign_updated', $campaign, $campaign->only(['name', 'subject', 'segment_id']), $old, $request->user(),
            "Email campaign '{$campaign->name}' updated");

        return response()->json(self::answer($campaign->fresh()));
    }

    /** A draft only; a campaign that went out stays in the history. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $campaign = $this->campaign($id);

        $gone = EmailCampaign::query()->whereKey($campaign->id)->where('status', EmailCampaign::STATUS_DRAFT)->delete();
        if ($gone !== 1) {
            throw self::notADraft($this->campaign($id)->status);
        }

        AuditLog::record('email_campaign_deleted', null, ['id' => $id, 'name' => $campaign->name], [], $request->user(),
            "Email campaign '{$campaign->name}' deleted");

        return response()->json(['ok' => true]);
    }

    /**
     * Who Send would email now, for the confirmation: the members reached and, of the segment's other members, how
     * many have not agreed to marketing email (or switched email off), unsubscribed, have an address that is
     * blocked, or have none. Refuses as Send does without a segment or with a rule that has a problem.
     */
    public function audience(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $audience = $this->start->audienceOf($this->campaign($id));

        return response()->json(['audience' => [
            'segment'      => ['id' => (int) $audience['segment']->id, 'name' => (string) $audience['segment']->name],
            'members'      => $audience['members'],
            'reached'      => count($audience['reached']),
            'unsubscribed' => $audience['unsubscribed'],
            'no_consent'   => $audience['no_consent'],
            'suppressed'   => $audience['suppressed'],
            'no_email'     => $audience['no_email'],
            'limit'        => CampaignAudience::LIMIT,
        ]]);
    }

    /**
     * One copy to the signed-in staff member's own address, "[TEST]" before the subject, as the full admin's
     * EmailCampaignController::test sends it (the body as it stands, no member footer). It changes nothing on the
     * campaign. An address the transport would refuse (suppressed) is said so rather than reported as sent.
     */
    public function test(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $campaign = $this->campaign($id);
        $missing = array_values(array_filter(CampaignStart::incomplete($campaign), fn (string $m) => in_array($m, ['subject', 'body'], true)));
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to test.', 422, ['missing' => $missing]);
        }
        $email = trim((string) $user->email);
        if ($email === '') {
            throw new LoyaltyRefused('no_email', 'Your account has no email address.', 422);
        }
        if (EmailSuppression::isSuppressed($email, (int) $campaign->organization_id)) {
            throw new LoyaltyRefused('suppressed', 'Your address is on the list that is never emailed.', 422);
        }

        try {
            Mail::html((string) $campaign->body_html, function ($mail) use ($email, $campaign, $user) {
                $mail->to($email, $user->name ?? null)->subject('[TEST] ' . $campaign->subject);
            });
        } catch (\Throwable $e) {
            Log::warning('Loyalty campaign test send failed', ['campaign_id' => $campaign->id, 'error' => $e->getMessage()]);
            throw new LoyaltyRefused('test_failed', 'The test could not be sent.', 502);
        }

        AuditLog::record('email_campaign_test_sent', $campaign, ['to' => $email], [], $user, "Email campaign '{$campaign->name}' test sent");

        return response()->json(['sent_to' => $email]);
    }

    /** Start sending: `{recipients, revision}` — the number the confirmation named and the draft it showed. */
    public function send(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $campaign = $this->campaign($id);
        $data = $request->validate([
            'recipients' => 'required|integer|min:1',
            'revision'   => 'required|string|max:64',
        ]);

        $campaign = $this->start->start($campaign, $request->user(), (int) $data['recipients'], $data['revision']);

        return response()->json(self::answer($campaign));
    }

    /** Stop a campaign while it sends; the job checks before each chunk, so what went out stays out. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $campaign = $this->campaign($id);

        $stopped = EmailCampaign::query()->whereKey($campaign->id)->where('status', EmailCampaign::STATUS_SENDING)
            ->update(['status' => EmailCampaign::STATUS_CANCELLED, 'error_message' => 'Cancelled by ' . ($user->name ?: 'a manager')]);
        if ($stopped !== 1) {
            throw new LoyaltyRefused('not_sending', 'This campaign is not sending.', 409, ['status' => (string) $this->campaign($id)->status]);
        }
        $campaign = $this->campaign($id);

        AuditLog::record('email_campaign_cancelled', $campaign, ['sent_before_cancel' => (int) $campaign->sent_count], ['status' => 'sending'], $user,
            "Email campaign '{$campaign->name}' cancelled after {$campaign->sent_count} sent");

        return response()->json(self::answer($campaign));
    }

    /**
     * A new draft from any campaign, as the full admin's duplicate makes one: the same subject, body and segment,
     * every count and send mark cleared, under the name the workspace gives it ("… (copy)" otherwise).
     */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $source = $this->campaign($id);
        $data = $request->validate(['name' => 'nullable|string|max:200']);

        $copy = $source->replicate(['status', 'sent_at', 'sent_count', 'failed_count', 'recipient_count', 'error_message', 'sent_by_user_id', 'last_progress_at']);
        $copy->forceFill([
            'name'               => mb_substr(trim((string) ($data['name'] ?? '')) ?: $source->name . ' (copy)', 0, 120),
            'status'             => EmailCampaign::STATUS_DRAFT,
            'created_by_user_id' => $request->user()->id,
            'sent_at'            => null,
            'sent_count'         => 0,
            'failed_count'       => 0,
            'recipient_count'    => 0,
            'error_message'      => null,
            'sent_by_user_id'    => null,
        ])->save();

        AuditLog::record('email_campaign_duplicated', $copy, ['name' => $copy->name, 'source_id' => (int) $source->id], [], $request->user(),
            "Email campaign '{$source->name}' duplicated as '{$copy->name}'");

        return response()->json(self::answer($copy->fresh()), 201);
    }

    // ─── Shapes ─────────────────────────────────────────────────────────────

    /** @return array{campaign: array<string, mixed>, options: array<string, mixed>} A campaign's page and the editor's choices. */
    private static function answer(EmailCampaign $c): array
    {
        return ['campaign' => self::detail($c), 'options' => CampaignBody::options()];
    }

    /** @return array<string, mixed> A campaign in the list. */
    private static function row(EmailCampaign $c): array
    {
        return [
            'id'              => (int) $c->id,
            'name'            => (string) $c->name,
            'subject'         => (string) $c->subject,
            'status'          => (string) $c->status,
            'segment'         => $c->segment ? ['id' => (int) $c->segment->id, 'name' => (string) $c->segment->name] : null,
            'recipient_count' => (int) $c->recipient_count,
            'sent_count'      => (int) $c->sent_count,
            'failed_count'    => (int) $c->failed_count,
            'sent_at'         => $c->sent_at?->toIso8601String(),
            'created_at'      => $c->created_at?->toIso8601String(),
            'updated_at'      => $c->updated_at?->toIso8601String(),
        ];
    }

    /**
     * A campaign's page: the row, its blocks when the workspace may edit them, the HTML the server rendered (the
     * preview, and what is sent), and the draft's revision for Send. The pipeline's own error text is not passed on.
     *
     * @return array<string, mixed>
     */
    private static function detail(EmailCampaign $c): array
    {
        $c->loadMissing(['segment:id,name', 'createdBy:id,name', 'sentBy:id,name']);
        $here = CampaignBody::editable($c->body_blocks, $c->body_html);

        return self::row($c) + [
            'segment_id'       => $c->segment_id !== null ? (int) $c->segment_id : null,
            'editable_here'    => $here,
            'body_blocks'      => $here ? array_values(is_array($c->body_blocks) ? $c->body_blocks : []) : null,
            'body_html'        => (string) $c->body_html,
            'missing'          => CampaignStart::incomplete($c),
            'last_progress_at' => $c->last_progress_at?->toIso8601String(),
            'created_by'       => $c->createdBy?->name,
            'sent_by'          => $c->sentBy?->name,
            'revision'         => (string) $c->updated_at?->toIso8601String(),
        ];
    }

    /** Edited here only as a draft, and only while its blocks are the workspace's. */
    private static function assertWorkable(EmailCampaign $campaign): void
    {
        if ($campaign->status !== EmailCampaign::STATUS_DRAFT) {
            throw self::notADraft($campaign->status);
        }
        if (!CampaignBody::editable($campaign->body_blocks, $campaign->body_html)) {
            throw new LoyaltyRefused('not_editable_here', 'This campaign is edited and sent in the full admin.', 409);
        }
    }

    private static function notADraft(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('not_a_draft', 'Only a draft can be changed or deleted.', 409, ['status' => $status]);
    }

    private function campaign(int $id): EmailCampaign
    {
        return EmailCampaign::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
