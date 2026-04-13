<?php

namespace App\Traits;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Shared AI provider dispatch logic for chat endpoints.
 *
 * Provides callProvider() with retry/backoff for transient errors (429, 500, 529)
 * and multi-provider routing (OpenAI, Anthropic, Google). Used by
 * WidgetChatController, ChatbotConfigController, and OpenAiService to avoid
 * duplicating the same HTTP call + retry code in three places.
 */
trait DispatchesAiChat
{
    /**
     * Route a chat request to the configured provider with retry/backoff.
     *
     * $extra accepts optional model tuning params from ChatbotModelConfig:
     *   top_p, frequency_penalty, presence_penalty, stop_sequences
     */
    protected function callProvider(
        string $provider,
        string $systemPrompt,
        array $messages,
        string $model,
        float $temperature,
        int $maxTokens,
        array $extra = [],
    ): string {
        return match ($provider) {
            'anthropic' => $this->dispatchAnthropic($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra),
            'google'    => $this->dispatchGoogle($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra),
            default     => $this->dispatchOpenAi($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra),
        };
    }

    private function dispatchOpenAi(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = []): string
    {
        $allMessages = array_merge([['role' => 'system', 'content' => $system]], $messages);

        // Reasoning models (o1/o3/o4) and GPT-5 family require `max_completion_tokens`
        // instead of `max_tokens`, and only accept the default temperature (1).
        $isNewFamily = (bool) preg_match('/^(o1|o3|o4|gpt-5)/i', $model);

        $params = [
            'model'    => $model,
            'messages' => $allMessages,
        ];

        if ($isNewFamily) {
            $params['max_completion_tokens'] = $maxTokens;
        } else {
            $params['max_tokens']  = $maxTokens;
            $params['temperature'] = $temp;
        }

        // Apply optional tuning params from model config (only for non-reasoning models)
        if (!$isNewFamily) {
            if (isset($extra['top_p']) && $extra['top_p'] < 1.0) {
                $params['top_p'] = (float) $extra['top_p'];
            }
            if (isset($extra['frequency_penalty']) && $extra['frequency_penalty'] > 0) {
                $params['frequency_penalty'] = (float) $extra['frequency_penalty'];
            }
            if (isset($extra['presence_penalty']) && $extra['presence_penalty'] > 0) {
                $params['presence_penalty'] = (float) $extra['presence_penalty'];
            }
            if (!empty($extra['stop_sequences'])) {
                $params['stop'] = $extra['stop_sequences'];
            }
        }

        return $this->withRetry(function () use ($params) {
            $response = \OpenAI\Laravel\Facades\OpenAI::chat()->create($params);
            return $response->choices[0]->message->content ?? '';
        }, "OpenAI/{$model}");
    }

    private function dispatchAnthropic(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = []): string
    {
        $apiKey = config('services.anthropic.api_key', env('ANTHROPIC_API_KEY'));
        if (!$apiKey) {
            throw new \RuntimeException('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env');
        }

        return $this->withRetry(function () use ($apiKey, $system, $messages, $model, $temp, $maxTokens, $extra) {
            $payload = [
                'model'       => $model,
                'max_tokens'  => $maxTokens,
                'temperature' => min($temp, 1.0),
                'system'      => $system,
                'messages'    => $messages,
            ];
            if (isset($extra['top_p']) && $extra['top_p'] < 1.0) {
                $payload['top_p'] = (float) $extra['top_p'];
            }
            $response = Http::withHeaders([
                'x-api-key'         => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type'      => 'application/json',
            ])->timeout(60)->post('https://api.anthropic.com/v1/messages', $payload);

            if ($response->failed()) {
                $status = $response->status();
                if (in_array($status, [429, 500, 529])) {
                    $delay = $status === 429
                        ? (int) ($response->header('retry-after') ?: 2)
                        : 1;
                    throw new \App\Exceptions\RetryableAiException(
                        "Anthropic {$status}: " . substr($response->body(), 0, 200),
                        $status,
                        $delay,
                    );
                }
                throw new \RuntimeException('Anthropic API error ' . $status . ': ' . substr($response->body(), 0, 300));
            }

            return $response->json()['content'][0]['text'] ?? '';
        }, "Anthropic/{$model}");
    }

    private function dispatchGoogle(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = []): string
    {
        $apiKey = config('services.google.gemini_api_key', env('GOOGLE_GEMINI_API_KEY'));
        if (!$apiKey) {
            throw new \RuntimeException('Google Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env');
        }

        $contents = [];
        foreach ($messages as $msg) {
            $contents[] = [
                'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ];
        }

        return $this->withRetry(function () use ($apiKey, $system, $contents, $model, $temp, $maxTokens) {
            $response = Http::timeout(60)->post(
                "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
                [
                    'system_instruction' => ['parts' => [['text' => $system]]],
                    'contents'           => $contents,
                    'generationConfig'   => ['temperature' => $temp, 'maxOutputTokens' => $maxTokens],
                ]
            );

            if ($response->failed()) {
                $status = $response->status();
                if (in_array($status, [429, 500, 503])) {
                    throw new \App\Exceptions\RetryableAiException(
                        "Gemini {$status}: " . substr($response->body(), 0, 200),
                        $status,
                        $status === 429 ? 2 : 1,
                    );
                }
                throw new \RuntimeException('Gemini API error ' . $status . ': ' . substr($response->body(), 0, 300));
            }

            return $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? '';
        }, "Google/{$model}");
    }

    /**
     * Retry wrapper — retries up to 3 times on RetryableAiException or
     * network-level failures (timeouts, DNS, etc.).
     */
    private function withRetry(callable $fn, string $label): string
    {
        $maxAttempts = 3;
        $lastError = null;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                return $fn();
            } catch (\App\Exceptions\RetryableAiException $e) {
                Log::warning("AI chat retryable [{$label}]", [
                    'attempt' => $attempt,
                    'status'  => $e->getCode(),
                    'delay'   => $e->retryDelay,
                ]);
                $lastError = $e->getMessage();
                if ($attempt < $maxAttempts) {
                    sleep($e->retryDelay);
                    continue;
                }
            } catch (\Illuminate\Http\Client\ConnectionException $e) {
                Log::warning("AI chat connection error [{$label}]", [
                    'attempt' => $attempt,
                    'error'   => $e->getMessage(),
                ]);
                $lastError = $e->getMessage();
                if ($attempt < $maxAttempts) {
                    usleep($attempt * 500_000);
                    continue;
                }
            }
        }

        throw new \RuntimeException("AI call failed after {$maxAttempts} attempts [{$label}]: {$lastError}");
    }
}
