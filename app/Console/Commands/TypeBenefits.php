<?php

namespace App\Console\Commands;

use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use Illuminate\Console\Command;

/**
 * Turns prose tier-benefit values of two exact shapes — "NN% off …" and
 * "<currency>NN off …" — into the typed fields DiscountService actually
 * computes with (value_type / value_amount / applies_to).
 *
 * `tier_benefits.value` is free-form prose an admin typed ("10% off
 * treatments"). Nothing enforces it: DiscountService::quote() only reads
 * value_amount, so a prose-only row is decorative — it prints on a scan
 * screen but never reduces a bill. This command is a one-time (or
 * re-runnable) conversion pass; LoyaltyPresetService runs the same parser
 * at write time so presets and admins agree on what "typed" means.
 *
 * Dry-run by default — never writes without --apply, and --apply needs
 * --org=<id> or an explicit --all. Never prints or
 * logs anything beyond the tier_benefits rows it is asked to convert (no
 * settings, no secrets).
 */
class TypeBenefits extends Command
{
    protected $signature = 'loyalty:type-benefits {--org= : Only this organisation} {--all : With --apply, write for every organisation} {--apply : Write the typed values}';

    protected $description = 'Type prose tier benefits (NN% off, <currency>NN off) so bookings can apply them';

    public function handle(): int
    {
        // A write across every tenant must be asked for by name: --apply
        // needs --org=<id>, or --all. The dry run stays allowed for all.
        if ($this->option('apply') && !$this->option('org') && !$this->option('all')) {
            $this->error('--apply writes: name one organisation with --org=<id>, or pass --all to type every organisation\'s benefits.');

            return self::FAILURE;
        }

        $rows = TierBenefit::withoutGlobalScopes()
            ->where('value_type', 'text')
            ->whereNotNull('value')
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))
            ->orderBy('id')
            ->get();

        $tierNames = LoyaltyTier::withoutGlobalScopes()
            ->whereIn('id', $rows->pluck('tier_id')->filter()->unique())
            ->pluck('name', 'id');

        $plan = [];
        $left = [];

        foreach ($rows as $tb) {
            $typed = self::parse((string) $tb->value);
            $tierLabel = $tierNames[$tb->tier_id] ?? $tb->tier_id;

            if ($typed) {
                $plan[] = [$tb->id, $tierLabel, $tb->value, $typed['type'], $typed['amount'], $typed['scope']];
            } else {
                $left[] = [$tb->id, $tb->value];
            }
        }

        $this->table(['id', 'tier', 'text', 'type', 'amount', 'scope'], $plan);

        if ($left) {
            $this->line('Left as text:');
            $this->table(['id', 'text'], $left);
        }

        if (!$this->option('apply')) {
            $this->info(count($plan).' benefit(s) would be typed. Run with --apply to write.');

            return self::SUCCESS;
        }

        foreach ($plan as [$id, , , $type, $amount, $scope]) {
            TierBenefit::withoutGlobalScopes()->whereKey($id)->update([
                'value_type' => $type,
                'value_amount' => $amount,
                'applies_to' => $scope,
            ]);
        }

        $this->info(count($plan).' benefit(s) typed.');

        return self::SUCCESS;
    }

    /**
     * @return array{type:string, amount:float, scope:string}|null
     */
    public static function parse(string $text): ?array
    {
        $scope = preg_match('/treatment|service|appointment|class|session|massage|facial/i', $text)
            ? 'services'
            : (preg_match('/night|stay|room/i', $text) ? 'stays' : 'all');

        if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*%\s*off\b/i', $text, $m)) {
            return ['type' => 'percent_discount', 'amount' => (float) $m[1], 'scope' => $scope];
        }

        if (preg_match('/^\s*(?:€|\$|£|EUR|USD|GBP)\s*(\d+(?:\.\d+)?)\s*off\b/i', $text, $m)) {
            return ['type' => 'fixed_amount', 'amount' => (float) $m[1], 'scope' => $scope];
        }

        return null;
    }
}
