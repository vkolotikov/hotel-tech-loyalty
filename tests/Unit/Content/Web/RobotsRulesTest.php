<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\RobotsRules;
use PHPUnit\Framework\TestCase;

/** robots.txt as the scan obeys it (spec 2026-10-20 §3.5). */
class RobotsRulesTest extends TestCase
{
    private const AGENT = 'HexaTechContentBot';

    public function test_the_star_group_applies_and_the_longest_rule_wins(): void
    {
        $rules = RobotsRules::parse("User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: Googlebot\nDisallow: /\n\nSitemap: https://ex.com/sitemap.xml", self::AGENT);

        $this->assertTrue($rules->allows('/x'));
        $this->assertFalse($rules->allows('/private/a'));
        $this->assertTrue($rules->allows('/private/open/b'));
        $this->assertSame(['https://ex.com/sitemap.xml'], $rules->sitemaps);
    }

    public function test_a_group_naming_our_robot_replaces_the_star_group(): void
    {
        $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow: /\n\nUser-agent: HexaTechContentBot\nAllow: /\n", self::AGENT)->allows('/a'));
        $mine = RobotsRules::parse("User-agent: *\nDisallow:\n\nUser-agent: hexatechcontentbot\nDisallow: /blog\n", self::AGENT);
        $this->assertFalse($mine->allows('/blog/x'));
        $this->assertTrue($mine->allows('/x'));
    }

    public function test_wildcards_and_the_end_anchor(): void
    {
        $rules = RobotsRules::parse("User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*", self::AGENT);

        $this->assertFalse($rules->allows('/a/b.pdf'));
        $this->assertTrue($rules->allows('/a/b.pdf?x=1'));
        $this->assertFalse($rules->allows('/searching'));
        $this->assertTrue($rules->allows('/x'));
    }

    public function test_an_allow_wins_a_tie_and_an_empty_disallow_allows_everything(): void
    {
        $this->assertTrue(RobotsRules::parse("User-agent: *\nAllow: /a\nDisallow: /a", self::AGENT)->allows('/a'));
        $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow:", self::AGENT)->allows('/'));
        $this->assertFalse(RobotsRules::parse("User-agent: *\nDisallow: /", self::AGENT)->allows('/'));
    }

    public function test_comments_line_ends_and_shared_groups(): void
    {
        $this->assertFalse(RobotsRules::parse("User-agent: * # all\r\nDisallow: /x # no\r\n", self::AGENT)->allows('/x'));
        $this->assertFalse(RobotsRules::parse("User-agent: other\nUser-agent: *\nDisallow: /z", self::AGENT)->allows('/z'));
        $this->assertTrue(RobotsRules::parse('<html><body>Not found</body></html>', self::AGENT)->allows('/anything'));
        $this->assertTrue(RobotsRules::allowAll()->allows('/anything'));
    }
}
