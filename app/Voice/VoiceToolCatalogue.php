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
    /** @var array<string, class-string<VoiceTool>>|null */
    private ?array $byName = null;

    /** @return array<int, array{type:string, function:array}> */
    public function definitions(): array
    {
        $definitions = [];

        foreach ($this->byName() as $name => $class) {
            $tool = (new $class)->toArray();
            $definitions[] = ['type' => 'function', 'function' => [
                'name' => $name,
                'description' => $tool['description'],
                'parameters' => $tool['inputSchema'],
            ]];
        }

        return $definitions;
    }

    /** @return class-string<VoiceTool>|null */
    public function classFor(string $name): ?string
    {
        return $this->byName()[$name] ?? null;
    }

    /** @return array<string, class-string<VoiceTool>> */
    private function byName(): array
    {
        if ($this->byName !== null) {
            return $this->byName;
        }

        $map = [];
        foreach ($this->classes() as $class) {
            $map[(new $class)->toArray()['name']] = $class;
        }

        return $this->byName = $map;
    }

    /**
     * Read the server's registered tools rather than keeping a second list.
     *
     * @return array<int, class-string<VoiceTool>>
     */
    private function classes(): array
    {
        // Read the declared default rather than constructing the server, which
        // requires an MCP transport we have no reason to build here.
        return (new ReflectionClass(HexaTechVoiceServer::class))->getDefaultProperties()['tools'] ?? [];
    }
}
