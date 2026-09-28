<?php

namespace App\Services\Booking;

use App\Models\ServiceBooking;
use App\Services\StripeService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Binds a Stripe PaymentIntent to exactly one confirm(). The portal's own
 * paymentIntent() writes org_id, member_id, service_id and start_at into
 * the intent's metadata; this is the one place that checks all four (plus
 * status and amount) before a confirm is allowed to spend it, that never
 * cancels an intent that isn't the caller's own, and that releases a spent
 * intent on a failed confirm so a card hold never outlives the booking
 * attempt.
 */
final class PortalPaymentIntentGuard
{
    public function __construct(private readonly StripeService $stripe)
    {
    }

    /**
     * Retrieve the intent and return it only when every one of status, org,
     * member, service, slot and amount matches. Before throwing on a
     * mismatch, cancels the intent — but ONLY when its own metadata names
     * this organisation AND this member; another member's or
     * organisation's intent is refused and left untouched (a member must
     * never be able to cancel a stranger's payment by guessing its id). A
     * retrieval failure (Stripe error, unknown id) throws without a cancel
     * attempt — there is nothing known about the intent to cancel.
     *
     * @throws PaymentMismatch
     */
    public function verify(string $piId, int $orgId, int $memberId, int $serviceId, \DateTimeInterface $startAt, float $total): mixed
    {
        try {
            $pi = $this->stripe->retrievePaymentIntent($piId);
        } catch (\Throwable) {
            throw new PaymentMismatch();
        }

        $meta = $this->metadata($pi);
        $metaOrg = (int) ($meta['org_id'] ?? 0);
        $metaMember = (int) ($meta['member_id'] ?? 0);
        $owned = $metaOrg === $orgId && $metaMember === $memberId;

        $ok = $owned
            && in_array($this->status($pi), ['succeeded', 'requires_capture'], true)
            && (int) ($meta['service_id'] ?? 0) === $serviceId
            && $this->sameInstant($meta['start_at'] ?? null, $startAt)
            && $this->amountMatches($pi, $total);

        if ($ok) {
            return $pi;
        }

        // $pi is already in hand here — cancel through the same object
        // rather than release()'s own (necessarily fresh) retrieval. But
        // never cancel an intent a real booking already relies on — a
        // member could otherwise void the payment for a booking they
        // already hold by resubmitting its intent id for a different slot.
        if ($owned && !$this->carried($piId, $orgId)) {
            $this->cancel($piId, 'abandoned');
        }
        throw new PaymentMismatch();
    }

    /**
     * Whether the intent's `amount` (Stripe minor units) is exactly $total
     * (major units), converted by StripeService::toSmallestUnit() — the same
     * conversion that created the intent, so a zero-decimal currency (5400
     * yen = amount 5400) matches too. Uses the intent's own currency when it
     * carries one, else the organisation's Stripe currency.
     */
    public function amountMatches(mixed $pi, float $total): bool
    {
        $currency = is_array($pi) ? ($pi['currency'] ?? null) : ($pi->currency ?? null);
        $currency = is_string($currency) && $currency !== '' ? $currency : null;

        return $this->amount($pi) === $this->stripe->toSmallestUnit($total, $currency);
    }

    /**
     * Inside the advisory lock, before the booking row is created: refuse
     * an intent this organisation has already spent on another booking.
     * One PaymentIntent authorises exactly one booking.
     *
     * @throws PaymentAlreadyUsed
     */
    public function assertUnused(string $piId, int $orgId): void
    {
        if ($this->carried($piId, $orgId)) {
            throw new PaymentAlreadyUsed();
        }
    }

    /**
     * Best-effort cancel for a confirm attempt that took (or already held)
     * a payment but did not end in a booking — called on every failing
     * exit once a PaymentIntent has been supplied, whether or not it was
     * ever verified. Only cancels when the intent's own metadata names
     * this organisation and this member, AND no booking in this
     * organisation already carries it — an intent a real booking relies on
     * is never touched here, however this method was reached. A failure
     * (retrieval or cancel) is logged, never swallowed.
     */
    public function release(?string $piId, int $orgId, int $memberId): void
    {
        if ($piId === null || $piId === '') {
            return;
        }

        if ($this->carried($piId, $orgId)) {
            return;
        }

        try {
            $pi = $this->stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
            return;
        }

        $meta = $this->metadata($pi);
        if ((int) ($meta['org_id'] ?? 0) !== $orgId || (int) ($meta['member_id'] ?? 0) !== $memberId) {
            return;
        }

        $this->cancel($piId, 'abandoned');
    }

    /** True when a ServiceBooking of this organisation already carries this PaymentIntent — the one condition under which it must never be cancelled. */
    private function carried(string $piId, int $orgId): bool
    {
        return ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $piId)
            ->exists();
    }

    private function cancel(string $piId, string $reason): void
    {
        try {
            $this->stripe->cancelPaymentIntent($piId, $reason);
        } catch (\Throwable $e) {
            Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
        }
    }

    /** Stripe's metadata values are strings; compares as timestamps, never as strings. */
    private function sameInstant(mixed $raw, \DateTimeInterface $expected): bool
    {
        if (!is_string($raw) || $raw === '') {
            return false;
        }
        try {
            return CarbonImmutable::parse($raw)->getTimestamp() === $expected->getTimestamp();
        } catch (\Throwable) {
            return false;
        }
    }

    /** retrievePaymentIntent() returns a Stripe\PaymentIntent; these three tolerate an array too (test doubles). */
    private function status(mixed $pi): string
    {
        return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? '');
    }

    private function amount(mixed $pi): int
    {
        return is_array($pi) ? (int) ($pi['amount'] ?? 0) : (int) ($pi->amount ?? 0);
    }

    private function metadata(mixed $pi): array
    {
        $m = is_array($pi) ? ($pi['metadata'] ?? []) : ($pi->metadata ?? []);
        return is_array($m) ? $m : (method_exists($m, 'toArray') ? $m->toArray() : (array) $m);
    }
}
