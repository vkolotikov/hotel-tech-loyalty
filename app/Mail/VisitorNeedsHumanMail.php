<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tell the venue that someone is waiting to speak to a person.
 *
 * WHY
 * The widget's only existing alert was a sound in the chat inbox, which
 * requires a staff member to already have the inbox open. Outside working
 * hours, or on any day nobody happens to be looking at it, a visitor who asked
 * for help reached nobody — and the assistant had already told them a colleague
 * was coming. A handoff nobody is notified of is worse than no handoff, because
 * it makes a promise the venue then breaks without knowing it was made.
 *
 * Deliberately thin. It carries what a person needs to decide whether to act
 * right now — who, what they asked, and where they were on the site — and links
 * into the inbox for the rest. Pasting the whole transcript into an email would
 * copy personal data into a channel with no retention policy.
 */
class VisitorNeedsHumanMail extends Mailable
{
    use Concerns\SendsAsVenue;
    use Queueable, SerializesModels;

    public function __construct(
        public string $venueName,
        public ?string $visitorName,
        public ?string $visitorEmail,
        public ?string $visitorPhone,
        public string $lastMessage,
        public ?string $pageUrl,
        public string $inboxUrl,
        public string $sentAt,
    ) {
        $this->captureVenue();
    }

    public function envelope(): Envelope
    {
        $who = trim((string) $this->visitorName) !== '' ? $this->visitorName : 'A visitor';

        return new Envelope(
            // Front-loaded so it is readable in a phone notification, which is
            // where this will actually be seen.
            subject: "{$who} is waiting to speak to someone",
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.visitor-needs-human');
    }
}
