<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AccessPlace;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Access\AccessPlaces;
use App\Services\Loyalty\Access\PlaceEntries;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Places and who may enter them, and each place's entries (release 8, spec 2026-10-25 §1). The rules are AccessPlaces'
 * (the one writer) and PlaceEntries' (the reads); this names the place (this organisation's, through the tenant scope,
 * or 404) and the caller's right: every active staff member reads, a manager changes (`manager_only` otherwise), as
 * with Program.
 *
 * - `GET places` → `{ places: [PlaceEntries::row], tiers: [{id, name, color}] (the tiers in use, for the dialog),
 *   can_change }`, with today's counts on the venue's clock.
 * - `POST places`, `PUT places/{id}` `{ name, description?, admits: all|tiers, tier_ids?, is_active?, sort_order?,
 *   idempotency_key? }` (the `Idempotency-Key` header when the body has none) → `{ place }`. A PUT changes only the
 *   fields it sends.
 * - `DELETE places/{id}` → `{ outcome: deleted|switched_off, place: row|null }`: a place with entries, or one an event
 *   names, is switched off and keeps its history.
 * - `GET places/{id}/entries?day=Y-m-d&page=` → PlaceEntries::page (the venue's today when no day is named).
 */
class PlaceController extends Controller
{
    public function index(Request $request, PlaceEntries $entries): JsonResponse
    {
        $orgId = (int) app('current_organization_id');

        return response()->json($entries->list($orgId, PortalBootstrap::venueToday($orgId)->toDateString()) + [
            'can_change' => LoyaltyAccess::isManager($request->user()),
        ]);
    }

    public function store(Request $request, AccessPlaces $places, PlaceEntries $entries): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $orgId = (int) app('current_organization_id');
        $data = $this->validated($request, false);

        $place = $places->create($orgId, $data, $request->user(), $this->key($request, $data['idempotency_key'] ?? null));

        return response()->json(['place' => $this->row($place, $entries)], 201);
    }

    public function update(Request $request, int $id, AccessPlaces $places, PlaceEntries $entries): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $place = $this->place($id);
        $data = $this->validated($request, true);

        $place = $places->update($place, $data, $request->user(), $this->key($request, $data['idempotency_key'] ?? null));

        return response()->json(['place' => $this->row($place, $entries)]);
    }

    public function destroy(Request $request, int $id, AccessPlaces $places, PlaceEntries $entries): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $place = $this->place($id);

        $outcome = $places->remove($place, $request->user());
        $kept = $outcome === 'switched_off' ? AccessPlace::query()->with('tiers')->find($place->id) : null;

        return response()->json(['outcome' => $outcome, 'place' => $kept ? $this->row($kept, $entries) : null]);
    }

    public function entries(Request $request, int $id, PlaceEntries $entries): JsonResponse
    {
        $place = $this->place($id);
        $data = $request->validate([
            'day'  => 'nullable|date_format:Y-m-d',
            'page' => 'nullable|integer|min:1|max:100000',
        ]);
        $orgId = (int) $place->organization_id;
        $day = $data['day'] ?? PortalBootstrap::venueToday($orgId)->toDateString();

        return response()->json($entries->page($place, $day, (int) ($data['page'] ?? 1)));
    }

    /**
     * The form's fields; on a change each only when sent. The tiers named must be this organisation's (OwnRows), and
     * `admits = tiers` needs one at least (AccessPlaces checks again, against what the place keeps).
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $partial): array
    {
        $some = $partial ? 'sometimes|' : '';

        return $request->validate([
            'name'            => $some . 'required|string|max:' . AccessPlaces::MAX_NAME,
            'description'     => 'sometimes|nullable|string|max:' . AccessPlaces::MAX_DESCRIPTION,
            'admits'          => [$partial ? 'sometimes' : 'required', 'string', Rule::in([AccessPlace::ADMITS_ALL, AccessPlace::ADMITS_TIERS])],
            'tier_ids'        => $partial ? 'sometimes|array|max:50' : 'required_if:admits,tiers|array|max:50',
            'tier_ids.*'      => ['integer', 'distinct', OwnRows::rule('loyalty_tiers')->whereNull('deleted_at')],
            'is_active'       => 'sometimes|boolean',
            'sort_order'      => 'sometimes|nullable|integer|min:0|max:' . AccessPlaces::MAX_SORT_ORDER,
            'idempotency_key' => 'nullable|string|max:64',
        ]);
    }

    /** @return array<string, mixed> */
    private function row(AccessPlace $place, PlaceEntries $entries): array
    {
        $orgId = (int) $place->organization_id;
        $today = $entries->counts($orgId, PortalBootstrap::venueToday($orgId)->toDateString(), (int) $place->id);

        return PlaceEntries::row($place, $today[(int) $place->id] ?? null);
    }

    /** The body's key, or the header's when the body has none (a long header kept as its hash). */
    private function key(Request $request, ?string $sent): ?string
    {
        $key = $sent ?: trim((string) $request->header('Idempotency-Key', ''));

        return $key === '' ? null : (mb_strlen($key) > 64 ? sha1($key) : $key);
    }

    /** One of this organisation's places (the tenant scope), or 404. */
    private function place(int $id): AccessPlace
    {
        return AccessPlace::query()->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
