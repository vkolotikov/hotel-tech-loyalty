# Voice phase 2a — the Voice Gateway

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff member sends a sentence of text and gets back a short spoken-style answer, with
the model calling the phase 1 voice tools to get it. Text in, text out — no microphone yet.

**Architecture:** `VoiceGateway` runs one turn: build the tool catalogue from the registered
`/mcp/voice` tools, call the model with those tools, execute any tool the model asks for through
the same `VoiceTool` classes the MCP server uses, and return the model's final sentence. The
catalogue is derived from `HexaTechVoiceServer`, never hand-written, so a new tool appears to the
model automatically.

**Tech Stack:** Laravel 13, `laravel/mcp` v0.9.4, `App\Traits\DispatchesAiChat` (existing
multi-provider dispatch with model allowlisting and usage tracking), PHPUnit.

**Spec:** `docs/superpowers/specs/2026-09-12-voice-assistant-design.md`
**Predecessor:** `docs/superpowers/plans/2026-09-12-voice-phase-1-tool-surface.md` (complete)

## Why 2a stops before audio

Splitting the brain from the microphone is deliberate. The whole turn loop — prompt wording,
tool choice, latency, the propose/commit handshake — is testable by typing, from a laptop, in
any language, with no speech provider chosen and no device. Adding audio at the same time would
mean debugging recognition errors and prompt behaviour simultaneously.

It also keeps the open speech-provider question (Russian quality plus an EU processing region,
spec §9) off the critical path. Phase 2b adds `SpeechToText`/`TextToSpeech` drivers and the SPA
and Expo push-to-talk UI on top of the endpoint this plan delivers.

## Global Constraints

- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. Never a bare `php artisan test`; always
  scope by directory and read the `Tests:` line yourself.
- `app/Mcp/Servers/HexaTechServer.php`, `app/Mcp/Support/HexaTechTool.php` and
  `app/Mcp/Support/CustomerBookingAccess.php` stay unmodified. The live ChatGPT pilot depends on
  them.
- The tool catalogue is **derived** from `HexaTechVoiceServer::$tools`. No second list of tool
  names or schemas anywhere in PHP or TypeScript.
- Every tool call goes through the existing `VoiceTool` pipeline, so `VoiceCapability`, the
  subscription check and brand scoping apply exactly as they do over MCP. The gateway never
  reaches `CustomerBookingAccess` directly.
- A model reply is never trusted to have confirmed a write. `voice_commit_note` is reachable
  only with a `request_id` from `voice_propose_note`, which phase 1 already enforces server-side.
- `VOICE_ENABLED` and the organization allowlist gate this endpoint exactly as they gate `/mcp/voice`.

## File Structure

Create:

| File | Responsibility |
|---|---|
| `app/Voice/VoiceToolCatalogue.php` | Derives model tool definitions from the voice MCP server |
| `app/Voice/VoiceToolRunner.php` | Executes one named tool through the `VoiceTool` pipeline |
| `app/Voice/TurnSession.php` | Per-conversation state: the last record referred to |
| `app/Voice/VoiceGateway.php` | The turn loop: model, tool calls, final sentence |
| `app/Http/Controllers/Api/V1/VoiceTurnController.php` | `POST /api/v1/voice/turn` |
| `tests/Feature/Voice/VoiceToolCatalogueTest.php` | Catalogue derivation |
| `tests/Feature/Voice/VoiceGatewayTest.php` | The loop, with a faked model |
| `tests/Feature/Voice/VoiceTurnEndpointTest.php` | Auth, gating, shape |

Modify:

| File | Change |
|---|---|
| `app/Traits/DispatchesAiChat.php` | **Additive only**: a new tool-calling method; existing methods untouched |
| `config/voice.php` | Model, provider, turn budget, max tool calls |
| `routes/api.php` | Register the turn endpoint |
| `docs/voice-assistant.md` | Document the gateway |

---

### Task 1: Derive the model's tool catalogue from the MCP server

**Files:**
- Create: `app/Voice/VoiceToolCatalogue.php`
- Test: `tests/Feature/Voice/VoiceToolCatalogueTest.php`

**Interfaces:**
- Consumes: `App\Mcp\Servers\HexaTechVoiceServer` (its `$tools` array of class names), and each
  tool's `toArray()`, which returns `name`, `title`, `description`, `inputSchema`, `annotations`.
  `inputSchema` is already a JSON Schema object with `type`, `properties` and
  `additionalProperties: false` — verified against `VoiceLeadCount`.
- Produces:
  - `VoiceToolCatalogue::definitions(): array` — OpenAI function-calling definitions, each
    `['type' => 'function', 'function' => ['name' => …, 'description' => …, 'parameters' => …]]`.
  - `VoiceToolCatalogue::classFor(string $name): ?string` — the tool class for a tool name.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Voice;

use App\Mcp\Tools\Voice\VoiceCommitNote;
use App\Mcp\Tools\Voice\VoiceLeadCount;
use App\Voice\VoiceToolCatalogue;

class VoiceToolCatalogueTest extends VoiceTestCase
{
    public function test_every_registered_voice_tool_is_offered_to_the_model(): void
    {
        $definitions = (new VoiceToolCatalogue)->definitions();
        $names = array_column(array_column($definitions, 'function'), 'name');

        // Derived from HexaTechVoiceServer, so a new tool needs no second list.
        $this->assertSame([
            'voice_daily_brief', 'voice_lead_count', 'voice_next_bookings',
            'voice_find_customer', 'voice_propose_note', 'voice_commit_note',
        ], $names);

        foreach ($definitions as $definition) {
            $this->assertSame('function', $definition['type']);
            $this->assertNotSame('', $definition['function']['description']);
            $this->assertSame('object', $definition['function']['parameters']['type']);
            $this->assertFalse($definition['function']['parameters']['additionalProperties']);
        }
    }

    public function test_a_tool_name_resolves_back_to_its_class(): void
    {
        $catalogue = new VoiceToolCatalogue;

        $this->assertSame(VoiceLeadCount::class, $catalogue->classFor('voice_lead_count'));
        $this->assertSame(VoiceCommitNote::class, $catalogue->classFor('voice_commit_note'));
        $this->assertNull($catalogue->classFor('list_leads'), 'Only voice tools are reachable.');
        $this->assertNull($catalogue->classFor('nonsense'));
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceToolCatalogueTest.php`
Expected: FAIL — `Class "App\Voice\VoiceToolCatalogue" not found`.

- [ ] **Step 3: Write the catalogue**

```php
<?php

namespace App\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Mcp\Support\VoiceTool;
use ReflectionClass;

/**
 * One source of truth for the tool surface: the model is offered exactly the
 * tools the voice MCP server registers, described by the same text and schema.
 * Adding a tool to HexaTechVoiceServer is the whole change.
 */
class VoiceToolCatalogue
{
    /** @return array<int, array{type:string, function:array}> */
    public function definitions(): array
    {
        return array_values(array_map(function (string $class) {
            $tool = (new $class)->toArray();

            return ['type' => 'function', 'function' => [
                'name' => $tool['name'],
                'description' => $tool['description'],
                'parameters' => $tool['inputSchema'],
            ]];
        }, $this->classes()));
    }

    public function classFor(string $name): ?string
    {
        foreach ($this->classes() as $class) {
            if ((new $class)->toArray()['name'] === $name) {
                return $class;
            }
        }

        return null;
    }

    /** @return array<int, class-string<VoiceTool>> */
    private function classes(): array
    {
        $property = (new ReflectionClass(HexaTechVoiceServer::class))->getProperty('tools');
        $property->setAccessible(true);

        return $property->getValue(new HexaTechVoiceServer);
    }
}
```

If `$tools` is not readable by reflection on this `laravel/mcp` version, add a public
`public static function toolClasses(): array { return (new static)->tools; }` to
`HexaTechVoiceServer` and call that instead. Do **not** copy the list into the catalogue.

- [ ] **Step 4: Run the test and verify it passes**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceToolCatalogueTest.php`
Expected: PASS, 2 tests. If the order differs, fix the expected order in the test to match
`HexaTechVoiceServer::$tools`; do not sort in the catalogue, because the registration order is
the deliberate order of preference.

- [ ] **Step 5: Commit**

```bash
git add app/Voice/VoiceToolCatalogue.php tests/Feature/Voice/VoiceToolCatalogueTest.php
git commit -m "Derive the model's voice tool catalogue from the MCP server"
```

---

### Task 2: Run one tool through the voice pipeline

**Files:**
- Create: `app/Voice/VoiceToolRunner.php`
- Test: `tests/Feature/Voice/VoiceToolCatalogueTest.php` (append)

**Interfaces:**
- Consumes: `VoiceToolCatalogue` (Task 1) and the tool's own production entry point,
  `HexaTechTool::handle(Laravel\Mcp\Request $request, CustomerBookingAccess $access)`. All
  verified against `vendor/laravel/mcp` v0.9.4:
  - `new Laravel\Mcp\Request(array $arguments)` — arguments are the first constructor parameter.
  - `handle()` returns `Laravel\Mcp\ResponseFactory` on success, whose
    `getStructuredContent(): ?array` yields the tool's array.
  - On failure it returns a `Laravel\Mcp\Response` with `isError(): true`, whose
    `content()` stringifies to the message.
- Produces:
  - `VoiceToolRunner::run(string $name, array $arguments): array` — returns
    `['ok' => bool, 'result' => array|null, 'error' => string|null]`. An unknown tool name and a
    tool error both return `ok: false` with a message; neither throws.

Calling `handle()` — not `speak()`, and **not** the `HexaTechVoiceServer::tool()` testing helper,
which exists only for tests and exposes no public accessors — is what guarantees the gateway
cannot become a second, less-guarded path to the same data. `handle()` is where
`CustomerBookingAccess::authorize()`, the `VoiceCapability` gate and argument validation all run.

- [ ] **Step 1: Write the failing test**

Append to `VoiceToolCatalogueTest`:

```php
    public function test_the_runner_executes_a_tool_and_reports_failures_without_throwing(): void
    {
        $runner = new \App\Voice\VoiceToolRunner(new VoiceToolCatalogue);

        $ok = $runner->run('voice_lead_count', []);
        $this->assertTrue($ok['ok']);
        $this->assertSame('two leads', $ok['result']['spoken_count']);

        $unknown = $runner->run('list_leads', []);
        $this->assertFalse($unknown['ok']);
        $this->assertStringContainsString('not available', $unknown['error']);

        $invalid = $runner->run('voice_find_customer', ['query' => ' ']);
        $this->assertFalse($invalid['ok']);
        $this->assertNotSame('', $invalid['error']);

        config(['voice.organization_ids' => []]);
        $denied = $runner->run('voice_lead_count', []);
        $this->assertFalse($denied['ok'], 'The capability gate still applies through the gateway.');
    }
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceToolCatalogueTest.php`
Expected: FAIL — `Class "App\Voice\VoiceToolRunner" not found`.

- [ ] **Step 3: Write the runner**

```php
<?php

namespace App\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use Laravel\Mcp\Request as McpRequest;
use Laravel\Mcp\ResponseFactory;
use Throwable;

/**
 * Executes a model-requested tool through the tool's own handle() entry point,
 * so the capability gate, authorization and argument validation apply exactly
 * as they do over MCP. The gateway is not a second door to the data.
 */
class VoiceToolRunner
{
    public function __construct(private VoiceToolCatalogue $catalogue) {}

    /** @return array{ok:bool, result:?array, error:?string} */
    public function run(string $name, array $arguments): array
    {
        $class = $this->catalogue->classFor($name);

        if ($class === null) {
            return $this->failed('The tool "'.$name.'" is not available.');
        }

        try {
            $response = app($class)->handle(new McpRequest($arguments), app(CustomerBookingAccess::class));
        } catch (Throwable $error) {
            // A tool failure must reach the model as text it can speak about,
            // never as an exception that ends the turn in silence.
            report($error);

            return $this->failed('That did not work. The result is unknown.');
        }

        // handle() returns a ResponseFactory for structured success and a
        // Response with isError() for a refusal or validation complaint.
        if ($response instanceof ResponseFactory) {
            return ['ok' => true, 'result' => $response->getStructuredContent() ?? [], 'error' => null];
        }

        return $this->failed((string) $response->content());
    }

    /** @return array{ok:bool, result:?array, error:?string} */
    private function failed(string $message): array
    {
        return ['ok' => false, 'result' => null, 'error' => $message];
    }
}
```

Register the runner's dependency resolution by constructor injection only — it must never be
handed a tool class from anywhere but the catalogue, which is what keeps `/mcp`'s seven text
tools unreachable from a voice turn.

- [ ] **Step 4: Run the test and verify it passes**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceToolCatalogueTest.php`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/Voice/VoiceToolRunner.php tests/Feature/Voice/VoiceToolCatalogueTest.php
git commit -m "Run gateway tool calls through the guarded MCP pipeline"
```

---

### Task 3: Tool-calling dispatch, added without touching existing chat

**Files:**
- Modify: `app/Traits/DispatchesAiChat.php` (**append new methods only**)
- Modify: `config/voice.php`
- Test: `tests/Feature/Voice/VoiceGatewayTest.php`

**Interfaces:**
- Consumes: the trait's existing private helpers `assertModelAllowed(string $model): void` and
  `trackUsage(string $model, string $feature, int $inputTokens, int $outputTokens): void`.
  Reusing them is the point: they enforce the organization's plan entitlement and record spend,
  and a separate HTTP client for voice would silently bypass both.
- Produces:
  - `DispatchesAiChat::callProviderWithTools(string $systemPrompt, array $messages, array $tools, string $model, int $maxTokens, string $feature): array`
    returning `['content' => ?string, 'tool_calls' => array<int, array{id:string, name:string, arguments:array}>]`.

Existing methods are not modified. OpenAI Chat Completions is the only provider in this task,
because its `tools`/`tool_calls` contract is stable and the phase 4 Alexa+ path does not use our
loop at all. Other providers throw a clear unsupported error rather than silently degrading.

- [ ] **Step 1: Add the voice model configuration**

Append to `config/voice.php`:

```php
    // The gateway's own model settings. Voice answers are short, so the token
    // ceiling is low; the turn budget exists because the Alexa adapter has
    // roughly eight seconds for an entire turn.
    'model' => env('VOICE_MODEL', 'gpt-4o'),
    'provider' => env('VOICE_PROVIDER', 'openai'),
    'max_tokens' => 400,
    'max_tool_calls' => 4,
    'turn_budget_seconds' => 6,
```

- [ ] **Step 2: Write the failing test**

```php
<?php

namespace Tests\Feature\Voice;

use App\Voice\VoiceGateway;
use Illuminate\Support\Facades\Http;

class VoiceGatewayTest extends VoiceTestCase
{
    /** Queue OpenAI chat-completion responses in order. */
    private function fakeModel(array ...$replies): void
    {
        $sequence = Http::sequence();
        foreach ($replies as $reply) {
            $sequence->push($reply, 200);
        }
        Http::fake(['api.openai.com/*' => $sequence]);
    }

    private function toolCall(string $name, array $arguments): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => null,
            'tool_calls' => [['id' => 'call_1', 'type' => 'function', 'function' => [
                'name' => $name, 'arguments' => json_encode($arguments)]]]]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    private function finalAnswer(string $text): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    public function test_a_question_is_answered_by_calling_a_tool_then_speaking(): void
    {
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel(
            $this->toolCall('voice_lead_count', []),
            $this->finalAnswer('You have two leads today.'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'how many leads today', 'session-1');

        $this->assertSame('You have two leads today.', $turn['spoken']);
        $this->assertSame(['voice_lead_count'], $turn['tools_used']);
    }

    public function test_a_turn_stops_after_the_tool_call_ceiling(): void
    {
        config(['openai.api_key' => 'test-key', 'voice.max_tool_calls' => 2]);
        $this->fakeModel(
            $this->toolCall('voice_lead_count', []),
            $this->toolCall('voice_lead_count', []),
            $this->toolCall('voice_lead_count', []),
            $this->finalAnswer('unused'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'loop forever', 'session-2');

        $this->assertCount(2, $turn['tools_used']);
        // A ceiling hit is spoken, never silent.
        $this->assertNotSame('', $turn['spoken']);
    }
}
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceGatewayTest.php`
Expected: FAIL — `Class "App\Voice\VoiceGateway" not found`. Task 4 makes it pass; this task
supplies the dispatch it needs.

- [ ] **Step 4: Append the tool-calling dispatch to the trait**

Add these methods to `App\Traits\DispatchesAiChat` without editing any existing method:

```php
    /**
     * Tool-calling variant of callProvider(). Returns the assistant's message
     * rather than a string, because a turn may be a tool request instead of
     * an answer. Reuses assertModelAllowed() and trackUsage() so a voice turn
     * is subject to the same plan entitlement and spend recording as chat.
     *
     * @return array{content:?string, tool_calls:array<int, array{id:string, name:string, arguments:array}>}
     */
    protected function callProviderWithTools(string $systemPrompt, array $messages, array $tools,
        string $model, int $maxTokens, string $feature = 'voice_turn'): array
    {
        $this->assertModelAllowed($model);

        $response = \Illuminate\Support\Facades\Http::withToken((string) config('openai.api_key'))
            ->timeout((int) config('voice.turn_budget_seconds', 6))
            ->post('https://api.openai.com/v1/chat/completions', [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'messages' => array_merge([['role' => 'system', 'content' => $systemPrompt]], $messages),
                'tools' => $tools,
                'tool_choice' => 'auto',
            ])->throw()->json();

        $this->trackUsage($model, $feature,
            (int) data_get($response, 'usage.prompt_tokens', 0),
            (int) data_get($response, 'usage.completion_tokens', 0));

        $message = data_get($response, 'choices.0.message', []);

        return [
            'content' => $message['content'] ?? null,
            'tool_calls' => array_map(fn ($call) => [
                'id' => $call['id'],
                'name' => $call['function']['name'],
                // Malformed arguments are a model error, not a crash: an empty
                // array lets validation produce a speakable complaint.
                'arguments' => json_decode($call['function']['arguments'] ?? '{}', true) ?: [],
            ], $message['tool_calls'] ?? []),
        ];
    }
```

If `config('voice.provider')` is not `openai`, the gateway (Task 4) refuses before reaching
here; do not add a silent fallback.

- [ ] **Step 5: Verify the existing chat suites still pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Chatbot/`
Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Ai/`
Expected: PASS. The trait is shared with the live widget chatbot; an addition must not disturb
it. If either directory does not exist, run the suites that cover `WidgetChatController` instead.

- [ ] **Step 6: Commit**

```bash
git add app/Traits/DispatchesAiChat.php config/voice.php tests/Feature/Voice/VoiceGatewayTest.php
git commit -m "Add tool-calling dispatch beside the existing chat dispatch"
```

---

### Task 4: The turn loop

**Files:**
- Create: `app/Voice/TurnSession.php`
- Create: `app/Voice/VoiceGateway.php`
- Test: `tests/Feature/Voice/VoiceGatewayTest.php` (already written in Task 3)

**Interfaces:**
- Consumes: `VoiceToolCatalogue`, `VoiceToolRunner`, `DispatchesAiChat::callProviderWithTools()`,
  `App\Voice\VoiceCapability`, and `HexaTechVoiceServer`'s `$instructions` text as the system
  prompt — again derived, not retyped.
- Produces:
  - `TurnSession::history(string $sessionId): array` / `::remember(string $sessionId, array $messages): void`
  - `VoiceGateway::turn(User $staff, string $said, string $sessionId): array` returning
    `['spoken' => string, 'tools_used' => array<int,string>, 'session_id' => string]`.

- [ ] **Step 1: Write the turn session**

```php
<?php

namespace App\Voice;

use Illuminate\Support\Facades\Cache;

/**
 * Short conversational memory so "add a note to that booking" resolves. Held
 * per staff member and session, and deliberately small: a voice turn should
 * not carry an unbounded transcript into every model call.
 */
class TurnSession
{
    private const MAX_MESSAGES = 12;

    private const TTL_SECONDS = 900;

    public function history(int $userId, string $sessionId): array
    {
        return Cache::get($this->key($userId, $sessionId), []);
    }

    public function remember(int $userId, string $sessionId, array $messages): void
    {
        Cache::put($this->key($userId, $sessionId),
            array_slice($messages, -self::MAX_MESSAGES), self::TTL_SECONDS);
    }

    public function forget(int $userId, string $sessionId): void
    {
        Cache::forget($this->key($userId, $sessionId));
    }

    private function key(int $userId, string $sessionId): string
    {
        return 'voice:turn:'.$userId.':'.sha1($sessionId);
    }
}
```

- [ ] **Step 2: Write the gateway**

```php
<?php

namespace App\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Models\User;
use App\Traits\DispatchesAiChat;
use ReflectionClass;
use RuntimeException;

class VoiceGateway
{
    use DispatchesAiChat;

    public function __construct(
        private VoiceToolCatalogue $catalogue,
        private VoiceToolRunner $runner,
        private TurnSession $session,
        private VoiceCapability $capability,
    ) {}

    public function turn(User $staff, string $said, string $sessionId): array
    {
        $this->capability->assertEnabled($staff);

        if (config('voice.provider') !== 'openai') {
            throw new RuntimeException('Only the openai provider supports voice tool calling.');
        }

        $messages = [...$this->session->history((int) $staff->id, $sessionId),
            ['role' => 'user', 'content' => $said]];
        $tools = $this->catalogue->definitions();
        $used = [];
        $spoken = null;

        for ($step = 0; $step < (int) config('voice.max_tool_calls', 4); $step++) {
            $reply = $this->callProviderWithTools($this->systemPrompt(), $messages, $tools,
                (string) config('voice.model'), (int) config('voice.max_tokens', 400));

            if ($reply['tool_calls'] === []) {
                $spoken = $reply['content'];
                $messages[] = ['role' => 'assistant', 'content' => $spoken];
                break;
            }

            $messages[] = ['role' => 'assistant', 'content' => $reply['content'],
                'tool_calls' => array_map(fn ($c) => ['id' => $c['id'], 'type' => 'function',
                    'function' => ['name' => $c['name'], 'arguments' => json_encode($c['arguments'])]],
                    $reply['tool_calls'])];

            foreach ($reply['tool_calls'] as $call) {
                $result = $this->runner->run($call['name'], $call['arguments']);
                $used[] = $call['name'];
                // A tool failure is returned to the model as content, so it can
                // say the count is unknown rather than inventing a number.
                $messages[] = ['role' => 'tool', 'tool_call_id' => $call['id'],
                    'content' => json_encode($result['ok'] ? $result['result'] : ['error' => $result['error']])];
            }
        }

        $this->session->remember((int) $staff->id, $sessionId, $messages);

        return [
            // Silence reads as failure to a listener, so the ceiling speaks.
            'spoken' => $spoken ?? 'I could not finish that. Try asking a smaller question.',
            'tools_used' => $used,
            'session_id' => $sessionId,
        ];
    }

    /** The server's own instructions are the system prompt; there is no second copy. */
    private function systemPrompt(): string
    {
        $property = (new ReflectionClass(HexaTechVoiceServer::class))->getProperty('instructions');
        $property->setAccessible(true);

        return $property->getValue(new HexaTechVoiceServer);
    }
}
```

- [ ] **Step 3: Run the test and verify it passes**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceGatewayTest.php`
Expected: PASS, 2 tests.

The second test asserts the ceiling is respected: `max_tool_calls` is 2, three tool replies are
queued, and only two run. If it instead reports four, the loop counter is counting tool calls
rather than model round trips — fix the loop, not the test.

- [ ] **Step 4: Add the write-safety test**

Append to `VoiceGatewayTest`:

```php
    public function test_the_model_cannot_save_a_note_without_proposing_it_first(): void
    {
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel(
            $this->toolCall('voice_commit_note',
                ['request_id' => '9133341b-c7da-4126-a6cb-fc302bdb170b']),
            $this->finalAnswer('I could not save that.'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'just save it', 'session-3');

        $this->assertSame(['voice_commit_note'], $turn['tools_used']);
        $this->assertSame('', (string) \Illuminate\Support\Facades\DB::table('service_bookings')
            ->where('id', 1)->value('staff_notes'), 'Nothing may be written without a proposal.');
    }
```

- [ ] **Step 5: Run it**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceGatewayTest.php`
Expected: PASS, 3 tests, with no production change — phase 1 already enforces this server-side.
This test exists because it is the property most likely to be broken by a later refactor.

- [ ] **Step 6: Commit**

```bash
git add app/Voice/TurnSession.php app/Voice/VoiceGateway.php tests/Feature/Voice/VoiceGatewayTest.php
git commit -m "Run a voice turn: model, guarded tool calls, one spoken answer"
```

---

### Task 5: The turn endpoint

**Files:**
- Create: `app/Http/Controllers/Api/V1/VoiceTurnController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/Voice/VoiceTurnEndpointTest.php`

**Interfaces:**
- Consumes: `VoiceGateway::turn()`.
- Produces: `POST /api/v1/voice/turn` accepting `{said: string, session_id?: string}` and
  returning `{spoken, tools_used, session_id}`.

Authentication uses the SPA's existing admin session middleware, not the plugin's OAuth: this
endpoint serves the signed-in portal, while `/mcp/voice` serves external clients. Both end at
the same `VoiceCapability` gate.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Voice;

use Illuminate\Support\Facades\Http;

class VoiceTurnEndpointTest extends VoiceTestCase
{
    public function test_a_signed_in_staff_member_gets_a_spoken_answer(): void
    {
        config(['openai.api_key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response([
            'choices' => [['message' => ['role' => 'assistant', 'content' => 'Two leads today.']]],
            'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 3]], 200)]);

        $this->postJson('/api/v1/voice/turn', ['said' => 'how many leads today'])
            ->assertOk()
            ->assertJsonPath('spoken', 'Two leads today.')
            ->assertJsonStructure(['spoken', 'tools_used', 'session_id']);
    }

    public function test_the_endpoint_refuses_an_organization_without_voice_access(): void
    {
        config(['voice.organization_ids' => []]);
        $this->postJson('/api/v1/voice/turn', ['said' => 'how many leads today'])
            ->assertForbidden();
    }

    public function test_a_blank_utterance_is_rejected(): void
    {
        $this->postJson('/api/v1/voice/turn', ['said' => '   '])->assertStatus(422);
        $this->postJson('/api/v1/voice/turn', [])->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceTurnEndpointTest.php`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Voice\VoiceGateway;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VoiceTurnController extends Controller
{
    public function __invoke(Request $request, VoiceGateway $gateway): JsonResponse
    {
        $data = $request->validate([
            'said' => ['required', 'string', 'min:1', 'max:1000', 'regex:/\S/u'],
            'session_id' => ['sometimes', 'string', 'max:64', 'alpha_dash'],
        ]);

        try {
            return response()->json($gateway->turn($request->user(),
                $data['said'], $data['session_id'] ?? (string) Str::uuid()));
        } catch (AuthorizationException $error) {
            // Spoken, not raw: this reaches a microphone UI, not a developer.
            return response()->json(['message' => $error->getMessage()], 403);
        }
    }
}
```

- [ ] **Step 4: Register the route**

Find the existing authenticated `v1` admin group in `routes/api.php` — the one already carrying
the portal's staff endpoints behind the session/tenant middleware — and add inside it:

```php
Route::post('voice/turn', \App\Http\Controllers\Api\V1\VoiceTurnController::class);
```

Read the surrounding group before adding: match whatever prefix and middleware stack its
neighbours use rather than creating a new group.

- [ ] **Step 5: Run the test and verify it passes**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/VoiceTurnEndpointTest.php`
Expected: PASS, 3 tests. If the first test returns 401, the fixture's `actingAs` is not
satisfying the group's guard — check which guard the neighbouring routes use and act as that.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Api/V1/VoiceTurnController.php routes/api.php tests/Feature/Voice/VoiceTurnEndpointTest.php
git commit -m "Answer a typed voice turn from the signed-in portal"
```

---

### Task 6: Verify and document

**Files:**
- Modify: `docs/voice-assistant.md`
- Modify: `.env.example`

- [ ] **Step 1: Add the configuration keys**

Append to the voice block in `.env.example`:

```
# Voice Gateway (phase 2a). Tool calling is OpenAI-only for now.
VOICE_MODEL=gpt-4o
VOICE_PROVIDER=openai
```

- [ ] **Step 2: Document the gateway**

Add a section to `docs/voice-assistant.md` after "What it does":

```markdown
## The Voice Gateway

`POST /api/v1/voice/turn` takes `{said, session_id?}` from the signed-in portal and returns
`{spoken, tools_used, session_id}`. It runs one turn: the model is offered the voice tools, any
tool it asks for is executed through the **same** MCP pipeline as `/mcp/voice` — so
`VoiceCapability`, validation and brand scoping apply identically — and its final sentence is
returned.

The tool catalogue and the system prompt are both derived from `HexaTechVoiceServer`. Adding a
tool there is the whole change; there is no second list to update.

Tool calling reuses `DispatchesAiChat`, so a voice turn is subject to the same model
entitlement check and usage tracking as the rest of the platform. `VOICE_PROVIDER` must be
`openai`; other providers are refused rather than silently degraded.

A turn stops after `voice.max_tool_calls` model round trips and says so out loud, because
silence is indistinguishable from a broken product to someone listening.
```

- [ ] **Step 3: Run every affected suite**

```
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Voice/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Voice/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/ChatGptTools/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/ChatGptTransport/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/ChatGptAuth/
```

Expected: all PASS. Read each `Tests:` line.

- [ ] **Step 4: Commit**

```bash
git add docs/voice-assistant.md .env.example
git commit -m "Document the Voice Gateway and its configuration"
```

---

## Done when

- `POST /api/v1/voice/turn` answers a typed question by calling voice tools, for an allowlisted
  organization only.
- The model's tool list and system prompt are derived from `HexaTechVoiceServer`; no second copy
  exists anywhere.
- A turn cannot save a note without a prior proposal, proven by test.
- `git diff --name-only` shows no change to `HexaTechServer.php`, `HexaTechTool.php` or
  `CustomerBookingAccess.php`, and only additions in `DispatchesAiChat.php`.

## Next

**Phase 2b** adds `SpeechToText`/`TextToSpeech` drivers behind interfaces and the SPA and Expo
push-to-talk UI over this endpoint. It needs the speech-provider decision first: Russian quality
and a documented EU processing region are the acceptance criteria (spec §9).

**Phase 3** is the Alexa skill adapter — an endpoint that unwraps an Alexa request, calls
`VoiceGateway::turn()`, and wraps the answer, plus the interaction model and account linking.
Note that it needs the eight-second budget honoured end to end, which is why
`voice.turn_budget_seconds` exists here rather than being introduced later.
