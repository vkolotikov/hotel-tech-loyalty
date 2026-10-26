<?php

namespace App\Services\Loyalty\Access;

use App\Models\AccessPlace;
use App\Models\AuditLog;
use App\Models\LoyaltyTier;
use App\Models\ScanEvent;
use App\Models\User;
use App\Scopes\TenantScope;
use App\Services\Loyalty\LoyaltyRefused;
use App\Support\AdvisoryLock;
use App\Support\SharedCache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * The only writer of `access_places` and `access_place_tiers` (release 8, spec 2026-10-25 §1): a venue's places and the
 * tiers each lets in. Who gets in is AccessDecision's; this keeps the places themselves.
 *
 * - A name is 1–80 characters and one per organisation, compared without case or the spaces around it (Spa and spa are
 *   one place). Checked under the organisation's places lock (`loyalty-places:{org}`), so two managers adding "Spa" at
 *   once make one; there is no unique index on names, the lock is the rule's only line.
 * - `admits = tiers` needs at least one tier, each this organisation's; `admits = all` keeps no tiers (a place that is
 *   switched back to chosen tiers is given them again), so the tiers a place lists are always the ones it lets in.
 * - A new place goes to the end of the list unless given an order.
 * - Removing a place that has entries, or that an event names, switches it off instead: its history stays readable and
 *   the event keeps its place. Only a place nothing names is deleted.
 * - Every change is audited (`loyalty.place_created`, `_updated`, `_deleted`, `_switched_off`).
 * - A create or update sent again with its idempotency key writes nothing and answers the place it made or changed; the
 *   same key with another body is 409 `key_reused`. The key is kept per organisation in SharedCache for a day, written
 *   inside the change's own transaction (the database store shares the connection, so both commit together).
 */
final class AccessPlaces
{
    public const MAX_NAME = 80;
    public const MAX_DESCRIPTION = 300;
    public const MAX_SORT_ORDER = 100000;

    /** How long a key's outcome is kept for a retry. */
    public const REPLAY_SECONDS = 86400;

    /**
     * @param array{name: string, description?: ?string, admits: string, tier_ids?: list<int>, is_active?: bool, sort_order?: ?int} $data
     */
    public function create(int $orgId, array $data, User $by, ?string $key = null): AccessPlace
    {
        $replayKey = self::replayKey($orgId, 'create', $key);
        $hash = self::hash($data);

        $id = AdvisoryLock::transaction(self::lockKey($orgId), function () use ($orgId, $data, $by, $replayKey, $hash) {
            if (($seen = self::seen($replayKey, $hash)) !== null) {
                return $seen;
            }

            $name = self::name($data['name'] ?? '');
            self::assertNameFree($orgId, $name, null);
            $admits = self::admits($data['admits'] ?? AccessPlace::ADMITS_ALL);
            $tierIds = $admits === AccessPlace::ADMITS_TIERS ? self::ownTiers($orgId, $data['tier_ids'] ?? []) : [];
            if ($admits === AccessPlace::ADMITS_TIERS && $tierIds === []) {
                throw ValidationException::withMessages(['tier_ids' => ['Choose the tiers that may enter.']]);
            }

            $place = (new AccessPlace())->forceFill([
                'organization_id' => $orgId,
                'name'            => $name,
                'description'     => self::description($data['description'] ?? null),
                'admits'          => $admits,
                'is_active'       => (bool) ($data['is_active'] ?? true),
                'sort_order'      => isset($data['sort_order']) ? (int) $data['sort_order']
                    : (int) AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
            ]);
            $place->save();
            $place->tiers()->sync($tierIds);

            self::audit($orgId, $by, 'loyalty.place_created', $place, [], self::snapshot($place, $tierIds), "Place '{$name}' added");
            self::keep($replayKey, $hash, (int) $place->id);

            return (int) $place->id;
        });

        return self::reread($orgId, $id);
    }

    /**
     * A partial change: a field not sent keeps what is stored (tier_ids too, while the place still admits tiers).
     *
     * @param array{name?: string, description?: ?string, admits?: string, tier_ids?: list<int>, is_active?: bool, sort_order?: ?int} $data
     */
    public function update(AccessPlace $place, array $data, User $by, ?string $key = null): AccessPlace
    {
        $orgId = (int) $place->organization_id;
        $replayKey = self::replayKey($orgId, 'update:' . $place->id, $key);
        $hash = self::hash($data);

        $id = AdvisoryLock::transaction(self::lockKey($orgId), function () use ($orgId, $place, $data, $by, $replayKey, $hash) {
            if (($seen = self::seen($replayKey, $hash)) !== null) {
                return $seen;
            }
            $locked = AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($place->id)->lockForUpdate()->first()
                ?? throw LoyaltyRefused::notFound();
            $oldTiers = self::tierIdsOf($locked);
            $old = self::snapshot($locked, $oldTiers);

            $name = array_key_exists('name', $data) ? self::name($data['name']) : (string) $locked->name;
            if (mb_strtolower($name) !== mb_strtolower((string) $locked->name)) {
                self::assertNameFree($orgId, $name, (int) $locked->id);
            }
            $admits = array_key_exists('admits', $data) ? self::admits($data['admits']) : (string) $locked->admits;
            $tierIds = match (true) {
                $admits === AccessPlace::ADMITS_ALL     => [],
                array_key_exists('tier_ids', $data)     => self::ownTiers($orgId, $data['tier_ids'] ?? []),
                default                                 => $oldTiers,
            };
            if ($admits === AccessPlace::ADMITS_TIERS && $tierIds === []) {
                throw ValidationException::withMessages(['tier_ids' => ['Choose the tiers that may enter.']]);
            }

            $locked->forceFill([
                'name'        => $name,
                'description' => array_key_exists('description', $data) ? self::description($data['description']) : $locked->description,
                'admits'      => $admits,
                'is_active'   => array_key_exists('is_active', $data) ? (bool) $data['is_active'] : (bool) $locked->is_active,
                'sort_order'  => isset($data['sort_order']) ? (int) $data['sort_order'] : (int) $locked->sort_order,
            ]);
            $locked->save();
            if ($tierIds !== $oldTiers) {
                $locked->tiers()->sync($tierIds);
            }

            $new = self::snapshot($locked, $tierIds);
            if ($new !== $old) {
                self::audit($orgId, $by, 'loyalty.place_updated', $locked, $old, $new, "Place '{$name}' changed");
            }
            self::keep($replayKey, $hash, (int) $locked->id);

            return (int) $locked->id;
        });

        return self::reread($orgId, $id);
    }

    /**
     * Delete a place nothing names; switch off one with entries or an event (its history stays). Answers which:
     * `deleted` or `switched_off`.
     */
    public function remove(AccessPlace $place, User $by): string
    {
        $orgId = (int) $place->organization_id;

        return AdvisoryLock::transaction(self::lockKey($orgId), function () use ($orgId, $place, $by) {
            $locked = AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($place->id)->lockForUpdate()->first()
                ?? throw LoyaltyRefused::notFound();
            $tierIds = self::tierIdsOf($locked);
            $snapshot = self::snapshot($locked, $tierIds);

            $entries = ScanEvent::withoutGlobalScopes()->where('organization_id', $orgId)->where('access_place_id', $locked->id)->exists();
            $events = Schema::hasTable('loyalty_events')
                && DB::table('loyalty_events')->where('organization_id', $orgId)->where('access_place_id', $locked->id)->exists();
            if ($entries || $events) {
                $locked->forceFill(['is_active' => false])->save();
                self::audit($orgId, $by, 'loyalty.place_switched_off', $locked, $snapshot, ['is_active' => false, 'kept_for' => $entries ? 'entries' : 'events'],
                    "Place '{$locked->name}' switched off instead of deleted: " . ($entries ? 'it has entries' : 'an event names it'));

                return 'switched_off';
            }

            DB::table('access_place_tiers')->where('access_place_id', $locked->id)->delete();
            $locked->delete();
            self::audit($orgId, $by, 'loyalty.place_deleted', $locked, $snapshot, [], "Place '{$locked->name}' deleted");

            return 'deleted';
        });
    }

    // ─── The rules ─────────────────────────────────────────────────────────

    private static function name(mixed $raw): string
    {
        $name = trim((string) $raw);
        if ($name === '' || mb_strlen($name) > self::MAX_NAME) {
            throw ValidationException::withMessages(['name' => ['Give the place a name of 1 to ' . self::MAX_NAME . ' characters.']]);
        }

        return $name;
    }

    /** One name per organisation, without case: compared in PHP (SQLite's LOWER() folds ASCII only). */
    private static function assertNameFree(int $orgId, string $name, ?int $except): void
    {
        $wanted = mb_strtolower($name);
        $taken = AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)
            ->when($except !== null, fn ($q) => $q->whereKeyNot($except))
            ->pluck('name')
            ->contains(fn ($other) => mb_strtolower(trim((string) $other)) === $wanted);
        if ($taken) {
            throw new LoyaltyRefused('name_taken', 'Another place already has this name.', 422, ['field' => 'name']);
        }
    }

    private static function admits(mixed $raw): string
    {
        if (!in_array($raw, [AccessPlace::ADMITS_ALL, AccessPlace::ADMITS_TIERS], true)) {
            throw ValidationException::withMessages(['admits' => ['Choose who may enter.']]);
        }

        return $raw;
    }

    private static function description(mixed $raw): ?string
    {
        $text = trim((string) ($raw ?? ''));
        if (mb_strlen($text) > self::MAX_DESCRIPTION) {
            throw ValidationException::withMessages(['description' => ['At most ' . self::MAX_DESCRIPTION . ' characters.']]);
        }

        return $text === '' ? null : $text;
    }

    /**
     * The tiers named, each this organisation's (any other is a field error, never linked), sorted, once each.
     *
     * @param array<int, mixed> $ids
     * @return list<int>
     */
    private static function ownTiers(int $orgId, array $ids): array
    {
        $wanted = array_values(array_unique(array_map('intval', $ids)));
        sort($wanted);
        if ($wanted === []) {
            return [];
        }
        // A deleted tier (release 11) is not one of this programme's.
        $own = LoyaltyTier::withoutGlobalScope(TenantScope::class)->where('organization_id', $orgId)->whereIn('id', $wanted)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (count($own) !== count($wanted)) {
            throw ValidationException::withMessages(['tier_ids' => ['Choose tiers of this programme.']]);
        }

        return $wanted;
    }

    /** @return list<int> */
    private static function tierIdsOf(AccessPlace $place): array
    {
        $ids = DB::table('access_place_tiers')->where('access_place_id', $place->id)->pluck('tier_id')->map(fn ($id) => (int) $id)->all();
        sort($ids);

        return $ids;
    }

    /** @param list<int> $tierIds @return array<string, mixed> */
    private static function snapshot(AccessPlace $place, array $tierIds): array
    {
        return [
            'name'        => (string) $place->name,
            'description' => $place->description,
            'admits'      => (string) $place->admits,
            'tier_ids'    => $tierIds,
            'is_active'   => (bool) $place->is_active,
            'sort_order'  => (int) $place->sort_order,
        ];
    }

    private static function reread(int $orgId, int $id): AccessPlace
    {
        return AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)->with('tiers')->find($id) ?? throw LoyaltyRefused::notFound();
    }

    /** @param array<string, mixed> $old @param array<string, mixed> $new */
    private static function audit(int $orgId, User $by, string $action, AccessPlace $place, array $old, array $new, string $description): void
    {
        AuditLog::create([
            'organization_id' => $orgId,
            'causer_type'     => User::class,
            'causer_id'       => $by->id,
            'action'          => $action,
            'subject_type'    => 'access_place',
            'subject_id'      => (int) $place->id,
            'old_values'      => $old,
            'new_values'      => $new,
            'ip_address'      => request()?->ip(),
            'description'     => $description,
        ]);
    }

    // ─── A retry ───────────────────────────────────────────────────────────

    private static function lockKey(int $orgId): string
    {
        return "loyalty-places:{$orgId}";
    }

    /** Kept per organisation and per kind of change, so one venue's key can never answer another's. */
    private static function replayKey(int $orgId, string $kind, ?string $key): ?string
    {
        return $key !== null && $key !== '' ? "loyalty-places:{$orgId}:{$kind}:" . hash('sha256', $key) : null;
    }

    /** @param array<string, mixed> $data */
    private static function hash(array $data): string
    {
        unset($data['idempotency_key']);
        ksort($data);
        if (isset($data['tier_ids']) && is_array($data['tier_ids'])) {
            $ids = array_map('intval', $data['tier_ids']);
            sort($ids);
            $data['tier_ids'] = $ids;
        }

        return hash('sha256', (string) json_encode($data));
    }

    /** The place a key already made or changed, or null for a new key; the same key with another body is refused. */
    private static function seen(?string $replayKey, string $hash): ?int
    {
        if ($replayKey === null || !is_array($seen = SharedCache::store()->get($replayKey))) {
            return null;
        }
        if (($seen['hash'] ?? null) !== $hash) {
            throw new LoyaltyRefused('key_reused', 'This retry key was used for a different change.', 409);
        }

        return (int) $seen['place_id'];
    }

    private static function keep(?string $replayKey, string $hash, int $placeId): void
    {
        if ($replayKey !== null) {
            SharedCache::store()->put($replayKey, ['hash' => $hash, 'place_id' => $placeId], self::REPLAY_SECONDS);
        }
    }
}
