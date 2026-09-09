<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class SearchCustomers extends HexaTechTool
{
    protected string $name = 'search_customers';

    protected string $title = 'Search HexaTech customers';

    protected string $description = 'Find customers by a required literal keyword of at least 2 characters from their name, email, phone or company in your connected organization. This is not an unfiltered customer or lead listing: do not send a blank query or use wildcards to request all records; wildcard characters are searched literally. For today\'s CRM leads or leads in a date range, use list_leads instead. Returns basic contact fields and a cursor. Use get_customer for a selected customer. Customer IDs are distinct from lead and booking IDs.';

    protected array $rules = ['query' => 'required|string|min:2|max:120|regex:/\S/u',
        'limit' => 'sometimes|filled|integer|min:1|max:25', 'after_id' => 'sometimes|filled|integer|min:0'];

    protected array $messages = [
        'query.required' => 'Provide a nonblank customer name, email, phone or company keyword (2-120 characters). For today\'s CRM leads, use list_leads instead.',
        'query.min' => 'The customer search keyword must contain at least 2 characters. Use list_leads for a date-based CRM lead list.',
        'query.regex' => 'The customer search keyword cannot be blank. Use list_leads for today\'s CRM leads.',
    ];

    public function schema(JsonSchema $schema): array
    {
        return ['query' => $schema->string()->min(2)->max(120)->required()
                ->description('Required literal name/email/phone/company keyword; no blank or wildcard-based listing. For CRM leads by creation date, use list_leads.'),
            'limit' => $schema->integer()->min(1)->max(25)->default(20),
            'after_id' => $schema->integer()->min(0)->description('Cursor from next_after_id; omit for the first page.')];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->searchCustomers($data);
    }
}
