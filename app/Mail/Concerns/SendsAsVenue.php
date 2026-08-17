<?php

namespace App\Mail\Concerns;

use App\Services\MailIdentityService;
use Illuminate\Mail\Mailables\Address;

/**
 * Makes a Mailable send as the VENUE rather than as the platform.
 *
 * THE PROBLEM
 * A guest who books a table receives their confirmation from
 * "Hotel Loyalty" <noreply@hotel-tech.ai> — a brand they have never heard of,
 * for a restaurant they just booked. Every guest-facing mail on the platform
 * had this, because Mailables inherit the global MAIL_FROM and nothing
 * overrode it.
 *
 * WHY THE ORG IS CAPTURED IN THE CONSTRUCTOR
 * These Mailables are queued. `envelope()` runs LATER, inside the worker, where
 * `current_organization_id` is not bound — there is no request, and the worker
 * serves every tenant. Resolving the venue at render time would therefore
 * resolve nothing, or worse, whatever org the previous job happened to bind.
 *
 * So the org id is captured at CONSTRUCTION, in the request or job that already
 * knows which tenant it is acting for, and travels with the serialized
 * Mailable as a public property. This is the same reason
 * SendEmailCampaignChunk re-binds the org explicitly in handle().
 *
 * USAGE
 *     class BookingConfirmationMail extends Mailable
 *     {
 *         use SendsAsVenue;
 *
 *         public function __construct(...) {
 *             $this->captureVenue();          // in the constructor, always
 *         }
 *
 *         public function envelope(): Envelope {
 *             return new Envelope(
 *                 subject:  '...',
 *                 from:     $this->venueFrom(),
 *                 replyTo:  $this->venueReplyTo(),
 *             );
 *         }
 *     }
 *
 * Note `from` keeps the PLATFORM address and changes only the display name.
 * See MailIdentityService for why sending from an unverified tenant domain
 * would break DMARC alignment and make deliverability worse.
 */
trait SendsAsVenue
{
    /**
     * Public so it survives Mailable serialization onto the queue. Null means
     * "no venue" and every helper below degrades to platform defaults.
     */
    public ?int $venueOrgId = null;

    /** Capture the acting tenant. Call from the constructor. */
    protected function captureVenue(?int $organizationId = null): static
    {
        $this->venueOrgId = $organizationId
            ?? (app()->bound('current_organization_id')
                ? (int) app('current_organization_id')
                : null);

        return $this;
    }

    /**
     * The From address, carrying the venue's display name.
     * Returns null when there is no venue, so the Envelope falls back to the
     * platform default rather than being handed an empty Address.
     */
    protected function venueFrom(): ?Address
    {
        $identity = app(MailIdentityService::class)->forOrganization($this->venueOrgId);

        if (!$identity['from_name']) {
            return null;
        }

        return new Address($identity['from_address'], $identity['from_name']);
    }

    /**
     * Where replies should go. Unlike From, this carries no authentication
     * requirement, so it can be the venue's real mailbox today — which is the
     * difference between a guest's reply reaching the restaurant and vanishing
     * into an unread noreply inbox.
     *
     * @return array<int, Address>
     */
    protected function venueReplyTo(): array
    {
        $identity = app(MailIdentityService::class)->forOrganization($this->venueOrgId);

        if (!$identity['reply_to']) {
            return [];
        }

        return [new Address($identity['reply_to'], $identity['from_name'] ?: null)];
    }
}
