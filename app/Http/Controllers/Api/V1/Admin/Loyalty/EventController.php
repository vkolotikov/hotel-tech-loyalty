<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Events\EventCheckIn;
use App\Services\Loyalty\Events\EventClock;
use App\Services\Loyalty\Events\EventEditor;
use App\Services\Loyalty\Events\EventRows;
use App\Services\Loyalty\Events\EventSignUp;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Events (release 8, spec 2026-10-25 §4): the list, one event, creating, changing, publishing and cancelling it, its
 * people, sign-ups by staff and check-in by name. The rules are the Events services'; this names the rows (this
 * organisation's, through the tenant scope, or 404 `not_found`; a `member_id` of another organisation is a field error)
 * and the caller's right.
 *
 * Who: every active staff member reads, signs members up or off and checks them in (AccessMap `events/{id}/sign-ups`,
 * `events/{id}/check-in`); creating, changing, publishing, cancelling and deleting is a manager's or `can_manage_offers`
 * (as offers: AccessMap `events`), else 403 `not_allowed` with `need`. The list says which (`can_change`).
 *
 * - `GET events?when=upcoming|today|past|drafts&page=` → `{ events: [row], page, pages, total, totals: { upcoming,
 *   past, drafts }, can_change, options: { places: [{ id, name, is_active }] } }`. Upcoming: published and cancelled events that have not ended, soonest first; today:
 *   published events of the venue's today that have not ended (Scan's "Scanning for"), all of them; past: those that
 *   ended, latest first; drafts: soonest first. 20 a page.
 * - `POST events` (the fields of EventEditor, `publish?: bool`, `idempotency_key?`) → 201 `{ event }`; `GET
 *   events/{id}` → `{ event, can_change, options }`; `PUT events/{id}` → `{ event }`; `DELETE events/{id}` (a draft) → `{ deleted: true }`; `POST events/{id}/publish`,
 *   `POST events/{id}/cancel` `{ reason? }` → `{ event }`.
 * - `GET events/{id}/people?page=` → `{ event, counts, people, page, pages, total }` (EventRows::people()).
 * - `POST events/{id}/sign-ups` `{ member_id, idempotency_key? }`, `DELETE events/{id}/sign-ups/{memberId}` →
 *   `{ event, person }`.
 * - `POST events/{id}/check-in` `{ member_id, idempotency_key? }` → EventCheckIn::checkIn()'s answer.
 *
 * Keys: the body's `idempotency_key`, or the `Idempotency-Key` header when the body has none.
 */
class EventController extends Controller
{
    public const WHEN = ['upcoming', 'today', 'past', 'drafts'];

    private const PER_PAGE = 20;
    private const TODAY_MAX = 100;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'when' => ['nullable', Rule::in(self::WHEN)],
            'page' => 'nullable|integer|min:1|max:100000',
            'q' => 'nullable|string|max:120',
            'place_id' => 'nullable|integer|min:1',
            'location' => 'nullable|string|max:200',
            'tier_id' => 'nullable|integer|min:1',
            'sort' => ['nullable', Rule::in(['soonest', 'latest'])],
        ]);
        $orgId = $this->orgId();
        $when = $data['when'] ?? 'upcoming';
        $now = EventClock::now($orgId);

        $query = $this->listed($orgId, $when, $now);
        if (trim($data['q'] ?? '') !== '') {
            // Bound values, literal wildcards and portable case folding (SQLite and PostgreSQL).
            $needle = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower(trim($data['q'])));
            $query->whereRaw("LOWER(title) LIKE ? ESCAPE '!'", ['%'.$needle.'%']);
        }
        if (isset($data['place_id'])) $query->where('access_place_id', $data['place_id']);
        if (isset($data['location'])) $query->whereNull('access_place_id')->where('location', $data['location']);
        if (isset($data['tier_id'])) {
            $query->where(fn ($q) => $q->where('admits', 'all')->orWhereHas('tiers', fn ($t) => $t->where('loyalty_tiers.organization_id', $orgId)->where('loyalty_tiers.id', $data['tier_id'])));
        }
        if (isset($data['sort'])) $query->reorder()->orderBy('starts_at', $data['sort'] === 'latest' ? 'desc' : 'asc')->orderBy('id');
        $total = (clone $query)->count();
        $per = $when === 'today' ? self::TODAY_MAX : self::PER_PAGE;
        $pages = max(1, (int) ceil($total / $per));
        $page = min((int) ($data['page'] ?? 1), $pages);
        $events = $query->with(EventRows::with())->forPage($page, $per)->get();

        return response()->json([
            'events'     => EventRows::rows($orgId, $events),
            'page'       => $page,
            'pages'      => $pages,
            'total'      => $total,
            'totals'     => [
                'upcoming' => $this->listed($orgId, 'upcoming', $now)->count(),
                'past'     => $this->listed($orgId, 'past', $now)->count(),
                'drafts'   => $this->listed($orgId, 'drafts', $now)->count(),
            ],
            'can_change' => self::canChange($request->user()),
            'options'    => self::options($orgId),
        ]);
    }

    public function store(Request $request, EventEditor $editor): JsonResponse
    {
        self::requireChange($request->user());
        $request->validate(['publish' => 'nullable|boolean', 'idempotency_key' => 'nullable|string|max:64']);

        $event = $editor->create($this->orgId(), $request->all(), $request->user(), $request->boolean('publish'), $this->key($request));

        return response()->json(['event' => $this->row($event)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['event' => $this->row($this->event($id)), 'can_change' => self::canChange($request->user()), 'options' => self::options($this->orgId())]);
    }

    public function update(Request $request, int $id, EventEditor $editor): JsonResponse
    {
        self::requireChange($request->user());

        return response()->json(['event' => $this->row($editor->change($this->event($id), $request->all(), $request->user()))]);
    }

    public function destroy(Request $request, int $id, EventEditor $editor): JsonResponse
    {
        self::requireChange($request->user());
        $editor->delete($this->event($id), $request->user());

        return response()->json(['deleted' => true]);
    }

    public function publish(Request $request, int $id, EventEditor $editor): JsonResponse
    {
        self::requireChange($request->user());

        return response()->json(['event' => $this->row($editor->publish($this->event($id), $request->user()))]);
    }

    public function cancel(Request $request, int $id, EventEditor $editor): JsonResponse
    {
        self::requireChange($request->user());
        $data = $request->validate(['reason' => 'nullable|string|max:300']);

        return response()->json(['event' => $this->row($editor->cancel($this->event($id), $data['reason'] ?? null, $request->user()))]);
    }

    public function people(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'page' => 'nullable|integer|min:1|max:100000',
            'q' => 'nullable|string|max:120',
            'attendance' => ['nullable', Rule::in(['all', 'not_checked_in', 'checked_in', 'walk_in', 'cancelled'])],
            'per_page' => 'nullable|integer|min:5|max:200',
        ]);
        $event = $this->event($id);
        $row = $this->row($event);

        $people = EventRows::people($event, (int) ($data['page'] ?? 1), $data);
        return response()->json(['event' => $row, 'counts' => $row['counts'] + ['not_checked_in' => $people['not_checked_in']], 'latest' => EventRows::latestCheckIns($event)] + $people);
    }

    public function signUp(Request $request, int $id, EventSignUp $signUps): JsonResponse
    {
        $event = $this->event($id);
        $member = $this->memberFrom($request);

        $signUps->signUp($event, $member, EventSignUp::STAFF, $request->user(), $this->key($request));

        return response()->json(['event' => $this->row($event), 'person' => EventRows::person($event, (int) $member->id)]);
    }

    public function cancelSignUp(Request $request, int $id, int $memberId, EventSignUp $signUps): JsonResponse
    {
        $event = $this->event($id);
        $member = LoyaltyMember::query()->with(['user', 'tier'])->find($memberId) ?? throw LoyaltyRefused::notFound();

        $signUps->cancel($event, $member, EventSignUp::STAFF, $request->user());

        return response()->json(['event' => $this->row($event), 'person' => EventRows::person($event, (int) $member->id)]);
    }

    public function checkIn(Request $request, int $id, EventCheckIn $checkIn): JsonResponse
    {
        $event = $this->event($id);
        $member = $this->memberFrom($request);

        return response()->json($checkIn->checkIn($event, $member, $request->user(), $this->key($request)));
    }

    /**
     * What the event dialog offers: this organisation's places (read here; AccessPlaces writes them), switched-off
     * ones too, marked, so an event keeps the place it names.
     *
     * @return array{places: list<array{id: int, name: string, is_active: bool}>}
     */
    public static function options(int $orgId): array
    {
        $places = Schema::hasTable('access_places')
            ? DB::table('access_places')->where('organization_id', $orgId)->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'is_active'])
                ->map(fn ($p) => ['id' => (int) $p->id, 'name' => (string) $p->name, 'is_active' => (bool) $p->is_active])->values()->all()
            : [];

        $locations = LoyaltyEvent::query()->where('organization_id', $orgId)->whereNull('access_place_id')->whereNotNull('location')->where('location', '<>', '')->distinct()->orderBy('location')->pluck('location')->all();
        return ['places' => $places, 'locations' => $locations];
    }

    /** Managers and staff who may manage offers create and change events (spec §4). */
    public static function canChange(User $user): bool
    {
        return LoyaltyAccess::isManager($user) || LoyaltyAccess::has($user, LoyaltyAccess::MANAGE_REWARDS);
    }

    private static function requireChange(User $user): void
    {
        if (!self::canChange($user)) {
            throw new LoyaltyRefused('not_allowed', 'Your account may not do this.', 403, ['need' => LoyaltyAccess::MANAGE_REWARDS]);
        }
    }

    /** The events of one tab, in its order. */
    private function listed(int $orgId, string $when, string $now): \Illuminate\Database\Eloquent\Builder
    {
        $query = LoyaltyEvent::query()->where('organization_id', $orgId);

        return match ($when) {
            // Today's, and one starting just after midnight once its doors are open (release 9: from two hours before,
            // as AccessDecision lets in) — so the door can scan for it at 23:00.
            'today'  => $query->where('status', LoyaltyEvent::PUBLISHED)->where('ends_at', '>', $now)
                ->where('starts_at', '<', max(EventClock::dayAfter(EventClock::today($orgId)), VenueClock::now($orgId)->addMinutes(AccessDecision::OPENS_BEFORE_MINUTES)->format(EventClock::DIGITS)))
                ->orderBy('starts_at')->orderBy('id'),
            'past'   => $query->whereIn('status', [LoyaltyEvent::PUBLISHED, LoyaltyEvent::CANCELLED])->where('ends_at', '<=', $now)
                ->orderByDesc('starts_at')->orderByDesc('id'),
            'drafts' => $query->where('status', LoyaltyEvent::DRAFT)->orderBy('starts_at')->orderBy('id'),
            default  => $query->whereIn('status', [LoyaltyEvent::PUBLISHED, LoyaltyEvent::CANCELLED])->where('ends_at', '>', $now)
                ->orderBy('starts_at')->orderBy('id'),
        };
    }

    /** @return array<string, mixed> */
    private function row(LoyaltyEvent $event): array
    {
        $fresh = LoyaltyEvent::query()->with(EventRows::with())->find($event->id) ?? throw LoyaltyRefused::notFound();

        return EventRows::row($fresh, EventRows::countsOf($fresh));
    }

    private function event(int $id): LoyaltyEvent
    {
        return LoyaltyEvent::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }

    /** The body's `member_id`: one of this organisation's members (a field error otherwise). */
    private function memberFrom(Request $request): LoyaltyMember
    {
        $data = $request->validate([
            'member_id'       => ['required', 'integer', OwnRows::rule('loyalty_members')],
            'idempotency_key' => 'nullable|string|max:64',
        ]);

        return LoyaltyMember::query()->with(['user', 'tier'])->find((int) $data['member_id'])
            ?? throw ValidationException::withMessages(['member_id' => ['Choose one of your members.']]);
    }

    /** The body's key, or the header's when the body has none (a long header kept as its hash). */
    private function key(Request $request): ?string
    {
        $key = (string) ($request->input('idempotency_key') ?: trim((string) $request->header('Idempotency-Key', '')));

        return $key === '' ? null : (mb_strlen($key) > 64 ? sha1($key) : $key);
    }

    private function orgId(): int
    {
        return (int) app('current_organization_id');
    }
}
