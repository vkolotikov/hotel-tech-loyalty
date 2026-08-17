<?php

namespace App\Mail;

use App\Mail\Concerns\HasIndustryVocab;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeMemberMail extends Mailable
{
    use Concerns\SendsAsVenue;

    use Queueable, SerializesModels, HasIndustryVocab;

    public function __construct(
        public LoyaltyMember $member,
        public Organization $organization,
        public string $code,
    ) {
        // Capture the acting tenant NOW; envelope() runs later in the
        // worker, where no org is bound. See Concerns\SendsAsVenue.
        $this->captureVenue();
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Welcome to {$this->organization->name} — set your password",
            from:    $this->venueFrom(),
            replyTo: $this->venueReplyTo(),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.welcome-member',
            with: array_merge([
                'memberName'   => $this->member->user->name,
                'memberNumber' => $this->member->member_number,
                'tierName'     => $this->member->tier?->name ?? 'Bronze',
                'hotelName'    => $this->organization->name,
                'email'        => $this->member->user->email,
                'code'         => $this->code,
            ], $this->industryVocabFor($this->organization)),
        );
    }
}
