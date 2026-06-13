<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class VerificationCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /** Same retry+backoff strategy as PasswordResetCodeMail — these are
     *  time-sensitive user-facing emails that must survive a transient
     *  SMTP outage without 500-ing the request thread. */
    public $tries = 3;
    public $backoff = [10, 30, 60];

    public function __construct(
        public string $code,
        public string $userName = '',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your verification code: {$this->code}",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.verification-code');
    }
}
