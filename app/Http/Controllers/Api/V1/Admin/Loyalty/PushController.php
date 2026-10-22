<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\MemberSegment;
use App\Models\NotificationCampaign;
use App\Models\User;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Campaigns\SendLater;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Push\PushMessage;
use App\Services\Loyalty\Push\PushStart;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Push messages (spec 2026-10-22 release 3 §5): a title, a body, a category (the member's own opt-out switches:
 * offers, points, tier, stays) and a segment, sent from the workspace to the segment's members who can receive a push,
 * behind the plan's `push_notifications` feature (the routes' `feature:push_notifications`). A message is a row of
 * notification_campaigns with `source` `loyalty`; the full admin's push campaigns, rows without one, are neither
 * listed nor touched here (404).
 *
 * Managers only, reads included, as email campaigns (AccessMap `admin/loyalty/push` records reads as staff; this
 * controller is stricter). Send is PushStart's one conditional update; cancel and delete are conditional too, so two
 * people pressing at once act once. Every change, send and cancel is audited.
 *
 * Release 4 (§5): send later (`schedule`, `unschedule`; PushStart), started by `loyalty:send-scheduled` when due.
 */
class PushController extends Controller
{
    private const PER_PAGE = 25;

    public function __construct(private readonly PushStart $start)
    {
    }

    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $query = PushMessage::query()->orderByDesc('created_at')->orderByDesc('id');
        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, (int) $request->query('page', 1)), $pages);
        $rows = $query->forPage($page, self::PER_PAGE)->get();
        $context = self::context($rows->all());

        return response()->json([
            'messages' => $rows->map(fn (NotificationCampaign $m) => self::row($m, $context))->values(),
            'page'     => $page,
            'pages'    => $pages,
            'total'    => $total,
        ]);
    }

    /** A new, empty draft under the name the workspace gives it; its page opens next. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $data = $request->validate(['name' => 'required|string|max:' . PushMessage::MAX_NAME]);

        $message = new NotificationCampaign();
        $message->forceFill([
            'name'       => trim($data['name']),
            'title'      => '',
            'body'       => '',
            'channel'    => 'push',
            'source'     => PushMessage::SOURCE,
            'status'     => PushMessage::STATUS_DRAFT,
            'created_by' => $user->id,
        ])->save();

        AuditLog::record('push_message_created', $message, ['name' => $message->name], [], $user, "Push message '{$message->name}' drafted");

        return response()->json(self::answer($this->message((int) $message->id)), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());

        return response()->json(self::answer($this->message($id)));
    }

    /**
     * Save a draft: its name, title, body, category and segment. A segment must be this organisation's (422 on the
     * field); the category is one of the member's own switches.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $this->message($id);
        $data = $request->validate([
            'name'       => 'required|string|max:' . PushMessage::MAX_NAME,
            'title'      => 'nullable|string|max:' . PushMessage::MAX_TITLE,
            'body'       => 'nullable|string|max:' . PushMessage::MAX_BODY,
            'category'   => ['nullable', 'string', Rule::in(NotificationService::CATEGORIES)],
            'segment_id' => ['nullable', 'integer', OwnRows::rule('member_segments')],
        ]);
        $values = [
            'name'              => trim($data['name']),
            'title'             => trim((string) ($data['title'] ?? '')),
            'body'              => trim((string) ($data['body'] ?? '')),
            'category'          => $data['category'] ?? null,
            'member_segment_id' => isset($data['segment_id']) ? (int) $data['segment_id'] : null,
        ];

        // Under the row's lock: a Send that started it meanwhile wins, and this answers that it is no longer a draft.
        [$message, $old] = DB::transaction(function () use ($id, $values) {
            $message = PushMessage::query()->whereKey($id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            if ($message->status !== PushMessage::STATUS_DRAFT) {
                throw self::notADraft((string) $message->status);
            }
            $old = $message->only(['name', 'title', 'category', 'member_segment_id']);
            $message->forceFill($values)->save();

            return [$message, $old];
        });

        AuditLog::record('push_message_updated', $message, $message->only(['name', 'title', 'category', 'member_segment_id']), $old, $user,
            "Push message '{$message->name}' updated");

        return response()->json(self::answer($this->message($id)));
    }

    /** A draft only; a message that went out stays in the history. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $message = $this->message($id);

        $gone = PushMessage::query()->whereKey($message->id)->where('status', PushMessage::STATUS_DRAFT)->delete();
        if ($gone !== 1) {
            throw self::notADraft((string) $this->message($id)->status);
        }

        AuditLog::record('push_message_deleted', null, ['id' => $id, 'name' => $message->name], [], $user, "Push message '{$message->name}' deleted");

        return response()->json(['ok' => true]);
    }

    /**
     * Who Send would push to now, for the confirmation: the members reached and, of the segment's other members, how
     * many switched push off, have no device, or switched this category off. Refuses as Send does without a segment,
     * without a category, or with a rule that has a problem.
     */
    public function audience(Request $request, int $id): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $message = $this->message($id);
        $audience = $this->start->audienceOf($message);

        return response()->json(['audience' => [
            'segment'   => ['id' => (int) $audience['segment']->id, 'name' => (string) $audience['segment']->name],
            'category'  => (string) $message->category,
            'members'   => $audience['members'],
            'reached'   => count($audience['reached']),
            'push_off'  => $audience['push_off'],
            'no_device' => $audience['no_device'],
            'opted_out' => $audience['opted_out'],
            'limit'     => PushMessage::LIMIT,
        ]]);
    }

    /** Start sending: `{recipients, revision}` — the number the confirmation named and the draft it showed. */
    public function send(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $message = $this->message($id);
        $data = $request->validate([
            'recipients' => 'required|integer|min:1',
            'revision'   => 'required|string|max:64',
        ]);

        $this->start->start($message, $user, (int) $data['recipients'], $data['revision']);

        return response()->json(self::answer($this->message($id)));
    }

    /**
     * Send later: `{send_at, revision}` — a time on the venue's clock (`YYYY-MM-DDTHH:mm`) and the draft shown; on a
     * scheduled message, a new time. Answers the message and how many it would reach now (`about`): it goes to whoever
     * can receive it when it starts.
     */
    public function schedule(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $message = $this->message($id);
        $data = $request->validate([
            'send_at'  => 'required|string|max:32',
            'revision' => 'required|string|max:64',
        ]);

        $done = $this->start->schedule($message, $user, $data['send_at'], $data['revision']);

        return response()->json(self::answer($this->message($id)) + ['about' => $done['about']]);
    }

    /** A scheduled message back to a draft. */
    public function unschedule(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $this->start->unschedule($this->message($id), $user);

        return response()->json(self::answer($this->message($id)));
    }

    /** Stop a message while it sends; the job checks before each chunk, so what went out stays out. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $message = $this->message($id);

        $stopped = PushMessage::query()->whereKey($message->id)->where('status', PushMessage::STATUS_SENDING)
            ->update(['status' => PushMessage::STATUS_CANCELLED]);
        if ($stopped !== 1) {
            throw new LoyaltyRefused('not_sending', 'This message is not sending.', 409, ['status' => (string) $this->message($id)->status]);
        }
        $message = $this->message($id);
        $sent = PushStart::resultsOf([(int) $message->id])[(int) $message->id]['sent'];

        AuditLog::record('push_message_cancelled', $message, ['pushed_before_cancel' => $sent], ['status' => PushMessage::STATUS_SENDING], $user,
            "Push message '{$message->name}' cancelled after {$sent} pushed");

        return response()->json(self::answer($message));
    }

    /**
     * A new draft from any push message: the same title, body, category and segment, every count and send mark
     * cleared, under the name the workspace gives it ("… (copy)" otherwise).
     */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        LoyaltyAccess::requireManager($user);
        $source = $this->message($id);
        $data = $request->validate(['name' => 'nullable|string|max:200']);

        $copy = new NotificationCampaign();
        $copy->forceFill([
            'name'              => mb_substr(trim((string) ($data['name'] ?? '')) ?: $source->name . ' (copy)', 0, PushMessage::MAX_NAME),
            'title'             => (string) $source->title,
            'body'              => (string) $source->body,
            'category'          => $source->category,
            'member_segment_id' => $source->member_segment_id,
            'channel'           => 'push',
            'source'            => PushMessage::SOURCE,
            'status'            => PushMessage::STATUS_DRAFT,
            'created_by'        => $user->id,
        ])->save();

        AuditLog::record('push_message_duplicated', $copy, ['name' => $copy->name, 'source_id' => (int) $source->id], [], $user,
            "Push message '{$source->name}' duplicated as '{$copy->name}'");

        return response()->json(self::answer($this->message((int) $copy->id)), 201);
    }

    // ─── Shapes ─────────────────────────────────────────────────────────────

    /** @return array{push: array<string, mixed>, options: array<string, mixed>} A message's page and the editor's choices. */
    private static function answer(NotificationCampaign $m): array
    {
        $context = self::context([$m]);

        return ['push' => self::detail($m, $context), 'options' => PushMessage::options()];
    }

    /**
     * What the rows of a page name besides themselves, read once for the page: their segments, the people who made
     * and sent them, and how far each got.
     *
     * @param list<NotificationCampaign> $rows
     * @return array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>}
     */
    private static function context(array $rows): array
    {
        $segmentIds = array_values(array_unique(array_filter(array_map(fn ($m) => (int) $m->member_segment_id, $rows))));
        $userIds = array_values(array_unique(array_filter(array_merge(
            array_map(fn ($m) => (int) $m->created_by, $rows),
            array_map(fn ($m) => (int) $m->sent_by_user_id, $rows),
        ))));

        return [
            'segments' => $segmentIds === [] ? [] : MemberSegment::query()->whereIn('id', $segmentIds)->pluck('name', 'id')->map(fn ($n) => (string) $n)->all(),
            'users'    => $userIds === [] ? [] : User::query()->whereIn('id', $userIds)->pluck('name', 'id')->map(fn ($n) => (string) $n)->all(),
            'results'  => PushStart::resultsOf(array_map(fn ($m) => (int) $m->id, $rows)),
        ];
    }

    /**
     * A message in the list: what it says, its state, its audience and how far it got — the members it was handed
     * (`recipient_count`) and, from its delivery rows, those pushed, failed, kept in the inbox only, passed over and
     * still under way.
     *
     * @param array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>} $context
     * @return array<string, mixed>
     */
    private static function row(NotificationCampaign $m, array $context): array
    {
        $segmentId = $m->member_segment_id !== null ? (int) $m->member_segment_id : null;
        $results = $context['results'][(int) $m->id] ?? array_fill_keys(PushMessage::OUTCOMES, 0);
        unset($results['last']);

        return [
            'id'              => (int) $m->id,
            'name'            => (string) $m->name,
            'title'           => (string) $m->title,
            'category'        => $m->category,
            'status'          => (string) $m->status,
            'segment'         => $segmentId !== null && isset($context['segments'][$segmentId]) ? ['id' => $segmentId, 'name' => $context['segments'][$segmentId]] : null,
            'recipient_count' => (int) $m->target_count,
            'results'         => $results,
            'scheduled_at'    => $m->scheduled_at?->toIso8601String(),
            'scheduled_for'   => SendLater::wallOf($m->scheduled_at, (int) $m->organization_id),
            'sent_at'         => $m->sent_at?->toIso8601String(),
            'created_at'      => $m->created_at?->toIso8601String(),
            'updated_at'      => $m->updated_at?->toIso8601String(),
        ];
    }

    /**
     * A message's page: the row, its body and segment id, what the draft still lacks, who made and sent it, when the
     * last member was handled, and the draft's revision for Send.
     *
     * @param array{segments: array<int, string>, users: array<int, string>, results: array<int, array<string, mixed>>} $context
     * @return array<string, mixed>
     */
    private static function detail(NotificationCampaign $m, array $context): array
    {
        $last = $context['results'][(int) $m->id]['last'] ?? null;

        return self::row($m, $context) + [
            'body'             => (string) $m->body,
            'segment_id'       => $m->member_segment_id !== null ? (int) $m->member_segment_id : null,
            'missing'          => PushMessage::incomplete($m),
            // Why a scheduled message did not start when it was due (PushStart::startScheduled), as a code.
            'schedule_problem' => $m->status === PushMessage::STATUS_FAILED && is_array($m->data) && is_string($m->data['schedule_problem'] ?? null)
                ? $m->data['schedule_problem'] : null,
            'last_progress_at' => $last !== null ? Carbon::parse($last, 'UTC')->toIso8601String() : null,
            'created_by'       => $context['users'][(int) $m->created_by] ?? null,
            'sent_by'          => $context['users'][(int) $m->sent_by_user_id] ?? null,
            'revision'         => PushMessage::revision($m),
        ];
    }

    private static function notADraft(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('not_a_draft', 'Only a draft can be changed or deleted.', 409, ['status' => $status]);
    }

    /** This organisation's push message, or 404: another organisation's, and the full admin's campaigns, are not found. */
    private function message(int $id): NotificationCampaign
    {
        return PushMessage::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
