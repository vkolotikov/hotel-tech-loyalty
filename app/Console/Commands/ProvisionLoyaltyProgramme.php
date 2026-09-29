<?php

namespace App\Console\Commands;

use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Services\LoyaltyPresetService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Gives a venue that has no membership programme the starter programme of
 * its industry. For venues created while their industry had none (medical,
 * before 2026-09-29) and for any venue whose tiers were never set up.
 *
 * It touches only venues with NO tier row at all — a venue whose tiers were
 * switched inactive on purpose has a paused programme, not none, and this
 * command never deletes or adds to it (LoyaltyPresetService::apply()'s
 * clean-replace path decides on "no member rows", not "no active tier", so
 * a guard of "no active tier" here would delete a paused programme with no
 * members, or write new active tiers beside a paused one that has members).
 * It applies the same preset a new signup of that industry gets, enrols
 * nobody and emails nobody. It reports unless told to --apply, and wants
 * to be told which venues: --org=N or --all.
 */
class ProvisionLoyaltyProgramme extends Command
{
    protected $signature = 'loyalty:provision-programme
                            {--org= : One organization id}
                            {--all : Every organization with no tier row at all}
                            {--apply : Write; without it the command only reports}';

    protected $description = 'Give venues that have no membership programme the starter programme of their industry.';

    public function handle(LoyaltyPresetService $presets): int
    {
        if (!$this->option('org') && !$this->option('all')) {
            $this->error('Name the venues: --org=<id> or --all.');
            return self::FAILURE;
        }
        $apply = (bool) $this->option('apply');
        $done = 0;

        Organization::withoutGlobalScopes()
            ->when($this->option('org'), fn ($q) => $q->whereKey((int) $this->option('org')))
            ->chunkById(200, function ($orgs) use (&$done, $apply, $presets) {
                foreach ($orgs as $org) {
                    $tiers = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id);
                    if ((clone $tiers)->exists()) {
                        // Any tier row at all — active or not — means this
                        // venue already has a programme (possibly paused).
                        // Never touch it: apply()'s clean-replace decides on
                        // member rows, not tier state, so a "no active tier"
                        // guard here could delete a paused programme.
                        if (!(clone $tiers)->where('is_active', true)->exists()) {
                            $this->line("org {$org->id} ({$org->name}): has a paused programme — skipped");
                        }
                        continue;
                    }
                    $industry = (string) $org->resolved_industry;

                    if (!$apply) {
                        $this->line("would give org {$org->id} ({$org->name}) the '{$industry}' programme");
                        $done++;
                        continue;
                    }

                    // The preset's settings and picker stamp are written for
                    // the bound tenant. Bound and restored per organisation
                    // — never left bound onto the next one, even on failure.
                    $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
                    app()->instance('current_organization_id', (int) $org->id);
                    try {
                        $summary = $presets->apply($industry, (int) $org->id);
                        $this->line("org {$org->id} ({$org->name}): '{$industry}' — {$summary['tiers_added']} tier(s), {$summary['benefits_added']} benefit(s), {$summary['rewards_added']} reward(s)");
                        $done++;
                    } catch (\Throwable $e) {
                        // One venue failing must not stop the others.
                        Log::error('loyalty:provision-programme failed for a venue', ['org' => $org->id, 'industry' => $industry, 'error' => $e->getMessage()]);
                        $this->warn("org {$org->id}: {$e->getMessage()}");
                    } finally {
                        if ($prior !== null) {
                            app()->instance('current_organization_id', $prior);
                        } else {
                            app()->forgetInstance('current_organization_id');
                        }
                    }
                }
            });

        $this->info($apply ? "{$done} venue(s) given a programme." : "{$done} venue(s) would be given a programme. Run with --apply to write.");

        return self::SUCCESS;
    }
}
