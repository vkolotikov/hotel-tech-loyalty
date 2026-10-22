<?php

namespace App\Services\Loyalty\Sms;

use App\Models\SmsCampaign;
use App\Models\User;
use App\Services\Email\CampaignTags;
use App\Services\Loyalty\Campaigns\CampaignAudience;
use App\Services\Sms\SmsText;
use App\Services\Sms\TwilioSms;
use Illuminate\Database\Eloquent\Builder;

/**
 * An SMS campaign from HexaTech Loyalty (release 4 §5, owner decision R4-4): a name, a plain text with the email
 * campaigns' tags (`{{first_name}}`, …, filled per member by App\Services\Email\CampaignTags) and a segment. It reaches
 * the segment's members who turned "Offers by SMS" on (`loyalty_members.sms_consent`) and have a phone number in
 * international form, through the venue's own Twilio account (Sms\TwilioSms).
 *
 * Draft → scheduled (send later) → sending (SmsStart's one conditional update) → sent (the last chunk), or cancelled
 * (Cancel while sending), or failed (a chunk gave up, Twilio refused the account, or a scheduled one could not start;
 * `error_message` is the reason's code). Only a draft is changed or deleted.
 */
final class SmsMessage
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT = 'sent';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_FAILED = 'failed';

    public const MAX_NAME = 120;
    /** The longest text kept: about six SMS parts in the GSM alphabet, under Twilio's own 1,600 characters with tags filled. */
    public const MAX_BODY = 918;

    /** The most members one SMS campaign is handed: the email campaigns' own cap. */
    public const LIMIT = CampaignAudience::LIMIT;

    /** A delivery row's outcomes (sms_campaign_deliveries.status). */
    public const OUTCOMES = ['sent', 'failed', 'skipped', 'pending'];

    /** This organisation's SMS campaigns (the tenant scope applies). */
    public static function query(): Builder
    {
        return SmsCampaign::query();
    }

    /**
     * The editor's choices: the tags (CampaignTags', the email campaigns' own), the sample a preview and a test fill
     * them with (the viewer's own), the limits, and whether the venue's Twilio account is set up. The workspace keeps
     * no copy of any of them.
     *
     * @return array<string, mixed>
     */
    public static function options(User $viewer, int $orgId): array
    {
        $twilio = app(TwilioSms::class)->readiness($orgId);

        return CampaignTags::options() + [
            'sample'      => CampaignTags::sample($viewer, $orgId),
            'max_name'    => self::MAX_NAME,
            'max_body'    => self::MAX_BODY,
            'limit'       => self::LIMIT,
            'gsm'         => ['single' => SmsText::GSM_SINGLE, 'part' => SmsText::GSM_PART],
            'ucs2'        => ['single' => SmsText::UCS2_SINGLE, 'part' => SmsText::UCS2_PART],
            'twilio'      => $twilio,
        ];
    }

    /**
     * The text with the values filled, as plain text: each line through CampaignTags::subject (every value on one line,
     * no control characters), the line breaks of the text kept.
     *
     * @param array<string, string> $values CampaignTags::forMember() or ::sample()
     */
    public static function fill(string $text, array $values): string
    {
        return implode("\n", array_map(fn (string $line) => CampaignTags::subject($line, $values), explode("\n", SmsText::normalise($text))));
    }

    /** What a draft still lacks before it can be sent: a text. (A segment is the audience's own check, `no_audience`.) @return list<string> */
    public static function incomplete(SmsCampaign $c): array
    {
        return trim((string) $c->body) === '' ? ['body'] : [];
    }

    /** The draft's revision as its page shows it and Send sends it back. */
    public static function revision(SmsCampaign $c): string
    {
        return (string) $c->updated_at?->toIso8601String();
    }
}
