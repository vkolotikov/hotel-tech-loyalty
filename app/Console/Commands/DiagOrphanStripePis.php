<?php

namespace App\Console\Commands;

use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Walk Stripe's recent PaymentIntents for an org and find ones that have
 * NO matching BookingMirror row — those are the "payment held but no
 * booking confirmed" customer cases (the user hit Confirm, Stripe captured
 * the funds, our /confirm endpoint 4xx'd or 5xx'd, and now there's money
 * sitting on a hold/charge with no reservation behind it).
 *
 * Read-only. Safe on prod. Only hits Stripe's list API + a single mirror
 * lookup per PI. The per-PI rescue command (stripe:cancel-pi) is printed
 * as a copy-paste hint so the operator can immediately unblock the guest.
 *
 * Usage:
 *   php artisan diag:orphan-stripe-pis --org=12
 *   php artisan diag:orphan-stripe-pis --org=12 --hours=72
 *   php artisan diag:orphan-stripe-pis --org=12 --json
 */
class DiagOrphanStripePis extends Command
{
    protected $signature = 'diag:orphan-stripe-pis
                            {--org= : Organization id (required)}
                            {--hours=24 : Look back window in hours}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Find Stripe PaymentIntents with no matching BookingMirror row.';

    public function handle(StripeService $stripe): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $hours = max(1, (int) $this->option('hours'));

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so StripeService::boot() loads THIS org's per-tenant
        // Stripe secret + BookingMirror lookups get auto-scoped correctly.
        app()->instance('current_organization_id', $orgId);

        if (!$stripe->isEnabled()) {
            $this->error("Stripe is not configured / not enabled for org {$orgId}. Check Settings → Integrations.");
            return self::FAILURE;
        }

        // Reflectively reach the underlying \Stripe\StripeClient. The
        // service only exposes high-level helpers (createPaymentIntent /
        // refund / retrieve) — we need paymentIntents->list which it
        // doesn't wrap. Pull the private field via Reflection so we
        // don't have to widen the service surface for one diagnostic.
        $client = $this->resolveStripeClient($stripe);
        if (!$client) {
            $this->error('Could not access the underlying StripeClient.');
            return self::FAILURE;
        }

        $sinceTs = now()->subHours($hours)->timestamp;

        $this->info(sprintf(
            'Listing PaymentIntents for org %d (%s) since %s (%dh window)...',
            $orgId,
            $org->name,
            date('c', $sinceTs),
            $hours,
        ));

        $orphans = [];
        $totalScanned = 0;

        // Walk every page Stripe returns. limit=100 is the API max per call.
        $params = [
            'created' => ['gte' => $sinceTs],
            'limit'   => 100,
        ];

        try {
            $piList = $client->paymentIntents->all($params);
        } catch (\Throwable $e) {
            $this->error('Stripe list failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        foreach ($piList->autoPagingIterator() as $pi) {
            $totalScanned++;

            try {
                $mirror = BookingMirror::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('stripe_payment_intent_id', $pi->id)
                    ->first();
            } catch (\Throwable $e) {
                $mirror = null;
            }

            if ($mirror) {
                continue;
            }

            $orphans[] = [
                'pi_id'         => (string) $pi->id,
                'status'        => (string) $pi->status,
                'amount'        => (int) ($pi->amount ?? 0),
                'amount_major'  => round(((int) ($pi->amount ?? 0)) / 100, 2),
                'currency'      => strtoupper((string) ($pi->currency ?? '')),
                'created_at'    => $pi->created ? date('c', (int) $pi->created) : null,
                'metadata'      => $this->safeMetadata($pi),
                'customer_email' => $this->resolveCustomerEmail($client, $pi),
                'description'   => (string) ($pi->description ?? ''),
                'last_payment_error' => isset($pi->last_payment_error)
                    ? (string) ($pi->last_payment_error->message ?? '')
                    : null,
            ];
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'org_id'        => $orgId,
                'org_name'      => $org->name,
                'hours'         => $hours,
                'scanned'       => $totalScanned,
                'orphan_count'  => count($orphans),
                'orphans'       => $orphans,
                'generated_at'  => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return $orphans ? self::FAILURE : self::SUCCESS;
        }

        $this->newLine();
        $this->info("Scanned {$totalScanned} PaymentIntent(s). Orphan count: " . count($orphans));
        $this->newLine();

        if (empty($orphans)) {
            $this->info('No orphan PaymentIntents found. Every PI maps to a BookingMirror row.');
            return self::SUCCESS;
        }

        $tableRows = [];
        foreach ($orphans as $o) {
            $metaSummary = '';
            $orgIdMeta   = $o['metadata']['org_id'] ?? null;
            $brandIdMeta = $o['metadata']['brand_id'] ?? null;
            if ($orgIdMeta !== null) {
                $metaSummary .= "org={$orgIdMeta}";
            }
            if ($brandIdMeta !== null) {
                $metaSummary .= ($metaSummary ? ' ' : '') . "brand={$brandIdMeta}";
            }
            $tableRows[] = [
                $o['pi_id'],
                $this->colorStatus($o['status']),
                $o['amount_major'] . ' ' . $o['currency'],
                $o['created_at'],
                $metaSummary,
                $o['customer_email'] ?: '—',
            ];
        }

        $this->table(
            ['PI ID', 'Status', 'Amount', 'Created', 'Metadata', 'Customer email'],
            $tableRows,
        );

        $this->newLine();
        $this->warn('Rescue commands (copy-paste-ready):');
        foreach ($orphans as $o) {
            $this->line(sprintf(
                '  php artisan stripe:cancel-pi %s --org-id=%d --reason="confirm 400 rescue"',
                $o['pi_id'],
                $orgId,
            ));
        }

        // Non-zero exit so monitoring can alert on orphan detection.
        return self::FAILURE;
    }

    /**
     * Reflection accessor for the private StripeClient on StripeService.
     * Avoids widening the public surface for a one-off diagnostic.
     */
    private function resolveStripeClient(StripeService $stripe): ?\Stripe\StripeClient
    {
        // Force lazy boot by hitting any public method.
        $stripe->isEnabled();

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

    private function safeMetadata(object $pi): array
    {
        $meta = $pi->metadata ?? null;
        if ($meta === null) {
            return [];
        }
        if (is_object($meta) && method_exists($meta, 'toArray')) {
            return $meta->toArray();
        }
        if (is_object($meta)) {
            return get_object_vars($meta);
        }
        return is_array($meta) ? $meta : [];
    }

    /**
     * Best-effort customer email lookup. Stripe sometimes carries it on the
     * PI itself (when receipt_email was passed) and sometimes only on the
     * attached Customer record. Falls back to "—" when neither is set.
     */
    private function resolveCustomerEmail(\Stripe\StripeClient $client, object $pi): ?string
    {
        if (!empty($pi->receipt_email)) {
            return (string) $pi->receipt_email;
        }
        $customerId = $pi->customer ?? null;
        if (!$customerId) {
            return null;
        }
        try {
            $cust = $client->customers->retrieve((string) $customerId, []);
            return (string) ($cust->email ?? '') ?: null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function colorStatus(string $status): string
    {
        return match ($status) {
            'succeeded'                => "<fg=red>{$status}</>", // money captured, no booking — worst case
            'requires_capture',
            'requires_payment_method',
            'requires_confirmation',
            'requires_action'          => "<fg=yellow>{$status}</>", // recoverable
            'canceled', 'cancelled'    => "<fg=gray>{$status}</>",
            default                    => $status,
        };
    }
}
