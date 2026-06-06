<?php

namespace App\Mail;

use App\Services\IndustryPrompts\IndustryPromptService;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeTrialMail extends Mailable
{
    // Note: HasIndustryVocab trait was initially included here but its
    // industryVocabFor() method takes an Organization model; this
    // Mailable only has a string $industry (no Org on the constructor
    // — the SaaS signup flow doesn't know the local Organization id
    // yet when the welcome email is queued). The trait stays available
    // for Mailables that DO carry an Organization (Phase 8 follow-up).
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
        // Phase 8 reviewer fix — the 4 settings-only industries had
        // no sub-brand mapping; they were falling back to
        // 'HotelTechAI' (via the array default lookup at envelope()),
        // so a legal firm received "Welcome to HotelTechAI" which
        // misled them about which sub-brand they signed up under.
        // Until those industries get dedicated GTM sub-brands, route
        // through the umbrella parent brand "HexaTech".
        'legal'       => 'HexaTech',
        'real_estate' => 'HexaTech',
        'education'   => 'HexaTech',
        'fitness'     => 'HexaTech',
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
        // Industry Platform Plan Phase 8 — pass industry vocab into
        // the Blade so headings + body copy flex per industry.
        // Hotel orgs see verbatim back-compat because the hotel
        // profile carries an empty noun map (every $nouns['x'] key
        // returns 'x' unchanged) and INDUSTRY_BRAND['hotel'] is
        // "HotelTechAI" — same as before this method existed.
        $industry = $this->industry ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile  = app(IndustryPromptService::class)->for($industry);
        $brand    = self::INDUSTRY_BRAND[$industry] ?? self::INDUSTRY_BRAND['hotel'];

        return new Content(
            view: 'emails.welcome-trial',
            with: [
                'industry' => $industry,
                'profile'  => $profile,
                'brand'    => $brand,
            ],
        );
    }
}
