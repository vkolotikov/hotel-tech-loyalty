<?php

namespace App\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Models\User;
use App\Traits\DispatchesAiChat;
use ReflectionClass;
use RuntimeException;

/**
 * One spoken turn: offer the voice tools to the model, run whichever it asks
 * for through the guarded pipeline, and return the sentence it ends with.
 */
class VoiceGateway
{
    use DispatchesAiChat;

    public function __construct(
        private VoiceToolCatalogue $catalogue,
        private VoiceToolRunner $runner,
        private TurnSession $session,
        private VoiceCapability $capability,
    ) {}

    /**
     * @param  bool  $allowWrites  false for a device that may only read, such as
     *   an Echo whose owner has not allowed notes. Write tools are then neither
     *   offered to the model nor run if it names one anyway.
     */
    public function turn(User $staff, string $said, string $sessionId, bool $allowWrites = true): array
    {
        // Gate before the model call, so a denied organization costs nothing.
        $this->capability->assertEnabled($staff);

        if (config('voice.provider') !== 'openai') {
            throw new RuntimeException('Only the openai provider supports voice tool calling.');
        }

        $messages = [...$this->session->history((int) $staff->id, $sessionId),
            ['role' => 'user', 'content' => $said]];
        $tools = $this->catalogue->definitions($allowWrites);
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
                $result = $this->runner->run($call['name'], $call['arguments'], $allowWrites);
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
            'spoken' => $spoken ?: 'I could not finish that. Try asking a smaller question.',
            'tools_used' => $used,
            'session_id' => $sessionId,
        ];
    }

    /** The server's own instructions are the system prompt; there is no second copy. */
    private function systemPrompt(): string
    {
        return (new ReflectionClass(HexaTechVoiceServer::class))
            ->getDefaultProperties()['instructions'] ?? '';
    }
}
