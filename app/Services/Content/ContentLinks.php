<?php

namespace App\Services\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use Illuminate\Support\Str;

/**
 * Tracked links (spec 2026-10-19 §5): a post's Link, or a link-in-bio button, as a short link on the public host,
 * `/go/{code}`, that adds UTM tags on the way out and counts clicks (ContentLinkClicks). The code is made once and kept:
 * changing the address keeps it, clearing it switches it off (`destination` null; the row stays, because the short link
 * may already be out in the world), entering one again switches the same code back on.
 */
final class ContentLinks
{
    /** No 0/o and no 1/l, so a code read aloud or copied by hand stays right (§5.1). */
    public const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
    public const LENGTH = 7;
    public const MAX = 2000;
    /** A link-in-bio button's tags (§5.2). */
    public const BUTTON_TAGS = ['utm_source' => 'link-in-bio', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => 'button'];

    /**
     * The address as sent, trimmed; null or '' is none. A link is http or https with a host, without spaces or control
     * characters (nothing can break the Location header), up to 2,000 characters (`bad_link`).
     */
    public static function clean(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            self::refuse();
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (mb_strlen($value) > self::MAX || preg_match('/[\s\x00-\x1F\x7F]/u', $value) !== 0) {
            self::refuse();
        }
        $parts = parse_url($value);
        if ($parts === false || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || ($parts['host'] ?? '') === '') {
            self::refuse();
        }

        return $value;
    }

    /** As clean(), for an address that must be there (a link-in-bio button's). */
    public static function cleanRequired(mixed $value): string
    {
        return self::clean($value) ?? self::refuse();
    }

    /**
     * A post's tags (§5.2): its platform, social — referral for email and blog —, its campaign's name as a slug (else
     * content-plan), post-{id}. @return array<string, string>
     */
    public static function postTags(string $platform, ?string $campaign, int $postId): array
    {
        $slug = Str::slug((string) $campaign);

        return [
            'utm_source'   => $platform,
            // Owner, 2026-10-20: an email or a blog post sends readers from outside social networks.
            'utm_medium'   => in_array($platform, ['email', 'blog'], true) ? 'referral' : 'social',
            'utm_campaign' => $slug !== '' ? $slug : 'content-plan',
            'utm_content'  => 'post-' . $postId,
        ];
    }

    /**
     * Where a live code sends the visitor (§5.2): the address with each tag it does not carry yet, its own query and
     * #fragment kept. The Location header is ASCII: a non-ASCII host goes out as punycode, any other non-ASCII byte
     * percent-encoded, as a browser sends it.
     *
     * @param array<string, string> $tags
     */
    public static function target(string $destination, array $tags): string
    {
        [$rest, $fragment] = array_pad(explode('#', $destination, 2), 2, null);
        [$base, $query] = array_pad(explode('?', $rest, 2), 2, null);
        $query = (string) $query;
        $missing = array_filter(
            $tags,
            fn (string $key) => preg_match('/(?:^|&)' . preg_quote($key, '/') . '(?:=|&|$)/', $query) !== 1,
            ARRAY_FILTER_USE_KEY,
        );
        $added = http_build_query($missing, '', '&', PHP_QUERY_RFC3986);
        $query = $query === '' ? $added : ($added === '' ? $query : $query . '&' . $added);
        $url = self::asciiHost($base) . ($query === '' ? '' : '?' . $query) . ($fragment === null ? '' : '#' . $fragment);

        return preg_replace_callback('/[^\x21-\x7E]/', fn (array $byte) => rawurlencode($byte[0]), $url);
    }

    /** A free code, drawn again on a clash (§5.1). `$draw` makes one random code; the default draws from ALPHABET. */
    public static function freshCode(?callable $draw = null): string
    {
        $draw ??= static function (): string {
            $code = '';
            for ($i = 0; $i < self::LENGTH; $i++) {
                $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }

            return $code;
        };
        for ($try = 0; $try < 10; $try++) {
            $code = $draw();
            if (!ContentLink::withoutGlobalScopes()->where('code', $code)->exists()) {
                return $code;
            }
        }

        throw new \RuntimeException('No free short-link code in 10 draws.');
    }

    /** A new live short link with its own code. @param array<string, string> $tags */
    public static function make(int $orgId, ?int $brandId, ?int $postId, string $destination, array $tags): ContentLink
    {
        return ContentLink::create([
            'organization_id' => $orgId,
            'brand_id'        => $brandId,
            'post_id'         => $postId,
            'code'            => self::freshCode(),
            'destination'     => $destination,
            'utm'             => $tags,
        ]);
    }

    /** The short link's address on the public host. */
    public static function shortUrl(string $code): string
    {
        return route('content.go', ['code' => $code]);
    }

    /** The post's short link, live or switched off; null when it never had a Link. */
    public static function ofPost(ContentPlannerPost $post): ?ContentLink
    {
        return ContentLink::withoutGlobalScopes()->where('post_id', $post->id)->first();
    }

    /** The post's tags as it is now (§5.2). @return array<string, string> */
    public static function tagsFor(ContentPlannerPost $post): array
    {
        $campaign = $post->campaign_id
            ? ContentPlannerCampaign::withoutGlobalScopes()->whereKey($post->campaign_id)->value('name')
            : null;

        return self::postTags((string) $post->platform, $campaign, (int) $post->id);
    }

    /** Would this address change the post's Link? A new Link is a change of words under approvals (§5.1). */
    public static function changes(ContentPlannerPost $post, ?string $destination): bool
    {
        return self::ofPost($post)?->destination !== $destination;
    }

    /** Sets the post's Link (§5.1): its short link is made once, changed in place, switched off by null and on again by an address. */
    public static function set(ContentPlannerPost $post, ?string $destination): void
    {
        $link = self::ofPost($post);
        if ($link !== null) {
            $link->update(['destination' => $destination, 'utm' => self::tagsFor($post)]);
        } elseif ($destination !== null) {
            self::make((int) $post->organization_id, (int) $post->brand_id, (int) $post->id, $destination, self::tagsFor($post));
        }
    }

    /** After the post's platform or campaign changed, its tags are worked out again (§5.2). */
    public static function retag(ContentPlannerPost $post): void
    {
        self::ofPost($post)?->update(['utm' => self::tagsFor($post)]);
    }

    /**
     * The panel's facts (§5.5, §7.2), or null for a post that never had a Link.
     *
     * @return array{code: string, short_url: string, destination: ?string, on: bool, clicks: int, clicks_bio: int, days: list<array{day: string, clicks: int}>}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        $link = self::ofPost($post);
        if ($link === null) {
            return null;
        }

        return [
            'code'        => (string) $link->code,
            'short_url'   => self::shortUrl((string) $link->code),
            'destination' => $link->destination,
            'on'          => $link->destination !== null,
        ] + ContentLinkClicks::summary($link);
    }

    /**
     * The original's address on each copy, each with its own code and tags (§5.1: versions, repeat copies, duplicates),
     * so clicks are counted per platform and per post. Nothing when the original's Link is unset or switched off.
     *
     * @param iterable<ContentPlannerPost> $copies
     */
    public static function copyTo(ContentPlannerPost $original, iterable $copies): void
    {
        $destination = self::ofPost($original)?->destination;
        if ($destination === null) {
            return;
        }
        foreach ($copies as $copy) {
            self::make((int) $copy->organization_id, (int) $copy->brand_id, (int) $copy->id, $destination, self::tagsFor($copy));
        }
    }

    /** `https://пример.рф/…` → `https://xn--e1afmkfd.xn--p1ai/…`; left as it is without intl (target() then percent-encodes it). */
    private static function asciiHost(string $base): string
    {
        return preg_replace_callback('#^(https?://(?:[^@/]*@)?)([^/:]+)#i', function (array $m): string {
            if (preg_match('/[^\x00-\x7F]/', $m[2]) !== 1 || !function_exists('idn_to_ascii')) {
                return $m[0];
            }
            $ascii = idn_to_ascii($m[2], IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);

            return $m[1] . ($ascii === false ? $m[2] : $ascii);
        }, $base, 1);
    }

    private static function refuse(): never
    {
        throw new ContentRefused('bad_link', 'The link must be a web address that starts with http:// or https://, up to 2,000 characters.', 422);
    }
}
