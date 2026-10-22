<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\MemberSegment;
use App\Models\SmsCampaign;
use App\Models\User;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Email\CampaignTags;
use App\Services\Loyalty\Campaigns\SendLater;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Sms\SmsMessage;
use App\Services\Loyalty\Sms\SmsStart;
use App\Services\Sms\PhoneNumber;
use App\Services\Sms\SmsText;
use App\Services\Sms\TwilioSms;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * SMS campaigns (release 4 §5, owner decision R4-4): a text with the email campaigns' tags, sent to a segment's
 * members who turned "Offers by SMS" on and have a phone number in international form, through the venue's own Twilio
 * account (Settings → Integrations in the full admin), behind the plan's `campaigns` feature (the routes'
 * `feature:campaigns`, as email campaigns). Rows of sms_campaigns (Loyalty\Sms\SmsMessage).
 *
 * Managers only, reads included, as email campaigns and push messages (AccessMap `admin/loyalty/sms` records reads as
 * staff; this controller is stricter). Send is SmsStart's one conditional update; schedule, unschedule, cancel and
 * delete are conditional too, so two people pressing at once act once. Every change, test, send, schedule and cancel
 * is audited. The Twilio Auth Token is never answered: the page learns only whether the account is set up, what is
 * missing, and the sending number.
 */
class SmsController extends Controller
{
    private const PER_PAGE = 25;

    public function __construct(private readonly SmsStart $start)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $orgId = self::orgId();
        $query = SmsMessage::query()->orderByDesc('created_at')->orderByDesc('id');
        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, (int) $request->query('page', 1)), $pages);
        $rows = $query->forPage($page, self::PER_PAGE)->get();
        $context = self::context($rows->all());

        return response()->json([
            'messages' => $rows->map(fn (SmsCampaign $c) => self::row($c, $context, $orgId))->values(),
            'page'     => $page,
            'pages'    => $pages,
            'total'    => $total,
            'twilio'   => app(TwilioSms::class)->readiness($orgId),
        ]);
    }

    /** A new, empty draft under the name the workspace gives it; its page opens next. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $data = $request->validate(['name' => 'required|string|max:' . SmsMessage::MAX_NAME]);

        $c = SmsCampaign::create([
            'name'               => trim($data['name']),
            'body'               => '',
            'status'             => SmsMessage::STATUS_DRAFT,
            'created_by_user_id' => $user->id,
        ]);

        AuditLog::record('sms_campaign_created', $c, ['name' => $c->name], [], $user, "SMS campaign '{$c->name}' drafted");

        return response()->json(self::answer($this->campaign((int) $c->id), $user), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());

        return response()->json(self::answer($this->campaign($id), $request->user()));
    }

    /** Save a draft: its name, text and segment. A segment must be this organisation's (422 on the field). */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $this->campaign($id);
        $data = $request->validate([
            'name'       => 'required|string|max:' . SmsMessage::MAX_NAME,
            'body'       => 'nullable|string|max:' . (SmsMessage::MAX_BODY * 2),
            'segment_id' => ['nullable', 'integer', OwnRows::rule('member_segments')],
        ]);
        $body = trim(SmsText::normalise((string) ($data['body'] ?? '')));
        if (mb_strlen($body) > SmsMessage::MAX_BODY) {
            throw \Illuminate\Validation\ValidationException::withMessages(['body' => 'The text may have at most ' . SmsMessage::MAX_BODY . ' characters.']);
        }
        $values = [
            'name'              => trim($data['name']),
            'body'              => $body,
            'member_segment_id' => isset($data['segment_id']) ? (int) $data['segment_id'] : null,
        ];

        // Under the row's lock: a Send that started it meanwhile wins, and this answers that it is no longer a draft.
        [$c, $old] = DB::transaction(function () use ($id, $values) {
            $c = SmsMessage::query()->whereKey($id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            if ($c->status !== SmsMessage::STATUS_DRAFT) {
                throw self::notADraft((string) $c->status);
            }
            $old = $c->only(['name', 'member_segment_id']);
            $c->forceFill($values)->save();

            return [$c, $old];
        });

        AuditLog::record('sms_campaign_updated', $c, $c->only(['name', 'member_segment_id']), $old, $user, "SMS campaign '{$c->name}' updated");

        return response()->json(self::answer($this->campaign($id), $user));
    }

    /** A draft only; a campaign that went out stays in the history. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $c = $this->campaign($id);

        $gone = SmsMessage::query()->whereKey($c->id)->where('status', SmsMessage::STATUS_DRAFT)->delete();
        if ($gone !== 1) {
            throw self::notADraft((string) $this->campaign($id)->status);
        }

        AuditLog::record('sms_campaign_deleted', null, ['id' => $id, 'name' => $c->name], [], $user, "SMS campaign '{$c->name}' deleted");

        return response()->json(['ok' => true]);
    }

    /**
     * Who Send would text now, for the confirmation: the members reached and the SMS parts their copies come to (the
     * cost hint: Twilio bills each part), and, of the segment's other members, how many have not turned SMS on, have
     * no phone number, have one without its country code, or share one with another member it reaches. Refuses as
     * Send does without a segment or with a rule that has a problem.
     */
    public function audience(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $a = $this->start->audienceOf($this->campaign($id));

        return response()->json(['audience' => [
            'segment'    => ['id' => (int) $a['segment']->id, 'name' => (string) $a['segment']->name],
            'members'    => $a['members'],
            'reached'    => count($a['reached']),
            'no_consent' => $a['no_consent'],
            'no_phone'   => $a['no_phone'],
            'bad_phone'  => $a['bad_phone'],
            'same_phone' => $a['same_phone'],
            'segments'   => $a['segments'],
            'limit'      => SmsMessage::LIMIT,
        ]]);
    }

    /**
     * One SMS to the signed-in staff member's own phone number (their user's), "[TEST]" before the text, its tags
     * filled with their own sample (CampaignTags::sample), through the venue's Twilio account. It changes nothing on
     * the campaign. Refused plainly without a number, or with one not in international form.
     */
    public function test(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $c = $this->campaign($id);
        $orgId = (int) $c->organization_id;
        if (SmsMessage::incomplete($c) !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to test.', 422, ['missing' => ['body']]);
        }
        $this->start->assertReady($orgId);
        $problem = PhoneNumber::problem($user->phone);
        if ($problem !== null) {
            throw new LoyaltyRefused($problem === PhoneNumber::NONE ? 'no_phone' : 'bad_phone',
                'Your account has no phone number in international form (+ and the country code).', 422);
        }
        $to = (string) PhoneNumber::e164($user->phone);

        $text = '[TEST] ' . SmsMessage::fill((string) $c->body, CampaignTags::sample($user, $orgId));
        $result = app(TwilioSms::class)->send($orgId, $to, $text);
        if (!$result['ok']) {
            throw new LoyaltyRefused('test_failed', 'The test could not be sent.', 502, ['reason' => $result['error']]);
        }

        AuditLog::record('sms_campaign_test_sent', $c, ['to' => $to, 'segments' => $result['segments']], [], $user, "SMS campaign '{$c->name}' test sent");

        return response()->json(['sent_to' => $to, 'segments' => $result['segments']]);
    }

    /** Start sending: `{recipients, revision}` — the number the confirmation named and the draft it showed. */
    public function send(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $c = $this->campaign($id);
        $data = $request->validate([
            'recipients' => 'required|integer|min:1',
            'revision'   => 'required|string|max:64',
        ]);

        $this->start->start($c, $user, (int) $data['recipients'], $data['revision']);

        return response()->json(self::answer($this->campaign($id), $user));
    }

    /**
     * Send later: `{send_at, revision}` — a time on the venue's clock (`YYYY-MM-DDTHH:mm`) and the draft shown; on a
     * scheduled campaign, a new time. Answers the campaign and how many it would reach now (`about`).
     */
    public function schedule(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $c = $this->campaign($id);
        $data = $request->validate([
            'send_at'  => 'required|string|max:32',
            'revision' => 'required|string|max:64',
        ]);

        $done = $this->start->schedule($c, $user, $data['send_at'], $data['revision']);

        return response()->json(self::answer($this->campaign($id), $user) + ['about' => $done['about'], 'about_segments' => $done['segments']]);
    }

    /** A scheduled campaign back to a draft. */
    public function unschedule(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $this->start->unschedule($this->campaign($id), $user);

        return response()->json(self::answer($this->campaign($id), $user));
    }

    /** Stop a campaign while it sends; the job checks before each member, so what went out stays out. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $c = $this->campaign($id);

        $stopped = SmsMessage::query()->whereKey($c->id)->where('status', SmsMessage::STATUS_SENDING)
            ->update(['status' => SmsMessage::STATUS_CANCELLED]);
        if ($stopped !== 1) {
            throw new LoyaltyRefused('not_sending', 'This campaign is not sending.', 409, ['status' => (string) $this->campaign($id)->status]);
        }
        $c = $this->campaign($id);
        $sent = SmsStart::resultsOf([(int) $c->id])[(int) $c->id]['sent'];

        AuditLog::record('sms_campaign_cancelled', $c, ['texted_before_cancel' => $sent], ['status' => SmsMessage::STATUS_SENDING], $user,
            "SMS campaign '{$c->name}' cancelled after {$sent} sent");

        return response()->json(self::answer($c, $user));
    }

    /**
     * A new draft from any SMS campaign: the same text and segment, every count and send mark cleared, under the name
     * the workspace gives it ("… (copy)" otherwise).
     */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $source = $this->campaign($id);
        $data = $request->validate(['name' => 'nullable|string|max:200']);

        $copy = SmsCampaign::create([
            'name'               => mb_substr(trim((string) ($data['name'] ?? '')) ?: $source->name . ' (copy)', 0, SmsMessage::MAX_NAME),
            'body'               => (string) $source->body,
            'member_segment_id'  => $source->member_segment_id,
            'status'             => SmsMessage::STATUS_DRAFT,
            'created_by_user_id' => $user->id,
        ]);

        AuditLog::record('sms_campaign_duplicated', $copy, ['name' => $copy->name, 'source_id' => (int) $source->id], [], $user,
            "SMS campaign '{$source->name}' duplicated as '{$copy->name}'");

        return response()->json(self::answer($this->campaign((int) $copy->id), $user), 201);
    }

    // ─── Shapes ─────────────────────────────────────────────────────────────

    /** @return array{sms: array<string, mixed>, options: array<string, mixed>} A campaign's page and the editor's choices. */
    private static function answer(SmsCampaign $c, User $viewer): array
    {
        $orgId = (int) $c->organization_id;
        $options = SmsMessage::options($viewer, $orgId);

        return ['sms' => self::detail($c, self::context([$c]), $options['sample'], $orgId), 'options' => $options];
    }

    /**
     * What the rows of a page name besides themselves, read once for the page: their segments, the people who made
     * and sent them, and how far each got.
     *
     * @param list<SmsCampaign> $rows
     * @return array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>}
     */
    private static function context(array $rows): array
    {
        $segmentIds = array_values(array_unique(array_filter(array_map(fn ($c) => (int) $c->member_segment_id, $rows))));
        $userIds = array_values(array_unique(array_filter(array_merge(
            array_map(fn ($c) => (int) $c->created_by_user_id, $rows),
            array_map(fn ($c) => (int) $c->sent_by_user_id, $rows),
        ))));

        return [
            'segments' => $segmentIds === [] ? [] : MemberSegment::query()->whereIn('id', $segmentIds)->pluck('name', 'id')->map(fn ($n) => (string) $n)->all(),
            'users'    => $userIds === [] ? [] : User::query()->whereIn('id', $userIds)->pluck('name', 'id')->map(fn ($n) => (string) $n)->all(),
            'results'  => SmsStart::resultsOf(array_map(fn ($c) => (int) $c->id, $rows)),
        ];
    }

    /**
     * A campaign in the list: its text's first line, its state, its audience, when it is scheduled for (the instant,
     * and the venue's wall clock), and how far it got — the members it was handed and, from its delivery rows, those
     * texted, failed, passed over and still under way, and the SMS parts Twilio counted for them.
     *
     * @param array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>} $context
     * @return array<string, mixed>
     */
    private static function row(SmsCampaign $c, array $context, int $orgId): array
    {
        $segmentId = $c->member_segment_id !== null ? (int) $c->member_segment_id : null;
        $results = $context['results'][(int) $c->id] ?? array_fill_keys(SmsMessage::OUTCOMES, 0) + ['segments' => 0];
        $parts = (int) ($results['segments'] ?? 0);
        unset($results['last'], $results['segments']);

        return [
            'id'              => (int) $c->id,
            'name'            => (string) $c->name,
            'excerpt'         => mb_substr(explode("\n", (string) $c->body)[0], 0, 120),
            'status'          => (string) $c->status,
            'segment'         => $segmentId !== null && isset($context['segments'][$segmentId]) ? ['id' => $segmentId, 'name' => $context['segments'][$segmentId]] : null,
            'recipient_count' => (int) $c->recipient_count,
            'results'         => $results,
            'segments_sent'   => $parts,
            'scheduled_at'    => $c->scheduled_at?->toIso8601String(),
            'scheduled_for'   => SendLater::wallOf($c->scheduled_at, $orgId),
            'sent_at'         => $c->sent_at?->toIso8601String(),
            'created_at'      => $c->created_at?->toIso8601String(),
            'updated_at'      => $c->updated_at?->toIso8601String(),
        ];
    }

    /**
     * A campaign's page: the row, its text and segment id, what the draft still lacks, how long the text is as the
     * networks count it (as written, and filled with the viewer's sample: the preview), the double-braced words no tag
     * fills, why it failed (a code) and the commonest reasons members' SMS failed, who made and sent it, when the last
     * member was handled, and the draft's revision for Send.
     *
     * @param array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>} $context
     * @param array<string, string> $sample CampaignTags::sample() for whoever is looking
     * @return array<string, mixed>
     */
    private static function detail(SmsCampaign $c, array $context, array $sample, int $orgId): array
    {
        $last = $context['results'][(int) $c->id]['last'] ?? null;
        $body = (string) $c->body;
        $preview = SmsMessage::fill($body, $sample);

        return self::row($c, $context, $orgId) + [
            'body'             => $body,
            'segment_id'       => $c->member_segment_id !== null ? (int) $c->member_segment_id : null,
            'missing'          => SmsMessage::incomplete($c),
            'length'           => SmsText::measure($body),
            'preview'          => $preview,
            'preview_length'   => SmsText::measure($preview),
            'unknown_tags'     => CampaignTags::unknown($body),
            'problem'          => $c->status === SmsMessage::STATUS_FAILED ? ($c->error_message ?: null) : null,
            'failures'         => self::failures((int) $c->id),
            'last_progress_at' => $last !== null ? Carbon::parse($last, 'UTC')->toIso8601String() : null,
            'created_by'       => $context['users'][(int) $c->created_by_user_id] ?? null,
            'sent_by'          => $context['users'][(int) $c->sent_by_user_id] ?? null,
            'revision'         => SmsMessage::revision($c),
        ];
    }

    /** @return list<array{reason: string, count: int}> the five commonest reasons members' SMS failed */
    private static function failures(int $id): array
    {
        return DB::table('sms_campaign_deliveries')->where('campaign_id', $id)->where('status', 'failed')
            ->groupBy('reason')->select('reason', DB::raw('COUNT(*) AS n'))->orderByDesc('n')->orderBy('reason')->limit(5)->get()
            ->map(fn ($r) => ['reason' => (string) ($r->reason ?? 'unknown'), 'count' => (int) $r->n])->values()->all();
    }

    private static function notADraft(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('not_a_draft', 'Only a draft can be changed or deleted.', 409, ['status' => $status]);
    }

    private static function orgId(): int
    {
        return (int) app('current_organization_id');
    }

    /** This organisation's SMS campaign, or 404. */
    private function campaign(int $id): SmsCampaign
    {
        return SmsMessage::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
