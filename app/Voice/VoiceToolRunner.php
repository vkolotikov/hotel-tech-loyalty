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
