<?php

namespace App\Console\Commands;

use App\Services\Booking\RefundOperations;
use Illuminate\Console\Command;

/** Read-only: no provider calls or booking mutations. */
class InspectRefunds extends Command
{
    protected $signature = 'refunds:inspect {--organization= : Limit to this organisation} {--all : Include terminal operations}';
    protected $description = 'Inspect durable refund operations awaiting provider or booking reconciliation';

    public function handle(): int
    {
        $org = $this->option('organization');
        if ($org !== null && (!ctype_digit((string) $org) || (int) $org < 1)) { $this->error('Use a positive organisation ID.'); return self::FAILURE; }
        $q = RefundOperations::connection()->table('refund_operations')->when($org, fn ($q) => $q->where('organization_id', (int) $org));
        if (!$this->option('all')) $q->where(fn ($q) => $q->whereIn('status', RefundOperations::OPEN)->orWhere(fn ($q) => $q->where('status', 'succeeded')->whereNull('applied_at')));
        $rows = $q->orderBy('created_at')->get();
        $this->table(['Operation', 'Org', 'Payment', 'Booking', 'Amount', 'Currency', 'Status', 'Provider refund', 'Created'], $rows->map(fn ($r) => [$r->id, $r->organization_id, $r->payment_intent_id, $r->booking_kind . ':' . $r->booking_id, $r->amount ?? 'remaining', $r->currency, $r->status, $r->refund_id ?? 'unknown', $r->created_at])->all());
        $this->info($rows->count() . ' operation(s). Read-only; no refunds were requested.');
        return self::SUCCESS;
    }
}
