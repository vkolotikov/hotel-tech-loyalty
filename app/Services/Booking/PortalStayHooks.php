<?php

namespace App\Services\Booking;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Support\AdvisoryLock;

/**
 * What the member portal does inside the engine's transaction when it
 * books a stay (see StayConfirmHooks): before the PMS is asked, the payment
 * is proven unspent and the coupon is taken; once the stay exists, the
 * coupon is given the stay's own reference (couponReference()) and the hold remembers which
 * stay it became — which is what makes a repeated confirm a replay.
 */
final class PortalStayHooks implements StayConfirmHooks
{
    public function __construct(
        private readonly PortalPaymentIntentGuard $guard,
        private readonly MemberPricing $pricing,
        private readonly CouponResolver $coupons,
        private readonly PricingResult $price,
        private readonly int $orgId,
        private readonly int $holdId,
        private readonly string $holdToken,
        private readonly ?string $paymentIntentId,
    ) {}

    /** `used_reference` is 60 characters; a hold token is 48. */
    public static function provisionalReference(string $holdToken): string
    {
        return 'H:' . substr($holdToken, 0, 30);
    }

    /**
     * The coupon's reference once the stay exists: the mirror's own id,
     * which nothing rewrites — unlike `booking_reference`, which the PMS
     * sync and bookings:retry-pms-sync can replace. MemberCancellation
     * releases by it (and, for a stay with no coupon reference in this
     * format, by the legacy booking reference instead).
     */
    public static function couponReference(int $mirrorId): string
    {
        return 'BM:' . $mirrorId;
    }

    /**
     * @throws PaymentAlreadyUsed
     * @throws PaymentMismatch
     * @throws PaymentUnverifiable the intent could not be read under the lock
     * @throws CouponException
     */
    public function beforeReservation(array $payload): void
    {
        if ($this->paymentIntentId !== null) {
            // One PaymentIntent pays for exactly one booking. The engine's
            // room lock serialises two confirms for the SAME room; it does
            // nothing for two confirms that carry the SAME intent for
            // DIFFERENT rooms (or a confirm racing a failed confirm's
            // release of this very intent — see
            // PortalPaymentIntentGuard::release()'s docblock). This lock on
            // the intent itself is what serialises those: confirm against
            // confirm, and confirm against a release/cancel.
            AdvisoryLock::within('pi:' . $this->paymentIntentId);
            $this->guard->assertUnused($this->paymentIntentId, $this->orgId);
            // This request's own verifyStay()/verify() ran BEFORE the lock
            // above was taken — between that check and here, a different
            // request's failed confirm could have cancelled this exact
            // intent. Re-check it fresh, now that nothing else can touch it
            // until this transaction ends.
            $this->guard->assertStillPayable($this->paymentIntentId);
        }

        $this->pricing->consume($this->price, self::provisionalReference($this->holdToken));
    }

    public function afterMirror(BookingMirror $mirror, array $payload): void
    {
        if ($this->price->couponConsumable()) {
            $this->coupons->rereference(
                $this->price->applied,
                self::provisionalReference($this->holdToken),
                self::couponReference((int) $mirror->id),
            );
        }

        $hold = BookingHold::withoutGlobalScopes()->whereKey($this->holdId)->first();
        if ($hold) {
            $hold->payload_json = array_merge($hold->payload_json ?? [], ['mirror_id' => (int) $mirror->id]);
            $hold->save();
        }
    }
}
