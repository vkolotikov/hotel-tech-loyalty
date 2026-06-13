<?php

namespace App\Enums;

/**
 * Canonical enum of payment_status values stored on `booking_mirror`.
 *
 * Why this exists: prior to this enum, the 10 status values were string
 * literals scattered across 6+ files — BookingAdminController (state
 * machine + 422 guard), BookingRefundService (refund branching),
 * BookingEngineService (confirm path), CapturePendingPaymentIntents
 * (capture-expired flips), BookingPublicController (webhook
 * orphan-recovery), and BookingDetail.tsx on the frontend. A typo or new
 * status value silently missed every other comparison. CLAUDE.md's
 * 'payment_status state machine' call-out was true only at the API write
 * boundary — every other site bypassed validation.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding (state-machine
 * constants split across files).
 *
 * Sweep policy (deliberate):
 *   1. New code MUST use this enum.
 *   2. Existing code can stay on bare literals until a feature/bugfix
 *      touches that file, at which point migrate opportunistically.
 *   3. The TS mirror in `frontend/src/lib/paymentStatus.ts` is the
 *      single source of truth for the frontend union.
 */
enum PaymentStatus: string
{
    /** Open — booking exists but no payment intent yet (channel-managed, manual entry). */
    case Open = 'open';

    /** Pending — Stripe payment intent created, awaiting confirmation. */
    case Pending = 'pending';

    /** Authorized — Stripe held the auth but capture hasn't run yet (manual-capture flow). */
    case Authorized = 'authorized';

    /** Paid — Stripe captured the funds, booking is fully paid. */
    case Paid = 'paid';

    /** Partially refunded — at least one partial refund has been applied. */
    case PartiallyRefunded = 'partially_refunded';

    /** Refunded — full refund applied. Terminal. */
    case Refunded = 'refunded';

    /** Disputed — Stripe dispute opened. Resolves to paid or refunded. */
    case Disputed = 'disputed';

    /** Invoice waiting — corporate invoice issued, awaiting wire/bank transfer. */
    case InvoiceWaiting = 'invoice_waiting';

    /** Channel managed — OTA / external channel handles payment; we never charge. */
    case ChannelManaged = 'channel_managed';

    /** Capture expired — Stripe auth held past the 7-day capture window. */
    case CaptureExpired = 'capture_expired';

    /** Cancelled — auth voided before capture (rescue helper / customer abandoned). */
    case Cancelled = 'cancelled';

    /** Mock — `booking_mock_mode=true` synthetic state for dev/testing. */
    case Mock = 'mock';

    /**
     * Legal next-state transitions per current state. Used by
     * BookingAdminController::updateStatus() to reject 422s on
     * illegal flips (e.g. paid → pending — should use Refund instead).
     *
     * Returns string[] of next-state values. Terminal states return [].
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Open               => [self::Pending->value, self::Authorized->value, self::Paid->value, self::InvoiceWaiting->value, self::ChannelManaged->value],
            self::Pending            => [self::Authorized->value, self::Paid->value, self::Open->value, self::InvoiceWaiting->value, self::ChannelManaged->value, self::Cancelled->value],
            self::Authorized         => [self::Paid->value, self::Cancelled->value, self::CaptureExpired->value],
            self::Paid               => [self::PartiallyRefunded->value, self::Refunded->value, self::Disputed->value],
            self::PartiallyRefunded  => [self::Refunded->value, self::Paid->value, self::Disputed->value],
            self::Refunded           => [],
            self::Disputed           => [self::Paid->value, self::Refunded->value, self::PartiallyRefunded->value],
            self::InvoiceWaiting     => [self::Paid->value, self::Open->value, self::ChannelManaged->value],
            self::ChannelManaged     => [self::Paid->value, self::Open->value, self::Pending->value],
            self::CaptureExpired     => [],
            self::Cancelled          => [],
            self::Mock               => [],
        };
    }

    /** True when this state cannot transition further. */
    public function isTerminal(): bool
    {
        return $this->allowedTransitions() === [];
    }

    /**
     * Try to construct from a possibly-null string. Returns null when
     * the value doesn't match an enum case (legacy rows, mistyped admin
     * input). Callers should treat null as 'unknown — be conservative'.
     */
    public static function tryFromValue(?string $value): ?self
    {
        if ($value === null || $value === '') return null;
        return self::tryFrom($value);
    }
}
