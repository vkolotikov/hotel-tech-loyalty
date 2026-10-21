<?php

namespace Tests\Concerns;

use App\Services\Content\Web\HostResolver;
use Illuminate\Support\Facades\Http;

/**
 * A website for the scan's tests (spec 2026-10-20 §3): DNS and HTTP both faked, nothing reaches the network. Every host
 * resolves to a public address unless `$ips` says otherwise; each address answers its page; anything else is a 404.
 */
trait FakesWebsite
{
    /**
     * @param array<string, string|array{0: string, 1?: int, 2?: array<string, string>}> $pages address => body, or [body, status, headers]
     * @param array<string, list<string>> $ips host => the addresses it resolves to
     */
    protected function fakeWebsite(array $pages, array $ips = []): void
    {
        // A test that scans twice gives the second site its own fake: stubs add up and the first registered wins.
        Http::swap(new \Illuminate\Http\Client\Factory($this->app->make('events')));
        $this->app->instance(HostResolver::class, new class($ips) extends HostResolver {
            /** @param array<string, list<string>> $ips */
            public function __construct(private array $ips)
            {
            }

            public function resolve(string $host): array
            {
                return $this->ips[$host] ?? ['93.184.216.34'];
            }
        });
        Http::preventStrayRequests();
        $stubs = [];
        foreach ($pages as $url => $page) {
            // A closure answers for itself (it may throw, as a connection that never answers).
            if ($page instanceof \Closure) {
                $stubs[$url] = $page;
                continue;
            }
            [$body, $status, $headers] = is_array($page) ? [$page[0], $page[1] ?? 200, $page[2] ?? []] : [$page, 200, []];
            $stubs[$url] = Http::response($body, $status, $headers + ['Content-Type' => self::fakeTypeOf($url)]);
        }
        $stubs['*'] = Http::response('<html><body>Not found</body></html>', 404, ['Content-Type' => 'text/html']);
        Http::fake($stubs);
    }

    private static function fakeTypeOf(string $url): string
    {
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        return match (true) {
            str_ends_with($path, 'robots.txt')                                 => 'text/plain; charset=utf-8',
            str_ends_with($path, '.gz')                                        => 'application/gzip',
            str_ends_with($path, '.xml') || str_contains($path, '/feed')       => 'application/xml; charset=utf-8',
            (bool) preg_match('/\.(png)$/', $path)                             => 'image/png',
            (bool) preg_match('/\.(jpe?g)$/', $path)                           => 'image/jpeg',
            default                                                            => 'text/html; charset=utf-8',
        };
    }

    /** A 1×1 PNG, a picture the media store accepts. */
    protected static function pngBytes(): string
    {
        return (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    }
}
