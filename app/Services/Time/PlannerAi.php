<?php

namespace App\Services\Time;

use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Messages\ToolUseBlock;
use App\Models\Organization;
use App\Services\Ai\AnthropicSdk;
use App\Services\AiUsageService;
use Illuminate\Support\Facades\Log;

/**
 * HexaTech Time Planner's AI (2026-11-09): Claude reads the planner's facts and answers through one tool, so the reply
 * is data the server checks, never text it trusts. Three uses, each recorded in `ai_usage_logs` under its own feature:
 *
 * - planDay (`time_plan`): who does what and when; DayPlanner::merge() checks every line before a person sees it;
 * - review (`time_review`): a short read of a day or a period, with suggestions whose actions name only tasks and
 *   people the facts hold (the controller drops any other);
 * - capture (`time_capture`): tasks from a message, notes or a voice note, which a person checks before saving.
 *
 * Nothing here writes a task. The month's AI allowance and the plan's model list are asked before the provider
 * (status()); a provider failure is logged with its own text and answered as `ai_failed` in our words.
 */
final class PlannerAi
{
    private const LANGUAGES = ['en' => 'English', 'ru' => 'Russian', 'de' => 'German', 'fr' => 'French', 'es' => 'Spanish'];

    private string $apiKey;

    private string $model;

    public function __construct(private readonly AiUsageService $usage)
    {
        $this->apiKey = (string) config('services.anthropic.api_key', '');
        $this->model = (string) config('services.anthropic.model', 'claude-sonnet-5');
    }

    /** `ready`, `not_configured` (no provider key), `over` (the month's allowance is used up) or `model_not_allowed`. */
    public function status(?Organization $org): string
    {
        if ($this->apiKey === '') {
            return 'not_configured';
        }
        if ($org && !$this->usage->isModelAllowed($org, $this->model)) {
            return 'model_not_allowed';
        }

        return $this->usage->budgetStatus($org)['status'] === 'over' ? 'over' : 'ready';
    }

    /** Refuses in our words unless the AI may be asked now. */
    public function assertReady(?Organization $org): void
    {
        match ($this->status($org)) {
            'ready'             => null,
            'over'              => throw new TimeRefused('ai_budget_used_up', "This month's AI allowance is used up. The AI is back next month, or with a larger package.", 403),
            'model_not_allowed' => throw new TimeRefused('model_not_allowed', 'Your plan does not include the AI model the planner uses.', 403),
            default             => throw new TimeRefused('ai_unavailable', 'The AI is not set up for this workspace yet.', 503),
        };
    }

    public static function language(?string $code): string
    {
        return self::LANGUAGES[$code ?? 'en'] ?? 'English';
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{summary: string, proposals: list<array<string, mixed>>, unplaced: list<array<string, mixed>>}
     */
    public function planDay(int $orgId, array $facts, ?string $instruction, string $lang): array
    {
        $language = self::language($lang);
        $system = <<<TXT
You are the day planner of a business's team. You decide who does each task in the list and when, for the day in the
facts. Rules you must keep:
- A task that has an owner stays with that owner, unless `assign_others` is true and the instruction asks to move it.
- Give a task without an owner only to a person whose `skills` include its type, or whose skills are "any".
- Match work to people's knowledge, their preferred types and tasks, and the experience they have shown.
- Plan only inside each person's hours, after `now` when the day is today, leave their break free, and never overlap
  two tasks of one person or a task with their busy times. Spread work so nobody goes over their capacity while
  someone else has room.
- High priority first and early in the day; demanding work in the morning, short admin later.
- Use HH:MM for times and whole minutes for durations. Keep each task's minutes unless it clearly needs another length.
Write `summary` (two sentences at most) and each `note` (why this person and this time, at most 15 words) in
{$language}. Answer only by calling the propose_day_plan tool, once.
TXT;
        $user = 'FACTS (JSON):' . "\n" . json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            . ($instruction ? "\n\nThe person planning asks: " . mb_substr(trim($instruction), 0, 500) : '');
        $tool = [
            'name' => 'propose_day_plan',
            'description' => 'The plan for the day.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'summary'   => ['type' => 'string'],
                    'proposals' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'task_id'          => ['type' => 'integer'],
                        'person'           => ['type' => 'string', 'description' => 'The person key from the facts'],
                        'start_time'       => ['type' => 'string', 'description' => 'HH:MM'],
                        'duration_minutes' => ['type' => 'integer'],
                        'note'             => ['type' => 'string'],
                    ], 'required' => ['task_id', 'person', 'start_time']]],
                    'unplaced'  => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'task_id' => ['type' => 'integer'],
                        'note'    => ['type' => 'string'],
                    ], 'required' => ['task_id']]],
                ],
                'required' => ['summary', 'proposals'],
            ],
        ];
        $out = $this->ask($orgId, 'time_plan', $system, $user, $tool, 4096);

        return [
            'summary'   => mb_substr(trim((string) ($out['summary'] ?? '')), 0, 600),
            'proposals' => array_values(array_filter((array) ($out['proposals'] ?? []), 'is_array')),
            'unplaced'  => array_values(array_filter((array) ($out['unplaced'] ?? []), 'is_array')),
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{summary: string, highlights: list<string>, suggestions: list<array<string, mixed>>}
     */
    public function review(int $orgId, string $kind, array $facts, string $lang): array
    {
        $language = self::language($lang);
        $what = $kind === 'period' ? 'how the team\'s time went over the period' : 'the planned day';
        $system = <<<TXT
You are an operations coach for a business's team. You read {$what} in the facts and say, briefly and concretely,
what works, what is at risk and what to change. Name people and tasks as the facts name them. Never invent numbers:
use only the facts. Suggest at most five changes, the most useful first; when a change is one move of one task, give
it as an action (move a task to another person, to another day, or to another time) with the task id and the person
key from the facts. Write in {$language}. Answer only by calling the review_time tool, once.
TXT;
        $tool = [
            'name' => 'review_time',
            'description' => 'The review.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'summary'     => ['type' => 'string', 'description' => 'Two or three sentences'],
                    'highlights'  => ['type' => 'array', 'items' => ['type' => 'string']],
                    'suggestions' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'title'  => ['type' => 'string'],
                        'detail' => ['type' => 'string'],
                        'action' => ['type' => 'object', 'properties' => [
                            'type'       => ['type' => 'string', 'enum' => ['assign', 'move_day', 'set_time', 'none']],
                            'task_id'    => ['type' => 'integer'],
                            'person'     => ['type' => 'string'],
                            'date'       => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                            'start_time' => ['type' => 'string', 'description' => 'HH:MM'],
                        ]],
                    ], 'required' => ['title']]],
                ],
                'required' => ['summary'],
            ],
        ];
        $out = $this->ask($orgId, 'time_review', $system, 'FACTS (JSON):' . "\n" . json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tool, 2048);

        return [
            'summary'     => mb_substr(trim((string) ($out['summary'] ?? '')), 0, 900),
            'highlights'  => array_values(array_slice(array_filter(array_map(fn ($h) => is_string($h) ? mb_substr(trim($h), 0, 240) : '', (array) ($out['highlights'] ?? []))), 0, 5)),
            'suggestions' => array_values(array_slice(array_filter((array) ($out['suggestions'] ?? []), 'is_array'), 0, 5)),
        ];
    }

    /**
     * @param  array<string, mixed>  $context  today, weekday, people names, types and tasks
     * @return list<array<string, mixed>>
     */
    public function capture(int $orgId, string $text, array $context, string $lang): array
    {
        $language = self::language($lang);
        $system = <<<TXT
You turn what a person wrote or said — notes, a message, a voice note, a list — into planner tasks for their team.
One task per piece of work; at most 20. Use the context: today's date and weekday (resolve "tomorrow", "Friday",
"next week" to a date), the team's names (person_name only when the text names or clearly means one of them), the
task types and tasks (use their exact names, or leave them empty). A time ("at 3", "after lunch") becomes start_time
HH:MM; a length ("an hour") becomes duration_minutes. Priority High only when the text says it is urgent or important,
Low when it says it can wait, else Normal. Steps of one task become subtasks. Leave out anything the text does not say.
Write titles, descriptions and subtasks in the language of the text (default {$language}), short and clear.
Answer only by calling the save_tasks tool, once.
TXT;
        $tool = [
            'name' => 'save_tasks',
            'description' => 'The tasks found in the text.',
            'input_schema' => [
                'type' => 'object',
                'properties' => ['tasks' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                    'title'            => ['type' => 'string'],
                    'date'             => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'start_time'       => ['type' => 'string', 'description' => 'HH:MM'],
                    'duration_minutes' => ['type' => 'integer'],
                    'priority'         => ['type' => 'string', 'enum' => ['High', 'Normal', 'Low']],
                    'task_group'       => ['type' => 'string'],
                    'task'             => ['type' => 'string'],
                    'person_name'      => ['type' => 'string'],
                    'description'      => ['type' => 'string'],
                    'subtasks'         => ['type' => 'array', 'items' => ['type' => 'string']],
                ], 'required' => ['title']]]],
                'required' => ['tasks'],
            ],
        ];
        $user = 'CONTEXT (JSON):' . "\n" . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            . "\n\nTEXT:\n" . mb_substr($text, 0, 10000);
        $out = $this->ask($orgId, 'time_capture', $system, $user, $tool, 3000);

        return array_values(array_slice(array_filter((array) ($out['tasks'] ?? []), 'is_array'), 0, 20));
    }

    /** @param array<string, mixed> $params */
    private function send(array $params): \Anthropic\Messages\Message
    {
        return AnthropicSdk::client($this->apiKey, 60, maxRetries: 1)->messages->create(...$params);
    }

    /**
     * One call; the tool's input, or TimeRefused `ai_failed` (the provider's words go to the log only).
     *
     * @return array<string, mixed>
     */
    private function ask(int $orgId, string $feature, string $system, string $user, array $tool, int $maxTokens): array
    {
        $params = ['model' => $this->model, 'maxTokens' => $maxTokens, 'system' => $system,
            'messages' => [['role' => 'user', 'content' => $user]], 'tools' => [$tool]];
        if (AnthropicSdk::takesForcedToolChoice($this->model)) {
            $params['toolChoice'] = ['type' => 'tool', 'name' => $tool['name']];
        }

        try {
            $message = $this->send($params);
        } catch (APIStatusException $e) {
            Log::warning('Time planner AI non-2xx', ['feature' => $feature, 'status' => $e->status, 'detail' => AnthropicSdk::errorDetail($e)]);
            throw new TimeRefused('ai_failed', 'The AI could not help just now. Please try again in a moment.', 502);
        } catch (\Throwable $e) {
            Log::warning('Time planner AI failed', ['feature' => $feature, 'error' => $e->getMessage(), 'class' => $e::class]);
            throw new TimeRefused('ai_failed', 'The AI could not help just now. Please try again in a moment.', 502);
        }

        $this->usage->recordUsage(
            orgId: $orgId,
            model: $this->model,
            inputTokens: (int) $message->usage->inputTokens,
            outputTokens: (int) $message->usage->outputTokens,
            feature: $feature,
        );

        foreach ($message->content as $block) {
            if ($block instanceof ToolUseBlock && $block->name === $tool['name']) {
                return json_decode(json_encode($block->input), true) ?: [];
            }
        }
        Log::warning('Time planner AI answered without its tool', ['feature' => $feature, 'text' => mb_substr(AnthropicSdk::text($message), 0, 300)]);
        throw new TimeRefused('ai_failed', 'The AI could not help just now. Please try again in a moment.', 502);
    }
}
