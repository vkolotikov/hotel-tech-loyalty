<?php

namespace App\Console\Commands;

use App\Models\Brand;
use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Give every organisation that has no default brand its default brand.
 *
 * Organization's `created` hook used to write the new organisation's default
 * brand for whichever tenant was bound when it ran (found 2026-10-23; see
 * Brand::createDefaultFor()). An organisation created while another one was
 * bound was therefore left with no default brand: PostgreSQL refused the row
 * on `brands_org_default_unique` and the hook logged a warning
 * ("Organization::booted — default brand creation failed"). This command
 * finds those organisations and, with --apply, gives each one its default.
 *
 * For each organisation with no live (not deleted) default brand:
 *   - it has live brands: the earliest becomes the default, the same choice
 *     brands:heal-orphan-rows makes;
 *   - it has none: Brand::createDefaultFor() creates the default, the same
 *     writer the `created` hook uses. The exception is an organisation whose
 *     widget token some brand row already carries (any organisation's,
 *     deleted or not). That organisation is skipped and the row is named:
 *     its public widget URLs already resolve to that row, and which
 *     organisation the row should serve is a person's decision.
 *
 * Idempotent: an organisation that has a default brand is never touched, so
 * a second run finds nothing to do. Dry run unless --apply. Exits non-zero
 * when an organisation could not be given its default brand.
 *
 * Brand-scoped rows written while an organisation had no default brand carry
 * brand_id NULL; brands:heal-orphan-rows stamps them afterwards.
 *
 * Usage:
 *   php artisan brands:ensure-default
 *   php artisan brands:ensure-default --org=<organisation id>
 *   php artisan brands:ensure-default --apply
 *   php artisan brands:ensure-default --org=<organisation id> --apply
 */
class BrandsEnsureDefault extends Command
{
    protected $signature = 'brands:ensure-default
        {--org= : Organisation id (omit = every organisation)}
        {--apply : Write the changes (default is a dry run)}';

    protected $description = 'Give every organisation that has no default brand its default brand (dry run unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $orgOption = $this->option('org');

        $orgs = Organization::query()->orderBy('id');
        if ($orgOption !== null) {
            if (! ctype_digit((string) $orgOption) || ! Organization::query()->whereKey((int) $orgOption)->exists()) {
                $this->error("No organisation with id {$orgOption}.");
                return self::FAILURE;
            }
            $orgs->whereKey((int) $orgOption);
        }

        $missing = $orgs->whereNotExists(fn ($q) => $q->selectRaw('1')
            ->from('brands')
            ->whereColumn('brands.organization_id', 'organizations.id')
            ->where('brands.is_default', true)
            ->whereNull('brands.deleted_at'))
            ->get();

        $this->info(($apply ? 'APPLY' : 'DRY RUN') . ' — ' . $missing->count() . ' organisation(s) without a default brand.');

        $done = 0;
        $blocked = 0;

        foreach ($missing as $org) {
            $label = "org #{$org->id} ({$org->name})";

            try {
                $outcome = $this->ensure($org, $apply);
            } catch (\Throwable $e) {
                // One organisation failing must not stop the others.
                Log::error('brands:ensure-default failed for an organisation', ['org_id' => $org->id, 'error' => $e->getMessage()]);
                $this->warn("  {$label}: failed — {$e->getMessage()}");
                $blocked++;
                continue;
            }

            if ($outcome['blocked']) {
                $this->warn("  {$label}: {$outcome['line']}");
                $blocked++;
            } else {
                $this->line("  {$label}: {$outcome['line']}");
                $done++;
            }
        }

        $this->newLine();
        $this->info(($apply ? "{$done} organisation(s) given a default brand." : "{$done} organisation(s) would be given a default brand.")
            . ($blocked ? " {$blocked} need a person." : ''));
        if (! $apply && $done > 0) {
            $this->comment('Re-run with --apply to write.');
        }

        return $blocked > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Decide, and with $apply do, what gives this organisation its default
     * brand. Every read is fresh, so a default that appeared since the
     * listing (another run, a person) is left alone.
     *
     * @return array{line: string, blocked: bool}
     */
    private function ensure(Organization $org, bool $apply): array
    {
        if ($existing = $this->defaultBrandOf($org)) {
            return ['line' => "has default brand #{$existing->id} now, left alone", 'blocked' => false];
        }

        $earliest = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->first();

        if ($earliest) {
            if (! $apply) {
                return ['line' => "would make brand #{$earliest->id} '{$earliest->name}' its default", 'blocked' => false];
            }
            $earliest->is_default = true;
            $earliest->save();

            return ['line' => "made brand #{$earliest->id} '{$earliest->name}' its default", 'blocked' => false];
        }

        $holder = $org->widget_token
            ? Brand::withoutGlobalScopes()->where('widget_token', $org->widget_token)->first()
            : null;

        if ($holder) {
            $where = (int) $holder->organization_id === (int) $org->id ? 'this organisation' : "organisation #{$holder->organization_id}";
            $state = $holder->deleted_at ? ', deleted' : '';

            return [
                'line'    => "skipped — its widget token is already carried by brand #{$holder->id} ({$where}{$state}); decide by hand which organisation that brand should serve",
                'blocked' => true,
            ];
        }

        if (! $apply) {
            return ['line' => 'would create its default brand', 'blocked' => false];
        }
        $brand = Brand::createDefaultFor($org);

        return ['line' => "created default brand #{$brand->id} '{$brand->slug}'", 'blocked' => false];
    }

    private function defaultBrandOf(Organization $org): ?Brand
    {
        return Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->whereNull('deleted_at')
            ->first();
    }
}
