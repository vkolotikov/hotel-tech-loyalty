<?php

namespace App\Console\Commands;

use App\Models\Brand;
use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Heal brand_id NULLs on brand-scoped tables for orgs whose default brand
 * either doesn't exist or was soft-deleted at the time the Phase 2
 * backfill / 2026_05_13_180000 heal migration ran.
 *
 * The user-visible symptom: "I created a 2nd brand and now all my old
 * chats / KB items / widget configs are gone from every brand." That
 * happens because BrandScope filters rows by `brand_id = X`. NULL rows
 * pass through when only one brand exists (BrandSwitcher hides, the
 * "all brands" fallback no-ops the scope), but the moment a 2nd brand
 * is created and the SPA pins a specific brand_id, NULL rows are
 * filtered out everywhere.
 *
 * What this command does, per org:
 *   1. Ensure a default brand exists. If no brand exists at all, create
 *      one via the same code path Organization::booted uses. If brands
 *      exist but none is_default, promote the earliest non-deleted one.
 *   2. Backfill brand_id = default_brand_id on every brand-scoped table
 *      where the row's brand_id is NULL.
 *   3. Report what changed.
 *
 * Usage:
 *   php artisan brands:heal-orphan-rows               # all orgs, dry-run
 *   php artisan brands:heal-orphan-rows --org=12      # single org
 *   php artisan brands:heal-orphan-rows --apply       # actually write
 *   php artisan brands:heal-orphan-rows --org=12 --apply
 */
class BrandsHealOrphanRows extends Command
{
    protected $signature = 'brands:heal-orphan-rows
        {--org= : Org id to heal (omit = all orgs)}
        {--apply : Actually write changes (default is dry-run)}';

    protected $description = 'Heal brand_id NULL rows across brand-scoped tables for orgs whose default brand was missing at backfill time';

    private const TABLES = [
        // chatbot / widget / KB
        'chatbot_behavior_configs', 'chatbot_model_configs',
        'knowledge_categories', 'knowledge_items', 'knowledge_documents',
        'chat_widget_configs', 'popup_rules',
        'chat_conversations', 'visitors',
        // booking + property
        'booking_rooms', 'booking_extras', 'booking_submissions',
        'properties', 'venues',
        'services', 'service_categories', 'service_masters',
        'service_extras', 'service_bookings',
        // attribution stamps
        'inquiries', 'reservations', 'points_transactions',
        'special_offers', 'notification_campaigns', 'email_templates',
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $orgFilter = $this->option('org');

        $orgs = Organization::query();
        if ($orgFilter) {
            $orgs->where('id', (int) $orgFilter);
        }
        $orgs = $orgs->get();

        if ($orgs->isEmpty()) {
            $this->error('No matching orgs.');
            return self::FAILURE;
        }

        $this->info(($apply ? 'APPLY' : 'DRY-RUN') . ' — healing ' . $orgs->count() . ' org(s)');
        $this->newLine();

        $totalRowsHealed = 0;
        $orgsHealed = 0;

        foreach ($orgs as $org) {
            $defaultBrand = $this->ensureDefaultBrand($org, $apply);
            if (!$defaultBrand) {
                $this->warn("  org#{$org->id} ({$org->name}) — could not ensure default brand, skipping");
                continue;
            }

            $orgHealedRows = 0;
            $changes = [];
            foreach (self::TABLES as $table) {
                if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'brand_id')) {
                    continue;
                }
                // Count rows that would be touched.
                $count = DB::table($table)
                    ->where('organization_id', $org->id)
                    ->whereNull('brand_id')
                    ->count();
                if ($count === 0) continue;

                if ($apply) {
                    DB::table($table)
                        ->where('organization_id', $org->id)
                        ->whereNull('brand_id')
                        ->update(['brand_id' => $defaultBrand->id]);
                }
                $changes[$table] = $count;
                $orgHealedRows += $count;
            }

            if ($orgHealedRows > 0) {
                $orgsHealed++;
                $totalRowsHealed += $orgHealedRows;
                $this->line("  org#{$org->id} ({$org->name}) — default brand #{$defaultBrand->id} '{$defaultBrand->name}'");
                foreach ($changes as $table => $n) {
                    $this->line("    {$table}: {$n} row(s) " . ($apply ? 'healed' : 'would be healed'));
                }
            }
        }

        $this->newLine();
        $this->info(($apply ? 'Healed ' : 'Would heal ') . "{$totalRowsHealed} row(s) across {$orgsHealed} org(s).");
        if (!$apply) {
            $this->comment('Re-run with --apply to write changes.');
        }
        return self::SUCCESS;
    }

    /**
     * Ensure the org has a default brand. Order of preference:
     *   1. Existing brand with is_default=true (no change needed).
     *   2. Earliest non-deleted brand promoted to is_default.
     *   3. Create one via the same defaults Organization::booted uses.
     */
    private function ensureDefaultBrand(Organization $org, bool $apply): ?Brand
    {
        $default = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->whereNull('deleted_at')
            ->first();
        if ($default) return $default;

        $promote = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->first();

        if ($promote) {
            if ($apply) {
                $promote->is_default = true;
                $promote->save();
                $this->line("    promoted brand #{$promote->id} '{$promote->name}' to is_default");
            } else {
                $this->line("    would promote brand #{$promote->id} '{$promote->name}' to is_default");
            }
            return $promote->fresh();
        }

        // No brand at all — create one.
        if ($apply) {
            $created = Brand::withoutGlobalScopes()->create([
                'organization_id' => $org->id,
                'name'            => $org->name ?: 'Default',
                'slug'            => Str::slug($org->name ?: 'default'),
                'widget_token'    => $org->widget_token ?: Str::random(40),
                'is_default'      => true,
                'is_active'       => true,
            ]);
            $this->line("    created default brand #{$created->id}");
            return $created;
        }

        $this->line("    would create new default brand for org#{$org->id}");
        // Return a stub so dry-run can keep counting hypothetical heals.
        return new Brand(['id' => 0, 'name' => '(would-be-default)', 'organization_id' => $org->id]);
    }
}
