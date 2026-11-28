<?php

namespace App\Mail;

use App\Services\MailIdentityService;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Delivered synchronously inside the authorization-checking queued job. */
class ContentCollaborationEmail extends Mailable
{
    public function __construct(public int $organizationId, public int $brandId, public int $postId,
        public string $kind, public string $title, public string $note) {}

    public function envelope(): Envelope
    {
        $identity = app(MailIdentityService::class)->forOrganization($this->organizationId);
        return new Envelope(
            from: new Address($identity['from_address'], $identity['from_name'] ?? ''),
            replyTo: $identity['reply_to'] ? [new Address($identity['reply_to'], $identity['from_name'] ?? '')] : [],
            subject: __('content_collaboration.' . $this->kind),
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.content-collaboration', with: [
            'url' => rtrim((string) config('app.url'), '/') . "/content/posts/{$this->postId}?brand_id={$this->brandId}",
            'settingsUrl' => rtrim((string) config('app.url'), '/') . '/content/settings',
        ]);
    }
}
