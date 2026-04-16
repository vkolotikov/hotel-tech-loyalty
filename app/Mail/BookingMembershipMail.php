<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class BookingMembershipMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $guestName,
        public string $hotelName,
        public string $memberNumber,
        public string $tierName,
        public string $email,
        public string $code,
        public string $supportEmail = 'support@hotel-tech.ai',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your {$this->hotelName} Membership — Activate Your Account",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-membership');
    }
}
