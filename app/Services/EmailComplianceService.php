<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use Illuminate\Mail\Message;
use Illuminate\Support\Str;

/**
 * The rules every non-transactional email has to satisfy before it leaves.
 *
 * Previously nothing here existed: three bulk paths sent commercial mail
 * with no unsubscribe token, route, footer or `List-Unsubscribe` header
 * anywhere in the codebase, gated on `email_notifications` (default TRUE)
 * rather than `marketing_consent` (default FALSE). Every one of those is a
 * deliverability problem before it is a legal one — Gmail and Yahoo both
 * require one-click unsubscribe for bulk senders, and the transport here
 * is plain SMTP, so no ESP adds the header on our behalf.
 *
 * Two categories, deliberately:
 *
 *  - `transactional` — the member asked for this by doing something: a
 *    welcome/claim mail, a redemption confirmation, a password reset.
 *    Needs no consent and carries no unsubscribe link.
 *  - anything else — marketing. Requires `marketing_consent`, honours
 *    `email_notifications`, and always carries a footer and the headers.
 */
class EmailComplianceService
{
    public const TRANSACTIONAL = 'transactional';

    /** Is this member allowed to receive mail of this category? */
    public function canReceive(LoyaltyMember $member, string $category): bool
    {
        if (!$member->user?->email) {
            return false;
        }

        if ($category === self::TRANSACTIONAL) {
            // Service mail still goes out — a member who opted out of
            // marketing has not opted out of being told their password
            // was reset.
            return true;
        }

        // Marketing needs BOTH: explicit consent, and the channel switch
        // they control themselves.
        return (bool) $member->marketing_consent
            && (bool) $member->email_notifications
            && $member->unsubscribed_at === null;
    }

    /**
     * Narrow a member query to those who may receive this category.
     *
     * Used by the send paths so the recipient count shown to the operator
     * is the count that will actually be mailed.
     */
    public function scopeEligible($query, string $category)
    {
        if ($category === self::TRANSACTIONAL) {
            return $query;
        }

        return $query->where('marketing_consent', true)
            ->where('email_notifications', true)
            ->whereNull('unsubscribed_at');
    }

    /**
     * The member's permanent unsubscribe link, minted on first use.
     *
     * Never expires — someone may open the mail a year from now, and a
     * dead unsubscribe link is worse than none at all.
     */
    public function unsubscribeUrl(LoyaltyMember $member): string
    {
        if (empty($member->unsubscribe_token)) {
            // 48 chars of randomness: this is the only thing standing
            // between a guessed URL and unsubscribing someone else.
            $member->forceFill(['unsubscribe_token' => Str::random(48)])->save();
        }

        return url('/unsubscribe/' . $member->unsubscribe_token);
    }

    /**
     * Stamp the one-click unsubscribe headers on an outgoing message.
     *
     * `List-Unsubscribe-Post` is RFC 8058: it tells Gmail/Yahoo the URL
     * accepts a POST, which is what turns the mail client's own
     * "Unsubscribe" button on. Without it the header is decorative.
     */
    public function applyHeaders(Message $message, LoyaltyMember $member, string $category): void
    {
        if ($category === self::TRANSACTIONAL) {
            return;
        }

        $url = $this->unsubscribeUrl($member);
        $headers = $message->getHeaders();

        $headers->addTextHeader('List-Unsubscribe', '<' . $url . '>');
        $headers->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
    }

    /** Footer appended to marketing HTML bodies. */
    public function footerHtml(LoyaltyMember $member, ?string $orgName = null): string
    {
        $url = e($this->unsubscribeUrl($member));
        $who = e($orgName ?: config('app.name'));

        return <<<HTML

<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;
            font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;line-height:1.5">
  You're receiving this because you joined the {$who} loyalty programme.
  <br>
  <a href="{$url}" style="color:#888;text-decoration:underline">Unsubscribe from marketing emails</a>
</div>
HTML;
    }

    /** Footer appended to marketing plain-text bodies. */
    public function footerText(LoyaltyMember $member, ?string $orgName = null): string
    {
        $url = $this->unsubscribeUrl($member);
        $who = $orgName ?: config('app.name');

        return "\n\n--\nYou're receiving this because you joined the {$who} loyalty programme.\n"
             . "Unsubscribe: {$url}\n";
    }
}
