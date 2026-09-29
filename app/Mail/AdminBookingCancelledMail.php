<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the venue's staff a member cancelled a booking in the portal:
 * who, what, and what was returned to them. Sent through
 * AdminNotificationService, which queues it to the venue's recipients.
 */
class AdminBookingCancelledMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param 'service'|'stay' $kind
     * @param 'none'|'released'|'refunded' $money
     * @param bool $pmsFailed  a stay whose PMS reservation could not be cancelled (refused or unreachable): staff must cancel it there by hand
     */
    public function __construct(
        public string $kind,
        public string $hotelName,
        public string $bookingReference,
        public string $guestName,
        public ?string $guestEmail,
        public string $title,
        public string $when,
        public string $money,
        public float $amount,
        public string $currency,
        public bool $couponReleased,
        public string $adminUrl,
        public bool $pmsFailed = false,
    ) {}

    public function envelope(): Envelope
    {
        $what = $this->kind === 'stay' ? 'stay' : 'appointment';

        return new Envelope(subject: "Cancelled by the member — {$what} {$this->bookingReference}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.admin-booking-cancelled');
    }
}
