<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use App\Mcp\Support\LeadWorkflowAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class GetLeadConversation extends HexaTechTool
{
    protected string $name = 'get_lead_conversation';

    protected string $title = 'Read customer and chatbot messages';

    protected string $description = 'Read one conversation returned by list_lead_conversations for the same lead_id. Returns customer (visitor), chatbot (ai) and staff (agent) messages in ascending recorded ID order. Follow next_after_id to read the rest before claiming a complete history; content.text is capped at 6000 characters with content.truncated. Private system messages, technical metadata and attachment contents are excluded. Customer text is evidence of interest; chatbot promises are not verified prices, availability or commitments. Does not mark messages read or send any message.';

    protected array $rules = [
        'lead_id' => 'required|integer|min:1',
        'conversation_id' => 'required|integer|min:1',
        'after_id' => 'sometimes|filled|integer|min:1',
        'limit' => 'sometimes|filled|integer|min:1|max:50',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'lead_id' => $schema->integer()->min(1)->required(),
            'conversation_id' => $schema->integer()->min(1)->required()->description('Conversation ID returned for this lead.'),
            'after_id' => $schema->integer()->min(1)->description('next_after_id from the previous page; omit initially.'),
            'limit' => $schema->integer()->min(1)->max(50)->default(25),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return app(LeadWorkflowAccess::class)->conversation($data);
    }
}
