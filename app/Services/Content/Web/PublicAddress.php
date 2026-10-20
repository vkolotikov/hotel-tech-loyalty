<?php

namespace App\Services\Content\Web;

/**
 * Which addresses the scan may read (spec 2026-10-20 §3.1, §3.5): a web address on a public host only, so a manager can
 * never point Content at a private network, the cloud's metadata service or the server itself.
 */
final class PublicAddress
{
    /** Ranges no scan connects to, beyond PHP's private and reserved flags. */
    private const BLOCKED = [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
        '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
        '::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32', '2001::/32', '2002::/16', '100::/64',
        // Final review: local-use NAT64, IPv4-translated and the old site-local range.
        '64:ff9b:1::/48', '::ffff:0:0:0/96', 'fec0::/10',
    ];

    /**
     * The address as typed (trimmed) when a scan may read it: http or https, a host with a dot (or a public IP), no
     * user or password, port 80, 443 or none, no spaces, up to 2,000 characters. Null otherwise.
     */
    public static function clean(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '' || mb_strlen($value) > 2000 || preg_match('/[\s\x00-\x1F\x7F]/u', $value) === 1) {
            return null;
        }
        $parts = parse_url($value);
        if ($parts === false || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
            return null;
        }
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        if ($host === '' || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        if (isset($parts['port']) && !in_array((int) $parts['port'], [80, 443], true)) {
            return null;
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return self::isPublicIp($host) ? $value : null;
        }
        // An international name is asked for by its ASCII form (punycode), the form DNS and curl both use.
        if (preg_match('/[^\x00-\x7F]/', $host) === 1) {
            $ascii = function_exists('idn_to_ascii') ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) : false;
            if (!is_string($ascii) || $ascii === '') {
                return null;
            }
            $host = strtolower($ascii);
        }
        // The host as it is stored and asked for: lowercase (and ASCII).
        $value = (string) preg_replace('#^(https?://)[^/:?\#]+#i', '${1}' . $host, $value, 1);
        // Final review: curl decodes a %-escaped host before it looks for its pin, so a host is plain letters, digits,
        // dots and hyphens; and no label is a number (127.1, 0x7f.1 and 0177.0.0.1 are addresses in disguise).
        if (preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)+$/', $host) !== 1) {
            return null;
        }
        $labels = explode('.', $host);
        if (array_filter($labels, fn (string $label) => preg_match('/^(\d+|0x[0-9a-f]*)$/', $label) !== 1) === []) {
            return null;
        }
        if ($host === 'localhost' || preg_match('/\.(localhost|local|internal|lan|home|corp)$/', $host) === 1) {
            return null;
        }

        return $value;
    }

    public static function isPublicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }
        if (str_contains($ip, ':')) {
            $packed = (string) inet_pton($ip);
            // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) reach the IPv4 address inside.
            if (str_starts_with($packed, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($packed, "\x00\x64\xff\x9b" . str_repeat("\0", 8))) {
                return self::isPublicIp((string) inet_ntop(substr($packed, 12)));
            }
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        foreach (self::BLOCKED as $cidr) {
            if (self::inRange($ip, $cidr)) {
                return false;
            }
        }

        return true;
    }

    private static function inRange(string $ip, string $cidr): bool
    {
        [$network, $bits] = explode('/', $cidr);
        $address = @inet_pton($ip);
        $net = @inet_pton($network);
        if ($address === false || $net === false || strlen($address) !== strlen($net)) {
            return false;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (substr($address, 0, $bytes) !== substr($net, 0, $bytes)) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;

        return (ord($address[$bytes]) & $mask) === (ord($net[$bytes]) & $mask);
    }
}
