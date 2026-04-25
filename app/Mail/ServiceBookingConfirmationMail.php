<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Confirmation email sent to a guest after a service booking
 * (spa / wellness / dining / etc.) is confirmed via the public widget.
 *
 * Mirrors the shape of `BookingConfirmationMail` (room bookings) but
 * tailored to the service-booking data model — single appointment in
 * time, optional master, optional extras as line items.
 */
class ServiceBookingConfirmationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $guestName,
        public string $hotelName,
        public string $bookingReference,
        public string $serviceName,
        public ?string $masterName,
        public string $startAt,        // ISO datetime
        public int $durationMinutes,
        public int $partySize,
        public float $servicePrice,
        public float $extrasTotal,
        public float $grossTotal,
        public string $currency,
        /** @var array<int,array{name:string,quantity:int,line_total:float}> */
        public array $extras,
        public ?string $cancellationPolicy,
        public string $supportEmail = 'support@hotel-tech.ai',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Reservation Confirmed — {$this->serviceName} at {$this->hotelName}",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.service-booking-confirmation');
    }
}
