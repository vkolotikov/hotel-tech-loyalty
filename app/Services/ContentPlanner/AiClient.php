<?php

namespace App\Services\ContentPlanner;

use Anthropic\Client;
use App\Models\ContentPlannerAiGeneration;
use App\Models\ContentPlannerProfile;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Central wrapper around the Anthropic SDK for all Content Planner AI calls.
 *
 * Responsibilities:
 * - single place for model selection + API invocation
 * - JSON extraction (```json fences, first-{ to last-} fallback) with ONE retry
 * - cost estimation + logging of every call to content_planner_ai_generations
 */
final class AiClient
{
    private Client $client;

    private string $model;

    public function __construct()
    {
        $this->client = new Client(
            apiKey: env('ANTHROPIC_API_KEY'),
        );
        $this->model = env('CONTENT_PLANNER_AI_MODEL', 'claude-sonnet-5');
    }

    /**
     * Call Claude and return the parsed JSON payload.
     *
     * Extracts JSON from ```json fences (fallback: substring from first '{'
     * to last '}'). On parse failure, retries ONCE with a strict "JSON only"
     * suffix. Throws \RuntimeException on API errors or unparseable JSON
     * (after logging an error row).
     */
    public function generateJson(ContentPlannerProfile $profile, string $generationType, string $prompt, int $maxTokens = 4000): array
    {
        $text = $this->call($profile, $generationType, $prompt, $maxTokens);
        $data = $this->extractJson($text);

        if (is_array($data)) {
            return $data;
        }

        // Retry once with a stricter instruction appended.
        $retryPrompt = $prompt . "\n\nReturn ONLY valid JSON, no prose.";
        $text = $this->call($profile, $generationType, $retryPrompt, $maxTokens);
        $data = $this->extractJson($text);

        if (is_array($data)) {
            return $data;
        }

        $this->logError(
            $profile,
            $generationType,
            'AI returned unparseable JSON after retry. Preview: ' . mb_substr($text, 0, 300)
        );

        throw new \RuntimeException("AI returned invalid JSON for '{$generationType}' generation. Please try again.");
    }

    /**
     * Call Claude and return the raw text response (for rewrite variations).
     */
    public function generateText(ContentPlannerProfile $profile, string $generationType, string $prompt, int $maxTokens = 2000): string
    {
        return $this->call($profile, $generationType, $prompt, $maxTokens);
    }

    /**
     * Perform the API call, log the outcome, and return the response text.
     *
     * @throws \RuntimeException on API failure (after logging an error row)
     */
    private function call(ContentPlannerProfile $profile, string $generationType, string $prompt, int $maxTokens): string
    {
        try {
            $response = $this->client->messages->create(
                model: $this->model,
                maxTokens: $maxTokens,
                messages: [
                    ['role' => 'user', 'content' => $prompt],
                ],
            );
        } catch (Throwable $e) {
            Log::error("ContentPlanner AiClient API error ({$generationType}): " . $e->getMessage(), [
                'profile_id' => $profile->id,
            ]);

            $this->logError($profile, $generationType, $e->getMessage());

            throw new \RuntimeException(
                "AI request failed for '{$generationType}' generation: " . $e->getMessage(),
                0,
                $e
            );
        }

        $text = $this->extractText($response);

        $this->logSuccess($profile, $generationType, $response, $text);

        return $text;
    }

    /**
     * Collect the text blocks from a response. Models with adaptive thinking
     * (e.g. claude-sonnet-5) prepend a 'thinking' block that has no ->text
     * property and throws on access — so filter by block type instead of
     * assuming content[0] is text.
     */
    private function extractText($response): string
    {
        $parts = [];

        foreach ($response->content as $block) {
            try {
                $type = $block->type;
                $type = $type instanceof \BackedEnum ? $type->value : (string) $type;

                if ($type === 'text') {
                    $parts[] = $block->text;
                }
            } catch (Throwable) {
                // Non-text block (thinking / tool use) — skip.
            }
        }

        return implode("\n", $parts);
    }

    /**
     * Extract a JSON object from an AI response.
     * Tries ```json fences first, then substring from first '{' to last '}'.
     */
    private function extractJson(string $text): ?array
    {
        if (preg_match('/```json\s*(.*?)\s*```/s', $text, $matches)) {
            $data = json_decode($matches[1], true);

            if (is_array($data)) {
                return $data;
            }
        }

        $start = strpos($text, '{');
        $end = strrpos($text, '}');

        if ($start !== false && $end !== false && $end > $start) {
            $data = json_decode(substr($text, $start, $end - $start + 1), true);

            if (is_array($data)) {
                return $data;
            }
        }

        return null;
    }

    /**
     * Log a successful AI generation.
     */
    private function logSuccess(ContentPlannerProfile $profile, string $generationType, $response, string $output): void
    {
        // The Anthropic SDK uses camelCase for token properties.
        $inputTokens = $response->usage->inputTokens ?? null;
        $outputTokens = $response->usage->outputTokens ?? null;

        ContentPlannerAiGeneration::create([
            'organization_id' => $profile->organization_id,
            'brand_id' => $profile->brand_id,
            'planner_profile_id' => $profile->id,
            'user_id' => auth()->id(),
            'generation_type' => $generationType,
            'model' => $this->model,
            'response_json' => [
                'preview' => mb_substr($output, 0, 500),
                'full_length' => mb_strlen($output),
            ],
            'tokens_input' => $inputTokens,
            'tokens_output' => $outputTokens,
            'cost_estimate' => $this->estimateCost($inputTokens, $outputTokens),
            'status' => 'success',
        ]);
    }

    /**
     * Log a failed AI generation.
     */
    private function logError(ContentPlannerProfile $profile, string $generationType, string $error): void
    {
        ContentPlannerAiGeneration::create([
            'organization_id' => $profile->organization_id,
            'brand_id' => $profile->brand_id,
            'planner_profile_id' => $profile->id,
            'user_id' => auth()->id(),
            'generation_type' => $generationType,
            'model' => $this->model,
            'status' => 'error',
            'error_message' => mb_substr($error, 0, 2000),
        ]);
    }

    /**
     * Estimate API cost based on tokens (claude-sonnet-5 pricing).
     */
    private function estimateCost(?int $inputTokens, ?int $outputTokens): ?float
    {
        if ($inputTokens === null && $outputTokens === null) {
            return null;
        }

        $inputCost = ($inputTokens ?? 0) * 0.003 / 1000;   // $3 per 1M input tokens
        $outputCost = ($outputTokens ?? 0) * 0.015 / 1000; // $15 per 1M output tokens

        return round($inputCost + $outputCost, 4);
    }
}
