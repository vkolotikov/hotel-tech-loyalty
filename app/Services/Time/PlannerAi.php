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
 * - capture (`time_capture`): tasks from a message, notes or a voice note, which a person checks before saving;
 * - planWeek (`time_week_plan`, 2026-11-14): which day and who for each piece of open work; WeekPlanner checks each line;
 * - coach (`time_coach`): a strategy for the team from what the planner learned, with fixes the server checks;
 * - draft (`time_draft`): what a manager could teach the AI (people, task types, the business), drafted from history,
 *   for the manager to accept;
 * - converse (`time_assistant`): the assistant's turn — Claude asks the planner's read-only tools (Assistant) as often as
 *   it needs, up to MAX_ROUNDS, and proposes changes the server checks; a person applies them.
 *
 * Nothing here writes a task. The month's AI allowance and the plan's model list are asked before the provider
 * (status()); a provider failure is logged with its own text and answered as `ai_failed` in our words.
 */
final class PlannerAi
{
    private const LANGUAGES = ['en' => 'English', 'ru' => 'Russian', 'de' => 'German', 'fr' => 'French', 'es' => 'Spanish'];

    /** The most model calls one assistant turn makes (each tool round is one). */
    public const MAX_ROUNDS = 6;

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

    /**
     * @param  array<string, mixed>  $facts  WeekPlanner::facts()
     * @return array{summary: string, lines: list<array<string, mixed>>, unplaced: list<array<string, mixed>>}
     */
    public function planWeek(int $orgId, array $facts, ?string $instruction, string $lang): array
    {
        $language = self::language($lang);
        $system = <<<TXT
You plan a business team's week. For every task in `to_place`, choose the day (one of `days`) and the person who does
it; you may add a start time. Rules you must keep:
- Never on a day after the task's `due_by`; overdue and high priority work as early as possible.
- A task with an `owner` stays with that owner unless `assign_others` is true and there is a clear reason.
- Give a task without an owner only to a person who works that day, has an account, and whose `skills` include its type
  (or are "any"); never past their `free_minutes` that day.
- Match work to people's knowledge, job title, level, preferred work and the experience they have shown; keep the
  business's rules (`business.rules`) and use its notes on task types and tasks. Spread the load fairly across the
  week; give demanding work to experienced people and a share of learning work to people who are developing it.
- Use the task's `minutes` as its length.
Write `summary` (two or three sentences: the shape of the week and any risk) and each `note` (why this person and day,
at most 15 words) in {$language}. Answer only by calling the propose_week_plan tool, once.
TXT;
        $user = 'FACTS (JSON):' . "\n" . json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            . ($instruction ? "\n\nThe person planning asks: " . mb_substr(trim($instruction), 0, 500) : '');
        $tool = [
            'name' => 'propose_week_plan',
            'description' => 'The plan for the week.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'summary'  => ['type' => 'string'],
                    'lines'    => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'task_id'    => ['type' => 'integer'],
                        'date'       => ['type' => 'string', 'description' => 'YYYY-MM-DD, one of the days'],
                        'person'     => ['type' => 'string', 'description' => 'The person key from the facts'],
                        'start_time' => ['type' => 'string', 'description' => 'HH:MM, optional'],
                        'note'       => ['type' => 'string'],
                    ], 'required' => ['task_id', 'date', 'person']]],
                    'unplaced' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'task_id' => ['type' => 'integer'], 'note' => ['type' => 'string'],
                    ], 'required' => ['task_id']]],
                ],
                'required' => ['summary', 'lines'],
            ],
        ];
        $out = $this->ask($orgId, 'time_week_plan', $system, $user, $tool, 8000);

        return [
            'summary'  => mb_substr(trim((string) ($out['summary'] ?? '')), 0, 900),
            'lines'    => array_values(array_filter((array) ($out['lines'] ?? []), 'is_array')),
            'unplaced' => array_values(array_filter((array) ($out['unplaced'] ?? []), 'is_array')),
        ];
    }

    /**
     * @param  array<string, mixed>  $facts  the learned figures, the readiness, the knowledge and the team
     * @return array{summary: string, recommendations: list<array<string, mixed>>}
     */
    public function coach(int $orgId, array $facts, string $lang): array
    {
        $language = self::language($lang);
        $system = <<<TXT
You are an operations coach for a business's manager. From the facts — what the planner learned from the last weeks
(how long work really takes against the plan, who finishes what on time and how fast, by task type), what the manager
has taught it, and what it still lacks — give a short strategy: what to change so the team's days run better.
At most eight recommendations, the most useful first, each concrete and grounded in a number from the facts (never
invent one). Kinds: duration (plan a task type or task longer or shorter), training (someone below the team at a type),
cross_skill (work only one or two people can do), schedule (load, days, hours), recognition (someone clearly strong),
process, data (what to teach the planner or start clocking). Name people and types as the facts name them; be fair and
respectful — this is for helping people grow, not ranking them.
When a recommendation is one change the planner can make, give it as `fix`: set_typical (a type's or a task's typical
minutes, with `type_name` or `task_key` and `minutes`), or add_skill (let a person take a type from the pool: `person`
key and `type_name`). Otherwise leave `fix` out.
Write in {$language}. Answer only by calling the coach_team tool, once.
TXT;
        $tool = [
            'name' => 'coach_team',
            'description' => 'The strategy for the team.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'summary'         => ['type' => 'string', 'description' => 'Two or three sentences'],
                    'recommendations' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                        'title'  => ['type' => 'string'],
                        'detail' => ['type' => 'string'],
                        'kind'   => ['type' => 'string', 'enum' => ['duration', 'training', 'cross_skill', 'schedule', 'recognition', 'process', 'data']],
                        'impact' => ['type' => 'string', 'enum' => ['high', 'medium', 'low']],
                        'fix'    => ['type' => 'object', 'properties' => [
                            'type'      => ['type' => 'string', 'enum' => ['set_typical', 'add_skill']],
                            'type_name' => ['type' => 'string'],
                            'task_key'  => ['type' => 'string'],
                            'minutes'   => ['type' => 'integer'],
                            'person'    => ['type' => 'string'],
                        ]],
                    ], 'required' => ['title', 'kind']]],
                ],
                'required' => ['summary', 'recommendations'],
            ],
        ];
        $out = $this->ask($orgId, 'time_coach', $system, 'FACTS (JSON):' . "\n" . json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tool, 4000);

        return [
            'summary'         => mb_substr(trim((string) ($out['summary'] ?? '')), 0, 900),
            'recommendations' => array_values(array_slice(array_filter((array) ($out['recommendations'] ?? []), 'is_array'), 0, 8)),
        ];
    }

    /**
     * Drafts of what a manager could teach the AI: `people` (job title, knowledge, strengths, what to develop, from what
     * each person finished), `types` (notes, typical minutes and best time per type and task, from the learned lengths),
     * `business` (about, rules, goals, from the business's kind, its types and tasks and its team).
     *
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    public function draft(int $orgId, string $kind, array $facts, string $lang): array
    {
        $language = self::language($lang);
        $what = match ($kind) {
            'people'   => 'for each person in `people` who has an account: a job title, what they know (skills, specialties, '
                . 'as their work shows), their strengths, and one or two things to develop. Keep what the manager already wrote '
                . 'and only complete or sharpen it; leave a field empty when the facts say nothing',
            'types'    => 'for each task type and task in the facts: a one-sentence note on what the work involves, its typical '
                . 'minutes (use the learned `suggested` minutes when there are enough samples, else leave it out), and for types '
                . 'the best time of day (morning, midday, afternoon, evening or any)',
            default    => 'the business context: `about` (what the business does and how the team works, 2-4 sentences), `rules` '
                . '(house rules that plans must keep, one per line, only ones the facts make likely), `goals` (what good days look '
                . 'like for this team, one or two sentences)',
        };
        $system = <<<TXT
You help a manager teach a team planner's AI about their business. Draft {$what}. Be specific to the facts, short, and
never invent people, certificates or numbers the facts do not hold — the manager reviews every line before it is saved.
Write in {$language}. Answer only by calling the save_drafts tool, once.
TXT;
        $properties = match ($kind) {
            'people' => ['people' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                'person' => ['type' => 'string'], 'job_title' => ['type' => 'string'], 'knowledge' => ['type' => 'string'],
                'strengths' => ['type' => 'string'], 'develop' => ['type' => 'string'],
            ], 'required' => ['person']]]],
            'types' => [
                'types' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                    'type' => ['type' => 'string'], 'notes' => ['type' => 'string'], 'typical_minutes' => ['type' => 'integer'],
                    'best_time' => ['type' => 'string', 'enum' => Knowledge::BEST_TIMES],
                ], 'required' => ['type']]],
                'tasks' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                    'task_key' => ['type' => 'string'], 'notes' => ['type' => 'string'], 'typical_minutes' => ['type' => 'integer'],
                ], 'required' => ['task_key']]],
            ],
            default => ['about' => ['type' => 'string'], 'rules' => ['type' => 'string'], 'goals' => ['type' => 'string']],
        };
        $tool = ['name' => 'save_drafts', 'description' => 'The drafts.', 'input_schema' => ['type' => 'object', 'properties' => $properties]];

        return $this->ask($orgId, 'time_draft', $system, 'FACTS (JSON):' . "\n" . json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tool, 4000);
    }

    /**
     * One assistant turn: Claude may call the tools as many rounds as it needs (MAX_ROUNDS at most); $run answers each
     * call with JSON-able data. The reply's text, and how many model calls it took.
     *
     * @param  list<array{role: string, content: string}>  $history  the conversation so far, the person's message last
     * @param  list<array<string, mixed>>  $tools
     * @param  callable(string, array<string, mixed>): mixed  $run
     * @return array{text: string, rounds: int, ended: string}
     */
    public function converse(int $orgId, string $system, array $history, array $tools, callable $run): array
    {
        $messages = array_map(fn ($m) => ['role' => $m['role'], 'content' => $m['content']], $history);
        for ($round = 1; $round <= self::MAX_ROUNDS; $round++) {
            $params = ['model' => $this->model, 'maxTokens' => 4096, 'system' => $system, 'messages' => $messages, 'tools' => $tools];
            // The last round may not ask for more: it answers with what it has (the tools stay defined, since the
            // conversation holds their calls, but none may be called).
            if ($round === self::MAX_ROUNDS) {
                $params['toolChoice'] = ['type' => 'none'];
            }
            $message = $this->call('time_assistant', $orgId, $params);

            $results = [];
            foreach ($message->content as $block) {
                if ($block instanceof ToolUseBlock) {
                    $input = json_decode(json_encode($block->input), true) ?: [];
                    try {
                        $answer = $run($block->name, is_array($input) ? $input : []);
                    } catch (TimeRefused $e) {
                        $answer = ['error' => $e->errorCode, 'message' => $e->getMessage()];
                    }
                    $results[] = ['type' => 'tool_result', 'tool_use_id' => $block->id, 'content' => json_encode($answer, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
                }
            }
            if ($results === []) {
                return ['text' => trim(AnthropicSdk::text($message)), 'rounds' => $round, 'ended' => 'answer'];
            }
            // The assistant's own blocks go back as the SDK gave them (thinking keeps its signature).
            $messages[] = ['role' => 'assistant', 'content' => $message->content];
            $messages[] = ['role' => 'user', 'content' => $results];
        }

        return ['text' => '', 'rounds' => self::MAX_ROUNDS, 'ended' => 'rounds'];
    }

    /**
     * One Messages call, its spend recorded under $feature; a failure is TimeRefused `ai_failed` (the provider's words go
     * to the log only).
     *
     * @param  array<string, mixed>  $params
     */
    private function call(string $feature, int $orgId, array $params): \Anthropic\Messages\Message
    {
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

        return $message;
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

        $message = $this->call($feature, $orgId, $params);

        foreach ($message->content as $block) {
            if ($block instanceof ToolUseBlock && $block->name === $tool['name']) {
                return json_decode(json_encode($block->input), true) ?: [];
            }
        }
        Log::warning('Time planner AI answered without its tool', ['feature' => $feature, 'text' => mb_substr(AnthropicSdk::text($message), 0, 300)]);
        throw new TimeRefused('ai_failed', 'The AI could not help just now. Please try again in a moment.', 502);
    }
}
