<?php

namespace App\Mail;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Refund confirmation email — sent by BookingRefundService after a
 * Stripe refund completes (either admin-initiated or webhook async).
 *
 * Keeps the tone matter-of-fact, focuses on three things the guest
 * cares about: how much, when it'll land in their account, who to
 * contact if anything's wrong.
 */
class BookingRefundMail extends Mailable
{
    use Queueable, SerializesModels;

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
    }

    public function envelope(): Envelope
    {
        $type = $this->isFull ? 'Refund' : 'Partial refund';
        return new Envelope(
            subject: "{$type} confirmed — {$this->hotelName} · {$this->bookingReference}",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-refund');
    }
}
