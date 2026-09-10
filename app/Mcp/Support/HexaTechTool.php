<?php

namespace App\Mcp\Support;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Tool;

abstract class HexaTechTool extends Tool
{
    protected array $rules = [];

    protected array $messages = [];

    protected bool $readOnly = true;

    protected bool $destructive = false;

    public function toArray(): array
    {
        $result = parent::toArray();
        $security = [['type' => 'oauth2', 'scopes' => ['mcp:use']]];
        $result['securitySchemes'] = $security;
        $result['_meta']['securitySchemes'] = $security;
        $result['annotations'] = ['readOnlyHint' => $this->readOnly, 'destructiveHint' => $this->destructive,
            'openWorldHint' => false, 'idempotentHint' => true];
        $result['inputSchema']['additionalProperties'] = false;

        return $result;
    }

    final public function handle(Request $request, CustomerBookingAccess $access): Response|ResponseFactory
    {
        try {
            $access->authorize();
            $unknown = array_diff(array_keys($request->all()), array_keys($this->rules));
            if ($unknown) {
                return Response::error('Only the documented tool arguments are accepted.');
            }
            $data = $request->validate($this->rules, $this->messages);

            return Response::structured($this->execute($data, $access));
        } catch (ValidationException $error) {
            return Response::error(implode(' ', array_merge(...array_values($error->errors()))));
        } catch (ModelNotFoundException) {
            return Response::error('The record was not found or is not available to your account.');
        } catch (AuthorizationException $error) {
            return Response::error($error->getMessage());
        } catch (\Throwable $error) {
            report($error);

            return Response::error('HexaTech could not complete this request. Retry shortly; for a write, reuse the same request_id and unchanged arguments.');
        }
    }

    abstract protected function execute(array $data, CustomerBookingAccess $access): array;
}
