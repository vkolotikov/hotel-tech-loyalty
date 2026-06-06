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
        // Phase 8.x — canonical industry id; null = legacy call site
        // → hotel framing. Medical orgs (hasLoyalty=false per
        // decision #5) shouldn't reach this email at all.
        public ?string $industry = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your {$this->hotelName} Membership — Activate Your Account",
        );
    }

    public function content(): Content
    {
        $industry = $this->industry ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile = app(\App\Services\IndustryPrompts\IndustryPromptService::class)->for($industry);
        return new Content(
            view: 'emails.booking-membership',
            with: [
                'industry' => $industry,
                'profile'  => $profile,
            ],
        );
    }
}
