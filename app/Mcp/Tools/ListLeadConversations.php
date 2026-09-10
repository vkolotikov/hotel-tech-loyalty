<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use App\Mcp\Support\LeadWorkflowAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class ListLeadConversations extends HexaTechTool
{
    protected string $name = 'list_lead_conversations';

    protected string $title = 'Find a lead\'s chatbot conversations';

    protected string $description = 'List authorized chatbot or inbox conversation IDs associated with a CRM lead. Direct inquiry links are marked this_lead. Legacy conversations linked through the same customer and brand are customer_history and may concern earlier enquiries. Conversations explicitly assigned to another lead are excluded. Follow next_before_id for older conversations, then use get_lead_conversation for actual customer messages. An empty result means no accessible linked conversation, not that the customer never chatted.';

    protected array $rules = [
        'lead_id' => 'required|integer|min:1',
        'before_id' => 'sometimes|filled|integer|min:1',
        'limit' => 'sometimes|filled|integer|min:1|max:20',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'lead_id' => $schema->integer()->min(1)->required(),
            'before_id' => $schema->integer()->min(1)->description('next_before_id from the previous page; omit initially.'),
            'limit' => $schema->integer()->min(1)->max(20)->default(10),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return app(LeadWorkflowAccess::class)->conversations($data);
    }
}
