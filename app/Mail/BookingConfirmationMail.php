<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Guest-facing booking confirmation.
 *
 * Constructor is back-compat friendly: every field added since the
 * original version is nullable with a sensible default so legacy
 * call sites (orphan recovery, retry crons) keep working without
 * supplying the new payment / unit-detail fields.
 */
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
        // New optional fields — body sections render conditionally.
        public ?string $bookingDate = null,        // ISO timestamp of when the booking was placed
        public ?string $unitImageUrl = null,       // absolute URL to room/unit hero image
        public ?int $unitMaxGuests = null,         // capacity hint surfaced under the unit name
        public ?string $arrivalTime = null,        // guest-provided ETA (if collected)
        public ?string $specialRequests = null,    // free-text guest note
        public ?string $guestEmail = null,
        public ?string $guestPhone = null,
        public ?string $guestAddress = null,
        // Payment details.
        public ?string $paymentMethod = null,      // 'card' | 'mock' | 'cash' | etc.
        public ?string $paymentBrand = null,       // 'visa' | 'mastercard' | … (when known)
        public ?string $paymentLast4 = null,
        public ?string $paymentStatus = null,      // 'paid' | 'authorized' | 'pending' | …
        public ?string $paymentReference = null,   // Stripe PI id (we redact for guest)
        public ?string $receiptUrl = null,         // Stripe-hosted receipt link
        // Branding.
        public ?string $brandLogoUrl = null,
        public ?string $brandPrimaryColor = null,  // CSS color (defaults to gold)
        public ?string $contactPhone = null,
        public ?string $hotelAddress = null,
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
