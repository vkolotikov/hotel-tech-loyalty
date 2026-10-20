<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentLinks;
use App\Services\Content\ContentRefused;
use PHPUnit\Framework\TestCase;

/** The pure parts of tracked links (spec 2026-10-19 §5.1, §5.2). */
class ContentLinksTest extends TestCase
{
    private const TAGS = ['utm_source' => 'instagram', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => 'post-5'];
    private const ADDED = 'utm_source=instagram&utm_medium=social&utm_campaign=content-plan&utm_content=post-5';

    public function test_a_plain_address_gets_every_tag(): void
    {
        $this->assertSame('https://lumiere.example/autumn?' . self::ADDED, ContentLinks::target('https://lumiere.example/autumn', self::TAGS));
        $this->assertSame('https://lumiere.example?' . self::ADDED, ContentLinks::target('https://lumiere.example', self::TAGS));
    }

    // Review Focus 2
    public function test_a_tag_the_address_carries_is_kept_and_so_are_its_query_and_fragment(): void
    {
        $this->assertSame(
            'https://lumiere.example/book?utm_source=newsletter&ref=7&utm_medium=social&utm_campaign=content-plan&utm_content=post-5#prices',
            ContentLinks::target('https://lumiere.example/book?utm_source=newsletter&ref=7#prices', self::TAGS),
        );
        // A tag without a value is still the address's own.
        $this->assertSame(
            'https://lumiere.example/?utm_campaign&utm_source=instagram&utm_medium=social&utm_content=post-5',
            ContentLinks::target('https://lumiere.example/?utm_campaign', self::TAGS),
        );
        // A key that only ends like a tag is not that tag.
        $this->assertSame('https://lumiere.example/?xutm_source=1&' . self::ADDED, ContentLinks::target('https://lumiere.example/?xutm_source=1', self::TAGS));
    }

    // Review Focus 1: the Location header stays ASCII.
    public function test_a_non_ascii_address_leaves_in_ascii(): void
    {
        if (!function_exists('idn_to_ascii')) {
            $this->markTestSkipped('intl is not loaded');
        }
        $this->assertSame(
            'https://xn--e1afmkfd.xn--p1ai/' . rawurlencode('путь') . '?q=' . rawurlencode('да') . '&' . self::ADDED . '#' . rawurlencode('якорь'),
            ContentLinks::target('https://пример.рф/путь?q=да#якорь', self::TAGS),
        );
        $this->assertSame('https://lumiere.example/caf%C3%A9?' . self::ADDED, ContentLinks::target('https://lumiere.example/café', self::TAGS));
    }

    public function test_the_campaign_tag_is_the_campaign_name_as_a_slug_or_content_plan(): void
    {
        $this->assertSame(
            ['utm_source' => 'linkedin', 'utm_medium' => 'social', 'utm_campaign' => 'autumn-offer-2026', 'utm_content' => 'post-7'],
            ContentLinks::postTags('linkedin', 'Autumn Offer 2026!', 7),
        );
        $this->assertSame('content-plan', ContentLinks::postTags('x', null, 7)['utm_campaign']);
        $this->assertSame('content-plan', ContentLinks::postTags('x', '!!!', 7)['utm_campaign']);
        $cyrillic = ContentLinks::postTags('x', 'Осенняя акция', 7)['utm_campaign'];
        $this->assertMatchesRegularExpression('/^[a-z0-9-]+$/', $cyrillic);
        $this->assertNotSame('content-plan', $cyrillic);
    }

    // Owner, 2026-10-20: an email or blog post's clicks are a referral in Google Analytics, not social.
    public function test_email_and_blog_posts_are_tagged_as_a_referral_and_every_other_platform_as_social(): void
    {
        $this->assertSame('referral', ContentLinks::postTags('email', null, 7)['utm_medium']);
        $this->assertSame('referral', ContentLinks::postTags('blog', 'Spring', 7)['utm_medium']);
        foreach (['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube'] as $platform) {
            $this->assertSame('social', ContentLinks::postTags($platform, null, 7)['utm_medium'], $platform);
        }
        $this->assertSame('email', ContentLinks::postTags('email', null, 7)['utm_source']);
    }

    public function test_only_web_addresses_up_to_2000_characters_are_links(): void
    {
        $this->assertSame('https://lumiere.example/a', ContentLinks::clean('  https://lumiere.example/a  '));
        $this->assertNull(ContentLinks::clean(''));
        $this->assertNull(ContentLinks::clean('   '));
        $this->assertNull(ContentLinks::clean(null));
        $longest = 'https://lumiere.example/' . str_repeat('a', 2000 - 24);
        $this->assertSame($longest, ContentLinks::clean($longest));
        $bad = [
            'ftp://lumiere.example', 'javascript:alert(1)', 'lumiere.example/a', 'https://', 'https:lumiere.example',
            "https://lumiere.example/a\nb", 'https://lumiere .example', 'mailto:hello@lumiere.example', $longest . 'a',
            ['https://lumiere.example'],
        ];
        foreach ($bad as $value) {
            try {
                ContentLinks::clean($value);
                $this->fail('accepted: ' . json_encode($value));
            } catch (ContentRefused $e) {
                $this->assertSame('bad_link', $e->errorCode);
                $this->assertSame(422, $e->status);
            }
        }
    }
}
