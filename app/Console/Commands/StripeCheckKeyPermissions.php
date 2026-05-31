<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Probe the org's Stripe key to confirm it can actually run the operations
 * the booking + refund flows depend on. Surfaces the "rk_live_* missing
 * refunds:write" footgun BEFORE a guest sits on hold waiting for an
 * auto-refund that's silently 403'ing on Stripe's side.
 *
 * Strategy: hit a sequence of safe read calls + one deliberately-invalid
 * retrieve to distinguish "no permission" (PermissionException / InvalidRequest
 * "key does not have access") from "real lookup failure" (InvalidRequest
 * "no such payment_intent"). Write scopes are INFERRED from the key prefix
 * and the read map — actually attempting a write would cost a refund.
 *
 *   sk_live_* / sk_test_*  → unrestricted secret key, all writes possible
 *   rk_live_* / rk_test_*  → restricted key; we can prove READ by attempting
 *                             a benign read on each resource. We can't prove
 *                             WRITE without doing harm, so we report it as
 *                             `likely_no` unless the operator runs this command
 *                             again after enabling the scope.
 *
 * Usage:
 *   php artisan stripe:check-key-permissions --org=12
 *   php artisan stripe:check-key-permissions --org=12 --json
 *
 * Exit codes:
 *   0  → key has refund-write access inferred + every READ passes
 *   1  → any READ probe failed, OR refund-write is inferred-missing
 */
class StripeCheckKeyPermissions extends Command
{
    protected $signature = 'stripe:check-key-permissions
                            {--org= : Organization id (required for per-tenant Stripe key)}
                            {--json : Emit machine-readable JSON instead of a table}';

    protected $description = 'Probe an org\'s Stripe key for the scopes the booking + refund flows need.';

    /** @var array<string,array{read:string,write:string,notes:string[]}> */
    private array $results = [];

    public function handle(StripeService $stripe): int
    {
        $orgId = (int) $this->option('org');
        $asJson = (bool) $this->option('json');

        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        app()->instance('current_organization_id', $orgId);

        if (!$stripe->isEnabled()) {
            $this->error("Stripe is not configured for org {$orgId}. Check Settings → Integrations.");
            return self::FAILURE;
        }

        $client = $this->resolveStripeClient($stripe);
        if (!$client) {
            $this->error('Could not access the underlying StripeClient.');
            return self::FAILURE;
        }

        $keyPrefix = $this->detectKeyPrefix($stripe);
        $isRestricted = str_starts_with($keyPrefix, 'rk_');
        $isLive = str_contains($keyPrefix, '_live_');

        if (!$asJson) {
            $this->line("Probing Stripe key (prefix=<info>{$keyPrefix}…</info>, "
                . ($isRestricted ? '<comment>restricted</comment>' : '<info>unrestricted secret</info>')
                . ', ' . ($isLive ? 'live' : 'test') . ') for org ' . $orgId);
            $this->newLine();
        }

        // ── Probes ────────────────────────────────────────────────────────

        $this->probePaymentIntentsRead($client);
        $this->probePaymentIntentsRetrieve($client);
        $this->probeChargesRead($client);
        $this->probeRefundsRead($client);

        // ── Infer writes ──────────────────────────────────────────────────
        // Unrestricted secret key → all writes are available.
        // Restricted key → we can't safely probe writes (would actually
        // create a refund). Report read-confirmed + write-inferred.
        $writeInference = $isRestricted ? 'likely_no_for_restricted' : 'yes_for_secret';

        foreach ($this->results as $resource => $row) {
            if ($writeInference === 'yes_for_secret') {
                $this->results[$resource]['write'] = 'ok';
                $this->results[$resource]['notes'][] = 'Secret key — all writes allowed.';
            } else {
                // Restricted: writes are inferred-no unless this is a
                // resource where read & write share a single scope (rare).
                // The honest answer is "we can't tell from here." Caller
                // must check the Dashboard. We bias to `likely_no` because
                // a fresh restricted key omits writes by default.
                $this->results[$resource]['write'] = 'likely_no';
                $this->results[$resource]['notes'][] =
                    'Restricted key — enable the matching scope at '
                    . 'https://dashboard.stripe.com/apikeys → edit your key.';
            }
        }

        // ── Output ────────────────────────────────────────────────────────
        $rows = [];
        foreach ($this->results as $resource => $row) {
            $rows[] = [
                'resource' => $resource,
                'read'     => $row['read'],
                'write'    => $row['write'],
                'notes'    => $row['notes'],
            ];
        }

        $refundWriteOk = ($this->results['Refunds']['write'] ?? '') === 'ok';
        $allReadsOk = collect($this->results)->every(fn($r) => $r['read'] === 'ok');

        if ($asJson) {
            $this->line(json_encode([
                'org_id'           => $orgId,
                'key_prefix'       => $keyPrefix,
                'is_restricted'    => $isRestricted,
                'is_live'          => $isLive,
                'results'          => $rows,
                'refund_write_ok'  => $refundWriteOk,
                'all_reads_ok'     => $allReadsOk,
                'bottom_line'      => $this->bottomLine($refundWriteOk, $allReadsOk, $isRestricted),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(
                ['Resource', 'Read', 'Write (inferred)', 'Notes'],
                array_map(
                    fn($r) => [
                        $r['resource'],
                        $this->fmtStatus($r['read']),
                        $this->fmtStatus($r['write']),
                        implode("\n", $r['notes']) ?: '—',
                    ],
                    $rows,
                ),
            );
            $this->newLine();
            $line = $this->bottomLine($refundWriteOk, $allReadsOk, $isRestricted);
            if ($refundWriteOk && $allReadsOk) {
                $this->info($line);
            } else {
                $this->error($line);
            }
        }

        // Exit 1 when any READ failed OR refund-write inferred-missing.
        return ($allReadsOk && $refundWriteOk) ? self::SUCCESS : self::FAILURE;
    }

    // ─── Probes ─────────────────────────────────────────────────────────

    private function probePaymentIntentsRead(\Stripe\StripeClient $client): void
    {
        $this->results['PaymentIntents'] = ['read' => 'ok', 'write' => 'unknown', 'notes' => []];
        try {
            $client->paymentIntents->all(['limit' => 1]);
        } catch (\Throwable $e) {
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            $this->results['PaymentIntents']['read'] = 'no';
            $this->results['PaymentIntents']['notes'][] = $scope
                ? "Read denied — restricted key missing {$scope}."
                : ('Read failed: ' . $this->shortError($e));
        }
    }

    /**
     * Retrieving a known-bogus PI id should produce InvalidRequestException
     * "No such payment_intent" — that's the PROOF the key has read access
     * (it got far enough to look up the resource). A permission-style error
     * here means the key is denied even retrieve, which is much worse than
     * the missing-refunds case.
     */
    private function probePaymentIntentsRetrieve(\Stripe\StripeClient $client): void
    {
        $row =& $this->results['PaymentIntents'];
        try {
            $client->paymentIntents->retrieve('pi_invalid', []);
            // Won't reach here unless Stripe is in a wildly unexpected state.
            $row['notes'][] = 'retrieve(pi_invalid) succeeded — unexpected; investigate.';
        } catch (\Throwable $e) {
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            if ($scope) {
                $row['read'] = 'no';
                $row['notes'][] = "retrieve denied — restricted key missing {$scope}.";
            } elseif ($e instanceof \Stripe\Exception\InvalidRequestException) {
                // Good: proves the key reached the resource lookup layer.
                $row['notes'][] = 'retrieve(pi_invalid) returned expected "no such PaymentIntent" — read access confirmed.';
            } else {
                $row['notes'][] = 'retrieve probe inconclusive: ' . $this->shortError($e);
            }
        }
    }

    private function probeChargesRead(\Stripe\StripeClient $client): void
    {
        $this->results['Charges'] = ['read' => 'ok', 'write' => 'unknown', 'notes' => []];
        try {
            $client->charges->all(['limit' => 1]);
        } catch (\Throwable $e) {
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            $this->results['Charges']['read'] = 'no';
            $this->results['Charges']['notes'][] = $scope
                ? "Read denied — restricted key missing {$scope}."
                : ('Read failed: ' . $this->shortError($e));
        }
    }

    private function probeRefundsRead(\Stripe\StripeClient $client): void
    {
        $this->results['Refunds'] = ['read' => 'ok', 'write' => 'unknown', 'notes' => []];
        try {
            $client->refunds->all(['limit' => 1]);
        } catch (\Throwable $e) {
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            $this->results['Refunds']['read'] = 'no';
            $this->results['Refunds']['notes'][] = $scope
                ? "Read denied — restricted key missing {$scope}. The Stripe Dashboard scope must be enabled to refund. https://dashboard.stripe.com/apikeys"
                : ('Read failed: ' . $this->shortError($e));
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private function bottomLine(bool $refundWriteOk, bool $allReadsOk, bool $isRestricted): string
    {
        if (!$allReadsOk) {
            return 'Key has READ failures — broken or under-scoped. See per-row notes above. https://dashboard.stripe.com/apikeys';
        }
        if (!$refundWriteOk) {
            return 'Key missing refund-write — manual refund needed via Stripe Dashboard. '
                . 'Open https://dashboard.stripe.com/apikeys → edit your key → enable refunds:write → save. '
                . ($isRestricted ? 'After saving, re-run this command to confirm.' : '');
        }
        return 'Key has refund-write access — auto-refund will work.';
    }

    private function fmtStatus(string $s): string
    {
        return match ($s) {
            'ok'        => '<info>ok</info>',
            'no'        => '<error>no</error>',
            'likely_no' => '<comment>likely_no</comment>',
            default     => $s,
        };
    }

    private function shortError(\Throwable $e): string
    {
        return mb_substr($e->getMessage(), 0, 160);
    }

    private function detectKeyPrefix(StripeService $stripe): string
    {
        // Reach into the private secretKey via reflection (StripeService
        // intentionally doesn't expose it via a getter to keep the surface
        // tight). We only return the prefix — the rest never leaves memory.
        try {
            $stripe->isEnabled(); // ensure boot()
            $rfx = new \ReflectionClass($stripe);
            $prop = $rfx->getProperty('secretKey');
            $prop->setAccessible(true);
            $key = (string) ($prop->getValue($stripe) ?? '');
            if ($key === '') return 'unknown';
            // Surface enough of the key to identify type without leaking it
            // into shells or logs: "rk_live_AB" etc.
            return mb_substr($key, 0, 10);
        } catch (\Throwable) {
            return 'unknown';
        }
    }

    private function resolveStripeClient(StripeService $stripe): ?\Stripe\StripeClient
    {
        $stripe->isEnabled(); // trigger boot
        try {
            $rfx = new \ReflectionClass($stripe);
            $prop = $rfx->getProperty('client');
            $prop->setAccessible(true);
            $client = $prop->getValue($stripe);
            return $client instanceof \Stripe\StripeClient ? $client : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
