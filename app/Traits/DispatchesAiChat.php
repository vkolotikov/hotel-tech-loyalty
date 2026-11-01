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
    /** Claude chat replies are asked for at this effort: fast, natural answers. */
    private const CLAUDE_CHAT_EFFORT = 'low';

    /**
     * Route a chat request to the configured provider with retry/backoff.
     *
     * $extra accepts optional model tuning params from ChatbotModelConfig:
     *   top_p, frequency_penalty, presence_penalty, stop_sequences
     *
     * Not every model takes $temperature and top_p: Claude (every model) and
     * Gemini 3+ never receive them, gpt-5.x only with reasoning effort `none`.
     * The admin page reads the same rule from frontend/src/lib/aiModels.ts.
     */
    protected function callProvider(
        string $provider,
        string $systemPrompt,
        array $messages,
        string $model,
        float $temperature,
        int $maxTokens,
        array $extra = [],
        string $feature = 'chat',
    ): string {
        $this->assertModelAllowed($model);
        return match ($provider) {
            'anthropic' => $this->dispatchAnthropic($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra, $feature),
            'google'    => $this->dispatchGoogle($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra, $feature),
            default     => $this->dispatchOpenAi($systemPrompt, $messages, $model, $temperature, $maxTokens, $extra, $feature),
        };
    }

    /**
     * Hard-block when the org's plan doesn't include the requested model.
     * No-op when no org context is bound (e.g. CLI / public webhooks).
     */
    private function assertModelAllowed(string $model): void
    {
        if (!app()->bound('current_organization_id')) return;
        $org = \App\Models\Organization::find((int) app('current_organization_id'));
        if (!$org) return;
        if (!app(\App\Services\AiUsageService::class)->isModelAllowed($org, $model)) {
            $allowed = (array) ($org->featureValue('ai_allowed_models') ?? []);
            throw new \App\Exceptions\AiModelNotAllowed($model, $allowed);
        }
    }

    /**
     * Record AI usage for billing + plan-cap reporting. Swallows errors —
     * a ledger write failure must never break the AI call itself.
     */
    private function trackUsage(string $model, string $feature, int $inputTokens, int $outputTokens): void
    {
        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;
        if (!$orgId) return;
        try {
            app(\App\Services\AiUsageService::class)->recordUsage(
                orgId: $orgId,
                model: $model,
                inputTokens: $inputTokens,
                outputTokens: $outputTokens,
                feature: $feature,
            );
        } catch (\Throwable $e) {
            // Already logged inside AiUsageService; double-catch keeps the
            // trait fail-safe even if the service itself blows up.
        }
    }

    private function dispatchOpenAi(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = [], string $feature = 'chat'): string
    {
        $apiKey = config('openai.api_key', env('OPENAI_API_KEY', ''));
        if (!$apiKey) {
            throw new \RuntimeException('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
        }

        // Per OpenAI's official guidance gpt-5.x belongs on the Responses API.
        // Routing them through Chat Completions was the cause of "some
        // models don't work correctly" reports — features like reasoning
        // and the new verbosity control are first-class on /v1/responses.
        // Older gpt-4.x and o-series stay on Chat Completions for now —
        // they work there and a forced migration adds risk for no win.
        // The prefix covers the whole family, gpt-5.6-terra / gpt-5.6-luna
        // included (WidgetChatController's tool loop uses the same prefix).
        $isGpt5 = (bool) preg_match('/^gpt-5/i', $model);
        if ($isGpt5) {
            return $this->dispatchOpenAiResponses($apiKey, $system, $messages, $model, $temp, $maxTokens, $extra, $feature);
        }
        return $this->dispatchOpenAiChatCompletions($apiKey, $system, $messages, $model, $temp, $maxTokens, $extra, $feature);
    }

    /**
     * Responses API path — the recommended endpoint for gpt-5.x.
     *
     *   POST /v1/responses
     *   {
     *     model, instructions, input,
     *     reasoning: { effort },
     *     text: { verbosity },
     *     max_output_tokens, prompt_cache_key
     *   }
     *
     * Output shape is `output[]` items; we extract assistant text by
     * walking output[].content[] looking for `output_text`. No tool/
     * function-calling here yet — the widget's tool surface still uses
     * Chat Completions and stays where it is.
     */
    private function dispatchOpenAiResponses(string $apiKey, string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = [], string $feature = 'chat'): string
    {
        // The Responses API takes `instructions` for the system content
        // and the message array as `input`. Don't merge the system into
        // the input — keeping it separate lets prompt caching kick in on
        // the static prefix.
        $input = array_map(fn($m) => [
            'role'    => $m['role'],
            'content' => $m['content'],
        ], $messages);

        $defaultEffort = $this->isGpt55($model) ? 'medium' : 'low';
        $effort = $extra['reasoning_effort'] ?? $defaultEffort;
        $verbosity = $extra['verbosity'] ?? 'medium';

        $params = [
            'model'             => $model,
            'instructions'      => $system,
            'input'             => $input,
            'max_output_tokens' => $maxTokens,
            'reasoning'         => ['effort' => $effort],
            'text'              => ['verbosity' => $verbosity],
            'store'             => false,
        ];

        // Per-org cache key — stable across requests so repeated traffic
        // hits the cache. The doc recommends keeping common prefixes
        // identical and varying user-specific context at the end.
        if (!empty($extra['prompt_cache_key'])) {
            $params['prompt_cache_key'] = (string) $extra['prompt_cache_key'];
        }

        // Temperature only applies when reasoning is disabled. For gpt-5.x
        // the doc explicitly says set effort=none for latency-sensitive
        // workflows (voice turns, classification); we honour that here.
        if ($effort === 'none') {
            $params['temperature'] = $temp;
        }

        return $this->withRetry(function () use ($apiKey, $params, $model, $feature) {
            $response = Http::withToken($apiKey)
                ->timeout(60)
                ->post('https://api.openai.com/v1/responses', $params);

            if ($response->failed()) {
                $status = $response->status();
                $errorBody = $response->json();
                $errorMsg = $errorBody['error']['message'] ?? substr($response->body(), 0, 300);
                if (in_array($status, [429, 500, 503])) {
                    $delay = $status === 429 ? (int) ($response->header('retry-after') ?: 2) : 1;
                    throw new \App\Exceptions\RetryableAiException("OpenAI {$status}: {$errorMsg}", $status, $delay);
                }
                throw new \RuntimeException("OpenAI Responses API error {$status} [{$model}]: {$errorMsg}");
            }

            $body = $response->json();
            // Responses API usage shape: usage.input_tokens / output_tokens.
            $this->trackUsage(
                $model,
                $feature,
                (int) ($body['usage']['input_tokens']  ?? 0),
                (int) ($body['usage']['output_tokens'] ?? 0),
            );

            // SDK convenience aggregator first — falls back to walking the
            // output array, which is what the doc warns is "not safe to
            // assume that the model's text output is present at
            // output[0].content[0].text".
            if (!empty($body['output_text'])) {
                return (string) $body['output_text'];
            }
            $text = '';
            foreach ($body['output'] ?? [] as $item) {
                if (($item['type'] ?? '') !== 'message') continue;
                foreach ($item['content'] ?? [] as $c) {
                    if (($c['type'] ?? '') === 'output_text' && isset($c['text'])) {
                        $text .= $c['text'];
                    } elseif (($c['type'] ?? '') === 'refusal' && isset($c['refusal'])) {
                        // Surface the refusal verbatim — the calling code
                        // can treat it the same as a regular response.
                        $text .= $c['refusal'];
                    }
                }
            }
            return $text;
        }, "OpenAI/{$model}");
    }

    private function isGpt55(string $model): bool
    {
        return (bool) preg_match('/^gpt-5\.5/i', $model);
    }

    /**
     * Legacy Chat Completions path for gpt-4.x, gpt-4o, o-series.
     * Same code as before the gpt-5 split — kept verbatim so older
     * deployments don't regress.
     */
    private function dispatchOpenAiChatCompletions(string $apiKey, string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = [], string $feature = 'chat'): string
    {
        $isOSeries = (bool) preg_match('/^(o1|o3|o4)/i', $model);
        $isModern  = !$isOSeries && (bool) preg_match('/^(gpt-4o|gpt-4\.1|gpt-4-turbo)/i', $model);

        $allMessages = array_merge([['role' => 'system', 'content' => $system]], $messages);

        $params = ['model' => $model, 'messages' => $allMessages];

        if ($isOSeries) {
            // Reasoning models — no temperature, no penalties.
            $params['max_completion_tokens'] = $maxTokens;
        } else {
            // Modern (gpt-4o, gpt-4.1) uses max_completion_tokens; legacy
            // (gpt-4, gpt-3.5) uses the deprecated max_tokens.
            $params[$isModern ? 'max_completion_tokens' : 'max_tokens'] = $maxTokens;
            $params['temperature'] = $temp;
            if (isset($extra['top_p']) && $extra['top_p'] < 1.0)         $params['top_p'] = (float) $extra['top_p'];
            if (isset($extra['frequency_penalty']) && $extra['frequency_penalty'] > 0) $params['frequency_penalty'] = (float) $extra['frequency_penalty'];
            if (isset($extra['presence_penalty'])  && $extra['presence_penalty']  > 0) $params['presence_penalty']  = (float) $extra['presence_penalty'];
            if (!empty($extra['stop_sequences'])) $params['stop'] = $extra['stop_sequences'];
        }

        return $this->withRetry(function () use ($apiKey, $params, $model, $feature) {
            $response = Http::withToken($apiKey)
                ->timeout(60)
                ->post('https://api.openai.com/v1/chat/completions', $params);

            if ($response->failed()) {
                $status = $response->status();
                $errorBody = $response->json();
                $errorMsg = $errorBody['error']['message'] ?? substr($response->body(), 0, 300);
                if (in_array($status, [429, 500, 503])) {
                    $delay = $status === 429 ? (int) ($response->header('retry-after') ?: 2) : 1;
                    throw new \App\Exceptions\RetryableAiException("OpenAI {$status}: {$errorMsg}", $status, $delay);
                }
                throw new \RuntimeException("OpenAI API error {$status} [{$model}]: {$errorMsg}");
            }

            $body = $response->json();
            // Chat Completions usage shape: usage.prompt_tokens / completion_tokens.
            $this->trackUsage(
                $model,
                $feature,
                (int) ($body['usage']['prompt_tokens']     ?? 0),
                (int) ($body['usage']['completion_tokens'] ?? 0),
            );
            return $body['choices'][0]['message']['content'] ?? '';
        }, "OpenAI/{$model}");
    }

    /**
     * Claude, through the official SDK (API version 2026-10-21, bearer key).
     *
     * The venue's temperature and top_p stay in its settings but are not sent:
     * every current Claude model refuses a non-default temperature, and API
     * version 2026-10-21 refuses temperature, top_p and top_k on every model.
     * Effort is `low` (quick replies, which is what a chat needs) and only for
     * the models that accept it; no `thinking` parameter, so each model keeps
     * its own default. The SDK makes one attempt per call — withRetry() below
     * stays the only retry loop.
     */
    private function dispatchAnthropic(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = [], string $feature = 'chat'): string
    {
        $apiKey = (string) config('services.anthropic.api_key', env('ANTHROPIC_API_KEY'));
        if (!$apiKey) {
            throw new \RuntimeException('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env');
        }

        $client = \App\Services\Ai\AnthropicSdk::client($apiKey, 60);
        $params = [
            'model'     => $model,
            'maxTokens' => $maxTokens,
            'messages'  => $messages,
        ];
        if ($system !== '') {
            $params['system'] = $system;
        }
        if (\App\Services\Ai\AnthropicSdk::takesEffort($model)) {
            $params['outputConfig'] = ['effort' => self::CLAUDE_CHAT_EFFORT];
        }
        if ($thinking = \App\Services\Ai\AnthropicSdk::chatThinking($model)) {
            $params['thinking'] = $thinking;
        }

        return $this->withRetry(
            fn () => $this->anthropicAttempt($client, $params, $model, $feature),
            "Anthropic/{$model}",
        );
    }

    /**
     * One Claude call. Rate limits, overload (529) and other 5xx answers are
     * RetryableAiException (with the Retry-After delay on a 429, as before);
     * anything else, a refusal and a reply with no text are a failed call.
     */
    private function anthropicAttempt(\Anthropic\Client $client, array $params, string $model, string $feature): string
    {
        try {
            $message = $client->messages->create(...$params);
        } catch (\Anthropic\Core\Exceptions\APIStatusException $e) {
            $status = (int) $e->status;
            $detail = \App\Services\Ai\AnthropicSdk::errorDetail($e);
            if ($status === 429 || $status >= 500) {
                $delay = $status === 429 ? \App\Services\Ai\AnthropicSdk::retryAfterSeconds($e, 2) : 1;
                throw new \App\Exceptions\RetryableAiException("Anthropic {$status}: {$detail}", $status, $delay, $e);
            }
            throw new \RuntimeException("Anthropic API error {$status} [{$model}]: {$detail}", 0, $e);
        } catch (\Anthropic\Core\Exceptions\APIException $e) {
            throw new \RuntimeException("Anthropic API error [{$model}]: " . \App\Services\Ai\AnthropicSdk::errorDetail($e), 0, $e);
        }

        // Anthropic usage shape: usage.input_tokens / output_tokens. Counted
        // before the checks below: a refused call is still billed.
        $this->trackUsage(
            $model,
            $feature,
            (int) ($message->usage->inputTokens ?? 0),
            (int) ($message->usage->outputTokens ?? 0),
        );

        if ($message->stopReason === 'refusal') {
            throw new \RuntimeException("Anthropic refused to answer [{$model}]");
        }

        $text = \App\Services\Ai\AnthropicSdk::text($message);
        if (trim($text) === '') {
            // An empty assistant turn would also break the next request of
            // the conversation (Claude refuses empty text), so it is a failure.
            throw new \RuntimeException("Anthropic returned no text [{$model}] (stop reason: " . ($message->stopReason ?? 'none') . ')');
        }

        return $text;
    }

    /**
     * Gemini 3 and later: Google recommends leaving the temperature at the
     * model's default, so the venue's setting is not sent to them.
     */
    private function geminiTakesTemperature(string $model): bool
    {
        return !(preg_match('/^gemini-(\d+)/i', $model, $m) && (int) $m[1] >= 3);
    }

    private function dispatchGoogle(string $system, array $messages, string $model, float $temp, int $maxTokens, array $extra = [], string $feature = 'chat'): string
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

        $generationConfig = ['maxOutputTokens' => $maxTokens];
        if ($this->geminiTakesTemperature($model)) {
            $generationConfig = ['temperature' => $temp] + $generationConfig;
        }

        return $this->withRetry(function () use ($apiKey, $system, $contents, $model, $generationConfig, $feature) {
            $response = Http::timeout(60)->post(
                "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
                [
                    'system_instruction' => ['parts' => [['text' => $system]]],
                    'contents'           => $contents,
                    'generationConfig'   => $generationConfig,
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

            $body = $response->json();
            // Gemini usage shape: usageMetadata.promptTokenCount / candidatesTokenCount;
            // a thinking model's thoughtsTokenCount is billed as output too.
            $this->trackUsage(
                $model,
                $feature,
                (int) ($body['usageMetadata']['promptTokenCount']     ?? 0),
                (int) ($body['usageMetadata']['candidatesTokenCount'] ?? 0)
                    + (int) ($body['usageMetadata']['thoughtsTokenCount'] ?? 0),
            );
            // Join the answer's text parts; a part marked `thought` is not the answer.
            $text = '';
            foreach ($body['candidates'][0]['content']['parts'] ?? [] as $part) {
                if (isset($part['text']) && empty($part['thought'])) {
                    $text .= $part['text'];
                }
            }
            return $text;
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
