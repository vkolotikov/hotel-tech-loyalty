<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeTrialMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Per-industry brand framing used in the subject line. Phase 8 will
     * fork the Blade template (token-substitution approach — single tree,
     * vocabulary-aware) for full body branding; for Phase 2 the only
     * visible signal is the subject line so the recipient instantly
     * recognises the sub-brand they signed up under.
     */
    private const INDUSTRY_BRAND = [
        'hotel'      => 'HotelTechAI',
        'beauty'     => 'BeautyTech.uk',
        'medical'    => 'MedTechAI',
        'restaurant' => 'HospitalityTech',
    ];

    public function __construct(
        public string $userName,
        public string $hotelName,
        public string $planName,
        public int $trialDays,
        public string $loginUrl,
        public string $docsUrl = 'https://hotel-tech.ai/docs',
        public string $supportEmail = 'support@hotel-tech.ai',
        /** Canonical industry id from Organization::INDUSTRIES; null = legacy / fall through to hotel framing. */
        public ?string $industry = null,
    ) {}

    public function envelope(): Envelope
    {
        $brand = self::INDUSTRY_BRAND[$this->industry] ?? self::INDUSTRY_BRAND['hotel'];
        return new Envelope(
            subject: "Welcome to {$brand} — your {$this->planName} trial is active!",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.welcome-trial');
    }
}
