<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Engagement Hub Phase 4 v3 — daily summary email.
 *
 * Constructed by EngagementDailySummaryService::buildSummary($orgId,
 * $orgNow) which returns the full payload. The Blade template renders
 * the same numbers an admin would see on /engagement, scoped to
 * yesterday's window so a GM gets a single morning pulse.
 */
class EngagementDailySummary extends Mailable
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
            subject: "{$this->summary['org_name']} — engagement summary for {$date}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.engagement-daily-summary',
            with: $this->summary + ['recipientName' => $this->recipientName],
        );
    }
}
