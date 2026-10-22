<?php

namespace App\Services\Email;

use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use App\Services\MailIdentityService;
use Illuminate\Support\Str;

/**
 * Tags in an email campaign's subject and body, filled per member (spec 2026-10-22 HexaTech Loyalty release 3 §4).
 * One renderer for the shared SendEmailCampaignChunk (the full admin's campaigns and the workspace's), both test sends
 * (EmailCampaignController::test and the workspace's CampaignController::test) and the workspace's preview.
 *
 * The tags are the ones EmailTemplate::AVAILABLE_TAGS names, and three the full admin's block builder writes in its
 * starter templates (`{{member.name}}`, `{{member.tier}}`, `{{member.points}}`), read as the template tags they mean.
 * A tag is matched exactly as written; anything else in double braces stays as written (`unknown()` lists it, so the
 * workspace can say so before sending).
 *
 * The values are filled after the body was rendered, in one pass (strtr: a value is never searched again, so a member
 * named "{{email}}" stays "{{email}}"): HTML-escaped in the body, so a member's name can never add markup, and as
 * plain text on one line in the subject. EmailTemplate::render() stays as it is (separate code with the same tag list):
 * a template's values go in unescaped and its `{{hotel_name}}` is the `company_name` setting; a campaign's is the name
 * it is sent under, the one its footer names.
 */
final class CampaignTags
{
    /** The builder's own tags, each read as the template tag it means. */
    public const ALIASES = [
        '{{member.name}}'   => '{{member_name}}',
        '{{member.tier}}'   => '{{tier_name}}',
        '{{member.points}}' => '{{points_balance}}',
    ];

    /** What a test email or a preview shows for the member's own number, code and points. */
    public const SAMPLE_NUMBER = 'SAMPLE-0001';
    public const SAMPLE_CODE = 'SAMPLE';
    public const SAMPLE_POINTS = 1250;
    public const SAMPLE_LIFETIME = 3400;

    /** Double braces and what is between them: what reads as a tag. */
    private const PATTERN = '/\{\{[^{}]*\}\}/';

    /** Every tag that is filled, in the order EmailTemplate names them, then the builder's. @return list<string> */
    public static function known(): array
    {
        return [...array_keys(EmailTemplate::AVAILABLE_TAGS), ...array_keys(self::ALIASES)];
    }

    /**
     * The tags the workspace's editor offers (EmailTemplate's, with its English description) and every tag that is
     * filled, served with each campaign so the editor keeps no list of its own.
     *
     * @return array{tags: list<array{tag: string, name: string, label: string}>, known_tags: list<string>}
     */
    public static function options(): array
    {
        $tags = [];
        foreach (EmailTemplate::AVAILABLE_TAGS as $tag => $label) {
            $tags[] = ['tag' => $tag, 'name' => trim($tag, '{}'), 'label' => $label];
        }

        return ['tags' => $tags, 'known_tags' => self::known()];
    }

    /**
     * A member's values, as plain text.
     *
     * @param string $venue the name the email is sent under (`venueName()`, the job's sender name)
     * @return array<string, string>
     */
    public static function forMember(LoyaltyMember $member, string $venue): array
    {
        $name = trim((string) ($member->user?->name ?? ''));

        return self::withAliases([
            '{{member_name}}'     => $name,
            '{{first_name}}'      => self::firstName($name),
            '{{email}}'           => (string) ($member->user?->email ?? ''),
            '{{member_number}}'   => (string) ($member->member_number ?? ''),
            '{{tier_name}}'       => (string) ($member->tier?->name ?? ''),
            '{{points_balance}}'  => number_format((int) $member->current_points),
            '{{lifetime_points}}' => number_format((int) $member->lifetime_points),
            '{{referral_code}}'   => (string) ($member->referral_code ?? ''),
            '{{hotel_name}}'      => $venue,
            '{{current_year}}'    => now()->format('Y'),
        ]);
    }

    /**
     * The sample a test email and the workspace's preview are filled with: the sender's own name and address, the
     * programme's entry tier, the venue's name, and marked sample values for the member's number, code and points.
     * Never a real member's: a test lands in a staff inbox and the audit log, where a member's details have no
     * business, and the sender sees at once that the name was filled in.
     *
     * @return array<string, string>
     */
    public static function sample(User $sender, int $organizationId): array
    {
        $name = trim((string) $sender->name) ?: Str::before((string) $sender->email, '@');
        $tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $organizationId)->where('is_active', true)
            ->orderBy('min_points')->orderBy('sort_order')->orderBy('id')->value('name');

        return self::withAliases([
            '{{member_name}}'     => $name,
            '{{first_name}}'      => self::firstName($name),
            '{{email}}'           => (string) $sender->email,
            '{{member_number}}'   => self::SAMPLE_NUMBER,
            '{{tier_name}}'       => (string) ($tier ?? ''),
            '{{points_balance}}'  => number_format(self::SAMPLE_POINTS),
            '{{lifetime_points}}' => number_format(self::SAMPLE_LIFETIME),
            '{{referral_code}}'   => self::SAMPLE_CODE,
            '{{hotel_name}}'      => self::venueName($organizationId),
            '{{current_year}}'    => now()->format('Y'),
        ]);
    }

    /**
     * The name a venue's campaign is sent under, as SendEmailCampaignChunk sends it: the venue's sender name when it
     * set one, its organisation's name otherwise.
     */
    public static function venueName(int $organizationId): string
    {
        $identity = app(MailIdentityService::class)->forOrganization($organizationId);

        return (string) ($identity['from_name'] ?: Organization::withoutGlobalScopes()->whereKey($organizationId)->value('name') ?: '');
    }

    /** The subject with the values filled, as plain text on one line. @param array<string, string> $values */
    public static function subject(string $subject, array $values): string
    {
        return self::oneLine(strtr($subject, array_map(fn (string $v) => self::oneLine($v), $values)));
    }

    /** The HTML with the values filled, each escaped. @param array<string, string> $values */
    public static function html(string $html, array $values): string
    {
        return strtr($html, array_map(fn (string $v) => e($v), $values));
    }

    /**
     * What reads as a tag in these texts but is not filled, each once, in the order they first appear.
     *
     * @return list<string>
     */
    public static function unknown(string ...$texts): array
    {
        $known = array_flip(self::known());
        $out = [];
        foreach ($texts as $text) {
            preg_match_all(self::PATTERN, $text, $found);
            foreach ($found[0] as $tag) {
                if (!isset($known[$tag])) {
                    $out[$tag] = true;
                }
            }
        }

        return array_map('strval', array_keys($out));
    }

    /** @param array<string, string> $values @return array<string, string> */
    private static function withAliases(array $values): array
    {
        foreach (self::ALIASES as $alias => $tag) {
            $values[$alias] = $values[$tag] ?? '';
        }

        return $values;
    }

    private static function firstName(string $name): string
    {
        return (string) (preg_split('/\s+/u', $name, 2)[0] ?? '');
    }

    /** No line breaks or other control characters: a header value. */
    private static function oneLine(string $text): string
    {
        // Byte by byte when the text is not valid UTF-8 (the /u pattern then fails).
        return (string) (preg_replace('/\p{Cc}+/u', ' ', $text) ?? preg_replace('/[\x00-\x1F\x7F]+/', ' ', $text));
    }
}
