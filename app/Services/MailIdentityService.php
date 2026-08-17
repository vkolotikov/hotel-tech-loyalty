<?php

namespace App\Services;

use App\Models\HotelSetting;
use App\Models\Organization;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;

/**
 * Decides who an outbound email is FROM.
 *
 * THE PROBLEM THIS SOLVES
 * Every message the platform sent — a guest's booking confirmation, a member's
 * welcome mail, a venue's marketing campaign — went out as the global
 * MAIL_FROM: "Hotel Loyalty" <noreply@hotel-tech.ai>. A salon's customer
 * received mail from a hotel brand they had never heard of. That is confusing
 * at best, and at worst it is what makes someone press "this is spam" — the
 * single most damaging signal a mailbox provider can receive, on a domain every
 * tenant shares.
 *
 * WHY THE ADDRESS STAYS ON THE PLATFORM DOMAIN
 * The From NAME becomes the venue. The From ADDRESS deliberately does not.
 *
 * SPF and DKIM are published for the platform's sending domain, and DMARC
 * alignment requires the From domain to match the domain that authenticated the
 * message. Sending as `bookings@some-venue.com` from our infrastructure — with
 * no SPF authorisation and no DKIM key for that domain — fails alignment, and a
 * failing message is treated far more harshly than a correctly-aligned one from
 * an unfamiliar brand. It would make deliverability worse while looking like an
 * improvement, which is the worst kind of change.
 *
 * The honest way to let a venue send as itself is per-tenant VERIFIED sending
 * domains: the venue publishes DKIM records the ESP gives them, and only then
 * does the From address change. That is a deliberate later step, and
 * `senderAddressFor()` is where it will land — see docs/EMAIL_DELIVERABILITY.md.
 *
 * REPLY-TO IS THE PART THAT CAN CHANGE TODAY
 * Reply-To carries no authentication requirement, so a reply can go straight to
 * the venue right now. That matters twice over: guests replying to a booking
 * confirmation currently reach an unread noreply mailbox, and replies are a
 * positive engagement signal to mailbox providers.
 */
class MailIdentityService
{
    /**
     * Settings keys a venue can set for its own sender identity. Note these are
     * the SAFE half of the old "Email / SMTP" settings block — the SMTP host and
     * credentials are not here on purpose, see removeLegacySmtpKeys().
     */
    public const KEY_FROM_NAME = 'mail_from_name';
    public const KEY_REPLY_TO  = 'mail_reply_to';

    /** Cache resolved identities per org for the life of the request. */
    private array $cache = [];

    /**
     * Resolve the sending identity for an organisation.
     *
     * @return array{from_name: ?string, from_address: string, reply_to: ?string}
     */
    public function forOrganization(?int $organizationId): array
    {
        $key = $organizationId ?? 0;
        if (isset($this->cache[$key])) {
            return $this->cache[$key];
        }

        $platformAddress = (string) config('mail.from.address');
        $identity = [
            'from_name'    => null,
            'from_address' => $platformAddress,
            'reply_to'     => null,
        ];

        if (!$organizationId) {
            return $this->cache[$key] = $identity;
        }

        $org = Organization::withoutGlobalScopes()->find($organizationId);
        if (!$org) {
            return $this->cache[$key] = $identity;
        }

        // Explicit override first, then the org's own name. A venue that has
        // not configured anything still gets its own name on the envelope,
        // which is the behaviour anyone would expect by default.
        $identity['from_name'] = $this->setting(self::KEY_FROM_NAME, $organizationId)
            ?: $org->name
            ?: null;

        $identity['reply_to'] = $this->setting(self::KEY_REPLY_TO, $organizationId)
            ?: ($org->email ?: null);

        // A malformed reply-to is worse than none: some providers reject the
        // whole message on a bad header rather than ignoring it.
        if ($identity['reply_to'] && !filter_var($identity['reply_to'], FILTER_VALIDATE_EMAIL)) {
            Log::warning('Ignoring invalid mail_reply_to for organization', [
                'organization_id' => $organizationId,
                'value'           => $identity['reply_to'],
            ]);
            $identity['reply_to'] = null;
        }

        return $this->cache[$key] = $identity;
    }

    /**
     * Stamp a message with the venue's identity.
     *
     * Safe to call on any message, including platform-identity mail: with no
     * org context it is a no-op, so call sites do not need to branch.
     */
    public function apply(Message $message, ?int $organizationId = null): void
    {
        $organizationId ??= app()->bound('current_organization_id')
            ? (int) app('current_organization_id')
            : null;

        $identity = $this->forOrganization($organizationId);

        if ($identity['from_name']) {
            $message->from($identity['from_address'], $identity['from_name']);
        }

        if ($identity['reply_to']) {
            $message->replyTo($identity['reply_to'], $identity['from_name'] ?: null);
        }
    }

    /**
     * Read a per-org setting without going through HotelSetting::getValue.
     *
     * getValue() reads a cached map that deliberately excludes ENCRYPTED_KEYS,
     * and it resolves the org from the ambient container binding. Both are
     * wrong here: this service is called from queued jobs that may be acting
     * for a different org than the one bound, so the org must be explicit.
     */
    private function setting(string $key, int $organizationId): ?string
    {
        $value = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $organizationId)
            ->where('key', $key)
            ->value('value');

        $value = is_string($value) ? trim($value) : null;

        return $value !== '' ? $value : null;
    }
}
