<?php

namespace App\Services\Loyalty\Programme;

use App\Models\EarnRateEvent;
use App\Models\LoyaltyTier;
use App\Models\Reward;
use App\Models\SpecialOffer;
use App\Models\User;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\LoyaltyPresetService;

/**
 * What "Ways to earn" and the setup wizard draw (release 7, spec 2026-10-25 §1): the venue's options (ProgrammeOptions)
 * with the cards they make and the rules of each field, how many tiers, offers and boosts it has and the rewards a full
 * stamp card may give, the presets with what each recommends, whether the wizard was done, whether the caller may
 * change any of it, and what ProgrammeAdvice finds (the checks, the ways not used at this venue). Every option list and
 * enum is the server's; the workspace keeps no copy.
 */
final class ProgrammeOverview
{
    public function __construct(private readonly LoyaltyPresetService $presets, private readonly ProgrammeAdvice $advice)
    {
    }

    /** @return array<string, mixed> */
    public function for(int $orgId, User $user): array
    {
        $options = ProgrammeOptions::for($orgId);
        $catalogue = $this->catalogue();
        // Owner 2026-10-26: what does not work together, and the ways that do nothing at this venue (ProgrammeAdvice).
        $checks = $this->advice->for($orgId, $options, array_column($catalogue['rewards'], 'id'));

        return [
            'options'    => $options,
            'ways'       => ProgrammeOptions::ways(),
            'fields'     => ProgrammeOptions::fields(),
            'catalogue'  => $catalogue,
            'presets'    => $this->presets(),
            'setup_done' => $options['programme_setup_completed_at'] !== null,
            'can_change' => LoyaltyAccess::isManager($user),
            'advice'     => $checks['advice'],
            'not_used'   => $checks['not_used'],
        ];
    }

    /**
     * The other parts of the programme, counted as their own pages list them (tenant-scoped, every brand's — the
     * workspace names `brand_id=all`): every tier (the wizard keeps a ladder that has any), the offers and boosts that
     * are switched on (a boost that has ended no longer counts), and the active rewards, cheapest first, for the stamp
     * card's reward picker.
     *
     * @return array{tiers: int, rewards: list<array{id: int, name: string, points_cost: int}>, offers: int, boosts: int}
     */
    public function catalogue(): array
    {
        return [
            'tiers'   => LoyaltyTier::query()->count(),
            'rewards' => Reward::query()->where('is_active', true)->orderBy('points_cost')->orderBy('name')->get(['id', 'name', 'points_cost'])
                ->map(fn (Reward $r) => ['id' => (int) $r->id, 'name' => (string) $r->name, 'points_cost' => (int) $r->points_cost])
                ->values()->all(),
            'offers'  => SpecialOffer::query()->where('is_active', true)->count(),
            'boosts'  => EarnRateEvent::query()->where('is_active', true)->where('ends_at', '>=', now())->count(),
        ];
    }

    /**
     * LoyaltyPresetService's list, the organisation's industry's own first (the rest in their order), each with the
     * options it recommends.
     *
     * @return list<array<string, mixed>>
     */
    public function presets(): array
    {
        $list = $this->presets->listPresets()['presets'];
        usort($list, fn (array $a, array $b) => (int) $b['recommended'] <=> (int) $a['recommended']);

        return array_map(fn (array $p) => $p + ['recommends' => $this->presets->recommendedOptions($p['key'])], $list);
    }
}
