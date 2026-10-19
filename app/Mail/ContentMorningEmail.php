<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** HexaTech Content's morning email (spec 2026-10-19 §4.5). Its words come ready from ContentMorningDigest. Queued. */
class ContentMorningEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $tries = 2;

    public $backoff = [120, 600];

    /** @param array<string, mixed> $lines */
    public function __construct(public array $lines)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: (string) $this->lines['subject']);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.content-morning', with: $this->lines);
    }
}
