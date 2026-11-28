<?php

namespace App\Services\ContentPlanner;

use GuzzleHttp\Psr7\Utils;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/** Protect a returned image from the SDK's strict optional-usage parser; never retry. */
final class ImageUsageTransport implements ClientInterface
{
    public function __construct(private ClientInterface $http) {}

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $response = $this->http->sendRequest($request);
        if ($response->getStatusCode() !== 200) {
            return $response;
        }

        $body = (string) $response->getBody();
        $data = json_decode($body, true);
        if (! is_array($data) || ! array_key_exists('usage', $data)) {
            return $response->withBody(Utils::streamFor($body));
        }

        $usage = $data['usage'];
        if (! is_array($usage)) {
            unset($data['usage']);
        } else {
            // -1 means invalid/missing, not a guessed zero. The estimator retains
            // valid fields and uses conservative floors whenever usage is incomplete.
            $count = static fn ($value): int => is_int($value) && $value >= 0 ? $value : -1;
            $details = is_array($usage['input_tokens_details'] ?? null) ? $usage['input_tokens_details'] : [];
            $input = $count($usage['input_tokens'] ?? null);
            $output = $count($usage['output_tokens'] ?? null);
            $text = $count($details['text_tokens'] ?? null);
            $image = $count($details['image_tokens'] ?? null);
            // The SDK requires an integer total although the wire field is optional.
            // Derive only an absent total from complete consistent counts; an explicit
            // malformed/contradictory total must still trigger conservative accounting.
            $total = $count($usage['total_tokens'] ?? null);
            if (!array_key_exists('total_tokens', $usage) && $input > 0 && $output > 0
                && $text >= 0 && $image >= 0 && $text + $image === $input && $input <= PHP_INT_MAX - $output) {
                $total = $input + $output;
            }
            $data['usage'] = [
                'total_tokens' => $total,
                'input_tokens' => $input,
                'output_tokens' => $output,
                'input_tokens_details' => [
                    'text_tokens' => $text,
                    'image_tokens' => $image,
                ],
            ];
        }

        return $response->withoutHeader('Content-Length')->withBody(Utils::streamFor(json_encode($data, JSON_THROW_ON_ERROR)));
    }
}
