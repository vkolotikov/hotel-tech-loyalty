<?php

namespace App\Services\Content\Web;

use GuzzleHttp\Exception\TransferException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * The scan's GET (spec 2026-10-20 §3.5): it names itself, reaches public hosts only — every address a host resolves to
 * is checked and the connection pinned to the checked one, so a second lookup cannot point it elsewhere — follows at
 * most four redirects, each checked again, and stops reading past the size it was given.
 */
class WebFetcher
{
    public const AGENT = 'HexaTechContentBot';
    public const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
    public const HTML_BYTES = 3_145_728;
    public const XML_BYTES = 10_485_760;
    public const IMAGE_BYTES = 5_242_880;
    private const MAX_REDIRECTS = 4;

    public function __construct(private HostResolver $resolver)
    {
    }

    public static function userAgent(): string
    {
        return self::AGENT . '/1.0 (+' . rtrim((string) config('app.url'), '/') . ')';
    }

    /**
     * @param list<string> $types accepted media types, by prefix ([] = any)
     * @param-out ?string $why bad_address | unreachable (no answer) | not_found | server_error (5xx, 429) | refused (other
     *                         4xx) | unexpected (another status) | redirects (too many, or to no address) | wrong_type |
     *                         too_big, when null is answered
     */
    public function get(string $url, int $maxBytes, array $types = [], ?string &$why = null): ?WebResponse
    {
        $why = null;
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $target = $this->target($url, $why);
            if ($target === null) {
                return null;
            }
            [$url, $ip, $port] = $target;
            $tooBig = false;
            try {
                // Curl, not a stream: Guzzle sends a streamed request through PHP's stream handler, which ignores curl's
                // options (the pin). The size is held by curl's progress callback instead, which stops the transfer.
                $response = Http::withOptions([
                    'allow_redirects' => false,
                    'curl'            => self::connectTo($ip, $port),
                    'progress'        => function ($total, $downloaded) use ($maxBytes, &$tooBig) {
                        if ($total > $maxBytes || $downloaded > $maxBytes) {
                            $tooBig = true;
                            throw new \LengthException('The answer is larger than ' . $maxBytes . ' bytes.');
                        }
                    },
                ])
                    ->withHeaders(['User-Agent' => self::userAgent(), 'Accept' => '*/*'])
                    ->timeout(10)
                    ->connectTimeout(5)
                    ->get($url);
            } catch (ConnectionException|TransferException|\LengthException) {
                $why = $tooBig ? 'too_big' : 'unreachable';

                return null;
            }
            // The address curl reached must be the one checked (a fake answer carries no transfer facts).
            $reached = (string) ($response->handlerStats()['primary_ip'] ?? '');
            if ($reached !== '' && @inet_pton($reached) !== @inet_pton($ip)) {
                $why = 'bad_address';

                return null;
            }
            $status = $response->status();
            if ($status >= 300 && $status < 400 && $response->header('Location') !== '') {
                $next = Urls::absolute($response->header('Location'), $url);
                if ($next === null) {
                    $why = 'redirects';

                    return null;
                }
                $url = $next;
                continue;
            }
            if ($status !== 200) {
                // robots.txt tells a server error (read nothing) from a refusal or an odd answer — a 204, a redirect
                // without its address — (read everything): RFC 9309 §2.3.1.
                $why = match (true) {
                    in_array($status, [404, 410], true) => 'not_found',
                    $status === 429 || $status >= 500   => 'server_error',
                    $status >= 400                      => 'refused',
                    default                             => 'unexpected',
                };

                return null;
            }
            $header = $response->header('Content-Type');
            $type = strtolower(trim(explode(';', $header)[0]));
            if ($types !== [] && !self::accepts($type, $types)) {
                $why = 'wrong_type';

                return null;
            }
            if ((int) $response->header('Content-Length') > $maxBytes) {
                $why = 'too_big';

                return null;
            }
            $body = $response->body();
            if (strlen($body) > $maxBytes) {
                $why = 'too_big';

                return null;
            }

            return new WebResponse($url, $type, $body, $header);
        }
        $why = 'redirects';

        return null;
    }

    /**
     * The pin (final review): CURLOPT_CONNECT_TO with an empty source host and port, so curl connects to the checked address
     * however it spells the host (CURLOPT_RESOLVE is keyed by the host as written, and curl decodes %-escapes first).
     *
     * @return array<int, list<string>>
     */
    public static function connectTo(string $ip, int $port): array
    {
        return [CURLOPT_CONNECT_TO => ['::' . (str_contains($ip, ':') ? "[{$ip}]" : $ip) . ':' . $port]];
    }

    /**
     * The address to ask for (its clean form: ASCII, lowercase host), the checked public IP to connect to and the port;
     * null (and $why) when it may not be read.
     *
     * @return array{0: string, 1: string, 2: int}|null
     */
    private function target(string $url, ?string &$why): ?array
    {
        $clean = PublicAddress::clean($url);
        if ($clean === null) {
            $why = 'bad_address';

            return null;
        }
        $parts = (array) parse_url($clean);
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        $port = (int) ($parts['port'] ?? (strtolower((string) ($parts['scheme'] ?? '')) === 'https' ? 443 : 80));
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$clean, $host, $port];
        }
        $ips = $this->resolver->resolve($host);
        if ($ips === []) {
            $why = 'unreachable';

            return null;
        }
        foreach ($ips as $ip) {
            if (!PublicAddress::isPublicIp($ip)) {
                $why = 'bad_address';

                return null;
            }
        }

        return [$clean, $ips[0], $port];
    }

    /** @param list<string> $types */
    private static function accepts(string $type, array $types): bool
    {
        foreach ($types as $accepted) {
            if (str_starts_with($type, $accepted)) {
                return true;
            }
        }

        return false;
    }
}
