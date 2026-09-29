<?php

namespace App\Mail;

use App\Models\Organization;
use App\Services\IndustryPrompts\IndustryPromptService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells a member the booking they cancelled in the portal is cancelled,
 * and what happened to their money: nothing was charged, a hold on the
 * card was released, or a payment is being refunded.
 *
 * Not sent for a refunded stay: BookingRefundService sends its own
 * BookingRefundMail, which says the same.
 */
class BookingCancelledMail extends Mailable implements ShouldQueue
{
    use Concerns\SendsAsVenue;

    use Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [60, 300, 900];

    /** @param 'none'|'released'|'refunded' $money */
    public function __construct(
        public string $guestName,
        public string $hotelName,
        public string $bookingReference,
        public string $title,
        public string $when,
        public string $money,
        public float $amount,
        public string $currency,
        public string $supportEmail,
        public ?string $industry = null,
    ) {
        // Capture the acting tenant NOW; envelope() runs later in the
        // worker, where no org is bound. See Concerns\SendsAsVenue.
        $this->captureVenue();
    }

    public function envelope(): Envelope
    {
        $noun = match ($this->industry) {
            'beauty', 'medical' => 'Appointment',
            default             => 'Booking',
        };

        return new Envelope(
            subject: "{$noun} cancelled — {$this->hotelName} · {$this->bookingReference}",
            from:    $this->venueFrom(),
            replyTo: $this->venueReplyTo(),
        );
    }

    public function content(): Content
    {
        $industry = $this->industry ?? Organization::DEFAULT_INDUSTRY;

        return new Content(
            view: 'emails.booking-cancelled',
            with: ['industry' => $industry, 'profile' => app(IndustryPromptService::class)->for($industry)],
        );
    }
}
