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

    public function __construct(
        public string $userName,
        public string $hotelName,
        public string $planName,
        public int $trialDays,
        public string $loginUrl,
        public string $docsUrl = 'https://hotel-tech.ai/docs',
        public string $supportEmail = 'support@hotel-tech.ai',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Welcome to Hotel Tech — your {$this->planName} trial is active!",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.welcome-trial');
    }
}
