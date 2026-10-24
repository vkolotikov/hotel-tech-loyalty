<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Gives every organisation without a default brand one (release 6, spec 2026-10-23 §2 item 1), through
 * Organization::ensureDefaultBrand() — the code the `created` hook runs: its earliest brand that is not deleted is
 * made the default, and an organisation with no brand at all gets one named after it. Before release 6 an
 * organisation created while another was bound (a super admin, a console command) was left without one.
 *
 * Dry run by default: it lists what it would do and writes nothing. `--apply` writes; a second run finds nothing to
 * do. Only default brands: rows left without a brand meanwhile are `brands:heal-orphan-rows`'s.
 *
 *   php artisan brands:ensure-default
 *   php artisan brands:ensure-default --org=<organisation id>
 *   php artisan brands:ensure-default --apply
 *   php artisan brands:ensure-default --org=<organisation id> --apply
 */
class EnsureDefaultBrands extends Command
{
    protected $signature = 'brands:ensure-default
                            {--org= : Only this organisation (its id)}
                            {--apply : Write (without it nothing is written: a dry run)}';

    protected $description = 'Give every organisation without a default brand one (dry run unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $only = $this->option('org');
        if ($only !== null && (!ctype_digit((string) $only) || !Organization::query()->whereKey((int) $only)->exists())) {
            $this->error('No organisation has that id. Usage: php artisan brands:ensure-default [--org=<organisation id>] [--apply]');

            return self::FAILURE;
        }

        $rows = [];
        $query = Organization::query()->orderBy('id')->when($only !== null, fn ($q) => $q->whereKey((int) $only));
        foreach ($query->get() as $org) {
            ['action' => $action, 'brand' => $brand] = $org->ensureDefaultBrand($apply);
            if ($action === 'none') {
                continue;
            }
            $rows[] = [
                $org->id,
                $org->name,
                match ($action) {
                    'promoted' => ($apply ? 'made' : 'would make') . " brand #{$brand->id} '{$brand->name}' the default",
                    default    => ($apply ? "created brand #{$brand->id}" : 'would create brand') . " '{$brand->name}' as the default",
                },
            ];
        }

        if ($rows === []) {
            $this->info($only !== null ? "Organisation {$only} has a default brand. Nothing to do." : 'Every organisation has a default brand. Nothing to do.');

            return self::SUCCESS;
        }

        $this->table(['organisation', 'name', $apply ? 'done' : 'would do'], $rows);
        $this->info($apply
            ? count($rows) . ' organisation(s) given a default brand.'
            : count($rows) . ' organisation(s) without a default brand. Nothing was written; run again with --apply to write.');

        return self::SUCCESS;
    }
}
