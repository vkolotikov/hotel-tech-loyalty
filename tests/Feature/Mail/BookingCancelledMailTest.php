<?php

namespace Tests\Feature\Mail;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use Tests\TestCase;

class BookingCancelledMailTest extends TestCase
{
    private function mail(array $over = []): BookingCancelledMail
    {
        return new BookingCancelledMail(...array_merge([
            'guestName' => 'Ada Lovelace', 'hotelName' => 'Seaside Hotel', 'bookingReference' => 'BK-ABC12345',
            'title' => 'Sea view', 'when' => 'Oct 10, 2026 – Oct 12, 2026', 'money' => 'none', 'amount' => 0.0,
            'currency' => 'EUR', 'supportEmail' => 'hello@seaside.test', 'industry' => 'hotel',
        ], $over));
    }

    public function test_the_subject_names_the_venue_and_the_reference(): void
    {
        $this->assertSame('Booking cancelled — Seaside Hotel · BK-ABC12345', $this->mail()->envelope()->subject);
        $this->assertSame('Appointment cancelled — Seaside Hotel · SVC-AB12CD34', $this->mail(['industry' => 'beauty', 'bookingReference' => 'SVC-AB12CD34'])->envelope()->subject);
    }

    public function test_the_body_says_what_happened_to_the_money(): void
    {
        $none = $this->mail()->render();
        $this->assertStringContainsString('BK-ABC12345', $none);
        $this->assertStringContainsString('Sea view', $none);
        $this->assertStringContainsString('Nothing was charged', $none);

        $released = $this->mail(['money' => 'released', 'amount' => 180.0])->render();
        $this->assertStringContainsString('The hold of EUR 180.00 on your card has been released', $released);
        $this->assertStringNotContainsString('refund', strtolower($released));

        $refunded = $this->mail(['money' => 'refunded', 'amount' => 54.0])->render();
        $this->assertStringContainsString('EUR 54.00', $refunded);
        $this->assertStringContainsString('5–10 business days', $refunded);
        $this->assertStringContainsString('hello@seaside.test', $refunded);
    }

    public function test_the_venue_is_told_who_what_and_what_was_returned(): void
    {
        $mail = new AdminBookingCancelledMail(
            kind: 'stay', hotelName: 'Seaside Hotel', bookingReference: 'BK-ABC12345', guestName: 'Ada Lovelace', guestEmail: 'ada@example.test',
            title: 'Sea view', when: 'Oct 10, 2026 – Oct 12, 2026', money: 'refunded', amount: 180.0, currency: 'EUR', couponReleased: true, adminUrl: 'https://app.example.test',
        );

        $this->assertSame('Cancelled by the member — stay BK-ABC12345', $mail->envelope()->subject);
        $html = $mail->render();
        $this->assertStringContainsString('Ada Lovelace', $html);
        $this->assertStringContainsString('ada@example.test', $html);
        $this->assertStringContainsString('Refunded: EUR 180.00', $html);
        $this->assertStringContainsString('The coupon used for this booking was returned to the member', $html);
        $this->assertStringContainsString('The time is free to book again', $html);
        $this->assertStringNotContainsString('could NOT be cancelled', $html);
    }

    /** A PMS that refused or could not be reached is the venue's to clear up — the mail says so instead of "free to book again". */
    public function test_the_venue_is_told_to_cancel_by_hand_when_the_pms_refused(): void
    {
        $html = (new AdminBookingCancelledMail(
            kind: 'stay', hotelName: 'Seaside Hotel', bookingReference: 'BK-ABC12345', guestName: 'Ada Lovelace', guestEmail: 'ada@example.test',
            title: 'Sea view', when: 'Oct 10, 2026 – Oct 12, 2026', money: 'none', amount: 0.0, currency: 'EUR', couponReleased: false, adminUrl: 'https://app.example.test',
            pmsFailed: true,
        ))->render();

        $this->assertStringContainsString('The reservation could NOT be cancelled in the booking system. Please cancel it there by hand.', $html);
        $this->assertStringNotContainsString('free to book again', $html);
    }
}
