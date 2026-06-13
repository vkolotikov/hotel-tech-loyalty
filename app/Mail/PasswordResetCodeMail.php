<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * Retry the password-reset email up to 3× on transient SMTP failure
     * before landing in failed_jobs. Without ShouldQueue, a transient
     * SMTP outage 500s the request thread + reveals account-existence
     * via the error side channel. See AUDIT-2026-06-13-ADDENDUM.md
     * observability finding.
     */
    public $tries = 3;
    public $backoff = [10, 30, 60];

    public function __construct(
        public string $code,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your password reset code: {$this->code}",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.password-reset-code');
    }
}
