<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Admin notification for any room or service booking submission.
 *
 * Sent in addition to the existing guest-facing confirmation so the
 * hotel team never misses a booking. Recipients are resolved from
 * hotel_settings.admin_notification_emails (comma-separated) with a
 * fallback to every staff user on the org.
 *
 * One Mailable handles both room and service flows — the $kind field
 * switches a couple of fields in the Blade view; everything else is
 * shared.
 */
class AdminBookingNotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $kind,              // 'room' | 'service'
        public string $hotelName,
        public string $bookingReference,
        public string $guestName,
        public ?string $guestEmail,
        public ?string $guestPhone,
        // Room-only fields (left empty for service bookings).
        public ?string $unitName,
        public ?string $checkIn,
        public ?string $checkOut,
        public ?int $nights,
        public ?int $adults,
        public ?int $children,
        // Service-only fields (left empty for room bookings).
        public ?string $serviceName,
        public ?string $masterName,
        public ?string $startAt,
        public ?int $durationMinutes,
        public ?int $partySize,
        // Shared money fields.
        public float $baseTotal,           // room_total or service_price
        public float $extrasTotal,
        public float $grossTotal,
        public string $currency,
        public array $extras = [],         // [['name','quantity','total'], ...]
        public ?string $specialRequests = null,
        public ?string $paymentStatus = null,
        public string $adminUrl = 'https://loyalty.hotel-tech.ai',
    ) {}

    public function envelope(): Envelope
    {
        $when = $this->kind === 'service' ? $this->startAt : $this->checkIn;
        $what = $this->kind === 'service' ? ($this->serviceName ?? 'Service') : ($this->unitName ?? 'Room');
        return new Envelope(
            subject: "🔔 New {$this->kind} booking — {$what} · {$this->guestName} ({$when})",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.admin-booking-notification');
    }
}
