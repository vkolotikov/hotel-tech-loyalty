<?php

namespace Tests\Unit\Portal;

use App\Services\Portal\PortalLinks;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * PortalLinks::resolve() is the pure decision behind base(): given literal
 * booleans instead of app()->environment()/app()->runningInConsole(), it can
 * prove the safety-critical rule directly — no app.url AND production must
 * never fall through to a live request host. That branch was previously
 * unreachable from any Feature test, because app()->runningInConsole() is
 * always true under PHPUnit, which short-circuits the guard before the
 * environment is even checked.
 *
 * Extends Tests\TestCase (not plain PHPUnit\Framework\TestCase) only
 * because the claim()/join() tests below need the config() helper, which
 * resolves through the container; resolve() itself is called with literal
 * arguments and touches no framework state. No database trait is used —
 * nothing here touches one.
 */
class PortalLinksTest extends TestCase
{
    public static function environments(): array
    {
        return [
            'production, console'     => [true, true],
            'production, web'         => [true, false],
            'non-production, console' => [false, true],
            'non-production, web'     => [false, false],
        ];
    }

    #[DataProvider('environments')]
    public function test_a_configured_url_wins_in_every_environment_and_loses_its_trailing_slash(bool $production, bool $console): void
    {
        $this->assertSame(
            'https://cfg.example.test',
            PortalLinks::resolve('https://cfg.example.test/', $production, $console, 'https://host.example.test'),
        );
    }

    public function test_production_with_no_url_and_a_request_host_returns_null(): void
    {
        // The guarantee this whole extraction exists to make testable: even
        // with a live request host in hand, production must never leak it.
        $this->assertNull(
            PortalLinks::resolve(null, true, false, 'https://someone-forwarded-this.example.test'),
        );
    }

    public function test_non_production_web_with_no_url_returns_the_request_host(): void
    {
        $this->assertSame(
            'https://myapp.test',
            PortalLinks::resolve(null, false, false, 'https://myapp.test/'),
        );
    }

    public function test_non_production_console_with_no_url_returns_null(): void
    {
        // Console blocks the fallback on its own, independent of production —
        // a queued job or artisan command must not mint a request-host link.
        $this->assertNull(
            PortalLinks::resolve('', false, true, 'https://would-be-ignored.example.test'),
        );
    }

    public function test_an_empty_or_whitespace_configured_url_counts_as_unset(): void
    {
        $viaNull       = PortalLinks::resolve(null, false, false, 'https://myapp.test');
        $viaEmpty      = PortalLinks::resolve('', false, false, 'https://myapp.test');
        $viaWhitespace = PortalLinks::resolve('   ', false, false, 'https://myapp.test');

        $this->assertSame('https://myapp.test', $viaNull);
        $this->assertSame($viaNull, $viaEmpty);
        $this->assertSame($viaNull, $viaWhitespace);
    }

    public function test_claim_builds_the_claim_url(): void
    {
        config(['app.url' => 'https://app.example.test']);

        $this->assertSame('https://app.example.test/portal/claim', PortalLinks::claim());
    }

    public function test_join_builds_the_join_url_with_org_and_ref(): void
    {
        config(['app.url' => 'https://app.example.test']);

        $this->assertSame(
            'https://app.example.test/portal/join?org=tok&ref=REF1',
            PortalLinks::join('tok', 'REF1'),
        );
    }

    public function test_join_without_a_ref_omits_the_ref_query_param(): void
    {
        config(['app.url' => 'https://app.example.test']);

        $this->assertSame(
            'https://app.example.test/portal/join?org=tok',
            PortalLinks::join('tok'),
        );
    }

    public function test_join_url_encodes_both_the_token_and_the_ref(): void
    {
        config(['app.url' => 'https://app.example.test']);

        $url = PortalLinks::join('a token&b', 'ref value/x');

        $this->assertSame(
            'https://app.example.test/portal/join?org=' . urlencode('a token&b') . '&ref=' . urlencode('ref value/x'),
            $url,
        );
        // Concretely: neither raw separator survives into the query string.
        $this->assertStringContainsString('a+token%26b', $url);
        $this->assertStringContainsString('ref+value%2Fx', $url);
    }
}
