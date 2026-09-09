<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class SearchCustomers extends HexaTechTool
{
    protected string $name = 'search_customers';

    protected string $title = 'Search HexaTech customers';

    protected string $description = 'Find customers by a literal part of their name, email, phone or company in your connected organization. Returns basic contact fields and a cursor. Use get_customer for a selected customer. Customer IDs are distinct from booking IDs.';

    protected array $rules = ['query' => 'required|string|min:2|max:120|regex:/\S/u',
        'limit' => 'sometimes|integer|min:1|max:25', 'after_id' => 'sometimes|integer|min:0'];

    public function schema(JsonSchema $schema): array
    {
        return ['query' => $schema->string()->min(2)->max(120)->required(),
            'limit' => $schema->integer()->min(1)->max(25)->default(20),
            'after_id' => $schema->integer()->min(0)->description('Cursor from next_after_id; omit for the first page.')];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->searchCustomers($data);
    }
}
