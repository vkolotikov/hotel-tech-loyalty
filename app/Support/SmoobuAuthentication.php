<?php

namespace App\Support;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Str;

/** Signs the bytes and query actually sent, including each retry's own timestamp and nonce. */
final class SmoobuAuthentication
{
    public static function apply(PendingRequest $client, string $key, string $secret): PendingRequest
    {
        if ($secret === '') return $client->withHeaders(['Api-Key' => $key]);
        return $client->beforeSending(function (Request $request) use ($key, $secret) {
            $psr = $request->toPsrRequest();
            $headers = self::headers($request->method(), $request->url(), $request->body(), $key, $secret, now('UTC')->format('Y-m-d\TH:i:s\Z'), (string) Str::uuid());
            foreach ($headers as $name => $value) $psr = $psr->withHeader($name, $value);
            return $psr;
        });
    }

    public static function headers(string $method, string $url, string $body, string $key, string $secret, string $timestamp, string $nonce): array
    {
        $uri = parse_url($url);
        if (($uri['scheme'] ?? '') !== 'https' || ($uri['host'] ?? '') !== 'login.smoobu.com') throw new \InvalidArgumentException('Smoobu authentication requires its official HTTPS endpoint.');
        $pairs = [];
        foreach (explode('&', $uri['query'] ?? '') as $part) {
            if ($part === '') continue;
            [$name, $value] = array_pad(explode('=', $part, 2), 2, '');
            $pairs[] = [rawurlencode(urldecode($name)), rawurlencode(urldecode($value))];
        }
        usort($pairs, fn ($a, $b) => ($a[0] <=> $b[0]) ?: ($a[1] <=> $b[1]));
        $query = implode('&', array_map(fn ($p) => $p[0] . '=' . $p[1], $pairs));
        $canonical = implode("\n", [strtoupper($method), $uri['path'] ?? '/', $query, $timestamp, $nonce, hash('sha256', $body), $key]);
        return ['X-API-Key' => $key, 'X-Timestamp' => $timestamp, 'X-Nonce' => $nonce, 'X-Signature' => base64_encode(hash_hmac('sha256', $canonical, $secret, true))];
    }
}
