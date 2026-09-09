<?php

namespace App\Services\ContentPlanner;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/** Enforce calendar deadlines in the transport; the SDK's timeout option is advisory. */
final class CalendarAiTransport implements ClientInterface
{
    public function __construct(private CalendarGenerationBudget $budget) {}

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $timeout = $this->budget->requestTimeout();

        try {
            // No retries here. Redirect handling stays with the SDK, as with
            // its default PSR-18 transport; each hop shares the same deadline.
            return Http::timeout($timeout)->connectTimeout(min(5, $timeout))
                ->withoutRedirecting()
                ->withHeaders($request->getHeaders())
                ->withBody((string) $request->getBody(), $request->getHeaderLine('Content-Type'))
                ->send($request->getMethod(), (string) $request->getUri())
                ->toPsrResponse();
        } catch (ConnectionException $e) {
            throw new CalendarGenerationException('provider_unavailable', 'The AI service could not complete this calendar request. Please retry.', $e);
        }
    }
}
