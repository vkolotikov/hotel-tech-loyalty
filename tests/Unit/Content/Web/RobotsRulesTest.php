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

    // Final review (6-1), deferred minor: a group named by a part of our name ("bot") applied to us (RFC 9309 §2.2.1).
    public function test_only_a_group_naming_our_robot_is_ours(): void
    {
        $this->assertTrue(RobotsRules::parse("User-agent: bot\nDisallow: /\n", self::AGENT)->allows('/a'));
        $this->assertTrue(RobotsRules::parse("User-agent: Content\nDisallow: /\n\nUser-agent: *\nAllow: /\n", self::AGENT)->allows('/a'));
        $this->assertFalse(RobotsRules::parse("User-agent: HexaTechContentBot/1.0\nDisallow: /\n", self::AGENT)->allows('/a'));
        $this->assertFalse(RobotsRules::parse("User-agent: HEXATECHCONTENTBOT\nDisallow: /\n", self::AGENT)->allows('/a'));
    }

    // Final review (6-1), deferred minor: patterns with many stars leaned on the regex engine's limits.
    public function test_patterns_with_many_stars_do_not_lean_on_the_regex_engine(): void
    {
        $limit = (string) ini_get('pcre.backtrack_limit');
        $jit = (string) ini_get('pcre.jit');
        ini_set('pcre.backtrack_limit', '100');
        ini_set('pcre.jit', '0');
        try {
            $rules = RobotsRules::parse("User-agent: *\nDisallow: /*a*a*a*a*a*.pdf$\n", self::AGENT);
            $this->assertFalse($rules->allows('/' . str_repeat('a', 3000) . '.pdf'));
            $this->assertTrue($rules->allows('/' . str_repeat('a', 3000) . '.pdfx'));
            $this->assertFalse(RobotsRules::parse("User-agent: *\nDisallow: /x*y\n", self::AGENT)->allows('/x-long-y-tail'));
            $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow: /x*y$\n", self::AGENT)->allows('/x-y-z'));
            $this->assertFalse(RobotsRules::parse("User-agent: *\nDisallow: /x*y$\n", self::AGENT)->allows('/x-y-z-y'));
            $this->assertFalse(RobotsRules::parse("User-agent: *\nDisallow: /a*b*a\n", self::AGENT)->allows('/aba'));
            $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow: /ab$\n", self::AGENT)->allows('/abab'));
        } finally {
            ini_set('pcre.backtrack_limit', $limit);
            ini_set('pcre.jit', $jit);
        }
    }
}
