<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\PublicAddress;
use PHPUnit\Framework\TestCase;

/** Only public addresses are read (spec 2026-10-20 §3.1, §3.5). */
class PublicAddressTest extends TestCase
{
    public function test_a_website_address_is_accepted(): void
    {
        foreach (['https://example.com', 'http://example.com/blog', 'https://example.com:443/x', ' https://example.com/a ', 'https://93.184.216.34/'] as $address) {
            $this->assertNotNull(PublicAddress::clean($address), $address);
        }
        $this->assertSame('https://example.com/a', PublicAddress::clean(' https://example.com/a '));
    }

    public function test_anything_else_is_refused(): void
    {
        $refused = [
            'ftp://example.com', 'https://localhost', 'https://intranet', 'https://shop.local', 'https://db.internal',
            'https://10.0.0.1', 'https://127.0.0.1/', 'https://[::1]/', 'https://example.com:8080', 'https://user:pw@example.com',
            'https://exa mple.com', '', 'example.com', 'https://' . str_repeat('a', 1990) . '.com', 'javascript:alert(1)',
        ];
        foreach ($refused as $address) {
            $this->assertNull(PublicAddress::clean($address), $address);
        }
        $this->assertNull(PublicAddress::clean(null));
        $this->assertNull(PublicAddress::clean(['https://example.com']));
    }

    /** Final review: curl decodes a %-escaped host before its pin, so a host is plain ASCII letters, digits, dots and hyphens. */
    public function test_a_host_must_be_plain_letters_digits_dots_and_hyphens(): void
    {
        foreach (['https://exa%6dple.com/', 'https://example.com./', 'https://.example.com', 'https://ex..ample.com', 'https://127.1/',
            'https://0x7f.1/', 'https://2130706433/', 'https://ex_ample.com', 'https://0177.0.0.1/'] as $address) {
            $this->assertNull(PublicAddress::clean($address), $address);
        }
        $this->assertSame('https://xn--e1afmkfd.xn--p1ai/blog', PublicAddress::clean('https://пример.рф/blog'));
        $this->assertSame('https://shop.example.com/a', PublicAddress::clean('https://Shop.Example.com/a'));
    }

    public function test_private_reserved_and_mapped_ips_are_not_public(): void
    {
        $blocked = [
            '10.1.2.3', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
            '255.255.255.255', '192.0.2.10', '198.18.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
            '::ffff:10.0.0.1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:a00:1::1', 'not an ip',
            // Final review: local-use NAT64, IPv4-translated and site-local forms.
            '64:ff9b:1::a00:1', '::ffff:0:a00:1', 'fec0::1',
        ];
        foreach ($blocked as $ip) {
            $this->assertFalse(PublicAddress::isPublicIp($ip), $ip);
        }
    }

    public function test_public_ips_are_public(): void
    {
        foreach (['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8'] as $ip) {
            $this->assertTrue(PublicAddress::isPublicIp($ip), $ip);
        }
    }
}
