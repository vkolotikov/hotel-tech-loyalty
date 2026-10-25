<?php

namespace App\Services\Loyalty\Events;

use App\Models\AuditLog;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\NotificationService;
use App\Support\SharedCache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Creating, changing, publishing, cancelling and deleting events (release 8, spec 2026-10-25 §4) — the only writer of
 * `loyalty_events` and `loyalty_event_tiers`.
 *
 * - The fields (validate()): `title` (1–120), `description` (≤ 2000), `starts_at` / `ends_at` (the venue's wall clock,
 *   `YYYY-MM-DDTHH:mm`, stored as written; the end after the start, at most 14 days later), `place_id` (one of this
 *   organisation's places) or `location` (≤ 200; a place wins), `admits` `all` | `tiers` with `tier_ids` (this
 *   organisation's, at least one for `tiers`), `points` (0–100,000), `counts_as_visit`, `sign_up`, `walk_ins` (one of
 *   the two must be on, or nobody could come) and `capacity` (1–100,000, or none). A change takes only the fields it
 *   names, merged into the event as it stands under its row lock; the whole is checked there. A published event's
 *   change may not leave out a member who signed up (`signed_up_outside`, 409): their sign-ups are cancelled first.
 * - The life: draft → published → cancelled. A draft can be deleted (`not_a_draft` otherwise: a published event is
 *   cancelled instead, so its sign-ups and check-ins stay); publishing needs an event that has not ended
 *   (`event_ended`); a cancelled event changes no more (`wrong_state`, with `state`), and neither is a draft cancelled.
 * - Members are told: when a published event's times or place change, and when it is cancelled, every member signed
 *   up gets an inbox message and a push (type `event_changed` / `event_cancelled`, as NotificationService::send() would
 *   send them, the pushes in batches), after the commit — a message that fails is logged and never undoes the change.
 * - Each step locks the event row, is audited (`loyalty.event_created`, `_changed`, `_published`, `_cancelled`,
 *   `_deleted`) and repeats harmlessly: publishing a published event or cancelling a cancelled one answers it as it is
 *   and tells nobody twice. A create with a key answers the event the key made, for a day (SharedCache); the same key
 *   with another body is 409 `key_reused`.
 */
final class EventEditor
{
    public const MAX_DAYS = 14;
    public const MAX_POINTS = 100000;
    public const MAX_CAPACITY = 100000;

    /** The fields a change may name, as the API takes them. */
    public const FIELDS = ['title', 'description', 'starts_at', 'ends_at', 'place_id', 'location', 'admits', 'tier_ids', 'points', 'counts_as_visit', 'sign_up', 'walk_ins', 'capacity'];

    private const REPLAY_SECONDS = 86400;

    public function __construct(private readonly NotificationService $notices)
    {
    }

    /** @param array<string, mixed> $input */
    public function create(int $orgId, array $input, User $by, bool $publish = false, ?string $key = null): LoyaltyEvent
    {
        $replayKey = $key !== null && $key !== '' ? "loyalty-event-create:{$orgId}:" . sha1($key) : null;
        $hash = hash('sha256', (string) json_encode([self::sorted(array_intersect_key($input, array_flip(self::FIELDS))), $publish]));
        if ($replayKey !== null && is_array($seen = SharedCache::store()->get($replayKey))) {
            if (($seen['hash'] ?? null) !== $hash) {
                throw new LoyaltyRefused('key_reused', 'This retry key was used for a different event.', 409);
            }
            $first = LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->find($seen['id'] ?? 0);
            if ($first !== null) {
                return $first;
            }
        }

        $data = $this->validate($orgId, $input);
        $wall = EventClock::now($orgId);
        if ($publish && $data['ends_at'] <= $wall) {
            throw new LoyaltyRefused('event_ended', 'This event has already ended.', 422);
        }

        $event = DB::transaction(function () use ($orgId, $data, $by, $publish) {
            $event = new LoyaltyEvent();
            $event->forceFill(self::columns($data) + [
                'organization_id' => $orgId,
                'status'          => $publish ? LoyaltyEvent::PUBLISHED : LoyaltyEvent::DRAFT,
                'created_by'      => $by->id,
            ]);
            $event->save();
            $this->syncTiers($event, $data);
            $this->audit($event, $by, 'loyalty.event_created', null, self::audited($event, $data['tier_ids']), "Event \"{$event->title}\" created" . ($publish ? ' and published' : ' as a draft'));

            return $event;
        });

        if ($replayKey !== null) {
            SharedCache::store()->put($replayKey, ['hash' => $hash, 'id' => (int) $event->id], self::REPLAY_SECONDS);
        }

        return $event->fresh() ?? $event;
    }

    /**
     * A change: the fields named, merged into the event as it stands under its row lock (two managers saving at once
     * each change what they named, the second on top of the first), checked whole and written in that transaction.
     *
     * @param array<string, mixed> $input only the fields that change
     */
    public function change(LoyaltyEvent $event, array $input, User $by): LoyaltyEvent
    {
        $orgId = (int) $event->organization_id;
        $input = array_intersect_key($input, array_flip(self::FIELDS));

        $told = DB::transaction(function () use ($event, $input, $by, $orgId) {
            $locked = $this->lock($event);
            if ($locked->status === LoyaltyEvent::CANCELLED) {
                throw new LoyaltyRefused('wrong_state', 'A cancelled event cannot be changed.', 409, ['state' => $locked->status]);
            }
            $data = $this->validate($orgId, array_merge(self::formOf($locked), $input));
            $this->refuseStranding($locked, $data);
            $before = self::audited($locked, $this->tierIds($locked));
            $wasWhen = [EventClock::digits($locked->starts_at), EventClock::digits($locked->ends_at)];
            $wasWhere = EventRows::where($locked);

            $locked->forceFill(self::columns($data));
            $locked->save();
            $this->syncTiers($locked, $data);
            $locked->unsetRelation('place');
            $after = self::audited($locked, $data['tier_ids']);

            $changed = array_keys(array_filter($after, fn ($v, $k) => ($before[$k] ?? null) !== $v, ARRAY_FILTER_USE_BOTH));
            if ($changed !== []) {
                $this->audit($locked, $by, 'loyalty.event_changed', array_intersect_key($before, array_flip($changed)), array_intersect_key($after, array_flip($changed)), "Event \"{$locked->title}\" changed");
            }

            $moved = $wasWhen !== [EventClock::digits($locked->starts_at), EventClock::digits($locked->ends_at)] || $wasWhere !== EventRows::where($locked);

            return $locked->status === LoyaltyEvent::PUBLISHED && $moved;
        });

        $fresh = $event->fresh() ?? $event;
        if ($told) {
            $where = EventRows::where($fresh);
            $this->tellSignedUp($fresh, [
                'type'  => 'event_changed',
                'title' => "Change to {$fresh->title}",
                'body'  => 'Now ' . EventClock::sayWhen($fresh) . ($where !== null ? ", {$where}" : '') . '. You are still signed up.',
            ]);
        }

        return $fresh;
    }

    /**
     * A published event's change may not leave out a member who signed up and has not come yet: their sign-up would
     * hold a place they could never use, the portal would stop showing them the event (so they could not cancel) and
     * the door would refuse them, untold. Such a change is refused (409 `signed_up_outside`, with `count` and up to five
     * `members` names) until those sign-ups are cancelled from the event's people. Only what the change itself leaves
     * out counts — a member already outside the old tiers (their tier changed since) does not block an unrelated edit.
     * A draft has no sign-ups and changes freely.
     *
     * @param array{admits: string, tier_ids: list<int>} $data
     */
    private function refuseStranding(LoyaltyEvent $locked, array $data): void
    {
        if ($locked->status !== LoyaltyEvent::PUBLISHED || $data['admits'] !== 'tiers') {
            return;
        }
        $wasAll = $locked->admits !== 'tiers';
        $was = $this->tierIds($locked);
        $orgId = (int) $locked->organization_id;

        $left = EventRegistration::withoutGlobalScopes()
            ->from('loyalty_event_registrations as r')
            ->join('loyalty_members as m', 'm.id', '=', 'r.member_id')
            ->where('r.organization_id', $orgId)->where('r.loyalty_event_id', $locked->id)->where('r.status', EventRegistration::SIGNED_UP)
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('loyalty_event_attendances as a')
                ->whereColumn('a.loyalty_event_id', 'r.loyalty_event_id')->whereColumn('a.member_id', 'r.member_id'))
            ->where(fn ($q) => $q->whereNull('m.tier_id')->orWhereNotIn('m.tier_id', $data['tier_ids']))
            ->when(!$wasAll, fn ($q) => $q->whereIn('m.tier_id', $was === [] ? [0] : $was))
            ->orderBy('r.signed_up_at')->orderBy('r.id')
            ->pluck('r.member_id')->map(fn ($id) => (int) $id)->all();
        if ($left === []) {
            return;
        }

        $names = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('id', array_slice($left, 0, 5))->with('user:id,name')->get()
            ->sortBy(fn (LoyaltyMember $m) => array_search((int) $m->id, $left, true))
            ->map(fn (LoyaltyMember $m) => (string) ($m->user?->name ?? $m->member_number ?? ''))->values()->all();

        throw new LoyaltyRefused('signed_up_outside', 'Members signed up are not in the tiers chosen; cancel their sign-ups first.', 409, ['count' => count($left), 'members' => $names]);
    }

    public function publish(LoyaltyEvent $event, User $by): LoyaltyEvent
    {
        DB::transaction(function () use ($event, $by) {
            $locked = $this->lock($event);
            if ($locked->status === LoyaltyEvent::PUBLISHED) {
                return;
            }
            if ($locked->status !== LoyaltyEvent::DRAFT) {
                throw new LoyaltyRefused('wrong_state', 'Only a draft can be published.', 409, ['state' => $locked->status]);
            }
            if (EventClock::hasEnded($locked)) {
                throw new LoyaltyRefused('event_ended', 'This event has already ended.', 422);
            }
            $locked->forceFill(['status' => LoyaltyEvent::PUBLISHED])->save();
            $this->audit($locked, $by, 'loyalty.event_published', ['status' => LoyaltyEvent::DRAFT], ['status' => LoyaltyEvent::PUBLISHED], "Event \"{$locked->title}\" published");
        });

        return $event->fresh() ?? $event;
    }

    public function cancel(LoyaltyEvent $event, ?string $reason, User $by): LoyaltyEvent
    {
        $reason = $reason !== null && trim($reason) !== '' ? mb_substr(trim($reason), 0, 300) : null;

        $now = DB::transaction(function () use ($event, $reason, $by) {
            $locked = $this->lock($event);
            if ($locked->status === LoyaltyEvent::CANCELLED) {
                return false;
            }
            if ($locked->status !== LoyaltyEvent::PUBLISHED) {
                throw new LoyaltyRefused('wrong_state', 'A draft is deleted, not cancelled.', 409, ['state' => $locked->status]);
            }
            if (EventClock::hasEnded($locked)) {
                throw new LoyaltyRefused('event_ended', 'This event has already ended.', 422);
            }
            $locked->forceFill(['status' => LoyaltyEvent::CANCELLED])->save();
            $this->audit($locked, $by, 'loyalty.event_cancelled', ['status' => LoyaltyEvent::PUBLISHED], ['status' => LoyaltyEvent::CANCELLED, 'reason' => $reason], "Event \"{$locked->title}\" cancelled");

            return true;
        });

        $fresh = $event->fresh() ?? $event;
        if ($now) {
            $this->tellSignedUp($fresh, [
                'type'  => 'event_cancelled',
                'title' => "{$fresh->title} is cancelled",
                'body'  => EventClock::sayWhen($fresh) . ' will not take place.' . ($reason !== null ? " {$reason}" : '') . ' Sorry for the change of plans.',
            ]);
        }

        return $fresh;
    }

    public function delete(LoyaltyEvent $event, User $by): void
    {
        DB::transaction(function () use ($event, $by) {
            $locked = $this->lock($event);
            if ($locked->status !== LoyaltyEvent::DRAFT) {
                throw new LoyaltyRefused('not_a_draft', 'Only a draft can be deleted; cancel a published event instead.', 409, ['state' => $locked->status]);
            }
            $this->audit($locked, $by, 'loyalty.event_deleted', self::audited($locked, $this->tierIds($locked)), null, "Draft event \"{$locked->title}\" deleted");
            DB::table('loyalty_event_tiers')->where('loyalty_event_id', $locked->id)->delete();
            $locked->delete();
        });
    }

    /**
     * The fields checked and normalised: wall-clock times as their stored digits, `tier_ids` empty unless the event is
     * for tiers, the location dropped when a place is named.
     *
     * @param array<string, mixed> $input
     * @return array{title: string, description: ?string, starts_at: string, ends_at: string, place_id: ?int, location: ?string, admits: string, tier_ids: list<int>, points: int, counts_as_visit: bool, sign_up: bool, walk_ins: bool, capacity: ?int}
     */
    public function validate(int $orgId, array $input): array
    {
        $input += ['counts_as_visit' => true, 'sign_up' => false, 'walk_ins' => true, 'admits' => 'all', 'points' => 0];
        foreach (['title', 'description', 'location'] as $text) {
            if (is_string($input[$text] ?? null)) {
                $input[$text] = trim($input[$text]);
            }
        }
        $wall = function (string $attribute, mixed $value, \Closure $fail) {
            if (!is_string($value) || EventClock::stored($value) === null) {
                $fail('The time must be a date and time as YYYY-MM-DDTHH:mm.');
            }
        };
        $places = Schema::hasTable('access_places');

        $validator = Validator::make($input, [
            'title'           => 'required|string|min:1|max:120',
            'description'     => 'nullable|string|max:2000',
            'starts_at'       => ['required', $wall],
            'ends_at'         => ['required', $wall],
            'place_id'        => $places ? ['nullable', 'integer', Rule::exists('access_places', 'id')->where('organization_id', $orgId)] : ['nullable', 'prohibited'],
            'location'        => 'nullable|string|max:200',
            'admits'          => ['required', Rule::in(['all', 'tiers'])],
            'tier_ids'        => 'nullable|array|required_if:admits,tiers',
            'tier_ids.*'      => ['integer', 'distinct', Rule::exists('loyalty_tiers', 'id')->where('organization_id', $orgId)],
            'points'          => 'required|integer|min:0|max:' . self::MAX_POINTS,
            'counts_as_visit' => 'required|boolean',
            'sign_up'         => 'required|boolean',
            'walk_ins'        => 'required|boolean',
            'capacity'        => 'nullable|integer|min:1|max:' . self::MAX_CAPACITY,
        ]);
        $validator->after(function ($v) use ($input) {
            if ($v->errors()->hasAny(['starts_at', 'ends_at'])) {
                return;
            }
            $start = (string) EventClock::stored((string) $input['starts_at']);
            $end = (string) EventClock::stored((string) $input['ends_at']);
            if ($end <= $start) {
                $v->errors()->add('ends_at', 'The end must be after the start.');
            } elseif (\Carbon\CarbonImmutable::createFromFormat(EventClock::DIGITS, $start, 'UTC')->addDays(self::MAX_DAYS)->format(EventClock::DIGITS) < $end) {
                $v->errors()->add('ends_at', 'An event lasts at most ' . self::MAX_DAYS . ' days.');
            }
            if (($input['admits'] ?? null) === 'tiers' && is_array($input['tier_ids'] ?? null) && $input['tier_ids'] === []) {
                $v->errors()->add('tier_ids', 'Choose at least one tier.');
            }
            if (!filter_var($input['sign_up'] ?? false, FILTER_VALIDATE_BOOLEAN) && !filter_var($input['walk_ins'] ?? true, FILTER_VALIDATE_BOOLEAN)) {
                $v->errors()->add('walk_ins', 'With sign-up off, walk-ins must be welcome: otherwise nobody can come.');
            }
        });
        $data = $validator->validate();

        $tiers = $data['admits'] === 'tiers' ? array_values(array_unique(array_map('intval', $data['tier_ids'] ?? []))) : [];
        sort($tiers);
        $place = isset($data['place_id']) ? (int) $data['place_id'] : null;
        $location = $place === null && isset($data['location']) && $data['location'] !== '' ? (string) $data['location'] : null;

        return [
            'title'           => (string) $data['title'],
            'description'     => isset($data['description']) && $data['description'] !== '' ? (string) $data['description'] : null,
            'starts_at'       => (string) EventClock::stored((string) $data['starts_at']),
            'ends_at'         => (string) EventClock::stored((string) $data['ends_at']),
            'place_id'        => $place,
            'location'        => $location,
            'admits'          => (string) $data['admits'],
            'tier_ids'        => $tiers,
            'points'          => (int) $data['points'],
            'counts_as_visit' => (bool) filter_var($data['counts_as_visit'], FILTER_VALIDATE_BOOLEAN),
            'sign_up'         => (bool) filter_var($data['sign_up'], FILTER_VALIDATE_BOOLEAN),
            'walk_ins'        => (bool) filter_var($data['walk_ins'], FILTER_VALIDATE_BOOLEAN),
            'capacity'        => isset($data['capacity']) ? (int) $data['capacity'] : null,
        ];
    }

    /** An event as the API takes it, for a change that names only some fields. @return array<string, mixed> */
    public static function formOf(LoyaltyEvent $event): array
    {
        return [
            'title'           => (string) $event->title,
            'description'     => $event->description,
            'starts_at'       => EventClock::wall($event->starts_at),
            'ends_at'         => EventClock::wall($event->ends_at),
            'place_id'        => $event->access_place_id !== null ? (int) $event->access_place_id : null,
            'location'        => $event->location,
            'admits'          => (string) $event->admits,
            'tier_ids'        => DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->orderBy('tier_id')->pluck('tier_id')->map(fn ($id) => (int) $id)->all(),
            'points'          => (int) $event->points,
            'counts_as_visit' => (bool) $event->counts_as_visit,
            'sign_up'         => (bool) $event->sign_up,
            'walk_ins'        => (bool) $event->walk_ins,
            'capacity'        => $event->capacity !== null ? (int) $event->capacity : null,
        ];
    }

    /** @param array<string, mixed> $data validate()'s answer @return array<string, mixed> */
    private static function columns(array $data): array
    {
        return [
            'title'           => $data['title'],
            'description'     => $data['description'],
            'starts_at'       => $data['starts_at'],
            'ends_at'         => $data['ends_at'],
            'access_place_id' => $data['place_id'],
            'location'        => $data['location'],
            'admits'          => $data['admits'],
            'points'          => $data['points'],
            'counts_as_visit' => $data['counts_as_visit'],
            'sign_up'         => $data['sign_up'],
            'walk_ins'        => $data['walk_ins'],
            'capacity'        => $data['capacity'],
        ];
    }

    /** @param array<string, mixed> $data */
    private function syncTiers(LoyaltyEvent $event, array $data): void
    {
        $want = $data['tier_ids'];
        $have = $this->tierIds($event);
        if ($want === $have) {
            return;
        }
        DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->whereNotIn('tier_id', $want === [] ? [0] : $want)->delete();
        foreach (array_diff($want, $have) as $tierId) {
            DB::table('loyalty_event_tiers')->insert(['loyalty_event_id' => $event->id, 'tier_id' => $tierId]);
        }
        $event->unsetRelation('tiers');
    }

    /** @return list<int> */
    private function tierIds(LoyaltyEvent $event): array
    {
        return DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->orderBy('tier_id')->pluck('tier_id')->map(fn ($id) => (int) $id)->all();
    }

    private function lock(LoyaltyEvent $event): LoyaltyEvent
    {
        return LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $event->organization_id)->whereKey($event->id)->lockForUpdate()->first()
            ?? throw LoyaltyRefused::notFound();
    }

    /**
     * Every member signed up for the event is told, as NotificationService::send() tells one: nothing for a member who
     * switched that kind off, else the message kept in their inbox (keep()) and a push to a member with push on and a
     * device — here handed to Expo a hundred at a time (pushMany()), so a large event does not make one request per
     * member. A deleted member is told nothing. Never fails the step that called it.
     *
     * @param array{type: string, title: string, body: string} $notice
     */
    private function tellSignedUp(LoyaltyEvent $event, array $notice): void
    {
        $notice['data'] = ['event_id' => (int) $event->id, 'starts_at' => EventClock::wall($event->starts_at)];
        $category = NotificationService::categoryOf($notice['type']);
        EventRegistration::withoutGlobalScopes()->where('organization_id', $event->organization_id)->where('loyalty_event_id', $event->id)
            ->where('status', EventRegistration::SIGNED_UP)->orderBy('id')
            ->chunk(100, function ($rows) use ($event, $notice, $category) {
                $members = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $event->organization_id)
                    ->whereIn('id', $rows->pluck('member_id')->all())->with('user')->get();
                $pushes = [];
                foreach ($members as $member) {
                    if (MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member) || NotificationService::optsOut($member->notification_preferences, $category)) {
                        continue;
                    }
                    try {
                        $this->notices->keep($member, $notice);
                    } catch (\Throwable $e) {
                        Log::warning('loyalty events: keeping a member\'s notice failed', ['event' => $event->id, 'member' => $member->id, 'error' => $e->getMessage()]);
                        continue;
                    }
                    if (NotificationService::canPush($member)) {
                        $pushes[] = ['to' => (string) $member->expo_push_token, 'title' => $notice['title'], 'body' => $notice['body'], 'data' => $notice['data']];
                    }
                }
                try {
                    $this->notices->pushMany($pushes);
                } catch (\Throwable $e) {
                    Log::warning('loyalty events: the pushes failed', ['event' => $event->id, 'error' => $e->getMessage()]);
                }
            });
    }

    /** @param list<int> $tierIds @return array<string, mixed> */
    private static function audited(LoyaltyEvent $event, array $tierIds): array
    {
        return [
            'title'           => (string) $event->title,
            'starts_at'       => EventClock::wall($event->starts_at),
            'ends_at'         => EventClock::wall($event->ends_at),
            'place_id'        => $event->access_place_id !== null ? (int) $event->access_place_id : null,
            'location'        => $event->location,
            'admits'          => (string) $event->admits,
            'tier_ids'        => $tierIds,
            'points'          => (int) $event->points,
            'counts_as_visit' => (bool) $event->counts_as_visit,
            'sign_up'         => (bool) $event->sign_up,
            'walk_ins'        => (bool) $event->walk_ins,
            'capacity'        => $event->capacity !== null ? (int) $event->capacity : null,
            'status'          => (string) $event->status,
            'description'     => $event->description,
        ];
    }

    /** @param array<string, mixed>|null $old @param array<string, mixed>|null $new */
    private function audit(LoyaltyEvent $event, User $by, string $action, ?array $old, ?array $new, string $description): void
    {
        AuditLog::create([
            'organization_id' => (int) $event->organization_id,
            'causer_type'     => User::class,
            'causer_id'       => $by->id,
            'action'          => $action,
            'subject_type'    => 'loyalty_event',
            'subject_id'      => (int) $event->id,
            'old_values'      => $old,
            'new_values'      => $new,
            'description'     => mb_substr($description, 0, 250),
        ]);
    }

    /** @param array<string, mixed> $a @return array<string, mixed> */
    private static function sorted(array $a): array
    {
        ksort($a);
        foreach ($a as $k => $v) {
            if (is_array($v)) {
                $a[$k] = self::sorted($v);
            }
        }

        return $a;
    }
}
