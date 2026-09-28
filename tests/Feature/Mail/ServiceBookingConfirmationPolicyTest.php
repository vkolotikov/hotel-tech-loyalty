<?php

namespace Tests\Feature\Mail;

use App\Mail\ServiceBookingConfirmationMail;
use Tests\TestCase;

/**
 * Locks the discount + payment-wording addition to
 * ServiceBookingConfirmationMail (member portal, phase 2, task 10):
 * a discount row rendered only when there is a discount, and a payment
 * line that reads the booking's payment_status.
 */
class ServiceBookingConfirmationPolicyTest extends TestCase
{
    private function makeMail(array $overrides = []): ServiceBookingConfirmationMail
    {
        $defaults = [
            'guestName'           => 'Jane Doe',
            'hotelName'           => 'Forrest Glamp',
            'bookingReference'    => 'SVC-ABC12345',
            'serviceName'         => 'Deep Tissue Massage',
            'masterName'          => null,
            'startAt'             => now()->addDay()->toIso8601String(),
            'durationMinutes'     => 60,
            'partySize'           => 1,
            'servicePrice'        => 60.0,
            'extrasTotal'         => 0.0,
            'grossTotal'          => 60.0,
            'currency'            => 'EUR',
            'extras'              => [],
            'cancellationPolicy'  => null,
        ];

        return new ServiceBookingConfirmationMail(...array_merge($defaults, $overrides));
    }

    /**
     * Final review, Important 3: the capture cron takes an authorised
     * payment within minutes (every ten minutes, on rows older than five),
     * so the email must not promise "charged after your visit".
     */
    public function test_the_render_shows_the_policy_discount_and_card_authorised_wording(): void
    {
        $mail = $this->makeMail([
            'cancellationPolicy' => 'X',
            'discountAmount'     => 6.0,
            'discountLabel'      => 'Ten off',
            'paymentStatus'      => 'authorized',
        ]);

        $html = $mail->render();

        $this->assertStringContainsString('X', $html);
        $this->assertStringContainsString('Ten off', $html);
        $this->assertStringContainsString('6.00', $html);
        $this->assertStringContainsString('Card authorised. The payment is taken shortly after booking.', $html);
        $this->assertStringNotContainsString('after your visit', $html);
    }

    public function test_no_discount_amount_means_no_discount_row(): void
    {
        $mail = $this->makeMail(['discountAmount' => null]);

        $html = $mail->render();

        $this->assertStringNotContainsString('Member discount', $html);
    }
}
