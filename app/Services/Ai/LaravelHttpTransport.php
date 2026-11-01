<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Sends the Anthropic SDK's requests through Laravel's HTTP client, so the
 * timeout is enforced (the SDK's own timeout option is advisory) and the tests'
 * Http::fake() sees them. One attempt only: redirects stay with the SDK, and a
 * connection failure surfaces as Laravel's ConnectionException, which the
 * caller's own retry loop already handles (DispatchesAiChat::withRetry()).
 */
final class LaravelHttpTransport implements ClientInterface
{
    public function __construct(private int $timeoutSeconds) {}

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $http = Http::timeout($this->timeoutSeconds)
            ->connectTimeout(min(10, $this->timeoutSeconds))
            ->withoutRedirecting()
            ->withHeaders($request->getHeaders());

        $body = (string) $request->getBody();
        if ($body !== '') {
            $http = $http->withBody($body, $request->getHeaderLine('Content-Type') ?: 'application/json');
        }

        return $http->send($request->getMethod(), (string) $request->getUri())->toPsrResponse();
    }
}
