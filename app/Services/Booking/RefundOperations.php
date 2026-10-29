<?php

namespace App\Services\Booking;

use App\Services\StripeService;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Stripe\Refund;

/**
 * Durable refund identity. This connection uses the same physical database but never the caller's
 * transaction: a booking rollback cannot forget a request already sent to Stripe. Journal rows have
 * no booking/tenant foreign keys and never lock booking rows. Callers retain row/slot -> pi lock order.
 */
final class RefundOperations
{
    public const CONNECTION = 'refund_journal';
    public const OPEN = ['requesting', 'unknown', 'pending', 'requires_action'];

    public static function connection(): Connection
    {
        if (!config('database.connections.' . self::CONNECTION)) {
            $config = config('database.connections.' . config('database.default'));
            // The journal must always use the writer, including deployments with read replicas.
            $config = array_replace($config, $config['write'] ?? []);
            unset($config['read'], $config['write']);
            config(['database.connections.' . self::CONNECTION => $config]);
        }
        return DB::connection(self::CONNECTION);
    }

    private static function rows(int $orgId, string $pi)
    {
        if ($orgId <= 0 || $pi === '') {
            throw new \LogicException('A refund operation requires an organisation and payment.');
        }
        return self::connection()->table('refund_operations')->where('organization_id', $orgId)->where('payment_intent_id', $pi);
    }

    /** Caller holds its payment lock. The separately committed journal serializes refund identities too. */
    public function request(StripeService $stripe, int $orgId, string $pi, ?float $amount, string $currency, string $kind, int $bookingId, float $refundedBefore, ?string $reason = null): Refund
    {
        self::assertAmount($amount, $currency);
        $op = self::connection()->transaction(function () use ($orgId, $pi, $amount, $currency, $kind, $bookingId, $refundedBefore, $reason) {
            // No DB booking lock is acquired on this connection, ever.
            \App\Support\AdvisoryLock::within('refund-operation:' . $orgId . ':' . $pi, self::connection());
            $rows = self::rows($orgId, $pi)->orderBy('created_at')->lockForUpdate()->get();
            foreach ($rows as $row) {
                // A successful operation whose booking transaction rolled back is replayed, not sent again.
                $unapplied = $row->status === 'succeeded' && $row->applied_at === null
                    && $refundedBefore + 0.004 < (float) $row->refunded_before + (float) $row->amount;
                if (!in_array($row->status, self::OPEN, true) && !$unapplied) continue;
                $same = $row->requested_amount === null ? $amount === null : ($amount !== null && abs((float) $row->requested_amount - $amount) < 0.005);
                if (!$same || $row->booking_kind !== $kind || (int) $row->booking_id !== $bookingId) {
                    throw new RefundNotSettled($row->status === 'unknown' || $row->status === 'requesting' ? 'refund_outcome_unknown' : 'refund_pending');
                }
                return $row;
            }
            $id = (string) Str::uuid();
            self::connection()->table('refund_operations')->insert([
                'id' => $id, 'organization_id' => $orgId, 'payment_intent_id' => $pi,
                'booking_kind' => $kind, 'booking_id' => $bookingId, 'amount' => $amount, 'requested_amount' => $amount,
                'refunded_before' => $refundedBefore, 'currency' => strtoupper($currency),
                'reason' => $reason,
                'status' => 'requesting', 'created_at' => now(), 'updated_at' => now(),
            ]);
            $created = self::rows($orgId, $pi)->where('id', $id)->first();
            $created->newRequest = true;
            return $created;
        });

        try {
            if (!$op->refund_id && !($op->newRequest ?? false) && \Carbon\CarbonImmutable::parse($op->created_at)->lt(now()->subHours(23))) {
                // Stripe may prune an idempotency key after 24h. Recover by authenticated metadata instead of reissuing it.
                $refund = collect(StripeService::underLock(fn () => $stripe->refundsForPaymentIntent($pi)))
                    ->first(fn ($r) => (string) ($r->metadata->refund_operation ?? '') === $op->id);
                if (!$refund) throw new RefundNotSettled('refund_outcome_unknown');
            } elseif ($op->refund_id) {
                $refund = StripeService::underLock(fn () => $stripe->retrieveRefund($op->refund_id));
            } else {
                $refund = StripeService::underLock(fn () => $stripe->refund($pi, $amount, $op->reason, 'refund-operation-' . $op->id, ['refund_operation' => $op->id, 'org_id' => (string) $orgId], $op->currency));
            }
        } catch (\Throwable $e) {
            $definite = ($op->newRequest ?? false) && !$op->refund_id && $e instanceof \Stripe\Exception\ApiErrorException
                && $e->getHttpStatus() >= 400 && $e->getHttpStatus() < 500
                && !in_array($e->getHttpStatus(), [409, 429], true);
            self::rows($orgId, $pi)->where('id', $op->id)->update(['status' => $definite ? 'failed' : 'unknown', 'updated_at' => now()]);
            report($e);
            throw new RefundNotSettled($definite ? 'refund_failed' : 'refund_outcome_unknown', $e);
        }
        $this->observe($orgId, $refund, $op->id);
        $status = self::providerStatus($refund);
        if ($status !== 'succeeded') {
            throw new RefundNotSettled(in_array($status, ['failed', 'canceled'], true) ? 'refund_failed' : ($status === 'unknown' ? 'refund_outcome_unknown' : 'refund_pending'));
        }
        return $refund;
    }

    /** Reject unrepresentable amounts before any provider/operation write; never silently round money. */
    public static function assertAmount(?float $amount, string $currency): void
    {
        if ($amount === null) return;
        if (!is_finite($amount) || $amount <= 0
            || abs(StripeService::fromSmallestUnit(StripeService::smallestUnitOf($amount, $currency), $currency) - $amount) > 0.000001) {
            throw new RefundNotSettled('invalid_amount');
        }
    }

    /** Only call with an authenticated provider response, never the request's own payload. */
    public function observe(int $orgId, Refund $refund, ?string $operationId = null): void
    {
        $id = (string) ($refund->id ?? '');
        if ($id === '') throw new RefundNotSettled('refund_outcome_unknown');
        $operationId ??= (string) ($refund->metadata->refund_operation ?? '');
        $query = self::connection()->table('refund_operations')->where('organization_id', $orgId);
        $query->where(fn ($q) => $q->where('refund_id', $id)->when($operationId !== '', fn ($w) => $w->orWhere('id', $operationId)));
        $op = $query->first();
        if (!$op) return;
        $pi = (string) ($refund->payment_intent ?? '');
        if ($pi !== '' && !hash_equals($op->payment_intent_id, $pi)) throw new \LogicException('Refund payment does not match operation.');
        if (isset($refund->currency) && strtoupper((string) $refund->currency) !== $op->currency) throw new \LogicException('Refund currency does not match operation.');
        $query->update([
            'refund_id' => $id, 'status' => self::providerStatus($refund),
            'amount' => isset($refund->amount) ? StripeService::fromSmallestUnit((int) $refund->amount, $op->currency) : $op->amount,
            'failure_reason' => $refund->failure_reason ?? null, 'updated_at' => now(),
        ]);
    }

    public static function pending(int $orgId, string $pi, ?float $recorded = null): array
    {
        if ($pi === '') return [];
        return self::rows($orgId, $pi)->where(fn ($q) => $q->whereIn('status', self::OPEN)->orWhere(function ($q) use ($recorded) {
            $q->where('status', 'succeeded')->whereNull('applied_at');
            if ($recorded !== null) $q->whereRaw('refunded_before + amount > CAST(? AS NUMERIC)', [$recorded + 0.004]);
        }))->get(['id', 'amount', 'requested_amount', 'booking_id', 'reason', 'status', 'currency'])->map(fn ($r) => (array) $r)->all();
    }

    private static function providerStatus(Refund $refund): string
    {
        $status = (string) ($refund->status ?? 'unknown');
        return in_array($status, ['succeeded', 'pending', 'requires_action', 'failed', 'canceled'], true) ? $status : 'unknown';
    }

    public static function applied(int $orgId, string $refundId): void
    {
        $write = fn () => self::connection()->table('refund_operations')->where('organization_id', $orgId)->where('refund_id', $refundId)->update(['applied_at' => now()]);
        DB::transactionLevel() > 0 ? DB::afterCommit($write) : $write();
    }

    /** Journal a dashboard refund too, so pending money cannot be refunded again from this app. */
    public function observePaymentRefund(int $orgId, Refund $refund, string $pi, string $kind, int $bookingId, string $currency): void
    {
        if ((string) ($refund->payment_intent ?? '') !== $pi || (string) ($refund->id ?? '') === '') {
            throw new \LogicException('Provider refund is for another payment.');
        }
        $id = (string) ($refund->metadata->refund_operation ?? '');
        $known = self::rows($orgId, $pi)->where(fn ($q) => $q->where('refund_id', $refund->id)->when($id !== '', fn ($w) => $w->orWhere('id', $id)))->exists();
        if (!$known) {
            self::connection()->table('refund_operations')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'organization_id' => $orgId, 'payment_intent_id' => $pi,
                'booking_kind' => $kind, 'booking_id' => $bookingId, 'refund_id' => $refund->id,
                'currency' => strtoupper($currency), 'requested_amount' => StripeService::fromSmallestUnit((int) $refund->amount, $currency),
                'status' => 'requesting', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->observe($orgId, $refund);
    }

    public static function statuses(int $orgId, array $ids): array
    {
        if ($ids === []) return [];
        return self::connection()->table('refund_operations')->where('organization_id', $orgId)->whereIn('refund_id', $ids)->pluck('status', 'refund_id')->all();
    }

    public static function targetRoom(int $orgId, string $operationId): ?int
    {
        if ($operationId === '') return null;
        return self::connection()->table('refund_operations')->where('organization_id', $orgId)->where('id', $operationId)->where('booking_kind', 'stay')->value('booking_id');
    }
}
