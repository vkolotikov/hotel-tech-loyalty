<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Manually unstick a Stripe PaymentIntent. Used when the booking confirm
 * flow 4xx'd / 5xx'd after Stripe authorised the charge, leaving funds
 * held with no reservation behind them. The companion diag command
 * (diag:orphan-stripe-pis) lists those, this one rescues each.
 *
 * Behaviour by PI status:
 *
 *   requires_payment_method
 *   requires_action
 *   requires_confirmation
 *   requires_capture             → paymentIntents.cancel(...)
 *   succeeded   (with --refund-if-captured)
 *                                → refunds.create(...) for the full amount
 *   succeeded   (without flag)   → refuse, hint operator to pass the flag
 *   canceled                     → no-op, exits 0
 *
 * Every action writes an AuditLog row (stripe.cancel_intent or
 * stripe.refund_intent) tagged with the org id so the trail survives
 * even when the request was driven from the CLI.
 *
 * Usage:
 *   php artisan stripe:cancel-pi pi_3Abc... --org-id=12
 *   php artisan stripe:cancel-pi pi_3Abc... --org-id=12 --reason="confirm 400 rescue"
 *   php artisan stripe:cancel-pi pi_3Abc... --org-id=12 --refund-if-captured --reason="captured rescue"
 */
class StripeCancelPi extends Command
{
    protected $signature = 'stripe:cancel-pi
                            {intent_id : Stripe PaymentIntent id (pi_...)}
                            {--org-id= : Organization id (required for per-tenant Stripe key)}
                            {--reason= : Free-text reason captured in the audit log}
                            {--refund-if-captured : Issue a refund when the PI is already succeeded}';

    protected $description = 'Cancel (or refund) a stuck Stripe PaymentIntent.';

    public function handle(StripeService $stripe): int
    {
        $intentId = (string) $this->argument('intent_id');
        $orgId    = (int) $this->option('org-id');
        $reason   = (string) ($this->option('reason') ?? '');
        $refundIfCaptured = (bool) $this->option('refund-if-captured');

        if (!$intentId) {
            $this->error('intent_id argument is required.');
            return self::FAILURE;
        }
        if (!$orgId) {
            $this->error('--org-id=<id> is required so the per-tenant Stripe key resolves correctly.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        app()->instance('current_organization_id', $orgId);

        if (!$stripe->isEnabled()) {
            $this->error("Stripe is not configured for org {$orgId}.");
            return self::FAILURE;
        }

        $client = $this->resolveStripeClient($stripe);
        if (!$client) {
            $this->error('Could not access the underlying StripeClient.');
            return self::FAILURE;
        }

        // Step 1 — retrieve.
        try {
            $pi = $client->paymentIntents->retrieve($intentId, []);
        } catch (\Throwable $e) {
            $this->error('Retrieve failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $status = (string) $pi->status;
        $this->line("PaymentIntent <info>{$intentId}</info> status = <comment>{$status}</comment>, amount = "
            . round(((int) ($pi->amount ?? 0)) / 100, 2) . ' '
            . strtoupper((string) ($pi->currency ?? '')));

        $cancellable = ['requires_payment_method', 'requires_action', 'requires_confirmation', 'requires_capture'];

        // Idempotent no-op: already cancelled.
        if (in_array($status, ['canceled', 'cancelled'], true)) {
            $this->info('Already cancelled. No action taken.');
            $this->prettyPrintPi($pi);
            return self::SUCCESS;
        }

        // Step 2 — branch by status.
        if (in_array($status, $cancellable, true)) {
            try {
                $cancelled = $client->paymentIntents->cancel($intentId, [
                    'cancellation_reason' => 'requested_by_customer',
                ]);
            } catch (\Throwable $e) {
                $this->error('Cancel failed: ' . $e->getMessage());
                $this->auditFailure($orgId, $intentId, 'cancel', $e->getMessage(), $reason);
                return self::FAILURE;
            }

            $this->info('Cancelled. New status: ' . $cancelled->status);
            $this->auditSuccess($orgId, $intentId, 'cancel', [
                'previous_status' => $status,
                'new_status'      => (string) $cancelled->status,
                'amount'          => (int) ($cancelled->amount ?? 0),
                'currency'        => (string) ($cancelled->currency ?? ''),
                'reason'          => $reason,
            ]);
            $this->prettyPrintPi($cancelled);
            return self::SUCCESS;
        }

        if ($status === 'succeeded') {
            if (!$refundIfCaptured) {
                $this->error('PaymentIntent is already succeeded (funds captured). Pass --refund-if-captured to issue a refund.');
                return self::FAILURE;
            }

            try {
                $refund = $client->refunds->create([
                    'payment_intent' => $intentId,
                    'reason'         => 'requested_by_customer',
                ]);
            } catch (\Throwable $e) {
                $this->error('Refund failed: ' . $e->getMessage());
                $this->auditFailure($orgId, $intentId, 'refund', $e->getMessage(), $reason);
                return self::FAILURE;
            }

            $this->info('Refund created: ' . $refund->id . ' (' . $refund->status . ')');
            $this->auditSuccess($orgId, $intentId, 'refund', [
                'refund_id'  => (string) $refund->id,
                'status'     => (string) $refund->status,
                'amount'     => (int) ($refund->amount ?? 0),
                'currency'   => (string) ($refund->currency ?? ''),
                'reason'     => $reason,
            ]);

            // Reload + print final state.
            try {
                $pi = $client->paymentIntents->retrieve($intentId, []);
            } catch (\Throwable) {
                // ignore; the refund itself succeeded
            }
            $this->prettyPrintPi($pi);
            return self::SUCCESS;
        }

        // Unhandled state — processing, in-flight chargeback, etc.
        $this->error("PaymentIntent is in status '{$status}' which this command does not handle. Inspect manually in the Stripe dashboard.");
        return self::FAILURE;
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

    private function prettyPrintPi(object $pi): void
    {
        $this->newLine();
        $this->line('Final PaymentIntent state:');
        $this->table(
            ['Field', 'Value'],
            [
                ['id',                  (string) ($pi->id ?? '')],
                ['status',              (string) ($pi->status ?? '')],
                ['amount',              round(((int) ($pi->amount ?? 0)) / 100, 2) . ' ' . strtoupper((string) ($pi->currency ?? ''))],
                ['amount_received',     round(((int) ($pi->amount_received ?? 0)) / 100, 2)],
                ['cancellation_reason', (string) ($pi->cancellation_reason ?? '')],
                ['created',             $pi->created ? date('c', (int) $pi->created) : ''],
                ['customer',            (string) ($pi->customer ?? '')],
                ['description',         (string) ($pi->description ?? '')],
            ],
        );
    }

    private function auditSuccess(int $orgId, string $piId, string $action, array $payload): void
    {
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'user_id'         => null,
                'action'          => $action === 'cancel' ? 'stripe.cancel_intent' : 'stripe.refund_intent',
                'subject_type'    => 'stripe_payment_intent',
                'subject_id'      => null,
                'new_values'      => array_merge(['payment_intent_id' => $piId], $payload),
                'description'     => "Manual {$action} via stripe:cancel-pi CLI for {$piId}",
            ]);
        } catch (\Throwable $e) {
            $this->warn('Audit-log write failed: ' . $e->getMessage());
        }
    }

    private function auditFailure(int $orgId, string $piId, string $action, string $error, string $reason): void
    {
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'user_id'         => null,
                'action'          => $action === 'cancel' ? 'stripe.cancel_intent_failed' : 'stripe.refund_intent_failed',
                'subject_type'    => 'stripe_payment_intent',
                'subject_id'      => null,
                'new_values'      => [
                    'payment_intent_id' => $piId,
                    'error'             => mb_substr($error, 0, 480),
                    'reason'            => $reason,
                ],
                'description'     => "Manual {$action} attempt FAILED via stripe:cancel-pi CLI for {$piId}",
            ]);
        } catch (\Throwable) {
            // best-effort
        }
    }
}
