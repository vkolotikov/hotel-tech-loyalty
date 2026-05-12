<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Daily loyalty-program digest. Payload built by
 * LoyaltyDigestService::buildSummary($orgId, $orgNow). Subject and
 * Blade template mirror the engagement digest so admins get a
 * consistent morning-email format.
 */
class LoyaltyDigest extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public array $summary,
        public string $recipientName,
    ) {}

    public function envelope(): Envelope
    {
        $date = $this->summary['date_label'] ?? 'yesterday';
        return new Envelope(
            subject: "{$this->summary['org_name']} — loyalty summary for {$date}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.loyalty-digest',
            with: $this->summary + ['recipientName' => $this->recipientName],
        );
    }
}
