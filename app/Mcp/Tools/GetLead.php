<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use App\Mcp\Support\LeadWorkflowAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class GetLead extends HexaTechTool
{
    protected string $name = 'get_lead';

    protected string $title = 'Read a CRM lead and its requirements';

    protected string $description = 'Read one CRM inquiry using lead_id from list_leads. Returns customer contact, brand, enquiry requirements and notes, configured custom fields, recorded price/currency, attachment metadata, available status stages, lost reasons and revision. Read activities and linked conversations before summarizing interests or drafting a proposal. Text fields expose text and truncated; never claim missing or truncated content was read. Attachment contents are unavailable. This read does not generate, save or send an email.';

    protected array $rules = [
        'lead_id' => 'required|integer|min:1',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'lead_id' => $schema->integer()->min(1)->required()->description('Inquiry ID from list_leads, not a customer ID.'),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return app(LeadWorkflowAccess::class)->getLead((int) $data['lead_id']);
    }
}
