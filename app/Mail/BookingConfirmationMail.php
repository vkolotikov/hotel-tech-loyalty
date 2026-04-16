<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class BookingConfirmationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $guestName,
        public string $hotelName,
        public string $bookingReference,
        public string $unitName,
        public string $checkIn,
        public string $checkOut,
        public int $nights,
        public int $adults,
        public int $children,
        public float $roomTotal,
        public float $extrasTotal,
        public float $grossTotal,
        public string $currency,
        public float $pricePerNight,
        public array $extras = [],
        public array $policies = [],
        public string $supportEmail = 'support@hotel-tech.ai',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Booking Confirmed — {$this->hotelName} ({$this->checkIn})",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-confirmation');
    }
}
