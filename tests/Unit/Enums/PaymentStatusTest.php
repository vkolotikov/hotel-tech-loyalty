<?php

namespace Tests\Unit\Enums;

use App\Enums\PaymentStatus;
use PHPUnit\Framework\TestCase;

/**
 * Locks in the payment_status state machine. Pre-fix, this was a
 * private const map inside BookingAdminController + 30+ string-literal
 * sites scattered across the booking files. The audit's #1 maintain-
 * ability finding called out the drift risk. These tests make the
 * transition table a first-class invariant.
 *
 * Doesn't touch the database — pure enum semantics. Runs in
 * milliseconds and is the canonical foundation for the wider test
 * suite buildup. See AUDIT-2026-06-13.md + ADDENDUM testing findings.
 */
class PaymentStatusTest extends TestCase
{
    public function test_terminal_states_have_no_transitions(): void
    {
        $this->assertSame([], PaymentStatus::Refunded->allowedTransitions());
        $this->assertSame([], PaymentStatus::CaptureExpired->allowedTransitions());
        $this->assertSame([], PaymentStatus::Cancelled->allowedTransitions());
        $this->assertSame([], PaymentStatus::Mock->allowedTransitions());

        $this->assertTrue(PaymentStatus::Refunded->isTerminal());
        $this->assertTrue(PaymentStatus::CaptureExpired->isTerminal());
        $this->assertTrue(PaymentStatus::Cancelled->isTerminal());
        $this->assertTrue(PaymentStatus::Mock->isTerminal());
    }

    public function test_paid_cannot_revert_to_pending(): void
    {
        // The forbidden transition CLAUDE.md explicitly calls out — a
        // paid booking becoming pending would erase the audit trail.
        // Staff are supposed to issue a refund instead.
        $allowed = PaymentStatus::Paid->allowedTransitions();
        $this->assertNotContains('pending', $allowed);
        $this->assertNotContains('open', $allowed);
        $this->assertContains('refunded', $allowed);
        $this->assertContains('partially_refunded', $allowed);
        $this->assertContains('disputed', $allowed);
    }

    public function test_authorized_can_capture_cancel_or_expire(): void
    {
        // The Stripe manual-capture safety net depends on this transition
        // set staying intact. Drop any of these and the safety net silently
        // breaks. See CLAUDE.md "Stripe manual capture is now the default".
        $allowed = PaymentStatus::Authorized->allowedTransitions();
        $this->assertContains('paid', $allowed);            // capture path
        $this->assertContains('cancelled', $allowed);       // rescue path
        $this->assertContains('capture_expired', $allowed); // 7-day expiry
    }

    public function test_open_can_reach_authorized_or_paid(): void
    {
        $allowed = PaymentStatus::Open->allowedTransitions();
        $this->assertContains('authorized', $allowed);
        $this->assertContains('paid', $allowed);
        $this->assertContains('invoice_waiting', $allowed);
        $this->assertContains('channel_managed', $allowed);
    }

    public function test_disputed_can_resolve_either_way(): void
    {
        $allowed = PaymentStatus::Disputed->allowedTransitions();
        $this->assertContains('paid', $allowed);           // dispute won
        $this->assertContains('refunded', $allowed);       // dispute lost
        $this->assertContains('partially_refunded', $allowed);
    }

    public function test_try_from_value_returns_null_for_unknowns(): void
    {
        $this->assertNull(PaymentStatus::tryFromValue(null));
        $this->assertNull(PaymentStatus::tryFromValue(''));
        $this->assertNull(PaymentStatus::tryFromValue('not_a_real_status'));
        $this->assertNull(PaymentStatus::tryFromValue('PAID')); // case-sensitive
    }

    public function test_try_from_value_returns_enum_for_knowns(): void
    {
        $this->assertSame(PaymentStatus::Paid, PaymentStatus::tryFromValue('paid'));
        $this->assertSame(PaymentStatus::Refunded, PaymentStatus::tryFromValue('refunded'));
        $this->assertSame(PaymentStatus::Authorized, PaymentStatus::tryFromValue('authorized'));
    }

    public function test_every_transition_target_is_a_valid_enum_value(): void
    {
        // Guard against typos in the transition map — every value listed
        // as a 'next state' must itself be a valid PaymentStatus.
        $allValues = array_column(PaymentStatus::cases(), 'value');
        foreach (PaymentStatus::cases() as $from) {
            foreach ($from->allowedTransitions() as $target) {
                $this->assertContains(
                    $target,
                    $allValues,
                    "PaymentStatus::{$from->name} lists '{$target}' as next state but it's not a valid enum value."
                );
            }
        }
    }
}
