<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\Urls;
use PHPUnit\Framework\TestCase;

/** Addresses as the scan compares them (spec 2026-10-20 §3.2–§3.4). */
class UrlsTest extends TestCase
{
    public function test_relative_addresses_are_read_against_their_page(): void
    {
        $this->assertSame('https://ex.com/a/b', Urls::absolute('/a/b', 'https://ex.com/x/y'));
        $this->assertSame('https://ex.com/x/c', Urls::absolute('c', 'https://ex.com/x/y'));
        $this->assertSame('https://ex.com/x/c', Urls::absolute('../c', 'https://ex.com/x/y/z'));
        $this->assertSame('https://cdn.ex.com/i.png', Urls::absolute('//cdn.ex.com/i.png', 'https://ex.com/'));
        $this->assertSame('https://ex.com/blog/?p=5', Urls::absolute('?p=5', 'https://ex.com/blog/'));
        $this->assertSame('https://ex.com/A', Urls::absolute('HTTPS://EX.com:443/A#frag', 'https://other.com/'));
    }

    public function test_fragments_and_other_schemes_are_no_address(): void
    {
        $this->assertNull(Urls::absolute('#top', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('mailto:ann@ex.com', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('javascript:void(0)', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('', 'https://ex.com/'));
    }

    public function test_the_normal_form_lowercases_drops_default_ports_fragments_and_dot_segments(): void
    {
        $this->assertSame('https://ex.com/', Urls::normalize('https://Ex.com'));
        $this->assertSame('http://ex.com/a/c?q=1', Urls::normalize('http://ex.com:80/a/./b/../c?q=1#x'));
        $this->assertSame('https://ex.com:8443/', Urls::normalize('https://ex.com:8443/'));
        $this->assertSame('https://ex.com/x', Urls::normalize('https://ex.com/../x'));
        $this->assertNull(Urls::normalize('ftp://ex.com/'));
        $this->assertNull(Urls::normalize('not an address'));
    }

    public function test_origin_path_and_query(): void
    {
        $this->assertSame('https://ex.com', Urls::origin('https://ex.com/a/b?x'));
        $this->assertSame('/a', Urls::path('https://ex.com/a?b=1'));
        $this->assertSame('/a?b=1', Urls::pathAndQuery('https://ex.com/a?b=1'));
        $this->assertSame('/', Urls::pathAndQuery('https://ex.com'));
    }
}
