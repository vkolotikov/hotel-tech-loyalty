<?php

namespace App\Mail;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\IndustryPrompts\IndustryPromptService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Refund confirmation email — sent by BookingRefundService after a
 * Stripe refund completes (either admin-initiated or webhook async).
 *
 * Implements ShouldQueue: refunds are async by nature (the guest is
 * not on a synchronous request path), and the email is more important
 * than its dispatch timing — failed_jobs + retries are the right
 * envelope. See AUDIT-2026-06-13-ADDENDUM.md observability finding.
 *
 * Keeps the tone matter-of-fact, focuses on three things the guest
 * cares about: how much, when it'll land in their account, who to
 * contact if anything's wrong.
 */
class BookingRefundMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [60, 300, 900];

    public string $guestName;
    public string $hotelName;
    public string $bookingReference;
    public string $unitName;
    public string $checkIn;
    public string $checkOut;
    public float $refundAmount;
    public bool $isFull;
    public string $currency;
    public string $supportEmail;
    /** Phase 8.x — canonical industry id resolved from the mirror's org. */
    public string $industry;

    public function __construct(BookingMirror $mirror, float $refundAmount, bool $isFull)
    {
        $this->guestName        = $mirror->guest_name ?: 'Guest';
        $this->bookingReference = $mirror->booking_reference ?: ('#' . $mirror->id);
        $this->unitName         = $mirror->apartment_name ?: 'Your room';
        $this->checkIn          = $mirror->arrival_date instanceof \DateTimeInterface
            ? $mirror->arrival_date->format('M j, Y')
            : (string) $mirror->arrival_date;
        $this->checkOut         = $mirror->departure_date instanceof \DateTimeInterface
            ? $mirror->departure_date->format('M j, Y')
            : (string) $mirror->departure_date;
        $this->refundAmount     = $refundAmount;
        $this->isFull           = $isFull;
        $this->currency         = HotelSetting::getValue('booking_currency', 'EUR');
        $this->hotelName        = HotelSetting::getValue('company_name', 'the hotel');
        $this->supportEmail     = HotelSetting::getValue('mail_from_address', 'support@hotel-tech.ai');
        // Phase 8.x — resolve org industry once via the mirror's FK so
        // the subject + Blade can flex vocab. Hotel default for legacy
        // call sites + null safety.
        $this->industry         = Organization::withoutGlobalScopes()
            ->find($mirror->organization_id)?->resolved_industry
            ?? Organization::DEFAULT_INDUSTRY;
    }

    public function envelope(): Envelope
    {
        // Phase 8.x — subject reflects industry vocabulary. "Refund"
        // stays universal; the noun in the workspace context flexes.
        $type = $this->isFull ? 'Refund' : 'Partial refund';
        return new Envelope(
            subject: "{$type} confirmed — {$this->hotelName} · {$this->bookingReference}",
        );
    }

    public function content(): Content
    {
        $profile = app(IndustryPromptService::class)->for($this->industry);
        return new Content(
            view: 'emails.booking-refund',
            with: [
                'industry' => $this->industry,
                'profile'  => $profile,
            ],
        );
    }
}
