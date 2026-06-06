<?php

namespace App\Mail;

use App\Services\IndustryPrompts\IndustryPromptService;
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
        // Phase 8.x — canonical industry id. Null = legacy call site
        // → falls through to hotel framing (Reservation Confirmed,
        // hotel vocabulary). The services widget already passes this.
        public ?string $industry = null,
    ) {}

    public function envelope(): Envelope
    {
        // Phase 8.x — "Reservation" reads as universal across hotel,
        // restaurant and venue. Beauty + medical orgs better with
        // "Appointment". Subject line stays content-light to avoid
        // industry confusion in the inbox preview.
        $bookingNoun = match ($this->industry) {
            'beauty', 'medical' => 'Appointment',
            default             => 'Reservation',
        };
        return new Envelope(
            subject: "{$bookingNoun} Confirmed — {$this->serviceName} at {$this->hotelName}",
        );
    }

    public function content(): Content
    {
        $industry = $this->industry ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile  = app(IndustryPromptService::class)->for($industry);
        return new Content(
            view: 'emails.service-booking-confirmation',
            with: [
                'industry' => $industry,
                'profile'  => $profile,
            ],
        );
    }
}
