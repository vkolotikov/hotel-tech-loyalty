<?php

namespace App\Services\Loyalty\Programme;

use App\Models\AccessPlace;
use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberSegment;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\AnalyticsService;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Events\EventClock;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\TierHolders;
use App\Support\AdvisoryLock;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Deleting a tier (release 11, owner 2026-10-26: "an option for users to delete or rename tiers and benefits, so they
 * can customise the system for their needs"). The tier leaves every list and ladder (it is soft-deleted) while the
 * history that names it keeps its name. Nothing is left pointing at it in a way that changes who gets what:
 *
 * - its members move to the tier the manager chose (Members\TierHolders: a tier assessment each);
 * - its benefits are taken off it (switched off, as taking one off does);
 * - places and events stop naming it — one that let in only this tier then lets in no tier until staff choose again;
 * - boosts and offers stop naming it, and one that named only this tier is switched off: an empty tier list there
 *   means every tier, so leaving it on would widen it to everyone;
 * - a segment rule loses it where it names other tiers too; a rule naming only this tier is left as it is, because
 *   an empty tier rule would match everyone — the segment is refused (unknown tier) until staff change it.
 *
 * `preview()` reads all of that for the confirm dialog; `remove()` does it under the organisation's tier lock. The
 * last tier switched on is never deleted: members need a tier, and new members a tier to start on.
 */
final class TierRemoval
{
    public function __construct(private readonly TierHolders $holders) {}

    /** @return array<string, mixed> */
    public function preview(LoyaltyTier $tier): array
    {
        $orgId = (int) $tier->organization_id;
        $targets = self::targets($tier);

        return [
            'tier'         => ['id' => (int) $tier->id, 'name' => (string) $tier->name],
            // Counted as the tier's card counts them (switched on); the switched-off ones move too, said apart.
            'members'      => LoyaltyMember::query()->where('tier_id', $tier->id)->where('is_active', true)->count(),
            'members_off'  => LoyaltyMember::query()->where('tier_id', $tier->id)->where('is_active', false)->count(),
            'blocked'      => $targets->isEmpty() ? 'last_tier' : null,
            'move_to'      => self::suggested($tier, $targets)?->id,
            'move_options' => $targets->map(fn (LoyaltyTier $t) => ['id' => (int) $t->id, 'name' => (string) $t->name])->values()->all(),
            'benefits'     => TierBenefit::query()->where('tier_id', $tier->id)->where('is_active', true)->whereHas('benefit')->count(),
            'places'       => self::doors(AccessPlace::query()->where('admits', 'tiers')->with('tiers')->orderBy('name')->get(), $tier, 'name'),
            'events'       => self::doors(self::comingEvents($orgId), $tier, 'title'),
            'boosts'       => self::listed(self::everyBrand(EarnRateEvent::class)->where('is_active', true)->orderBy('name')->get(), $tier, 'name'),
            'offers'       => self::listed(self::everyBrand(SpecialOffer::class)->where('is_active', true)->orderBy('title')->get(), $tier, 'title'),
            'segments'     => self::segments($tier),
        ];
    }

    /** @return array{members: int, places: int, events: int, boosts_off: int, offers_off: int} What it changed. */
    public function remove(LoyaltyTier $tier, ?int $moveTo, User $by): array
    {
        $orgId = (int) $tier->organization_id;

        $done = AdvisoryLock::transaction("tiers:{$orgId}", function () use ($orgId, $tier, $moveTo, $by) {
            $locked = LoyaltyTier::query()->whereKey($tier->id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            $targets = self::targets($locked);
            if ($targets->isEmpty()) {
                throw new LoyaltyRefused('last_tier', 'Keep at least one tier switched on: members need a tier.', 409);
            }
            $members = LoyaltyMember::query()->where('tier_id', $locked->id)->count();
            $to = $moveTo !== null ? $targets->firstWhere('id', $moveTo) : null;
            if ($moveTo !== null && $to === null) {
                throw new LoyaltyRefused('move_to_unknown', 'Choose one of the other tiers switched on.', 422);
            }
            if ($members > 0 && $to === null) {
                throw new LoyaltyRefused('move_to_required', 'Choose the tier its members move to.', 422);
            }

            $before = $locked->only(['name', 'min_points', 'min_visits', 'min_spend', 'earn_rate', 'is_active']);
            // Gone from every ladder first, so no review that starts now picks it; then nobody holds it.
            $locked->delete();
            $moved = $to ? $this->holders->moveAll($locked, $to, $by) : 0;

            TierBenefit::query()->where('tier_id', $locked->id)->where('is_active', true)->update(['is_active' => false]);
            $places = DB::table('access_place_tiers')->where('tier_id', $locked->id)->delete();
            $events = DB::table('loyalty_event_tiers')->where('tier_id', $locked->id)->delete();
            $boostsOff = self::strip(self::everyBrand(EarnRateEvent::class)->get(), $locked);
            $offersOff = self::strip(self::everyBrand(SpecialOffer::class)->get(), $locked);
            foreach (MemberSegment::query()->get() as $segment) {
                $definition = self::withoutTier((array) $segment->definition, (int) $locked->id);
                if ($definition !== $segment->definition) {
                    $segment->forceFill(['definition' => $definition])->save();
                }
            }

            $summary = ['members' => $moved, 'places' => $places, 'events' => $events, 'boosts_off' => $boostsOff, 'offers_off' => $offersOff];
            AuditLog::record('tier_deleted', $locked, $summary + ['moved_to' => $to?->name], $before, $by,
                "Tier '{$locked->name}' deleted" . ($to ? "; {$moved} members moved to '{$to->name}'" : ''));

            return ['summary' => $summary, 'to' => $to];
        });

        // A review that read the ladder before the delete was committed may still have put a member on it.
        if ($done['to'] !== null) {
            $done['summary']['members'] += $this->holders->moveAll(LoyaltyTier::withTrashed()->findOrFail($tier->id), $done['to'], $by);
        }
        LoyaltyTier::flushCacheFor($orgId);
        AnalyticsService::clearDashboardCache();

        return $done['summary'];
    }

    // ─── What it touches ───────────────────────────────────────────────────

    /** The tiers its members may move to: the others switched on, in the ladder's order. */
    private static function targets(LoyaltyTier $tier): Collection
    {
        return AccessDecision::ladder(LoyaltyTier::query()->where('is_active', true)->whereKeyNot($tier->id)->get());
    }

    /** The nearest tier below it that members can earn, else the nearest above, else the first switched on. */
    private static function suggested(LoyaltyTier $tier, Collection $targets): ?LoyaltyTier
    {
        $ladder = AccessDecision::ladder($targets->concat([$tier]));
        $at = $ladder->search(fn (LoyaltyTier $t) => (int) $t->id === (int) $tier->id);
        $open = fn (LoyaltyTier $t) => (int) $t->id !== (int) $tier->id && !($t->invitation_only ?? false);
        $below = $ladder->slice(0, $at)->reverse()->first($open);

        return $below ?? $ladder->slice($at + 1)->first($open) ?? $ladder->first(fn (LoyaltyTier $t) => (int) $t->id !== (int) $tier->id);
    }

    /**
     * Every brand's rows of a brand-scoped model: a tier is the whole organisation's, whichever brand the request names.
     *
     * @param class-string<EarnRateEvent|SpecialOffer> $model
     */
    private static function everyBrand(string $model): \Illuminate\Database\Eloquent\Builder
    {
        return $model::query()->withoutGlobalScope(BrandScope::class);
    }

    /** Events not over and not called off. */
    private static function comingEvents(int $orgId): Collection
    {
        $now = EventClock::now($orgId);

        return LoyaltyEvent::query()->where('admits', 'tiers')->where('status', '!=', EventClock::CANCELLED)->with('tiers')
            ->orderBy('starts_at')->get()->reject(fn (LoyaltyEvent $e) => EventClock::hasEnded($e, $now))->values();
    }

    /**
     * Places or events that let this tier in, and whether it is the only one they do.
     *
     * @return list<array{id: int, name: string, only: bool}>
     */
    private static function doors(Collection $doors, LoyaltyTier $tier, string $label): array
    {
        return $doors->filter(fn ($d) => $d->tiers->contains('id', $tier->id))
            ->map(fn ($d) => ['id' => (int) $d->id, 'name' => (string) $d->{$label}, 'only' => $d->tiers->count() === 1])
            ->values()->all();
    }

    /**
     * Boosts or offers that name this tier, and whether it is the only one (then they are switched off).
     *
     * @return list<array{id: int, name: string, only: bool}>
     */
    private static function listed(Collection $rows, LoyaltyTier $tier, string $label): array
    {
        return $rows->filter(fn ($r) => in_array((int) $tier->id, self::ids($r->tier_ids), true))
            ->map(fn ($r) => ['id' => (int) $r->id, 'name' => (string) $r->{$label}, 'only' => self::ids($r->tier_ids) === [(int) $tier->id]])
            ->values()->all();
    }

    /** @return list<array{id: int, name: string, only: bool}> Segments with a tier rule that names it. */
    private static function segments(LoyaltyTier $tier): array
    {
        $out = [];
        foreach (MemberSegment::query()->orderBy('name')->get() as $segment) {
            $rules = array_filter((array) (($segment->definition ?? [])['filters'] ?? []), fn ($f) => is_array($f) && self::namesTier($f, (int) $tier->id));
            if ($rules !== []) {
                $out[] = ['id' => (int) $segment->id, 'name' => (string) $segment->name,
                    'only' => array_filter($rules, fn ($f) => self::ids($f['value'] ?? []) === [(int) $tier->id]) !== []];
            }
        }

        return $out;
    }

    // ─── Writing ───────────────────────────────────────────────────────────

    /** Take the tier off each row's `tier_ids`; one left with none is switched off (none means every tier). */
    private static function strip(Collection $rows, LoyaltyTier $tier): int
    {
        $off = 0;
        foreach ($rows as $row) {
            $ids = self::ids($row->tier_ids);
            if (!in_array((int) $tier->id, $ids, true)) {
                continue;
            }
            $left = array_values(array_diff($ids, [(int) $tier->id]));
            if ($left === []) {
                $off += $row->is_active ? 1 : 0;
                $row->forceFill(['tier_ids' => null, 'is_active' => false])->save();
            } else {
                $row->forceFill(['tier_ids' => $left])->save();
            }
        }

        return $off;
    }

    /** The definition with the tier taken out of every tier rule that names others too. */
    private static function withoutTier(array $definition, int $tierId): array
    {
        if (!isset($definition['filters']) || !is_array($definition['filters'])) {
            return $definition;
        }
        $definition['filters'] = array_map(function ($f) use ($tierId) {
            if (!is_array($f) || !self::namesTier($f, $tierId)) {
                return $f;
            }
            $left = array_values(array_diff(self::ids($f['value'] ?? []), [$tierId]));

            return $left === [] ? $f : ['value' => $left] + $f;
        }, $definition['filters']);

        return $definition;
    }

    private static function namesTier(array $filter, int $tierId): bool
    {
        return ($filter['type'] ?? null) === 'tier' && in_array($tierId, self::ids($filter['value'] ?? []), true);
    }

    /** @return list<int> */
    private static function ids(mixed $value): array
    {
        return array_values(array_map('intval', array_filter((array) ($value ?? []), fn ($v) => is_numeric($v))));
    }
}
