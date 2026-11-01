<?php

namespace App\Services\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIException;
use Anthropic\Messages\Message;
use Anthropic\Messages\TextBlock;

/**
 * The few things every direct Claude call in the app shares: a client on the
 * official SDK (API version 2026-10-21, the key sent as a bearer token), the
 * rule for which models take an effort setting, and reading the reply text.
 *
 * API version 2026-10-21 refuses temperature, top_p and top_k on every model,
 * and the SDK has no parameter for them: a caller cannot send one by mistake.
 */
final class AnthropicSdk
{
    /**
     * A client that makes one attempt per call (the caller owns retries) and
     * gives up after $timeoutSeconds.
     */
    public static function client(string $apiKey, int $timeoutSeconds): Client
    {
        return new Client(
            apiKey: $apiKey,
            requestOptions: [
                'maxRetries'  => 0,
                'timeout'     => (float) $timeoutSeconds,
                'transporter' => new LaravelHttpTransport($timeoutSeconds),
            ],
        );
    }

    /**
     * Whether the model accepts `output_config.effort`. The Claude 5 family
     * does, and so do Opus and Sonnet from 4.6; Haiku 4.5 and Sonnet 4.5 answer
     * 400 to it, and older venues may still have one of those saved.
     */
    public static function takesEffort(string $model): bool
    {
        if (!preg_match('/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=-|$)/', $model, $m)) {
            return false;
        }
        $major = (int) $m[2];
        $minor = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : 0;

        if ($major >= 5) {
            return true;
        }

        return $major === 4 && $minor >= 6 && in_array($m[1], ['opus', 'sonnet'], true);
    }

    /**
     * The reply's text. A model that thinks puts a thinking block first, so
     * this joins the text blocks rather than reading the first block.
     */
    public static function text(Message $message): string
    {
        $parts = [];
        foreach ($message->content as $block) {
            if ($block instanceof TextBlock) {
                $parts[] = $block->text;
            }
        }

        return implode('', $parts);
    }

    /** A short, readable reason for a failed call: the API's own error message when there is one. */
    public static function errorDetail(APIException $e): string
    {
        $body = $e->body;
        $message = is_array($body) ? ($body['error']['message'] ?? null) : null;
        if (!is_string($message) || $message === '') {
            $message = is_string($body) && $body !== '' ? $body : $e->getMessage();
        }

        return mb_substr(trim($message), 0, 300);
    }

    /** The response's Retry-After in whole seconds, or $default when it gives none. */
    public static function retryAfterSeconds(APIException $e, int $default): int
    {
        $header = trim($e->response?->getHeaderLine('retry-after') ?? '');

        return ctype_digit($header) && (int) $header > 0 ? (int) $header : $default;
    }
}
