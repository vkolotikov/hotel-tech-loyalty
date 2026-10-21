<?php

namespace Tests\Feature\Content;

use App\Services\Content\Web\HostResolver;
use App\Services\Content\Web\WebFetcher;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesWebsite;
use Tests\TestCase;

/** The scan's GET (spec 2026-10-20 §3.5): public hosts only, redirects checked again, sizes and types capped. */
class WebFetcherTest extends TestCase
{
    use FakesWebsite;

    private function fetcher(): WebFetcher
    {
        return app(WebFetcher::class);
    }

    public function test_a_page_is_read_as_the_robot_names_itself(): void
    {
        $this->fakeWebsite(['https://lumiere.example/' => '<html><title>Hi</title></html>']);

        $page = $this->fetcher()->get('https://lumiere.example/', WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);

        $this->assertSame('https://lumiere.example/', $page->url);
        $this->assertSame('text/html', $page->type);
        $this->assertStringContainsString('<title>Hi</title>', $page->body);
        Http::assertSent(fn (Request $request) => str_starts_with($request->header('User-Agent')[0] ?? '', 'HexaTechContentBot/1.0 (+'));
    }

    public function test_redirects_are_followed_and_the_final_address_is_kept(): void
    {
        $this->fakeWebsite([
            'http://lumiere.example/' => ['', 301, ['Location' => 'https://www.lumiere.example/']],
            'https://www.lumiere.example/' => '<html>ok</html>',
        ]);

        $this->assertSame('https://www.lumiere.example/', $this->fetcher()->get('http://lumiere.example/', WebFetcher::HTML_BYTES)->url);
    }

    public function test_a_redirect_to_a_private_address_or_port_is_refused(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/a' => ['', 302, ['Location' => 'http://10.0.0.1/admin']],
            'https://lumiere.example/b' => ['', 302, ['Location' => 'https://lumiere.example:8080/']],
        ]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/a', 1000, [], $why));
        $this->assertSame('bad_address', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/b', 1000, [], $why));
        $this->assertSame('bad_address', $why);
    }

    public function test_a_host_resolving_to_a_private_address_is_never_asked(): void
    {
        $this->fakeWebsite(['https://intranet.example/' => 'secret'], ['intranet.example' => ['93.184.216.34', '192.168.1.10']]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://intranet.example/', 1000, [], $why));
        $this->assertSame('bad_address', $why);
        Http::assertNothingSent();
    }

    public function test_a_host_that_does_not_resolve_is_unreachable(): void
    {
        $this->fakeWebsite([], ['gone.example' => []]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://gone.example/', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }

    public function test_answers_other_than_200_say_why(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/down' => ['oops', 500],
            'https://lumiere.example/busy' => ['slow down', 429],
            'https://lumiere.example/closed' => ['no', 403],
        ]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/missing', 1000, [], $why));
        $this->assertSame('not_found', $why);
        // Final review (6-1): robots.txt needs a server error told apart from a refusal (RFC 9309 §2.3.1).
        $this->assertNull($this->fetcher()->get('https://lumiere.example/down', 1000, [], $why));
        $this->assertSame('server_error', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/busy', 1000, [], $why));
        $this->assertSame('server_error', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/closed', 1000, [], $why));
        $this->assertSame('refused', $why);
    }

    public function test_the_wrong_type_and_too_big_bodies_are_skipped(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/file' => ['%PDF', 200, ['Content-Type' => 'application/pdf']],
            'https://lumiere.example/big' => [str_repeat('a', 2000), 200, ['Content-Length' => '2000']],
            'https://lumiere.example/sneaky' => [str_repeat('a', 2000)],
        ]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/file', 1000, WebFetcher::HTML_TYPES, $why));
        $this->assertSame('wrong_type', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/big', 1000, [], $why));
        $this->assertSame('too_big', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/sneaky', 1000, [], $why));
        $this->assertSame('too_big', $why);
    }

    // Fixes-batch review: robots.txt reads nothing only on a server error or no answer, so redirects and odd answers say so.
    public function test_a_redirect_loop_and_an_odd_answer_say_what_they_are(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/loop' => ['', 302, ['Location' => '/loop']],
            'https://lumiere.example/empty' => ['', 204],
            'https://lumiere.example/nowhere' => ['', 302],
        ]);
        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/loop', 1000, [], $why));
        $this->assertSame('redirects', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/empty', 1000, [], $why));
        $this->assertSame('unexpected', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/nowhere', 1000, [], $why));
        $this->assertSame('unexpected', $why);
    }

    /**
     * Final review: the pin is CURLOPT_CONNECT_TO with an empty source host, so it holds however curl spells the host
     * (CURLOPT_RESOLVE is keyed by the host as written, and curl decodes %-escapes before it looks).
     */
    public function test_the_connection_is_pinned_whatever_the_hosts_spelling(): void
    {
        $this->assertSame([CURLOPT_CONNECT_TO => ['::93.184.216.34:443']], WebFetcher::connectTo('93.184.216.34', 443));
        $this->assertSame([CURLOPT_CONNECT_TO => ['::[2606:4700:4700::1111]:80']], WebFetcher::connectTo('2606:4700:4700::1111', 80));
    }

    public function test_an_international_host_is_asked_for_by_its_ascii_name(): void
    {
        $this->fakeWebsite(['https://xn--e1afmkfd.xn--p1ai/' => '<html><title>Пример</title></html>']);

        $this->assertSame('https://xn--e1afmkfd.xn--p1ai/', $this->fetcher()->get('https://пример.рф/', 1000)->url);
    }

    public function test_a_dead_connection_is_unreachable(): void
    {
        // Its own fake: stubs add up and the first registered wins, so fakeWebsite's catch-all would answer first.
        $this->app->instance(HostResolver::class, new class extends HostResolver {
            public function resolve(string $host): array
            {
                return ['93.184.216.34'];
            }
        });
        Http::fake(fn () => throw new ConnectionException('Connection refused'));

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }
}
