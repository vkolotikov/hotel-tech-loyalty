<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Reconciles local `organizations` against the SaaS platform so that
 * when a company is deleted in SaaS, its orphaned copy in loyalty is
 * archived (marked via `saas_deleted_at`). Archived orgs are hidden
 * from tenant lookups but preserved on disk in case the deletion
 * needs to be reversed.
 *
 * Scheduled daily at 03:30 — see routes/console.php. Safe to run
 * manually: `php artisan saas:reconcile-orgs`.
 */
class ReconcileSaasOrgs extends Command
{
    protected $signature = 'saas:reconcile-orgs
        {--dry-run : Report what would change without writing to the DB}
        {--chunk=200 : How many saas_org_ids to check per HTTP call}';

    protected $description = 'Archive local organizations whose SaaS company no longer exists';

    public function handle(): int
    {
        $apiBase = rtrim((string) config('services.saas.api_url'), '/');
        $secret  = (string) config('services.saas.jwt_secret');

        if (!$apiBase || !$secret) {
            $this->error('SAAS_API_URL or SAAS_JWT_SECRET not configured — aborting.');
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $chunk  = max(1, min(500, (int) $this->option('chunk')));

        // Only consider orgs linked to a SaaS company. Orgs with no saas_org_id
        // are standalone and out of scope for this reconciliation.
        $total = Organization::query()
            ->whereNotNull('saas_org_id')
            ->whereNull('saas_deleted_at')
            ->count();

        if ($total === 0) {
            $this->info('No active SaaS-linked organizations to check.');
            return self::SUCCESS;
        }

        $this->info("Checking {$total} org(s) against {$apiBase} in chunks of {$chunk}…");

        $archived = 0;
        $checked  = 0;
        $errored  = 0;

        Organization::query()
            ->whereNotNull('saas_org_id')
            ->whereNull('saas_deleted_at')
            ->orderBy('id')
            ->chunkById($chunk, function ($orgs) use ($apiBase, $secret, $dryRun, &$archived, &$checked, &$errored) {
                $ids = $orgs->pluck('saas_org_id')->filter()->values()->all();
                if (empty($ids)) return;

                $body = json_encode(['ids' => $ids]);
                $sig  = hash_hmac('sha256', $body, $secret);

                try {
                    $resp = Http::timeout(15)
                        ->withHeaders([
                            'Content-Type' => 'application/json',
                            'X-Signature'  => $sig,
                        ])
                        ->send('POST', $apiBase . '/internal/orgs-exist', ['body' => $body]);
                } catch (\Throwable $e) {
                    $this->error('HTTP call failed: ' . $e->getMessage());
                    $errored += count($ids);
                    return;
                }

                if (!$resp->successful()) {
                    $this->error('SaaS returned ' . $resp->status() . ': ' . $resp->body());
                    $errored += count($ids);
                    return;
                }

                $existing = collect($resp->json('existing', []))->flip();
                $missing  = collect($ids)->reject(fn ($id) => $existing->has($id))->values();

                $checked += count($ids);

                foreach ($orgs as $org) {
                    if (!$missing->contains($org->saas_org_id)) continue;

                    $this->line(sprintf(
                        '  %s archive id=%d "%s" (saas_org_id=%s)',
                        $dryRun ? '[dry-run]' : '→',
                        $org->id,
                        $org->name,
                        $org->saas_org_id,
                    ));

                    if (!$dryRun) {
                        $org->update(['saas_deleted_at' => now()]);
                    }
                    $archived++;
                }
            });

        $this->info(sprintf(
            'Done. checked=%d archived=%d errors=%d%s',
            $checked,
            $archived,
            $errored,
            $dryRun ? ' (dry-run — no writes)' : '',
        ));

        return $errored > 0 ? self::FAILURE : self::SUCCESS;
    }
}
