<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class AddCustomerNote extends HexaTechTool
{
    protected string $name = 'add_customer_note';

    protected string $title = 'Add an internal customer note';

    protected string $description = 'Append an internal note to a selected customer activity history after the user asks to save that note. Updates their last activity time. Sends no email or message. Identify the correct customer first. Generate a UUID request_id per intended note and reuse it unchanged with the same target and text on every retry. Never invent note text or infer customer marketing consent.';

    protected bool $readOnly = false;

    protected array $rules = ['customer_id' => 'required|integer|min:1',
        'body' => 'required|string|min:1|max:2000|regex:/\S/u', 'request_id' => 'required|uuid'];

    public function schema(JsonSchema $schema): array
    {
        return ['customer_id' => $schema->integer()->min(1)->required(),
            'body' => $schema->string()->min(1)->max(2000)->required(),
            'request_id' => $schema->string()->format('uuid')->required()];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->addCustomerNote($data['customer_id'], $data['body'], $data['request_id']);
    }
}
