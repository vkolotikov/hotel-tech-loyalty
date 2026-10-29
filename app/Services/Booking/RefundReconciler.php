<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\BookingRefundService;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;

/** Signed webhooks are a notification to read current provider state, never a trusted cumulative ledger. */
final class RefundReconciler
{
    public function reconcile(int $orgId, string $pi, StripeService $stripe): void
    {
        $service = ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $pi)->first();
        $stay = $service ? null : BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $pi)->first();
        if (!$service && !$stay) return;
        if ($stay) {
            $refunds = [];
            app(BookingRefundService::class)->reconcileProviderRefunds($stay, function () use ($stripe, $orgId, $pi, $stay, &$refunds) {
                [$total, $last, $refunds] = $this->read($stripe, $orgId, $pi, $stay, 'stay');
                return [$total, $last];
            });
            foreach ($refunds as $refund) if ($refund->status === 'succeeded') RefundOperations::applied($orgId, $refund->id);
            return;
        }
        DB::transaction(function () use ($orgId, $pi, $stripe) {
            $b = ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $pi)->lockForUpdate()->firstOrFail();
            AdvisoryLock::within('pi:' . $pi);
            [$total, $last, $refunds] = $this->read($stripe, $orgId, $pi, $b, 'service');
            $old = (float) ($b->refunded_amount ?? 0);
            $gone = round($total + (float) ($b->dispute_lost_amount ?? 0), 2);
            $b->refunded_amount = $gone;
            $b->last_refund_id = $last?->id;
            $b->refunded_at = $gone > 0 ? now() : null;
            foreach ($refunds as $refund) {
                if ($refund->status !== 'succeeded') continue;
                ServiceBookingPayment::withoutGlobalScopes()->firstOrCreate([
                    'organization_id' => $orgId, 'service_booking_id' => $b->id, 'stripe_refund_id' => $refund->id,
                ], ['kind' => 'refund', 'method' => 'online_card', 'amount' => StripeService::fromSmallestUnit((int) $refund->amount, (string) $b->currency), 'currency' => $b->currency, 'note' => 'Refund confirmed by Stripe']);
            }
            // Do not turn an online payment into an unpaid booking when a refund fails later.
            $b->payment_status = $gone > 0 ? ($gone >= (float) $b->total_amount - 0.004 ? 'refunded' : 'partially_refunded') : 'paid';
            $b->payment_status = AppointmentMoney::statusFor(AppointmentMoney::summary($b)) ?? $b->payment_status;
            if (abs($old - $gone) > 0.004) {
                $meta = (array) ($b->meta ?? []);
                $meta['money_version'] = (int) ($meta['money_version'] ?? 0) + 1;
                $b->meta = $meta;
                AuditLog::record('service_booking.refund_reconciled', $b, ['refunded_amount' => $gone], ['refunded_amount' => $old], null, 'Refund status reconciled with Stripe');
            }
            $b->save();
            AppointmentMoney::rememberFullRefund($b);
            foreach ($refunds as $refund) if ($refund->status === 'succeeded') RefundOperations::applied($orgId, $refund->id);
        });
        // Reversal is idempotent; it only runs when all paid money actually went back.
        $fresh = $service->fresh();
        if (AppointmentMoney::summary($fresh)['paid_back'] >= AppointmentMoney::summary($fresh)['paid_in'] && AppointmentMoney::summary($fresh)['paid_in'] > 0) {
            app(\App\Services\Loyalty\BookingPointsService::class)->reverseForServiceBooking($fresh);
        }
    }

    private function read(StripeService $stripe, int $orgId, string $pi, $booking, string $kind): array
    {
        $currency = (string) $booking->currency;
        $refunds = StripeService::underLock(fn () => $stripe->refundsForPaymentIntent($pi));
        $total = 0.0;
        foreach ($refunds as $refund) {
            if (strtoupper((string) $refund->currency) !== strtoupper($currency)) throw new \LogicException('Refund currency does not match booking.');
            app(RefundOperations::class)->observePaymentRefund($orgId, $refund, $pi, $kind, (int) $booking->id, $currency);
            if ($refund->status === 'succeeded') $total += StripeService::fromSmallestUnit((int) $refund->amount, $currency);
        }
        return [round($total, 2), collect($refunds)->where('status', 'succeeded')->sortByDesc('created')->first(), $refunds];
    }
}
